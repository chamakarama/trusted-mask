/**
 * Shared helpers for the label pipeline: paths, the challenge catalog, a streaming CSV profiler with a cache,
 * catalog-based relationships, manifests/detections built from catalog rows, splits and task ids.
 * Runs in Node (npx vite-node). Raw values never leave this module: only statistics are returned or cached.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import type {
  ColumnManifest, ColumnStats, DatasetManifest, FieldDetection, InferredType, PrivacyRole, Relationship, Subtype,
} from "@/contracts";
import { PRIVACY_ROLES, SUBTYPES, columnKey } from "@/contracts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MASK_DIR = path.resolve(HERE, "..", "..");
export const ML_DIR = process.env.MASK_ML_DIR ? path.resolve(process.env.MASK_ML_DIR) : path.join(MASK_DIR, "ml");
export const CHALLENGE_DIR = process.env.MASK_CHALLENGE_DIR
  ? path.resolve(process.env.MASK_CHALLENGE_DIR)
  : path.resolve(MASK_DIR, "..", "TRUSTED_SinceAI2026_FINAL", "TRUSTED_PETS_PROVING_GROUND_2026");
export const SAMPLE_ROWS = 20_000;
export const STATS_CACHE_VERSION = 2;

export const PROMPT_VERSION = "annotator-1";
export const CHALLENGER_PROMPT_VERSION = "challenger-1";

export const paths = {
  splits: () => path.join(ML_DIR, "SPLITS.json"),
  statsCache: () => path.join(ML_DIR, "cache", "stats"),
  tasks: () => path.join(ML_DIR, "labels", "tasks"),
  annotations: () => path.join(ML_DIR, "labels", "annotations"),
  challenges: () => path.join(ML_DIR, "labels", "challenges"),
  records: () => path.join(ML_DIR, "labels", "records.jsonl"),
  data: () => path.join(ML_DIR, "data"),
};

// ---------- CLI ----------

export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== undefined) out[k!] = v;
    else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) out[k!] = argv[++i]!;
    else out[k!] = true;
  }
  return out;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
export const readJson = <T = unknown>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
export const sha256File = (file: string): string => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export const sha256Str = (s: string): string => createHash("sha256").update(s).digest("hex");

export function gitRevision(): string {
  try {
    const rev = execSync("git rev-parse HEAD", { cwd: MASK_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: MASK_DIR, stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0;
    return dirty ? `${rev}+dirty` : rev;
  } catch { return "unknown"; }
}

/** Filesystem-safe unit id; long ids get a hash suffix so file names stay unique and short. */
export function safeId(id: string): string {
  const s = id.replace(/[^A-Za-z0-9._-]+/g, "_");
  return s.length <= 120 ? s : `${s.slice(0, 100)}_${sha256Str(id).slice(0, 12)}`;
}
export const taskIdOf = (scenarioId: string, unitId: string): string => `${scenarioId}::${unitId}`;

// ---------- splits ----------

export interface Splits { version: 1; frozenAt: string; rule: string; groups: { train: string[]; val: string[]; test: string[] } }

export function loadSplits(): { splits: Splits; hash: string; splitOf: (group: string) => "train" | "val" | "test" } {
  const file = paths.splits();
  const splits = readJson<Splits>(file);
  const m = new Map<string, "train" | "val" | "test">();
  for (const s of ["train", "val", "test"] as const) for (const g of splits.groups[s]) {
    if (m.has(g)) throw new Error(`SPLITS.json assigns ${g} twice`);
    m.set(g, s);
  }
  return {
    splits, hash: sha256File(file),
    splitOf: (g) => { const s = m.get(g); if (!s) throw new Error(`source group ${g} is not in SPLITS.json`); return s; },
  };
}

// ---------- challenge catalog ----------

export interface CatalogRow {
  dataset: string; table: string; column: string; privacy_role: PrivacyRole; data_kind: string; subtype: Subtype;
  art9: boolean; description: string; traps: string;
}

export function loadCatalog(): CatalogRow[] {
  const text = fs.readFileSync(path.join(CHALLENGE_DIR, "metadata", "field_catalog.csv"), "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.map((r) => {
    const role = r.privacy_role as PrivacyRole;
    const subtype = r.subtype as Subtype;
    if (!PRIVACY_ROLES.includes(role)) throw new Error(`catalog: unknown role ${role} for ${r.dataset}.${r.table}.${r.column}`);
    if (!SUBTYPES.includes(subtype)) throw new Error(`catalog: unknown subtype ${subtype}`);
    return {
      dataset: r.dataset!, table: r.table!, column: r.column!, privacy_role: role, data_kind: r.data_kind ?? "", subtype,
      art9: String(r.art9_special_category).toLowerCase() === "true", description: r.description ?? "", traps: r.traps ?? "",
    };
  });
}

