/** Plain-language labels and formatters for the interface. No raw values pass through here. */
import type {
  Confidence, HighlightKind, LocationResolution, MetricResult, OutputForm, PrivacyRole, TaskKind, TextNeed,
  TimeResolution, TrustLevel, DecisionUnit, GoalSpec,
} from "@/contracts";
import { columnKey } from "@/contracts";

export const HIGHLIGHT_ORDER: HighlightKind[] = ["keep", "tokenize", "generalize", "redact", "suppress", "derive", "review"];
export const HIGHLIGHT_LABEL: Record<HighlightKind, string> = {
  keep: "Kept", tokenize: "Tokenised", generalize: "Generalised", redact: "Redacted", suppress: "Removed", derive: "Derived", review: "Needs review",
};
export const HIGHLIGHT_HINT: Record<HighlightKind, string> = {
  keep: "Unchanged",
  tokenize: "Replaced by a consistent token; joins still work",
  generalize: "Made less precise",
  redact: "Personal details in text replaced",
  suppress: "Not included in the output",
  derive: "Replaced by values computed from it",
  review: "Mask is unsure; check before export",
};

export const ROLE_LABEL: Record<PrivacyRole, string> = {
  direct_identifier: "Direct identifier",
  quasi_identifier: "Indirect identifier",
  sensitive_attribute: "Sensitive",
  technical_identifier: "Technical identifier",
  record_key: "Record key",
  free_text: "Free text",
  non_sensitive: "Not personal",
  unknown: "Unknown",
};
export const ROLE_ORDER: PrivacyRole[] = ["direct_identifier", "quasi_identifier", "sensitive_attribute", "technical_identifier", "record_key", "free_text", "non_sensitive", "unknown"];

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "high", medium: "medium", low: "low", unknown: "unknown" };

export const TASK_LABEL: Record<TaskKind, string> = {
  topic_mining: "Find topics and trends in text",
  model_training: "Train a model",
  quality_audit: "Quality audit by reading samples",
  statistics: "Aggregate statistics",
  research: "Row-level research",
  operations: "Internal operations analysis",
  fraud_security: "Fraud or security detection",
  other: "Other analysis",
};
export const TRUST_LABEL: Record<TrustLevel, string> = {
  internal: "Internal team",
  contractual: "Contracted partner",
  controlled_research: "Controlled research",
  public: "Public release",
};
export const OUTPUT_LABEL: Record<OutputForm, string> = { row_level: "Row-level tables", text_corpus: "Text corpus", aggregate: "Aggregates only" };
export const TEXT_NEED_LABEL: Record<TextNeed, string> = {
  none: "Not needed", topic_only: "Topic and meaning", fluent: "Natural reading", verbatim_evidence: "Verbatim evidence",
};
export const LINKAGE_LABEL: Record<GoalSpec["linkage"], string> = { none: "No linking", within_table: "Within a table", across_tables: "Across tables" };
export const TIME_LABEL: Record<TimeResolution, string> = {
  exact: "Exact", minute: "Minute", "15min": "15 minutes", hour: "Hour", day: "Day", week: "Week", month: "Month", year: "Year",
};
export const LOCATION_LABEL: Record<LocationResolution, string> = {
  exact: "Exact", street: "Street", postcode: "Postcode", postcode3: "Postcode area (3 digits)", municipality: "Municipality", region: "Region", none: "No location",
};

export function subtypeLabel(s: string): string {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function unitTitle(unit: DecisionUnit | undefined, fallbackId = ""): string {
  if (!unit) return fallbackId.replace(/^[fgs]:/, "");
  if (unit.kind === "span_class") return `${unit.spanLabel ? subtypeLabel(unit.spanLabel) : "Span"} in ${unit.refs[0]!.column}`;
  if (unit.kind === "field_group") return unit.refs.map((r) => r.column).filter((c, i, a) => a.indexOf(c) === i).join(" + ") + " (linked)";
  return unit.refs[0]!.column;
}
export function unitWhere(unit: DecisionUnit | undefined): string {
  if (!unit) return "";
  return unit.refs.map(columnKey).join(", ");
}

const nf = new Intl.NumberFormat("en-GB");
export const fmtInt = (n: number): string => nf.format(n);
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
export function fmtPct(r: number): string {
  if (r === 0) return "0%";
  if (r < 0.001) return "<0.1%";
  return `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
}
export function fmtMetricValue(m: MetricResult): string {
  if (m.status !== "evaluated" || m.value === null) return "—";
  switch (m.unit) {
    case "ratio": return fmtPct(m.value);
    case "count": return fmtInt(m.value);
    case "seconds": return fmtMs(m.value * 1000);
    default: return Number.isInteger(m.value) ? fmtInt(m.value) : m.value.toFixed(2);
  }
}
export function fmtThreshold(m: MetricResult): string {
  if (!m.threshold) return "";
  const v = m.unit === "ratio" ? fmtPct(m.threshold.value) : String(m.threshold.value);
  const op = { "<=": "≤", ">=": "≥", "<": "<", ">": ">" }[m.threshold.op];
  return `${op} ${v}`;
}
export const METRIC_STATUS_LABEL: Record<MetricResult["status"], string> = {
  evaluated: "Evaluated", unsupported: "Not supported", not_applicable: "Not applicable", failed: "Check failed to run",
};
/** Same four states for threat coverage and benchmark tests. */
export const TEST_STATUS_LABEL = METRIC_STATUS_LABEL;
export const BASIS_LABEL: Record<MetricResult["basis"], string> = {
  own_detections: "against Mask's own detections",
  independent_labels: "against independent labels",
  structural: "structural check",
  goal_requirement: "goal requirement",
};
export const METRIC_KIND_LABEL: Record<MetricResult["kind"], string> = { risk: "Risk", utility: "Utility", integrity: "Integrity" };

export const shortHash = (h: string | undefined | null, n = 10): string => (h ? h.slice(0, n) : "—");

export function paramValueLabel(options: { value: string; label: string }[] | undefined, v: unknown): string {
  const o = options?.find((x) => x.value === String(v));
  return o ? o.label : String(v);
}
