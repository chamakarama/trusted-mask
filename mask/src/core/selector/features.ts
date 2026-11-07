/**
 * Base feature vector x(unit, goal) for the learned selector.
 *
 * Every feature is named "<group>:<value>". The group (text before the first ':') is the unit of explanation:
 * the learned selector sums contributions per group to say why a recipe won. Names and order are stable for a
 * given FEATURE_SPEC_VERSION; a model artifact lists the names it was trained on and the selector maps by name,
 * so an artifact may use a subset (e.g. the goal-agnostic ablation) but never a name this spec does not produce.
 *
 * No raw cell values: features come from detections, column statistics and the structured goal only.
 * The spec is documented in ml/FEATURES.md; change both together and bump the version.
 */
import type { ColumnRef, ColumnStats, DecisionUnit, FieldDetection, GoalSpec, InferredType, Relationship } from "@/contracts";
import {
  DECISION_UNIT_KINDS, INFERRED_TYPES, LOCATION_RESOLUTIONS, OUTPUT_FORMS, PRIVACY_ROLES, SPAN_LABELS, SUBTYPES,
  TASK_KINDS, TEXT_NEEDS, TIME_RESOLUTIONS, TRUST_LEVELS, columnKey,
} from "@/contracts";
import { primaryDetection } from "./candidates";
import type { SelectionContext } from "./types";

export const FEATURE_SPEC_VERSION = "1.0.0";
/** Goal embedding slots. Zero when the goal carries no embedding (or one from a different model). */
export const EMBED_DIMS = 256;

const LINKAGES = ["none", "within_table", "across_tables"] as const;
const DISTINCT_BUCKETS: [string, number][] = [["le2", 2], ["le10", 10], ["le50", 50], ["le200", 200], ["le1k", 1000], ["le10k", 10000], ["gt10k", Infinity]];
const CONFIDENCE_VALUE: Record<string, number> = { high: 1, medium: 0.66, low: 0.33, unknown: 0 };

/** Minimal context the features need. A SelectionContext can be adapted with featureContextFrom. */
export interface FeatureContext {
  goal: GoalSpec;
  detections: FieldDetection[];
  /** column info keyed by "table.column" */
  columns: Map<string, { inferredType: InferredType; stats: ColumnStats }>;
  relationships: Relationship[];
}

export interface FeatureOptions {
  /** if set, a goal embedding from another model is ignored (zeros) and noted */
  embeddingModel?: string;
}

export interface FeatureVector {
  names: string[];
  values: number[];
  notes: string[];
}

export function featureContextFrom(ctx: SelectionContext): FeatureContext {
  const columns = new Map<string, { inferredType: InferredType; stats: ColumnStats }>();
  for (const t of ctx.manifest.tables) for (const c of t.columns) columns.set(columnKey({ table: t.name, column: c.name }), { inferredType: c.inferredType, stats: c.stats });
  return { goal: ctx.goal, detections: ctx.detections, columns, relationships: ctx.manifest.relationships };
}

const isSelectionContext = (c: SelectionContext | FeatureContext): c is SelectionContext => "manifest" in c;

/** Names of all base features, in order. Independent of any unit or goal. */
export function featureNames(): string[] {
  return FEATURE_NAMES;
}

const FEATURE_NAMES: string[] = (() => {
  const n: string[] = [];
  for (const k of DECISION_UNIT_KINDS) n.push(`unit.kind:${k}`);
  for (const r of PRIVACY_ROLES) n.push(`unit.role:${r}`);
  for (const s of SUBTYPES) n.push(`unit.subtype:${s}`);
  n.push("unit.art9:on", "unit.detection:confidence", "unit.detection:score", "unit.detection:needsReview");
  n.push("unit.stats:uniqueRatio", "unit.stats:nullShare", "unit.stats:numericShare", "unit.stats:spaceShare", "unit.stats:logMeanLength");
  for (const [b] of DISTINCT_BUCKETS) n.push(`unit.distinct:${b}`);
  for (const t of INFERRED_TYPES) n.push(`unit.type:${t}`);
  n.push("unit.group:on", "unit.group:size", "unit.group:tables", "unit.relationships:on");
  for (const l of SPAN_LABELS) n.push(`unit.span:${l}`);
  n.push("unit.spanFreq:share", "unit.spanFreq:logCount");
  for (const k of TASK_KINDS) n.push(`goal.task:${k}`);
  for (const t of TRUST_LEVELS) n.push(`goal.trust:${t}`);
  for (const o of OUTPUT_FORMS) n.push(`goal.output:${o}`);
  for (const t of TEXT_NEEDS) n.push(`goal.textNeed:${t}`);
  for (const l of LINKAGES) n.push(`goal.linkage:${l}`);
  for (const t of [...TIME_RESOLUTIONS, "unset"]) n.push(`goal.time:${t}`);
  for (const l of [...LOCATION_RESOLUTIONS, "unset"]) n.push(`goal.location:${l}`);
  n.push("goal.ageBand:set");
  n.push("goal.mentioned:on");
  n.push("goal.excl:special_category", "goal.excl:other");
  n.push("goal.unresolved:on");
  for (let i = 0; i < EMBED_DIMS; i++) n.push(`goal.emb:${i}`);
  // explicit interactions: these let a linear model condition role/span decisions on the goal
  for (const t of TRUST_LEVELS) for (const r of PRIVACY_ROLES) n.push(`x.trust_role:${t}|${r}`);
  for (const tn of TEXT_NEEDS) for (const l of SPAN_LABELS) n.push(`x.textNeed_span:${tn}|${l}`);
  for (const t of TRUST_LEVELS) for (const l of SPAN_LABELS) n.push(`x.trust_span:${t}|${l}`);
  for (const k of LINKAGES) for (const r of PRIVACY_ROLES) n.push(`x.linkage_role:${k}|${r}`);
  for (const r of PRIVACY_ROLES) n.push(`x.mentioned_role:${r}`);
  for (const t of TRUST_LEVELS) n.push(`x.trust_art9:${t}`);
  return n;
})();