export interface Scenario {
  id: string; dataset: string; title: string; recipient: string; purpose: string; trust_level: string; threat_model: string;
  legal_context?: string; utility_requirements: string[]; suggested_privacy_targets?: string; notes?: string;
}
export const loadScenarios = (): Scenario[] => readJson<Scenario[]>(path.join(CHALLENGE_DIR, "metadata", "scenarios.json"));

export interface UtilityTaskInfo { id: string; table: string; description: string; kind: string }
/** Utility task descriptions parsed from the organiser toolkit (id, table, description). Best effort. */
export function loadUtilityTasks(): Map<string, UtilityTaskInfo> {
  const dir = path.join(CHALLENGE_DIR, "toolkit", "pets_eval", "utility");
  const out = new Map<string, UtilityTaskInfo>();
  if (!fs.existsSync(dir)) return out;
  const re = /UtilityTask\(\s*"([A-Z]+-[A-Z0-9]+)",\s*\w+,\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".py")).sort()) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/"\s*\n\s*"/g, "");
    for (const m of src.matchAll(re)) out.set(m[1]!, { id: m[1]!, table: m[2]!, description: m[3]!, kind: m[4]! });
  }
  return out;
}

/** Span label counts per text column from metadata/pii_spans/<dataset>__<table>__<column>.jsonl */
export function loadSpanCounts(dataset: string): Map<string, { byLabel: Record<string, number>; rowsWithSpans: number }> {
  const dir = path.join(CHALLENGE_DIR, "metadata", "pii_spans");
  const out = new Map<string, { byLabel: Record<string, number>; rowsWithSpans: number }>();
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(`${dataset}__`) && x.endsWith(".jsonl")).sort()) {
    const [, table, column] = f.replace(/\.jsonl$/, "").split("__");
    const byLabel: Record<string, number> = {};
    let rows = 0;
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as { spans?: { label: string }[] };
      if (r.spans?.length) rows++;
      for (const s of r.spans ?? []) byLabel[s.label] = (byLabel[s.label] ?? 0) + 1;
    }
    out.set(`${table}.${column}`, { byLabel, rowsWithSpans: rows });
  }
  return out;
}

// ---------- CSV profiling ----------

export interface TableProfile {
  cacheVersion: number;
  dataset: string; table: string; fileName: string;
  rowCount: number; byteSize: number; sha256: string; sampledRows: number;
  columns: ColumnManifest[];
  /** share of non-empty sampled values that are valid Finnish identity codes, per column */
  hetuMatch: Record<string, number>;
  parseWarnings: string[];
}

const RE_INT = /^[+-]?\d+$/;
const RE_NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const RE_BOOL = /^(true|false|True|False|TRUE|FALSE)$/;
const HETU_RE = /^(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-Y])$/;
const HETU_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY";

export function isValidHetu(v: string): boolean {
  const m = HETU_RE.exec(v.trim());
  if (!m) return false;
  const n = Number(`${m[1]}${m[2]}${m[3]}${m[5]}`);
  return HETU_CHECK[n % 31] === m[6];
}

function inferType(values: string[]): InferredType {
  if (!values.length) return "empty";
  const share = (re: RegExp) => values.filter((v) => re.test(v)).length / values.length;
  if (share(RE_BOOL) >= 0.95) return "boolean";
  if (share(RE_INT) >= 0.95) return "integer";
  if (share(RE_NUM) >= 0.95) return "number";
  if (share(RE_DATETIME) >= 0.95) return "datetime";
  if (share(RE_DATE) >= 0.95) return "date";
  return "string";
}

