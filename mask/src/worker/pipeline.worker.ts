/// <reference lib="webworker" />
/**
 * Pipeline worker: owns the session (original tables, manifest, detections, span index, executed outputs).
 * Every request is answered with a response carrying the same requestId. Long steps report progress.
 */
import Papa from "papaparse";
import type {
  WorkerRequest, WorkerResponse, DatasetManifest, DetectionSet, Proposal, Evaluation, RowView, CellChange, RowFilter, RowSort, ViewMode,
  SpanDetection, HighlightKind, ModelArtifact, GoalSpec, OutputTableSummary,
} from "@/contracts";
import { ModelArtifactSchema } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";
import { createProfiler, createFieldDetector, createSpanDetector } from "@/core/detect";
import { createExecutor, type ExecutedPlan, type SpanIndex } from "@/core/execute";
import { createEvaluator } from "@/core/evaluate";
import { createExportService } from "@/core/export";
import { createGoalEmbedder } from "@/core/goal";
import { registry, getRecipe } from "@/core/registry";
import { buildDecisionUnits, PolicySelector, type SelectionContext, type Selector } from "@/core/selector";
import { createLearnedSelector } from "@/core/selector/learned";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
const post = (r: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(r, transfer);

interface Session {
  tables: TableData[];
  manifest: DatasetManifest | null;
  detections: DetectionSet | null;
  spanCache: Map<string, SpanDetection[]>;
  goal: GoalSpec | null;
  proposal: Proposal | null;
  executed: ExecutedPlan | null;
  evaluation: Evaluation | null;
  sessionKey: Uint8Array;
  model: ModelArtifact | null;
  viewCache: Map<string, number[]>;
}

const session: Session = {
  tables: [], manifest: null, detections: null, spanCache: new Map(), goal: null, proposal: null, executed: null, evaluation: null,
  sessionKey: crypto.getRandomValues(new Uint8Array(32)), model: null, viewCache: new Map(),
};
const cancelled = new Set<string>();

const spanDetector = createSpanDetector();
const spanIndex: SpanIndex = {
  get(table, column, row) {
    const key = `${table}.${column}:${row}`;
    let s = session.spanCache.get(key);
    if (!s) {
      const t = session.tables.find((x) => x.name === table);
      const ci = t?.columns.indexOf(column) ?? -1;
      const text = t && ci >= 0 ? t.data[ci]?.[row] : null;
      s = text ? spanDetector.detect(text, { column }) : [];
      session.spanCache.set(key, s);
    }
    return s;
  },
};

function tableName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_");
}

function parseCsv(file: { name: string; data: ArrayBuffer }): TableData {
  const text = new TextDecoder("utf-8").decode(file.data);
  const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: "greedy", dynamicTyping: false });
  const rows = parsed.data;
  const warnings = parsed.errors.slice(0, 20).map((e) => `row ${e.row ?? "?"}: ${e.message}`);
  const header = (rows[0] ?? []).map((h, i) => (h && h.trim()) || `column_${i + 1}`);
  const body = rows.slice(1);
  const data: (string | null)[][] = header.map(() => new Array<string | null>(body.length));
  for (let r = 0; r < body.length; r++) {
    const row = body[r] ?? [];
    if (row.length !== header.length && warnings.length < 25) warnings.push(`row ${r + 2}: ${row.length} fields, expected ${header.length}`);
    for (let c = 0; c < header.length; c++) {
      const v = row[c];
      data[c]![r] = v === undefined || v === "" ? null : v;
    }
  }
  return { name: tableName(file.name), fileName: file.name, columns: header, data, rowCount: body.length, byteSize: file.data.byteLength, sha256: sha256Hex(file.data), parseWarnings: warnings };
}

