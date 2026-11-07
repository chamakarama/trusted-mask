/**
 * Profiler: typed column statistics and cross-table relationships. Never copies raw values into the manifest.
 * Single pass per column with Sets; value-overlap checks for relationships use at most RELATION_SAMPLE distinct
 * values of the `from` column (stated in the evidence string when sampling happened).
 */
import type { ColumnManifest, ColumnStats, DatasetManifest, InferredType, Relationship, TableManifest } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { sha256Hex, nowIso } from "@/core/util/hash";
import type { Profiler, ProfileResult } from "./types";
import { parseNumber, parseTemporal } from "./validators";

const LOW_CARDINALITY = 50;
const RELATION_SAMPLE = 5000;
const BOOL_VALUES = new Set(["true", "false", "yes", "no", "kyllä", "ei", "ja", "nej", "t", "f", "y", "n"]);
const INT_RX = /^[+-]?\d+$/;
const WS_RX = /\s/;

/** Internal per-column profile kept for relationship discovery and the field detector. Never leaves the worker. */
export interface ColumnProfile {
  table: string;
  column: string;
  /** column position in its table (0 = first column, usually the row key) */
  index: number;
  stats: ColumnStats;
  inferredType: InferredType;
  distinctValues: Set<string>;
  intShare: number;
}

export function profileColumn(table: string, column: string, values: readonly (string | null)[], index = 0): ColumnProfile {
  const distinct = new Set<string>();
  const counts = new Map<string, number>();
  let nonEmpty = 0, lenSum = 0, maxLen = 0, spaces = 0, numeric = 0, ints = 0, bools = 0;
  let nMin = Infinity, nMax = -Infinity, nSum = 0;
  let tCount = 0, tMin = "", tMax = "", hasTime = false;
  let tested = 0;
  let trackCounts = true;
  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    if (raw === null || raw === undefined) continue;
    const v = raw.trim();
    if (v === "") continue;
    nonEmpty++;
    lenSum += v.length;
    if (v.length > maxLen) maxLen = v.length;
    if (WS_RX.test(v)) spaces++;
    distinct.add(v);
    if (trackCounts) {
      counts.set(v, (counts.get(v) ?? 0) + 1);
      if (counts.size > LOW_CARDINALITY) { trackCounts = false; counts.clear(); }
    }
    const num = v.length <= 40 ? parseNumber(v) : null;
    if (num !== null) {
      numeric++;
      if (INT_RX.test(v)) ints++;
      if (num < nMin) nMin = num;
      if (num > nMax) nMax = num;
      nSum += num;
    } else if (v.length <= 5 && BOOL_VALUES.has(v.toLowerCase())) bools++;
    if (v.length >= 6 && v.length <= 35) {
      // temporal: test every value until clearly not temporal (first 2000 values decide), then only when promising
      if (tested < 2000 || tCount > tested * 0.5) {
        tested++;
        const t = parseTemporal(v);
        if (t) {
          tCount++;
          if (tMin === "" || t.iso < tMin) tMin = t.iso;
          if (tMax === "" || t.iso > tMax) tMax = t.iso;
          if (t.hasTime) hasTime = true;
        }
      }
    }
  }
  const stats: ColumnStats = {
    count: values.length,
    nonEmpty,
    distinct: distinct.size,
    uniqueRatio: nonEmpty ? distinct.size / nonEmpty : 0,
    meanLength: nonEmpty ? lenSum / nonEmpty : 0,
    maxLength: maxLen,
    spaceShare: nonEmpty ? spaces / nonEmpty : 0,
    numericShare: nonEmpty ? numeric / nonEmpty : 0,
  };
  if (numeric > 0 && numeric >= nonEmpty * 0.95) stats.numeric = { min: nMin, max: nMax, mean: nSum / numeric };
  if (trackCounts && nonEmpty > 0 && counts.size > 0) {
    let min = Infinity, rare = 0;
    for (const c of counts.values()) { if (c < min) min = c; if (c < 5) rare++; }
    stats.minCategoryShare = min / nonEmpty;
    stats.rareCategoryCount = rare;
  }
  const temporalShare = nonEmpty ? tCount / Math.min(nonEmpty, Math.max(tested, 1)) : 0;
  if (tCount > 0 && temporalShare >= 0.8 && tested >= Math.min(nonEmpty, 20) * 0.8) stats.temporal = { min: tMin, max: tMax, hasTime };

  let inferredType: InferredType = "string";
  if (nonEmpty === 0) inferredType = "empty";
  else if (bools / nonEmpty >= 0.98 && distinct.size <= 4) inferredType = "boolean";
  else if (stats.temporal && temporalShare >= 0.95 && numeric / nonEmpty < 0.5) inferredType = hasTime ? "datetime" : "date";
  else if (numeric / nonEmpty >= 0.98) inferredType = ints / Math.max(numeric, 1) >= 0.999 ? "integer" : "number";
  return { table, column, index, stats, inferredType, distinctValues: distinct, intShare: nonEmpty ? ints / nonEmpty : 0 };
}