function columnStats(values: (string | null)[], inferredType: InferredType): ColumnStats {
  const nonEmpty = values.filter((v): v is string => v !== null && v !== "");
  const counts = new Map<string, number>();
  for (const v of nonEmpty) counts.set(v, (counts.get(v) ?? 0) + 1);
  const n = nonEmpty.length;
  const nums = nonEmpty.filter((v) => RE_NUM.test(v)).map(Number);
  const stats: ColumnStats = {
    count: values.length, nonEmpty: n, distinct: counts.size, uniqueRatio: n ? counts.size / n : 0,
    meanLength: n ? nonEmpty.reduce((s, v) => s + v.length, 0) / n : 0,
    maxLength: nonEmpty.reduce((s, v) => Math.max(s, v.length), 0),
    spaceShare: n ? nonEmpty.filter((v) => /\s/.test(v)).length / n : 0,
    numericShare: n ? nums.length / n : 0,
  };
  if (nums.length && nums.length / n >= 0.9) {
    let min = Infinity, max = -Infinity, sum = 0;
    for (const x of nums) { if (x < min) min = x; if (x > max) max = x; sum += x; }
    stats.numeric = { min, max, mean: sum / nums.length };
  }
  if (counts.size > 0 && counts.size <= 200) {
    let minC = Infinity;
    for (const c of counts.values()) minC = Math.min(minC, c);
    stats.minCategoryShare = minC / n;
    stats.rareCategoryCount = [...counts.values()].filter((c) => c < 5).length;
  }
  if (inferredType === "date" || inferredType === "datetime") {
    const ds = nonEmpty.filter((v) => RE_DATE.test(v) || RE_DATETIME.test(v)).sort();
    if (ds.length) stats.temporal = { min: ds[0]!, max: ds[ds.length - 1]!, hasTime: inferredType === "datetime" };
  }
  return stats;
}

/**
 * Stream one CSV: full row count + sha256, statistics from the first SAMPLE_ROWS rows, and full distinct value
 * sets for the requested columns (used only to measure relationship match rates; never cached or written).
 */
export async function profileCsv(file: string, keepDistinct: string[] = []): Promise<{ header: string[]; rowCount: number; sha256: string; byteSize: number; sample: (string | null)[][]; distinct: Map<string, Set<string>>; warnings: string[] }> {
  const hash = createHash("sha256");
  const byteSize = fs.statSync(file).size;
  let header: string[] = [];
  const sample: (string | null)[][] = [];
  const distinct = new Map<string, Set<string>>(keepDistinct.map((c) => [c, new Set<string>()]));
  let keepIdx: [number, Set<string>][] = [];
  let rowCount = 0;
  const warnings: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const rs = fs.createReadStream(file);
    rs.on("data", (chunk) => hash.update(chunk));
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: false, skipEmptyLines: true });
    parser.on("data", (row: string[]) => {
      if (!header.length) {
        header = row.map((h) => h.replace(/^﻿/, ""));
        keepIdx = keepDistinct.map((c) => [header.indexOf(c), distinct.get(c)!] as [number, Set<string>]).filter(([i]) => i >= 0);
        if (header.length === 0) warnings.push("empty header");
        return;
      }
      if (row.length !== header.length && warnings.length < 5) warnings.push(`row ${rowCount + 1} has ${row.length} fields, header has ${header.length}`);
      if (rowCount < SAMPLE_ROWS) header.forEach((_, i) => { (sample[i] ??= []).push(row[i] === undefined || row[i] === "" ? null : row[i]!); });
      for (const [i, set] of keepIdx) { const v = row[i]; if (v) set.add(v); }
      rowCount++;
    });
    parser.on("end", () => resolve());
    parser.on("error", reject);
    rs.on("error", reject);
    rs.pipe(parser);
  });
  return { header, rowCount, sha256: hash.digest("hex"), byteSize, sample, distinct, warnings };
}

export function tableFile(dataset: string, table: string): string {
  return path.join(CHALLENGE_DIR, "data", dataset, `${table}.csv`);
}

function buildProfile(dataset: string, table: string, p: Awaited<ReturnType<typeof profileCsv>>, hetuCols: string[]): TableProfile {
  const columns: ColumnManifest[] = p.header.map((name, index) => {
    const values = p.sample[index] ?? [];
    const nonEmpty = values.filter((v): v is string => v !== null);
    const inferredType = inferType(nonEmpty);
    return { name, index, inferredType, stats: columnStats(values, inferredType) };
  });
  const hetuMatch: Record<string, number> = {};
  for (const c of hetuCols) {
    const i = p.header.indexOf(c);
    if (i < 0) continue;
    const ne = (p.sample[i] ?? []).filter((v): v is string => v !== null);
    hetuMatch[c] = ne.length ? ne.filter(isValidHetu).length / ne.length : 0;
  }
  return {
    cacheVersion: STATS_CACHE_VERSION, dataset, table, fileName: `${table}.csv`, rowCount: p.rowCount, byteSize: p.byteSize, sha256: p.sha256,
    sampledRows: Math.min(p.rowCount, SAMPLE_ROWS), columns, hetuMatch, parseWarnings: p.warnings,
  };
}

// ---------- relationships from the catalog ----------

const ID_ROLES = new Set<PrivacyRole>(["direct_identifier", "technical_identifier", "record_key"]);

interface RelCandidate { a: { table: string; column: string }; b: { table: string; column: string }; declared: string | null }