function requireManifest(): DatasetManifest { if (!session.manifest) throw new Error("import data first"); return session.manifest; }
function requireDetections(): DetectionSet { if (!session.detections) throw new Error("profile data first"); return session.detections; }
function requireProposal(planHash: string): Proposal {
  if (!session.proposal) throw new Error("no proposal");
  if (session.proposal.planHash !== planHash) throw new Error("stale plan: the proposal changed");
  return session.proposal;
}

const progress = (requestId: string, stage: string) => (done: number, total: number, message?: string) => post({ kind: "progress", requestId, stage, done, total, message });

async function handle(req: WorkerRequest): Promise<void> {
  const { requestId } = req;
  switch (req.kind) {
    case "import": {
      session.tables = []; session.manifest = null; session.detections = null; session.spanCache.clear(); session.proposal = null; session.executed = null; session.evaluation = null; session.viewCache.clear();
      const errors: string[] = [];
      const seen = new Set<string>();
      req.files.forEach((f, i) => {
        progress(requestId, "parsing")(i, req.files.length, f.name);
        try {
          const t = parseCsv(f);
          if (seen.has(t.name)) { errors.push(`${f.name}: duplicate table name ${t.name}`); return; }
          if (!t.columns.length) { errors.push(`${f.name}: no columns found`); return; }
          seen.add(t.name); session.tables.push(t);
        } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
      });
      if (!session.tables.length) { post({ kind: "error", requestId, message: errors.join("\n") || "no readable tables", recoverable: true }); return; }
      const { manifest } = createProfiler().profile(session.tables, progress(requestId, "profiling"));
      session.manifest = manifest;
      post({ kind: "imported", requestId, manifest, errors });
      return;
    }
    case "profile": {
      const manifest = requireManifest();
      const detections = createFieldDetector().detectFields(session.tables, manifest, spanDetector, progress(requestId, "detecting"));
      session.detections = detections;
      post({ kind: "profiled", requestId, detections });
      return;
    }
    case "propose": {
      const manifest = requireManifest();
      const detections = requireDetections();
      let goal = req.goal;
      if (!goal.embedding) {
        const embedder = await createGoalEmbedder();
        if (embedder) goal = { ...goal, embedding: { model: embedder.model, dims: embedder.dims, vector: await embedder.embed(goal.task.description || goal.rawText) } };
      }
      session.goal = goal;
      const units = buildDecisionUnits(manifest, detections.fields);
      const sctx: SelectionContext = { manifest, goal, detections: detections.fields, units, registry, overrides: req.overrides };
      let selector: Selector;
      if (req.selectorId === "learned") {
        if (!session.model) throw new Error("no learned model loaded");
        selector = createLearnedSelector(session.model);
      } else selector = new PolicySelector();
      const proposal = await selector.propose(sctx);
      session.proposal = proposal; session.executed = null; session.evaluation = null; session.viewCache.clear();
      post({ kind: "proposed", requestId, proposal });
      return;
    }
    case "execute": {
      const manifest = requireManifest();
      const proposal = requireProposal(req.planHash);
      const executed = createExecutor().execute({ tables: session.tables, manifest, proposal, spans: spanIndex, sessionKey: session.sessionKey }, progress(requestId, "executing"));
      session.executed = executed; session.evaluation = null; session.viewCache.clear();
      const tables: OutputTableSummary[] = executed.tables.map((t) => ({ name: t.name, rowCount: t.rowCount, columns: t.columns, sha256: t.sha256 }));
      post({ kind: "executed", requestId, planHash: proposal.planHash, outputHash: executed.outputHash, tables, durationMs: executed.durationMs });
      return;
    }
    case "evaluate": {
      const manifest = requireManifest();
      const proposal = requireProposal(req.planHash);
      if (!session.executed || session.executed.planHash !== proposal.planHash) throw new Error("execute the plan before evaluating");
      if (!session.goal) throw new Error("no goal");
      const devLabels = req.devLabels?.map((d) => ({ ...d, idColumn: session.tables.find((t) => t.name === d.table)?.columns[0] ?? "" }));
      const evaluation = createEvaluator().evaluate({ original: session.tables, manifest, detections: requireDetections(), spans: spanIndex, goal: session.goal, proposal, executed: session.executed, devLabels }, progress(requestId, "evaluating"));
      session.evaluation = evaluation;
      post({ kind: "evaluated", requestId, evaluation });
      return;
    }
    case "rows": {
      post(rowsResponse(req));
      return;
    }
    case "cell": {
      const t = session.tables.find((x) => x.name === req.table);
      if (!t) throw new Error(`unknown table ${req.table}`);
      const ci = t.columns.indexOf(req.column);
      const original = ci >= 0 ? t.data[ci]?.[req.row] ?? null : null;
      const out = session.executed?.tables.find((x) => x.name === req.table);
      const oi = out?.columns.findIndex((c) => c.sourceColumn === req.column || c.name === req.column) ?? -1;
      const prot = out && oi >= 0 ? out.data[oi]?.[req.row] ?? null : null;
      const change = out && oi >= 0 ? cellChange(out.name, oi, req.row) : null;
      post({ kind: "cell", requestId, original, protected: prot, change });
      return;
    }
    case "export": {
      const manifest = requireManifest();
      const proposal = requireProposal(req.planHash);
      if (!session.executed || session.executed.planHash !== proposal.planHash) throw new Error("execute the plan before exporting");
      if (!session.evaluation || session.evaluation.planHash !== proposal.planHash) throw new Error("evaluate the plan before exporting");
      if (!session.goal) throw new Error("no goal");
      const { receipt, files } = await createExportService().build({ manifest, goal: session.goal, proposal, executed: session.executed, evaluation: session.evaluation });
      const payload = files.map((f) => ({ name: f.name, data: f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer, mime: f.mime }));
      post({ kind: "exported", requestId, receipt, files: payload }, payload.map((f) => f.data));
      return;
    }
    case "embed": {
      const embedder = await createGoalEmbedder();
      if (!embedder) throw new Error("no embedding model available");
      post({ kind: "embedded", requestId, model: embedder.model, vector: await embedder.embed(req.text) });
      return;
    }
    case "loadModel": {
      const res = await fetch(req.artifactUrl);
      if (!res.ok) throw new Error(`model fetch failed: ${res.status}`);
      const parsed = ModelArtifactSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error(`model artifact invalid: ${parsed.error.issues[0]?.message ?? "schema"}`);
      if (parsed.data.registryVersion !== registry.version) throw new Error(`model built for registry ${parsed.data.registryVersion}, app has ${registry.version}`);
      session.model = parsed.data;
      post({ kind: "modelLoaded", requestId, modelId: parsed.data.modelId, registryVersion: parsed.data.registryVersion });
      return;
    }
    case "cancel": {
      cancelled.add(req.target);
      post({ kind: "cancelled", requestId: req.target });
      return;
    }
  }
}

