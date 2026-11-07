/**
 * PipelineSession: the whole Mask pipeline over in-memory tables, independent of the worker transport.
 * The worker wraps it; tests drive it directly. It owns original tables, manifest, detections, the span
 * cache, the current proposal, executed outputs and the evaluation. Raw values never leave it except through
 * row views requested for display and the export files.
 */
import Papa from "papaparse";
import type {
  CellChange, DatasetManifest, DetectionSet, DecisionOverride, Evaluation, GoalSpec, HighlightKind, ModelArtifact,
  OutputTableSummary, Proposal, RowFilter, RowSort, RowView, SpanDetection, ViewMode, RecipeId, ExportReceipt,
} from "@/contracts";
import { ModelArtifactSchema } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { sha256Hex } from "@/core/util/hash";
import { createProfiler, createFieldDetector, createSpanDetector } from "@/core/detect";
import { createExecutor, type ExecutedPlan, type SpanIndex } from "@/core/execute";
import { createEvaluator } from "@/core/evaluate";
import { createExportService, type ExportFile } from "@/core/export";
import { createGoalEmbedder } from "@/core/goal";
import { registry, getRecipe } from "@/core/registry";
import { buildDecisionUnits, PolicySelector, type SelectionContext, type Selector } from "@/core/selector";
import { createLearnedSelector } from "@/core/selector/learned";

export type Progress = (done: number, total: number, message?: string) => void;
const noop: Progress = () => {};

export interface DevLabels { table: string; column: string; spans: Record<string, SpanDetection[]> }

export function tableNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_");
}

export function parseCsv(file: { name: string; data: ArrayBuffer | Uint8Array | string }): TableData {
  const bytes = typeof file.data === "string" ? new TextEncoder().encode(file.data) : file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : file.data;
  const text = new TextDecoder("utf-8").decode(bytes);
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
  return { name: tableNameFromFile(file.name), fileName: file.name, columns: header, data, rowCount: body.length, byteSize: bytes.byteLength, sha256: sha256Hex(bytes), parseWarnings: warnings };
}

export class PipelineSession {
  tables: TableData[] = [];
  manifest: DatasetManifest | null = null;
  detections: DetectionSet | null = null;
  goal: GoalSpec | null = null;
  proposal: Proposal | null = null;
  executed: ExecutedPlan | null = null;
  evaluation: Evaluation | null = null;
  model: ModelArtifact | null = null;
  private spanCache = new Map<string, SpanDetection[]>();
  private viewCache = new Map<string, number[]>();
  private spanDetector = createSpanDetector();
  readonly spanIndex: SpanIndex;

  constructor(private sessionKey: Uint8Array = crypto.getRandomValues(new Uint8Array(32))) {
    this.spanIndex = {
      get: (table, column, row) => {
        const key = `${table}.${column}:${row}`;
        let s = this.spanCache.get(key);
        if (!s) {
          const t = this.tables.find((x) => x.name === table);
          const ci = t?.columns.indexOf(column) ?? -1;
          const text = t && ci >= 0 ? t.data[ci]?.[row] : null;
          s = text ? this.spanDetector.detect(text, { column }) : [];
          this.spanCache.set(key, s);
        }
        return s;
      },
    };
  }

  private reset() {
    this.tables = []; this.manifest = null; this.detections = null; this.spanCache.clear();
    this.proposal = null; this.executed = null; this.evaluation = null; this.viewCache.clear();
  }