/**
 * Candidate links: same column name across two tables of a dataset where both columns have identifier roles,
 * or an FK named in a description ("Foreign key to ed_visits", "(FK customers)", "join key to taps").
 */
export function relationshipCandidates(rows: CatalogRow[]): RelCandidate[] {
  const out = new Map<string, RelCandidate>();
  const tables = [...new Set(rows.map((r) => r.table))];
  const add = (a: CatalogRow, b: CatalogRow, declared: string | null) => {
    if (a.table === b.table) return;
    const [x, y] = [a, b].sort((p, q) => `${p.table}.${p.column}`.localeCompare(`${q.table}.${q.column}`));
    const k = `${x!.table}.${x!.column}|${y!.table}.${y!.column}`;
    const prev = out.get(k);
    out.set(k, { a: { table: x!.table, column: x!.column }, b: { table: y!.table, column: y!.column }, declared: prev?.declared ?? declared });
  };
  for (const r of rows) {
    const d = r.description;
    const m = /foreign key to (\w+)|\(FK (\w+)\)|FK (\w+)|join key to (\w+)|joins? \w+ to (\w+)|foreign key to (\w+)/i.exec(d);
    const target = m ? (m.slice(1).find((x) => x) ?? null) : null;
    if (target && tables.includes(target)) {
      const t = rows.find((x) => x.table === target && x.column === r.column);
      if (t) add(r, t, d);
    }
  }
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i]!, b = rows[j]!;
    if (a.column === b.column && a.table !== b.table && ID_ROLES.has(a.privacy_role) && ID_ROLES.has(b.privacy_role)) add(a, b, null);
  }
  return [...out.values()];
}

export interface DatasetProfile {
  dataset: string;
  tables: TableProfile[];
  relationships: Relationship[];
  /** measured candidates, including rejected ones, for the record */
  relationshipLog: { a: string; b: string; declared: boolean; matchAB: number; matchBA: number; kept: boolean }[];
}

/** Profile every catalogued table of a dataset (cached in ml/cache/stats). */
export async function profileDataset(dataset: string, rows: CatalogRow[], opts: { refresh?: boolean; log?: (s: string) => void } = {}): Promise<DatasetProfile> {
  const log = opts.log ?? (() => {});
  const cacheDir = paths.statsCache();
  const relFile = path.join(cacheDir, `${dataset}__relationships.json`);
  const tables = [...new Set(rows.map((r) => r.table))];
  const cands = relationshipCandidates(rows);
  const relCols = new Map<string, Set<string>>();
  for (const c of cands) for (const s of [c.a, c.b]) relCols.set(s.table, (relCols.get(s.table) ?? new Set()).add(s.column));
  const cached = (t: string) => {
    const f = path.join(cacheDir, `${dataset}__${t}.json`);
    if (opts.refresh || !fs.existsSync(f)) return null;
    const p = readJson<TableProfile>(f);
    return p.cacheVersion === STATS_CACHE_VERSION ? p : null;
  };
  const relCached = !opts.refresh && fs.existsSync(relFile) && tables.every((t) => cached(t))
    ? readJson<Pick<DatasetProfile, "relationships" | "relationshipLog"> & { cacheVersion: number }>(relFile) : null;
  const profiles: TableProfile[] = [];
  const distinct = new Map<string, Set<string>>();
  for (const t of tables) {
    const hit = cached(t);
    if (hit && relCached?.cacheVersion === STATS_CACHE_VERSION) { profiles.push(hit); continue; }
    const file = tableFile(dataset, t);
    if (!fs.existsSync(file)) throw new Error(`missing data file ${file}`);
    log(`profiling ${dataset}/${t}.csv`);
    const p = await profileCsv(file, [...(relCols.get(t) ?? [])]);
    for (const [c, set] of p.distinct) distinct.set(`${t}.${c}`, set);
    const hetuCols = rows.filter((r) => r.table === t && r.subtype === "NATIONAL_ID").map((r) => r.column);
    const prof = buildProfile(dataset, t, p, hetuCols);
    writeJson(path.join(cacheDir, `${dataset}__${t}.json`), prof);
    profiles.push(prof);
  }
  if (relCached && relCached.cacheVersion === STATS_CACHE_VERSION && distinct.size === 0) {
    return { dataset, tables: profiles, relationships: relCached.relationships, relationshipLog: relCached.relationshipLog };
  }
  // measure match rates on full distinct sets
  const relationships: Relationship[] = [];
  const relationshipLog: DatasetProfile["relationshipLog"] = [];
  for (const c of cands) {
    const A = distinct.get(`${c.a.table}.${c.a.column}`) ?? new Set<string>();
    const B = distinct.get(`${c.b.table}.${c.b.column}`) ?? new Set<string>();
    const rate = (x: Set<string>, y: Set<string>) => { if (!x.size) return 0; let n = 0; for (const v of x) if (y.has(v)) n++; return n / x.size; };
    const ab = rate(A, B), ba = rate(B, A);
    // from = the side whose values are (mostly) found in the other (child -> parent)
    const [from, to, mr] = ab >= ba ? [c.a, c.b, ab] : [c.b, c.a, ba];
    const kept = mr >= 0.5;
    relationshipLog.push({ a: columnKey(c.a), b: columnKey(c.b), declared: !!c.declared, matchAB: round(ab), matchBA: round(ba), kept });
    if (!kept) continue;
    relationships.push({
      id: `rel:${columnKey(from)}->${columnKey(to)}`, kind: c.declared ? "foreign_key" : "shared_identifier", from, to, matchRate: round(mr),
      evidence: c.declared ? `catalog: "${c.declared}"; measured value match ${round(mr)}` : `catalog: same column name and identifier role; measured value match ${round(mr)}`,
    });
  }
  relationships.sort((p, q) => p.id.localeCompare(q.id));
  writeJson(relFile, { cacheVersion: STATS_CACHE_VERSION, relationships, relationshipLog });
  return { dataset, tables: profiles, relationships, relationshipLog };
}
const round = (x: number) => Math.round(x * 1e4) / 1e4;