const INDEX = new Map(FEATURE_NAMES.map((n, i) => [n, i]));

/** Group of a feature name: the part before the first ':'. */
export const featureGroup = (name: string): string => name.slice(0, name.indexOf(":"));

/** Is the unit (or one of its columns) mentioned by the goal's required fields, groupings or measures? */
export function mentionedInGoal(goal: GoalSpec, unit: DecisionUnit): boolean {
  const names = unit.refs.flatMap((r: ColumnRef) => [r.column.toLowerCase(), columnKey(r).toLowerCase()]);
  const listed = [...goal.requiredFields, ...goal.groupings].map((s) => s.toLowerCase().trim());
  if (names.some((n) => listed.includes(n))) return true;
  const bare = unit.refs.map((r) => r.column.toLowerCase());
  return goal.measures.some((m) => bare.some((b) => b.length > 2 && m.toLowerCase().includes(b)));
}

/**
 * x(unit, goal). Deterministic; same unit and context give the same vector.
 * For field groups the strongest-role detection (primaryDetection) and its column statistics describe the unit.
 */
export function baseFeatures(unit: DecisionUnit, ctxIn: SelectionContext | FeatureContext, opts: FeatureOptions = {}): FeatureVector {
  const ctx = isSelectionContext(ctxIn) ? featureContextFrom(ctxIn) : ctxIn;
  const values = new Array<number>(FEATURE_NAMES.length).fill(0);
  const notes: string[] = [];
  const set = (name: string, v: number) => {
    const i = INDEX.get(name);
    if (i === undefined) throw new Error(`feature ${name} is not in feature spec ${FEATURE_SPEC_VERSION}`);
    values[i] = Number.isFinite(v) ? v : 0;
  };
  const goal = ctx.goal;
  const ids = new Set(unit.detectionIds);
  const dets = ctx.detections.filter((d) => ids.has(d.id));
  const det = primaryDetection(dets);
  const ref = det?.ref ?? unit.refs[0]!;
  const col = ctx.columns.get(columnKey(ref));

  set(`unit.kind:${unit.kind}`, 1);
  const role = det?.role ?? "unknown";
  set(`unit.role:${role}`, 1);
  if (det) set(`unit.subtype:${det.subtype}`, 1);
  const art9 = dets.some((d) => d.art9);
  if (art9) set("unit.art9:on", 1);
  set("unit.detection:confidence", det ? CONFIDENCE_VALUE[det.confidence] ?? 0 : 0);
  set("unit.detection:score", det ? Math.max(0, Math.min(1, det.score)) : 0);
  if (dets.some((d) => d.needsReview)) set("unit.detection:needsReview", 1);

  if (col) {
    const s = col.stats;
    set("unit.stats:uniqueRatio", s.uniqueRatio);
    set("unit.stats:nullShare", s.count > 0 ? 1 - s.nonEmpty / s.count : 1);
    set("unit.stats:numericShare", s.numericShare);
    set("unit.stats:spaceShare", s.spaceShare);
    set("unit.stats:logMeanLength", Math.log1p(s.meanLength) / 5);
    const b = DISTINCT_BUCKETS.find(([, max]) => s.distinct <= max)!;
    set(`unit.distinct:${b[0]}`, 1);
    set(`unit.type:${col.inferredType}`, 1);
  } else notes.push(`no column statistics for ${columnKey(ref)}`);

  if (unit.kind === "field_group") {
    set("unit.group:on", 1);
    set("unit.group:size", Math.min(unit.refs.length, 10) / 10);
    set("unit.group:tables", Math.min(new Set(unit.refs.map((r) => r.table)).size, 10) / 10);
  }
  const keys = new Set(unit.refs.map(columnKey));
  const hasRel = (unit.relationshipIds?.length ?? 0) > 0 || dets.some((d) => d.relationships.length > 0)
    || ctx.relationships.some((r) => keys.has(columnKey(r.from)) || keys.has(columnKey(r.to)));
  if (hasRel) set("unit.relationships:on", 1);

  const label = unit.kind === "span_class" ? unit.spanLabel : undefined;
  if (label) {
    set(`unit.span:${label}`, 1);
    const sum = det?.spanSummary;
    const n = sum?.byLabel[label] ?? 0;
    set("unit.spanFreq:share", sum && sum.rowsScanned > 0 ? Math.min(1, n / sum.rowsScanned) : 0);
    set("unit.spanFreq:logCount", Math.log1p(n) / 10);
  }

  set(`goal.task:${goal.task.kind}`, 1);
  const trust = goal.recipient.trustLevel;
  set(`goal.trust:${trust}`, 1);
  set(`goal.output:${goal.outputForm}`, 1);
  set(`goal.textNeed:${goal.textNeed}`, 1);
  set(`goal.linkage:${goal.linkage}`, 1);
  set(`goal.time:${goal.resolution.time ?? "unset"}`, 1);
  set(`goal.location:${goal.resolution.location ?? "unset"}`, 1);
  if (goal.resolution.ageBandYears !== undefined) set("goal.ageBand:set", 1);
  const mentioned = mentionedInGoal(goal, unit);
  if (mentioned) set("goal.mentioned:on", 1);
  if (goal.exclusions.includes("special_category")) set("goal.excl:special_category", 1);
  if (goal.exclusions.some((e) => e !== "special_category")) set("goal.excl:other", 1);
  if (goal.unresolved.length > 0) set("goal.unresolved:on", 1);

  const emb = goal.embedding;
  if (emb) {
    if (opts.embeddingModel && emb.model !== opts.embeddingModel) notes.push(`goal embedding from ${emb.model} ignored: model expects ${opts.embeddingModel}`);
    else if (emb.vector.length !== EMBED_DIMS) notes.push(`goal embedding has ${emb.vector.length} dims, spec expects ${EMBED_DIMS}; ignored`);
    else emb.vector.forEach((v, i) => set(`goal.emb:${i}`, v));
  }

  set(`x.trust_role:${trust}|${role}`, 1);
  set(`x.linkage_role:${goal.linkage}|${role}`, 1);
  if (mentioned) set(`x.mentioned_role:${role}`, 1);
  if (art9) set(`x.trust_art9:${trust}`, 1);
  if (label) {
    set(`x.textNeed_span:${goal.textNeed}|${label}`, 1);
    set(`x.trust_span:${trust}|${label}`, 1);
  }
  return { names: FEATURE_NAMES, values, notes };
}

