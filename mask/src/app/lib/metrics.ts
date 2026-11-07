/** Group per-scope metric results by metric id so each check appears once, with its worst value. */
import type { DatasetManifest, MetricResult } from "@/contracts";

/** Short chip labels; the full metric name stays in the tooltip and the expanded detail. */
const SHORT: Record<string, string> = {
  k_anonymity: "Small groups (k<5)", direct_identifier_retained: "Direct IDs kept", text_leakage: "Spans left in text",
  text_leakage_hard_labels: "ID/secret spans left", text_leakage_independent: "Gold spans left", vocabulary_retained: "Vocabulary kept",
  category_fidelity: "Categories preserved", utility_field_required: "Needed fields", join_integrity: "Joins", token_uniqueness: "Token uniqueness",
  temporal_resolution: "Time resolution", rows_retained: "Rows kept", row_counts: "Rows kept", numeric_fidelity: "Means after binning",
  required_fields: "Needed fields", location_resolution: "Location resolution",
};

export interface MetricGroup {
  id: string;
  name: string;
  short: string;
  kind: MetricResult["kind"];
  /** the scope result that best represents the group: a hard failure, else a failure, else the worst value */
  worst: MetricResult;
  items: MetricResult[];
  status: MetricResult["status"];
  hardFail: boolean;
  fail: boolean;
  scopeNoun: string;
  /** compact form for the chip, e.g. "9 cols" */
  scopeShort: string;
}

const GROUP_NAME: Record<string, string> = { join_integrity: "Joins preserved" };

function worse(a: MetricResult, b: MetricResult): MetricResult {
  // rank: hard fail > fail > failed-to-run > unsupported > evaluated (worse value) > not applicable
  const rank = (m: MetricResult) =>
    m.passed === false && m.threshold?.hard ? 6 : m.passed === false ? 5 : m.status === "failed" ? 4 : m.status === "unsupported" ? 3 : m.status === "evaluated" ? 2 : 1;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra > rb ? a : b;
  if (a.value === null || b.value === null) return a.value === null ? b : a;
  return a.direction === "lower_better" ? (b.value > a.value ? b : a) : (b.value < a.value ? b : a);
}

function groupStatus(items: MetricResult[]): MetricResult["status"] {
  if (items.some((m) => m.status === "failed")) return "failed";
  if (items.some((m) => m.status === "evaluated")) return "evaluated";
  if (items.some((m) => m.status === "unsupported")) return "unsupported";
  return "not_applicable";
}

export function groupMetrics(metrics: MetricResult[]): MetricGroup[] {
  const byId = new Map<string, MetricResult[]>();
  for (const m of metrics) byId.set(m.id, [...(byId.get(m.id) ?? []), m]);
  const groups = [...byId.entries()].map(([id, items]): MetricGroup => {
    const worst = items.reduce(worse);
    const names = new Set(items.map((m) => m.name));
    const columns = items.every((m) => m.scope.includes("."));
    const tables = items.every((m) => !m.scope.includes(".") && m.scope !== "dataset");
    return {
      id, items, worst, kind: worst.kind, status: groupStatus(items),
      name: names.size === 1 ? items[0]!.name : GROUP_NAME[id] ?? items[0]!.name,
      short: SHORT[id] ?? (names.size === 1 ? items[0]!.name : GROUP_NAME[id] ?? items[0]!.name),
      hardFail: items.some((m) => m.passed === false && !!m.threshold?.hard),
      fail: items.some((m) => m.passed === false),
      scopeNoun: items.length === 1 ? "" : `${items.length} ${columns ? "columns" : tables ? "tables" : "scopes"}`,
      scopeShort: items.length === 1 ? "" : `${items.length} ${columns ? "cols" : tables ? "tables" : "scopes"}`,
    };
  });
  // hard failures first; then by kind (risk, utility, integrity) with failures first inside each kind
  const KIND = { risk: 0, utility: 1, integrity: 2 } as const;
  return groups.map((g, i) => ({ g, i }))
    .sort((a, b) => Number(b.g.hardFail) - Number(a.g.hardFail) || KIND[a.g.kind] - KIND[b.g.kind] || Number(b.g.fail) - Number(a.g.fail) || a.i - b.i)
    .map((x) => x.g);
}

/** Extra context for a metric's detail line that the evaluator does not phrase for small samples. */
export function metricContext(m: MetricResult, manifest: DatasetManifest | null): string {
  if (m.id !== "k_anonymity" || m.status !== "evaluated") return "";
  const rows = manifest?.tables.find((t) => t.name === m.scope)?.rowCount;
  if (!rows) return "";
  const groups = m.breakdown?.classes;
  const small = rows < 1000;
  return `Over ${rows.toLocaleString("en-GB")} rows${groups !== undefined ? ` in ${groups.toLocaleString("en-GB")} groups` : ""}${small ? "; small samples make most combinations unique, so this share is high by construction" : ""}.`;
}