// ---------- manifest and detections ----------

export function buildManifest(dp: DatasetProfile): DatasetManifest {
  const tables = dp.tables.map((t) => ({
    name: t.table, fileName: t.fileName, rowCount: t.rowCount, byteSize: t.byteSize, sha256: t.sha256, columns: t.columns, parseWarnings: t.parseWarnings,
  }));
  return {
    version: 1,
    inputHash: sha256Str([...dp.tables].sort((a, b) => a.fileName.localeCompare(b.fileName)).map((t) => t.sha256).join("")),
    createdAt: "1970-01-01T00:00:00.000Z",
    tables, relationships: dp.relationships,
  };
}

export const CATALOG_DETECTOR = { id: "catalog", version: "TRUSTED_PETS_PROVING_GROUND_2026@1.0.0" };

/** FieldDetection from a catalog row (content label, high confidence) plus measured HETU validity and span counts. */
export function detectionsFor(dp: DatasetProfile, rows: CatalogRow[], spans: ReturnType<typeof loadSpanCounts>): FieldDetection[] {
  const out: FieldDetection[] = [];
  for (const t of dp.tables) for (const c of t.columns) {
    const r = rows.find((x) => x.table === t.table && x.column === c.name);
    if (!r) continue; // uncatalogued column: no detection (selectors treat it as unknown)
    const ref = { table: t.table, column: c.name };
    const evidence: FieldDetection["evidence"] = [{ ruleId: "catalog", description: `field_catalog.csv: ${r.privacy_role}/${r.subtype}` }];
    if (t.hetuMatch[c.name] !== undefined) evidence.push({ ruleId: "stats.hetu", description: "valid Finnish identity codes in the sample", matchRate: t.hetuMatch[c.name] });
    const rels = dp.relationships.filter((x) => columnKey(x.from) === columnKey(ref) || columnKey(x.to) === columnKey(ref)).map((x) => x.id);
    const sp = spans.get(columnKey(ref));
    out.push({
      id: `d:${columnKey(ref)}`, kind: "field", ref, role: r.privacy_role, subtype: r.subtype, art9: r.art9, confidence: "high", score: 1,
      evidence, needsReview: false, reviewReasons: [], relationships: rels, alternatives: [],
      ...(sp ? { spanSummary: { rowsScanned: t.rowCount, rowsWithSpans: sp.rowsWithSpans, byLabel: sp.byLabel, detectorId: "pii_spans", detectorVersion: CATALOG_DETECTOR.version } } : {}),
      detector: CATALOG_DETECTOR,
    });
  }
  return out;
}

/** Manifest restricted to the given columns (for rebuilding a selection context for one unit). */
export function manifestSubset(m: DatasetManifest, refs: { table: string; column: string }[]): DatasetManifest {
  const keys = new Set(refs.map(columnKey));
  return {
    ...m,
    tables: m.tables.filter((t) => refs.some((r) => r.table === t.name)).map((t) => ({ ...t, columns: t.columns.filter((c) => keys.has(`${t.name}.${c.name}`)) })),
    relationships: m.relationships.filter((r) => keys.has(columnKey(r.from)) || keys.has(columnKey(r.to))),
  };
}