/** Plain-language description of a feature group given the active (non-zero) feature names in it. */
export function describeGroup(group: string, active: string[]): string {
  const vals = active.map((n) => n.slice(n.indexOf(":") + 1));
  const v = vals[0] ?? "";
  const pretty = (s: string) => s.replace(/_/g, " ").toLowerCase();
  switch (group) {
    case "unit.kind": return `the unit is a ${pretty(v)}`;
    case "unit.role": return `the column is a ${pretty(v)}`;
    case "unit.subtype": return `it holds ${pretty(v)} values`;
    case "unit.art9": return "it is special-category data";
    case "unit.detection": return "detection confidence";
    case "unit.stats": return "its value statistics (uniqueness, gaps, length)";
    case "unit.distinct": return `it has ${v.replace("le", "at most ").replace("gt", "more than ")} distinct values`;
    case "unit.type": return `values are ${v}`;
    case "unit.group": return "it is a group of linked columns";
    case "unit.relationships": return "it joins other tables";
    case "unit.span": return `the spans are ${pretty(v)}`;
    case "unit.spanFreq": return "how often these spans occur";
    case "goal.task": return `the task is ${pretty(v)}`;
    case "goal.trust": return `recipient is ${pretty(v)}`;
    case "goal.output": return `output is ${pretty(v)}`;
    case "goal.textNeed": return `text need: ${pretty(v)}`;
    case "goal.linkage": return `linkage: ${pretty(v)}`;
    case "goal.time": return v === "unset" ? "no time resolution stated" : `time resolution: ${v}`;
    case "goal.location": return v === "unset" ? "no location resolution stated" : `location resolution: ${v}`;
    case "goal.ageBand": return "an age band is requested";
    case "goal.mentioned": return "the goal names this column";
    case "goal.excl": return `the goal excludes ${vals.map(pretty).join(", ")}`;
    case "goal.unresolved": return "the goal has open questions";
    case "goal.emb": return "the goal wording";
    case "x.trust_role": { const [t, r] = v.split("|"); return `recipient is ${pretty(t ?? "")} and the column is a ${pretty(r ?? "")}`; }
    case "x.textNeed_span": { const [t, l] = v.split("|"); return `text need is ${pretty(t ?? "")} for ${pretty(l ?? "")} spans`; }
    case "x.trust_span": { const [t, l] = v.split("|"); return `recipient is ${pretty(t ?? "")} for ${pretty(l ?? "")} spans`; }
    case "x.linkage_role": { const [k, r] = v.split("|"); return `linkage ${pretty(k ?? "")} for a ${pretty(r ?? "")}`; }
    case "x.mentioned_role": return `the goal names this ${pretty(v)}`;
    case "x.trust_art9": return `special-category data going to a ${pretty(v)} recipient`;
    default: return group;
  }
}