function highlightFor(recipeId: Proposal["decisions"][number]["selected"] extends infer S ? (S extends { recipeId: infer R } ? R : never) : never): HighlightKind {
  return getRecipe(recipeId).highlight;
}

function cellChange(table: string, outCol: number, row: number): CellChange | null {
  const out = session.executed?.tables.find((x) => x.name === table);
  const col = out?.columns[outCol];
  const proposal = session.proposal;
  if (!out || !col || !proposal || !col.unitId) return null;
  const decision = proposal.decisions.find((d) => d.unitId === col.unitId);
  if (!decision?.selected) return null;
  const tc = out.textChanges.get(`${outCol}:${row}`);
  const kind: HighlightKind = decision.needsReview ? "review" : highlightFor(decision.selected.recipeId);
  if (tc) {
    return { kind, unitId: col.unitId, recipeId: decision.selected.recipeId, spans: tc.spans.map((s) => ({ ...s, label: s.label as SpanDetection["label"], score: 1, ruleId: "executed" })) };
  }
  if (col.status === "kept") return null;
  return { kind, unitId: col.unitId, recipeId: decision.selected.recipeId };
}

function rowsResponse(req: Extract<WorkerRequest, { kind: "rows" }>): WorkerResponse {
  const { requestId, table, view, offset, limit } = req;
  const orig = session.tables.find((x) => x.name === table);
  if (!orig) throw new Error(`unknown table ${table}`);
  const out = view === "protected" ? session.executed?.tables.find((x) => x.name === table) ?? null : null;
  if (view === "protected" && !out) throw new Error("no protected output for this plan yet");
  const order = viewOrder(orig, out, req.sort, req.filter);
  const slice = order.slice(offset, offset + limit);
  const columns = out ? out.columns.map((c) => c.name) : orig.columns;
  const rows: RowView[] = slice.map((r) => {
    if (!out) return { row: r, cells: orig.columns.map((_, c) => orig.data[c]?.[r] ?? null) };
    const changes: Record<string, CellChange> = {};
    out.columns.forEach((c, ci) => { const ch = cellChange(table, ci, r); if (ch) changes[c.name] = ch; });
    return { row: r, cells: out.columns.map((_, ci) => out.data[ci]?.[r] ?? null), changes };
  });
  return { kind: "rows", requestId, table, view, offset, total: order.length, columns, rows };
}