  import(files: { name: string; data: ArrayBuffer | Uint8Array | string }[], progress: Progress = noop): { manifest: DatasetManifest; errors: string[] } {
    this.reset();
    const errors: string[] = [];
    const seen = new Set<string>();
    files.forEach((f, i) => {
      progress(i, files.length, f.name);
      try {
        const t = parseCsv(f);
        if (seen.has(t.name)) { errors.push(`${f.name}: duplicate table name ${t.name}`); return; }
        if (!t.columns.length) { errors.push(`${f.name}: no columns found`); return; }
        seen.add(t.name); this.tables.push(t);
      } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); }
    });
    if (!this.tables.length) throw new Error(errors.join("\n") || "no readable tables");
    const { manifest } = createProfiler().profile(this.tables, progress);
    this.manifest = manifest;
    return { manifest, errors };
  }

  profile(progress: Progress = noop): DetectionSet {
    const manifest = this.requireManifest();
    const detections = createFieldDetector().detectFields(this.tables, manifest, this.spanDetector, progress);
    this.detections = detections;
    return detections;
  }

  async propose(goal: GoalSpec, selectorId: "policy" | "learned", overrides: DecisionOverride[]): Promise<Proposal> {
    const manifest = this.requireManifest();
    const detections = this.requireDetections();
    let g = goal;
    if (!g.embedding) {
      const embedder = await createGoalEmbedder();
      if (embedder) g = { ...g, embedding: { model: embedder.model, dims: embedder.dims, vector: await embedder.embed(g.task.description || g.rawText) } };
    }
    this.goal = g;
    const units = buildDecisionUnits(manifest, detections.fields);
    const ctx: SelectionContext = { manifest, goal: g, detections: detections.fields, units, registry, overrides };
    let selector: Selector;
    if (selectorId === "learned") {
      if (!this.model) throw new Error("no learned model loaded");
      selector = createLearnedSelector(this.model);
    } else selector = new PolicySelector();
    const proposal = await selector.propose(ctx);
    this.proposal = proposal; this.executed = null; this.evaluation = null; this.viewCache.clear();
    return proposal;
  }

  execute(planHash: string, progress: Progress = noop): { planHash: string; outputHash: string; tables: OutputTableSummary[]; durationMs: number } {
    const manifest = this.requireManifest();
    const proposal = this.requireProposal(planHash);
    const executed = createExecutor().execute({ tables: this.tables, manifest, proposal, spans: this.spanIndex, sessionKey: this.sessionKey }, progress);
    this.executed = executed; this.evaluation = null; this.viewCache.clear();
    return { planHash: proposal.planHash, outputHash: executed.outputHash, durationMs: executed.durationMs, tables: executed.tables.map((t) => ({ name: t.name, rowCount: t.rowCount, columns: t.columns, sha256: t.sha256 })) };
  }

  evaluate(planHash: string, devLabels?: DevLabels[], progress: Progress = noop): Evaluation {
    const manifest = this.requireManifest();
    const proposal = this.requireProposal(planHash);
    if (!this.executed || this.executed.planHash !== proposal.planHash) throw new Error("execute the plan before evaluating");
    if (!this.goal) throw new Error("no goal");
    const labels = devLabels?.map((d) => ({ ...d, idColumn: this.tables.find((t) => t.name === d.table)?.columns[0] ?? "" }));
    const evaluation = createEvaluator().evaluate({ original: this.tables, manifest, detections: this.requireDetections(), spans: this.spanIndex, goal: this.goal, proposal, executed: this.executed, devLabels: labels }, progress);
    this.evaluation = evaluation;
    return evaluation;
  }

  async export(planHash: string): Promise<{ receipt: ExportReceipt; files: ExportFile[] }> {
    const manifest = this.requireManifest();
    const proposal = this.requireProposal(planHash);
    if (!this.executed || this.executed.planHash !== proposal.planHash) throw new Error("execute the plan before exporting");
    if (!this.evaluation || this.evaluation.planHash !== proposal.planHash) throw new Error("evaluate the plan before exporting");
    if (!this.goal) throw new Error("no goal");
    return createExportService().build({ manifest, goal: this.goal, proposal, executed: this.executed, evaluation: this.evaluation });
  }

  loadModel(json: unknown): ModelArtifact {
    const parsed = ModelArtifactSchema.safeParse(json);
    if (!parsed.success) throw new Error(`model artifact invalid: ${parsed.error.issues[0]?.message ?? "schema"}`);
    if (parsed.data.registryVersion !== registry.version) throw new Error(`model built for registry ${parsed.data.registryVersion}, app has ${registry.version}`);
    this.model = parsed.data;
    return parsed.data;
  }

  cell(table: string, row: number, column: string): { original: string | null; protected: string | null; change: CellChange | null } {
    const t = this.tables.find((x) => x.name === table);
    if (!t) throw new Error(`unknown table ${table}`);
    const ci = t.columns.indexOf(column);
    const original = ci >= 0 ? t.data[ci]?.[row] ?? null : null;
    const out = this.executed?.tables.find((x) => x.name === table);
    const oi = out?.columns.findIndex((c) => c.sourceColumn === column || c.name === column) ?? -1;
    const prot = out && oi >= 0 ? out.data[oi]?.[row] ?? null : null;
    const change = out && oi >= 0 ? this.cellChange(out.name, oi, row) : null;
    return { original, protected: prot, change };
  }

  rows(req: { table: string; view: ViewMode; offset: number; limit: number; sort?: RowSort; filter?: RowFilter }): { table: string; view: ViewMode; offset: number; total: number; columns: string[]; rows: RowView[] } {
    const { table, view, offset, limit } = req;
    const orig = this.tables.find((x) => x.name === table);
    if (!orig) throw new Error(`unknown table ${table}`);
    const out = view === "protected" ? this.executed?.tables.find((x) => x.name === table) ?? null : null;
    if (view === "protected" && !out) throw new Error("no protected output for this plan yet");
    const order = this.viewOrder(orig, out, req.sort, req.filter);
    const slice = order.slice(offset, offset + limit);
    const columns = out ? out.columns.map((c) => c.name) : orig.columns;
    const rows: RowView[] = slice.map((r) => {
      if (!out) return { row: r, cells: orig.columns.map((_, c) => orig.data[c]?.[r] ?? null) };
      const changes: Record<string, CellChange> = {};
      out.columns.forEach((c, ci) => { const ch = this.cellChange(table, ci, r); if (ch) changes[c.name] = ch; });
      return { row: r, cells: out.columns.map((_, ci) => out.data[ci]?.[r] ?? null), changes };
    });
    return { table, view, offset, total: order.length, columns, rows };
  }

  private cellChange(table: string, outCol: number, row: number): CellChange | null {
    const out = this.executed?.tables.find((x) => x.name === table);
    const col = out?.columns[outCol];
    const proposal = this.proposal;
    if (!out || !col || !proposal || !col.unitId) return null;
    const decision = proposal.decisions.find((d) => d.unitId === col.unitId);
    if (!decision?.selected) return null;
    const tc = out.textChanges.get(`${outCol}:${row}`);
    const kind: HighlightKind = decision.needsReview ? "review" : getRecipe(decision.selected.recipeId as RecipeId).highlight;
    if (tc) {
      return { kind, unitId: col.unitId, recipeId: decision.selected.recipeId, spans: tc.spans.map((s) => ({ ...s, label: s.label as SpanDetection["label"], score: 1, ruleId: "executed" })) };
    }
    if (col.status === "kept") return null;
    return { kind, unitId: col.unitId, recipeId: decision.selected.recipeId };
  }

  private viewOrder(orig: TableData, out: ExecutedPlan["tables"][number] | null, sort?: RowSort, filter?: RowFilter): number[] {
    const key = JSON.stringify({ t: orig.name, v: out ? out.sha256 : "orig", sort, filter });
    const cached = this.viewCache.get(key);
    if (cached) return cached;
    let idx = Array.from({ length: orig.rowCount }, (_, i) => i);
    if (filter && out) {
      const unitSet = filter.unitIds ? new Set(filter.unitIds) : null;
      const hl = filter.highlights ? new Set(filter.highlights) : null;
      const search = filter.search?.toLowerCase();
      idx = idx.filter((r) => {
        let changed = false, matchUnit = !unitSet, matchHl = !hl, matchReview = !filter.needsReview, matchSearch = !search;
        out.columns.forEach((c, ci) => {
          const ch = this.cellChange(orig.name, ci, r);
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
    this.viewCache.set(key, idx);
    return idx;
  }

  private requireManifest(): DatasetManifest { if (!this.manifest) throw new Error("import data first"); return this.manifest; }
  private requireDetections(): DetectionSet { if (!this.detections) throw new Error("profile data first"); return this.detections; }
  private requireProposal(planHash: string): Proposal {
    if (!this.proposal) throw new Error("no proposal");
    if (this.proposal.planHash !== planHash) throw new Error("stale plan: the proposal changed");
    return this.proposal;
  }
}