function normName(c: string): string {
  return c.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9åäö]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Is this column a plausible join key at all? (identifier-shaped, not a measurement or short category) */
function keyLike(p: ColumnProfile): boolean {
  const s = p.stats;
  if (s.nonEmpty < 2 || s.distinct < 2) return false;
  if (s.meanLength < 2 || s.meanLength > 64) return false;
  if (s.spaceShare > 0.2) return false;
  if (p.inferredType === "boolean" || p.inferredType === "date" || p.inferredType === "datetime") return false;
  if (p.inferredType === "number") return false;
  // small integers (counts, scores, sequence numbers) overlap by accident
  if (p.inferredType === "integer" && s.numeric && s.numeric.max < 100000 && s.distinct < 5000) return false;
  return true;
}

export function findRelationships(profiles: ColumnProfile[]): Relationship[] {
  const rels: Relationship[] = [];
  const keys = profiles.filter(keyLike);
  const targets = keys.filter((p) => p.stats.uniqueRatio >= 0.98 && p.stats.distinct >= 2);
  for (const from of keys) {
    const fromName = normName(from.column);
    const fromVals = from.distinctValues;
    // deterministic sample: the first RELATION_SAMPLE distinct values in insertion (row) order
    const sample: string[] = [];
    for (const v of fromVals) { sample.push(v); if (sample.length >= RELATION_SAMPLE) break; }
    const sampled = fromVals.size > sample.length;
    for (const to of targets) {
      if (to.table === from.table) continue;
      const toName = normName(to.column);
      const sameName = fromName === toName;
      // cheap prefilter on length ranges
      if (Math.abs(from.stats.meanLength - to.stats.meanLength) > Math.max(2, to.stats.meanLength * 0.5)) continue;
      let hit = 0;
      for (const v of sample) if (to.distinctValues.has(v)) hit++;
      const rate = sample.length ? hit / sample.length : 0;
      const nameHint = sameName || fromName.endsWith(`_${toName}`) || toName.endsWith(`_${fromName}`);
      if (rate < (nameHint ? 0.5 : 0.9)) continue;
      if (!nameHint && from.stats.distinct < 20) continue;
      const fromUnique = from.stats.uniqueRatio >= 0.98;
      const kind: Relationship["kind"] = fromUnique && to.stats.uniqueRatio >= 0.98 && !sameName ? "shared_identifier" : "foreign_key";
      const id = `rel:${from.table}.${from.column}->${to.table}.${to.column}`;
      const evidence = `${(rate * 100).toFixed(1)}% of ${sampled ? `a deterministic sample of ${sample.length} of ${fromVals.size}` : `${fromVals.size}`} distinct ${from.column} values occur in ${to.table}.${to.column} (unique ratio ${to.stats.uniqueRatio.toFixed(3)})${sameName ? "; same column name" : nameHint ? "; related column name" : ""}`;
      rels.push({ id, kind, from: { table: from.table, column: from.column }, to: { table: to.table, column: to.column }, matchRate: Number(rate.toFixed(4)), evidence });
    }
  }
  // shared identifiers: same non-unique column name in two tables with value overlap (no near-unique side)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const a = keys[i]!, b = keys[j]!;
    if (a.table === b.table || normName(a.column) !== normName(b.column)) continue;
    if (a.stats.uniqueRatio >= 0.98 || b.stats.uniqueRatio >= 0.98) continue;
    const [small, big] = a.distinctValues.size <= b.distinctValues.size ? [a, b] : [b, a];
    let hit = 0, n = 0;
    for (const v of small.distinctValues) { n++; if (big.distinctValues.has(v)) hit++; if (n >= RELATION_SAMPLE) break; }
    const rate = n ? hit / n : 0;
    if (rate < 0.5) continue;
    rels.push({
      id: `rel:${small.table}.${small.column}<->${big.table}.${big.column}`, kind: "shared_identifier",
      from: { table: small.table, column: small.column }, to: { table: big.table, column: big.column }, matchRate: Number(rate.toFixed(4)),
      evidence: `${(rate * 100).toFixed(1)}% of ${n < small.distinctValues.size ? `a sample of ${n}` : n} distinct values shared; same column name, neither side unique`,
    });
  }
  // when both directions qualify (both sides unique, e.g. one conversation per customer in a small extract), keep the
  // direction that points at a table's first column (its row key)
  const pos = new Map(profiles.map((p) => [`${p.table}.${p.column}`, p.index]));
  const keyOf = (r: Relationship) => `${r.from.table}.${r.from.column}|${r.to.table}.${r.to.column}`;
  const all = new Set(rels.map(keyOf));
  const kept = rels.filter((r) => {
    const rev = `${r.to.table}.${r.to.column}|${r.from.table}.${r.from.column}`;
    if (!all.has(rev)) return true;
    const toFirst = pos.get(`${r.to.table}.${r.to.column}`) === 0, fromFirst = pos.get(`${r.from.table}.${r.from.column}`) === 0;
    return toFirst || !fromFirst;
  });
  kept.sort((x, y) => x.id.localeCompare(y.id));
  return kept;
}

