/** Plain-language summary of a GoalSpec for the interpretation card, plus labels/options for editable fields. */
import type { GoalSpec, LocationResolution, OutputForm, TaskKind, TextNeed, TimeResolution, TrustLevel } from "@/contracts";
import { LOCATION_RESOLUTIONS, OUTPUT_FORMS, TASK_KINDS, TEXT_NEEDS, TIME_RESOLUTIONS, TRUST_LEVELS } from "@/contracts";
import { SCENARIO_META } from "./scenarios";

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  topic_mining: "Topic mining", model_training: "Model training", quality_audit: "Quality audit", statistics: "Published statistics",
  research: "Research", operations: "Operations", fraud_security: "Fraud / security", other: "Other",
};
export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  internal: "internal", contractual: "contractual", controlled_research: "controlled research", public: "public",
};
export const OUTPUT_FORM_LABELS: Record<OutputForm, string> = { row_level: "Row-level records", text_corpus: "Text corpus", aggregate: "Aggregate tables only" };
export const TEXT_NEED_LABELS: Record<TextNeed, string> = {
  none: "not needed, text columns are removed",
  topic_only: "topic only, identifiers become placeholders",
  fluent: "natural reading, identifiers become realistic surrogates",
  verbatim_evidence: "evidence kept, identifiers become typed placeholders (never invented values)",
};
export const LINKAGE_LABELS: Record<GoalSpec["linkage"], string> = {
  none: "not needed",
  within_table: "same person stays linkable within a table",
  across_tables: "same person stays joinable across tables (consistent pseudonyms)",
};
export const TIME_LABELS: Record<TimeResolution, string> = {
  exact: "exact times kept", minute: "rounded to the minute", "15min": "rounded to 15 minutes", hour: "rounded to the hour",
  day: "rounded to the day", week: "rounded to the week", month: "rounded to the month", year: "rounded to the year",
};
export const LOCATION_LABELS: Record<LocationResolution, string> = {
  exact: "exact location", street: "street level, no house numbers", postcode: "full postcode", postcode3: "3-digit postcode area",
  municipality: "municipality", region: "region", none: "no location",
};

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function explainGoal(spec: GoalSpec): string[] {
  const lines: string[] = [];
  lines.push(`Task: ${spec.task.description || TASK_KIND_LABELS[spec.task.kind].toLowerCase()} (${TASK_KIND_LABELS[spec.task.kind].toLowerCase()})`);
  lines.push(`Recipient: ${spec.recipient.description} (${TRUST_LEVEL_LABELS[spec.recipient.trustLevel]})`);
  lines.push(`Output: ${OUTPUT_FORM_LABELS[spec.outputForm].toLowerCase()}`);
  lines.push(`Text: ${TEXT_NEED_LABELS[spec.textNeed]}`);
  lines.push(`Linkage: ${LINKAGE_LABELS[spec.linkage]}`);
  if (spec.resolution.time) lines.push(`Time: ${TIME_LABELS[spec.resolution.time]}`);
  if (spec.resolution.location) lines.push(`Location: ${LOCATION_LABELS[spec.resolution.location]}`);
  if (spec.resolution.ageBandYears !== undefined) lines.push(`Age: ${spec.resolution.ageBandYears === 0 ? "exact" : `${spec.resolution.ageBandYears}-year bands`}`);
  if (spec.measures.length) lines.push(`Measures: ${spec.measures.slice(0, 4).join("; ")}${spec.measures.length > 4 ? ` (+${spec.measures.length - 4} more)` : ""}`);
  if (spec.groupings.length) lines.push(`Grouped by: ${spec.groupings.join(", ")}`);
  if (spec.exclusions.length) lines.push(`Excluded: ${spec.exclusions.map((e) => (e === "special_category" ? "special-category data (health, Art. 9)" : e)).join(", ")}`);
  const sc = spec.provenance.scenarioMatch;
  if (sc) lines.push(`Scenario: ${sc}${SCENARIO_META[sc] ? ` (${SCENARIO_META[sc]!.title})` : ""}`);
  if (spec.unresolved.length) lines.push(`Open questions: ${spec.unresolved.map((q) => q.question).join(" ")}`);
  return lines.map(cap);
}

export interface GoalFieldOption {
  /** dotted GoalSpec path */
  path: string;
  label: string;
  kind: "enum" | "list" | "text" | "number";
  options?: { value: string; label: string }[];
  help?: string;
}

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>): { value: string; label: string }[] =>
  values.map((v) => ({ value: v, label: cap(labels[v]) }));

export const GOAL_FIELD_OPTIONS: GoalFieldOption[] = [
  { path: "task.description", label: "What the data is for", kind: "text" },
  { path: "task.kind", label: "Task", kind: "enum", options: opts(TASK_KINDS, TASK_KIND_LABELS) },
  { path: "recipient.description", label: "Recipient", kind: "text" },
  { path: "recipient.trustLevel", label: "Recipient trust", kind: "enum", options: opts(TRUST_LEVELS, TRUST_LEVEL_LABELS), help: "Decides how much protection is required." },
  { path: "outputForm", label: "Output", kind: "enum", options: opts(OUTPUT_FORMS, OUTPUT_FORM_LABELS) },
  { path: "textNeed", label: "Free text", kind: "enum", options: opts(TEXT_NEEDS, TEXT_NEED_LABELS) },
  { path: "linkage", label: "Linkage", kind: "enum", options: opts(["none", "within_table", "across_tables"] as const, LINKAGE_LABELS) },
  { path: "resolution.time", label: "Time precision", kind: "enum", options: opts(TIME_RESOLUTIONS, TIME_LABELS) },
  { path: "resolution.location", label: "Location precision", kind: "enum", options: opts(LOCATION_RESOLUTIONS, LOCATION_LABELS) },
  { path: "resolution.ageBandYears", label: "Age band (years, 0 = exact)", kind: "number" },
  { path: "measures", label: "Measures", kind: "list", help: "Analyses the recipient needs, in plain words." },
  { path: "groupings", label: "Grouped by", kind: "list", help: "Column names the analysis groups or filters by." },
  { path: "requiredFields", label: "Required columns", kind: "list" },
  { path: "exclusions", label: "Must not receive", kind: "list", options: [{ value: "special_category", label: "Special-category data (health, Art. 9)" }] },
  { path: "threatAssumptions", label: "Threat assumptions", kind: "list" },
];