function viewOrder(orig: TableData, out: ExecutedPlan["tables"][number] | null, sort?: RowSort, filter?: RowFilter): number[] {
  const key = JSON.stringify({ t: orig.name, v: out ? out.sha256 : "orig", sort, filter });
  const cached = session.viewCache.get(key);
  if (cached) return cached;
  let idx = Array.from({ length: orig.rowCount }, (_, i) => i);
  if (filter && out) {
    const unitSet = filter.unitIds ? new Set(filter.unitIds) : null;
    const hl = filter.highlights ? new Set(filter.highlights) : null;
    const search = filter.search?.toLowerCase();
    idx = idx.filter((r) => {
      let changed = false, matchUnit = !unitSet, matchHl = !hl, matchReview = !filter.needsReview, matchSearch = !search;
      out.columns.forEach((c, ci) => {
        const ch = cellChange(orig.name, ci, r);
        if (ch) { changed = true; if (unitSet?.has(ch.unitId)) matchUnit = true; if (hl?.has(ch.kind)) matchHl = true; if (ch.kind === "review") matchReview = true; }
        if (search && !matchSearch && (out.data[ci]?.[r] ?? "").toLowerCase().includes(search)) matchSearch = true;
      });
      if (filter.onlyChanged && !changed) return false;
      return matchUnit && matchHl && matchReview && matchSearch;
    });
  } else if (filter?.search) {
    const s = filter.search.toLowerCase();
    idx = idx.filter((r) => orig.columns.some((_, c) => (orig.data[c]?.[r] ?? "").toLowerCase().includes(s)));
  }
  if (sort) {
    const src = out ?? orig;
    const ci = out ? out.columns.findIndex((c) => c.name === sort.column) : orig.columns.indexOf(sort.column);
    if (ci >= 0) {
      const col = src.data[ci] ?? [];
      const numeric = col.slice(0, 200).every((v) => v === null || v === "" || !Number.isNaN(Number(v)));
      const dir = sort.dir === "asc" ? 1 : -1;
      idx = [...idx].sort((a, b) => {
        const va = col[a] ?? null, vb = col[b] ?? null;
        if (va === null && vb === null) return 0; if (va === null) return 1; if (vb === null) return -1;
        return dir * (numeric ? Number(va) - Number(vb) : va.localeCompare(vb));
      });
    }
  }
  session.viewCache.set(key, idx);
  return idx;
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  handle(req).catch((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    post({ kind: "error", requestId: req.requestId, message, recoverable: true });
  });
};