export function computeInputHash(tables: readonly { fileName: string; sha256: string }[]): string {
  const ordered = [...tables].sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  return sha256Hex(ordered.map((t) => t.sha256).join("\n"));
}

/** Profiles every column; keeps the internal profiles for reuse by the field detector in the same worker. */
export function profileTables(tables: TableData[], onProgress?: (done: number, total: number, message?: string) => void): { manifest: DatasetManifest; profiles: ColumnProfile[] } {
  const total = tables.reduce((n, t) => n + t.columns.length, 0) + 1;
  let done = 0;
  const profiles: ColumnProfile[] = [];
  const tms: TableManifest[] = [];
  for (const t of tables) {
    const cols: ColumnManifest[] = [];
    t.columns.forEach((name, index) => {
      const p = profileColumn(t.name, name, t.data[index] ?? [], index);
      profiles.push(p);
      cols.push({ name, index, inferredType: p.inferredType, stats: p.stats });
      onProgress?.(++done, total, `${t.name}.${name}`);
    });
    tms.push({ name: t.name, fileName: t.fileName, rowCount: t.rowCount, byteSize: t.byteSize, sha256: t.sha256, columns: cols, parseWarnings: [...t.parseWarnings] });
  }
  const relationships = findRelationships(profiles);
  onProgress?.(total, total, "relationships");
  const manifest: DatasetManifest = { version: 1, inputHash: computeInputHash(tables), createdAt: nowIso(), tables: tms, relationships };
  return { manifest, profiles };
}

export class RulesProfiler implements Profiler {
  profile(tables: TableData[], onProgress?: (done: number, total: number, message?: string) => void): ProfileResult {
    return { manifest: profileTables(tables, onProgress).manifest };
  }
}
