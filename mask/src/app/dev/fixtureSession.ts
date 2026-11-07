/**
 * DEVELOPMENT FIXTURE SESSION (?dev=fixture). Hand-written manifest, detections, goal, proposal, outputs and
 * evaluation for the customer-service shape. It exists so the interface can be built and reviewed while the
 * engine is being implemented. NOTHING HERE IS MEASURED: metric values are placeholders, not results.
 */
import type {
  CellChange, ColumnManifest, DatasetManifest, Decision, DecisionOverride, DecisionUnit, DetectionSet, Evaluation, FieldDetection,
  GoalSpec, HighlightKind, MetricResult, OutputColumn, PrivacyRole, Proposal, RecipeId, RecipeParams, RowFilter, RowView, SpanLabel, Subtype,
  Confidence, Candidate, ExportReceipt, ImportFile,
} from "@/contracts";
import { columnKey } from "@/contracts";
import { getRecipe, REGISTRY_VERSION } from "@/core/registry";
import { hashOf, sha256Hex } from "@/core/util/hash";
import type { Backend, CellResult, RowsQuery, RowsResult } from "../backend/types";
import type { ExecutedSummary, Progress } from "../store/state";
import { FIXTURE_TABLES, turnSpans, type FixtureTable } from "./fixtureData";

const T0 = "2026-01-01T00:00:00.000Z";
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- manifest
function columnManifest(t: FixtureTable, ci: number): ColumnManifest {
  const vals = t.rows.map((r) => r[ci] ?? null).filter((v): v is string => v !== null);
  const nums = vals.map(Number).filter((n) => Number.isFinite(n));
  const numericShare = vals.length ? nums.length / vals.length : 0;
  const name = t.columns[ci]!;
  const isTs = /ts$|since/.test(name);
  return {
    name, index: ci,
    inferredType: isTs ? (name.endsWith("ts") ? "datetime" : "date") : numericShare === 1 && vals.length ? "integer" : "string",
    stats: {
      count: t.rows.length, nonEmpty: vals.length, distinct: new Set(vals).size,
      uniqueRatio: vals.length ? new Set(vals).size / vals.length : 0,
      meanLength: vals.length ? vals.reduce((a, v) => a + v.length, 0) / vals.length : 0,
      maxLength: Math.max(0, ...vals.map((v) => v.length)),
      spaceShare: vals.length ? vals.filter((v) => /\s/.test(v)).length / vals.length : 0,
      numericShare,
      numeric: numericShare === 1 && nums.length ? { min: Math.min(...nums), max: Math.max(...nums), mean: nums.reduce((a, b) => a + b, 0) / nums.length } : undefined,
    },
  };
}

export const fixtureManifest: DatasetManifest = {
  version: 1, inputHash: "fixture-input-0000", createdAt: T0,
  tables: FIXTURE_TABLES.map((t) => ({
    name: t.name, fileName: `${t.name}.csv`, rowCount: t.rows.length, byteSize: JSON.stringify(t.rows).length,
    sha256: `fixture-${t.name}`, columns: t.columns.map((_, i) => columnManifest(t, i)),
    parseWarnings: t.name === "turns" ? ["row 19: 7 fields, expected 6 (fixture example warning)"] : [],
  })),
  relationships: [
    { id: "rel-cust", kind: "foreign_key", from: { table: "conversations", column: "customer_id" }, to: { table: "customers", column: "customer_id" }, matchRate: 1, evidence: "all conversation customer ids appear in customers" },
    { id: "rel-conv", kind: "foreign_key", from: { table: "turns", column: "conversation_id" }, to: { table: "conversations", column: "conversation_id" }, matchRate: 1, evidence: "all turn conversation ids appear in conversations" },
  ],
};

// ---------------------------------------------------------------- detections
type D = [table: string, column: string, role: PrivacyRole, subtype: Subtype, confidence: Confidence, score: number, evidence: string, review?: string[], rel?: string[]];
const DET: D[] = [
  ["customers", "customer_id", "record_key", "CUSTOMER_ID", "high", 0.96, "Unique per row; referenced by conversations.customer_id", undefined, ["rel-cust"]],
  ["customers", "full_name", "direct_identifier", "PERSON_NAME", "high", 0.93, "Two capitalised words per value; column name matches 'name'"],
  ["customers", "hetu", "direct_identifier", "NATIONAL_ID", "high", 0.99, "All values pass the Finnish identity-code checksum"],
  ["customers", "postcode", "quasi_identifier", "POSTCODE", "high", 0.9, "Five-digit values; column name matches 'postcode'"],
  ["customers", "city", "quasi_identifier", "MUNICIPALITY", "medium", 0.71, "Values match the municipality list"],
  ["customers", "email", "direct_identifier", "EMAIL", "high", 0.99, "Values match the e-mail pattern"],
  ["customers", "phone", "direct_identifier", "PHONE", "high", 0.97, "Values match the Finnish phone pattern"],
  ["customers", "customer_since", "quasi_identifier", "DATE", "medium", 0.62, "ISO dates; meaning inferred from the column name", ["Date meaning inferred from the column name only"]],
  ["conversations", "conversation_id", "record_key", "RECORD_ID", "high", 0.95, "Unique per row; referenced by turns.conversation_id", undefined, ["rel-conv"]],
  ["conversations", "customer_id", "record_key", "CUSTOMER_ID", "high", 0.94, "Foreign key to customers.customer_id", undefined, ["rel-cust"]],
  ["conversations", "agent_name", "direct_identifier", "PERSON_NAME", "medium", 0.68, "Person names, repeated across rows (staff?)", ["Employee names: Mask cannot tell whether the recipient may see staff identities"]],
  ["conversations", "channel", "non_sensitive", "CATEGORY", "high", 0.9, "Three distinct values"],
  ["conversations", "started_ts", "quasi_identifier", "TIMESTAMP", "high", 0.92, "Timestamps with seconds"],
  ["conversations", "intent", "non_sensitive", "CATEGORY", "high", 0.88, "Five distinct values"],
  ["conversations", "handle_time_s", "non_sensitive", "DURATION", "high", 0.85, "Integers; column name ends in _s"],
  ["conversations", "csat", "non_sensitive", "MEASUREMENT", "medium", 0.6, "Integers 1–5, often empty"],
  ["turns", "turn_id", "record_key", "RECORD_ID", "high", 0.95, "Unique per row"],
  ["turns", "conversation_id", "record_key", "RECORD_ID", "high", 0.94, "Foreign key to conversations.conversation_id", undefined, ["rel-conv"]],
  ["turns", "seq", "non_sensitive", "OTHER", "high", 0.8, "Small integers ordered within a conversation"],
  ["turns", "speaker", "non_sensitive", "CATEGORY", "high", 0.95, "Two distinct values"],
  ["turns", "ts", "quasi_identifier", "TIMESTAMP", "high", 0.92, "Timestamps with seconds"],
  ["turns", "text", "free_text", "FREE_TEXT", "high", 0.97, "Long values with spaces; personal-data spans found"],
];

const spanCounts: Record<string, number> = {};
for (const spans of turnSpans) for (const s of spans) spanCounts[s.label] = (spanCounts[s.label] ?? 0) + 1;

const fields: FieldDetection[] = DET.map(([table, column, role, subtype, confidence, score, evidence, review, rel]) => ({
  id: `det:${table}.${column}`, kind: "field", ref: { table, column }, role, subtype,
  art9: false, confidence, score, evidence: [{ ruleId: "fixture.rule", description: evidence, matchRate: score }],
  needsReview: !!review, reviewReasons: review ?? [], relationships: rel ?? [], alternatives: role === "direct_identifier" && confidence !== "high" ? [{ role: "non_sensitive", subtype: "OTHER", score: 0.3 }] : [],
  spanSummary: role === "free_text" ? { rowsScanned: turnSpans.length, rowsWithSpans: turnSpans.filter((s) => s.length).length, byLabel: spanCounts, detectorId: "fixture-spans", detectorVersion: "0" } : undefined,
  detector: { id: "fixture-detector", version: "0" },
}));

export const fixtureDetections: DetectionSet = { version: 1, inputHash: fixtureManifest.inputHash, fields, createdAt: T0 };

// ---------------------------------------------------------------- goal
export function fixtureGoal(text: string, answers: Record<string, string>): GoalSpec {
  const repeat = answers.repeat_contacts;
  const g: GoalSpec = {
    version: 1, goalId: "", rawText: text,
    task: { kind: "topic_mining", description: "Find the main contact reasons and handle time by intent" },
    recipient: { description: "External analytics vendor", trustLevel: "contractual" },
    outputForm: "row_level",
    measures: ["contact reasons", "handle time by intent"],
    groupings: ["intent", "channel"],
    resolution: { time: "hour" },
    requiredFields: ["conversations.intent", "conversations.handle_time_s", "turns.text"],
    linkage: repeat === "no" ? "within_table" : "across_tables",
    textNeed: "topic_only",
    exclusions: [], threatAssumptions: ["recipient may hold other customer lists"],
    unresolved: repeat ? [] : [{
      id: "repeat_contacts",
      question: "Does the vendor need to follow repeat contacts by the same customer?",
      affects: ["linkage"],
      options: [{ value: "yes", label: "Yes, link contacts" }, { value: "no", label: "No" }],
    }],
    provenance: { interpreter: "fixture", version: "0", notes: ["development fixture"] },
  };
  return { ...g, goalId: hashOf({ ...g, rawText: "", goalId: "" }).slice(0, 16) };
}

// ---------------------------------------------------------------- units and base plan
const relGroups: Record<string, string[]> = {
  "customers.customer_id": ["g:conversations.customer_id+customers.customer_id"], "conversations.customer_id": ["g:conversations.customer_id+customers.customer_id"],
  "conversations.conversation_id": ["g:conversations.conversation_id+turns.conversation_id"], "turns.conversation_id": ["g:conversations.conversation_id+turns.conversation_id"],
};
function buildUnits(): DecisionUnit[] {
  const units: DecisionUnit[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    const k = columnKey(f.ref);
    const g = relGroups[k]?.[0];
    if (g) {
      if (seen.has(g)) continue;
      seen.add(g);
      const refs = fields.filter((x) => relGroups[columnKey(x.ref)]?.[0] === g);
      units.push({ id: g, kind: "field_group", refs: refs.map((r) => r.ref), relationshipIds: [...new Set(refs.flatMap((r) => r.relationships))], detectionIds: refs.map((r) => r.id) });
      continue;
    }
    units.push({ id: `f:${k}`, kind: "field", refs: [f.ref], detectionIds: [f.id] });
    if (f.spanSummary) for (const label of Object.keys(f.spanSummary.byLabel).sort()) {
      units.push({ id: `s:${k}:${label}`, kind: "span_class", refs: [f.ref], spanLabel: label as SpanLabel, detectionIds: [f.id], parentUnitId: `f:${k}` });
    }
  }
  return units.sort((a, b) => a.id.localeCompare(b.id));
}
export const fixtureUnits = buildUnits();

type C = [RecipeId, RecipeParams?, string?];
interface PlanSpec { cands: C[]; invalid?: [RecipeId, string][]; reason: string; detail?: string[]; review?: string[] }
const TOK: C = ["tokenize_keyed", { scope: "dataset", format: "token" }];
const TIME = (res: string): C => ["generalize_datetime", { resolution: res }];
const SPAN_PLAN = (label: string, first: "redact_typed" | "redact_surrogate" | "keep", reason: string): PlanSpec => ({
  cands: first === "keep" ? [["keep"], ["redact_typed"], ["redact_surrogate", { consistency: "conversation" }], ["suppress"]]
    : first === "redact_surrogate" ? [["redact_surrogate", { consistency: "conversation" }], ["redact_typed"], ["suppress"], ["keep"]]
      : [["redact_typed"], ["suppress"], ["keep"]],
  invalid: first === "redact_typed" && ["NATIONAL_ID", "PHONE", "EMAIL"].includes(label) ? [["redact_surrogate", `${label.toLowerCase().replace("_", " ")} surrogates are not supported`]] : [],
  reason,
});

const PLAN: Record<string, PlanSpec> = {
  "g:conversations.customer_id+customers.customer_id": { cands: [TOK, ["keep"], ["suppress"]], reason: "Row key that joins tables; tokenised so the vendor can still join without seeing the original key.", detail: ["record keys link tables when shared"] },
  "g:conversations.conversation_id+turns.conversation_id": { cands: [TOK, ["keep"], ["suppress"]], reason: "Conversation key tokenised: turns still group into conversations, the internal id is not disclosed." },
  "f:customers.full_name": { cands: [["suppress"], TOK], invalid: [["keep", "a direct identifier cannot be kept for an external recipient"]], reason: "Removed: the name identifies the person directly and the analysis does not need it." },
  "f:customers.hetu": { cands: [["derive_hetu", { ageBandYears: "10", referenceDate: "2025-12-31" }], ["derive_hetu", { ageBandYears: "5", referenceDate: "2025-12-31" }], ["suppress"]], invalid: [["keep", "national identity codes are never released verbatim"], ["tokenize_keyed", "not a candidate for national identity codes in this plan"]], reason: "The identity code is replaced by the age band and sex it encodes.", detail: ["HETU encodes birth date and sex; the code itself identifies directly"] },
  "f:customers.postcode": { cands: [["generalize_postcode", { digits: "3" }], ["generalize_postcode", { digits: "2" }], ["suppress"], ["keep"]], reason: "Postcode truncated to 3 digits: regional patterns stay, the street area does not." },
  "f:customers.city": { cands: [["generalize_category_rare", { minGroup: 5 }], ["keep"], ["suppress"]], reason: "Place kept with small areas merged, since it is not central to the analysis." },
  "f:customers.email": { cands: [["suppress"], TOK], invalid: [["keep", "a direct identifier cannot be kept for an external recipient"]], reason: "Removed: e-mail identifies the person directly and the analysis does not need it." },
  "f:customers.phone": { cands: [["suppress"], TOK], invalid: [["keep", "a direct identifier cannot be kept for an external recipient"]], reason: "Removed: phone identifies the person directly and the analysis does not need it." },
  "f:customers.customer_since": { cands: [TIME("year"), TIME("month"), ["suppress"], ["keep"]], reason: "Customer-since date reduced to the year: tenure survives, exact dates do not.", review: ["Date meaning inferred from the column name only"] },
  "f:conversations.agent_name": { cands: [TOK, ["suppress"], ["keep"]], reason: "Agent names tokenised: workload per agent stays countable, staff names are not disclosed.", review: ["Employee names: Mask cannot tell whether the recipient may see staff identities"] },
  "f:conversations.channel": { cands: [["keep"], ["generalize_category_rare", { minGroup: 5 }], ["suppress"]], reason: "Kept: the analysis groups by channel." },
  "f:conversations.started_ts": { cands: [TIME("hour"), TIME("day"), TIME("15min"), ["suppress"], ["keep"]], reason: "Time rounded to the hour: enough for handle time by intent, and exact times no longer link to call logs." },
  "f:conversations.intent": { cands: [["keep"], ["generalize_category_rare", { minGroup: 5 }]], reason: "Kept: the analysis groups by intent." },
  "f:conversations.handle_time_s": { cands: [["keep"], ["generalize_numeric_bin", { width: 60, topCode: 0 }], ["suppress"]], reason: "Kept exactly: handle time is the measure the analysis needs." },
  "f:conversations.csat": { cands: [["keep"], ["suppress"]], reason: "Kept: satisfaction score is not personal on its own." },
  "f:turns.turn_id": { cands: [TOK, ["keep"], ["suppress"]], reason: "Turn id tokenised; it has no meaning outside the source system." },
  "f:turns.seq": { cands: [["keep"]], reason: "Kept: turn order is needed to read conversations." },
  "f:turns.speaker": { cands: [["keep"]], reason: "Kept: speaker role is needed to read conversations." },
  "f:turns.ts": { cands: [TIME("hour"), TIME("day"), ["suppress"], ["keep"]], reason: "Turn times rounded to the hour, matching the conversation start times." },
  "f:turns.text": { cands: [["redact_text"], ["suppress"]], invalid: [["keep", "text contains hard identifiers (identity codes, phone numbers)"]], reason: "Text kept for topic analysis; personal details inside it are replaced (see each type below)." },
  "s:turns.text:PERSON": SPAN_PLAN("PERSON", "redact_typed", "Names in text replaced by [PERSON]: topics stay readable, nobody is named."),
  "s:turns.text:NATIONAL_ID": SPAN_PLAN("NATIONAL_ID", "redact_typed", "Identity codes in text replaced by [NATIONAL_ID]."),
  "s:turns.text:PHONE": SPAN_PLAN("PHONE", "redact_typed", "Phone numbers in text replaced by [PHONE]."),
  "s:turns.text:EMAIL": SPAN_PLAN("EMAIL", "redact_typed", "E-mail addresses in text replaced by [EMAIL]."),
  "s:turns.text:ADDRESS": SPAN_PLAN("ADDRESS", "redact_typed", "Street addresses in text replaced by [ADDRESS]."),
  "s:turns.text:LOCATION": SPAN_PLAN("LOCATION", "keep", "Town names kept: outages are reported by area and towns are large."),
  "s:turns.text:ORG": SPAN_PLAN("ORG", "keep", "Organisation names kept: they describe banks and partners, not people."),
};

function candidateLabel(id: RecipeId, params: RecipeParams): string {
  const def = getRecipe(id);
  const bits = def.params.filter((p) => p.options && params[p.key] !== undefined).map((p) => p.options!.find((o) => o.value === String(params[p.key]))?.label ?? String(params[p.key]));
  const nums = def.params.filter((p) => p.type === "number" && params[p.key] !== undefined).map((p) => `${p.label.toLowerCase()} ${String(params[p.key])}`);
  const extra = [...bits.filter((b) => !/session|dataset|tok_/i.test(b)), ...nums];
  return extra.length ? `${def.name} (${extra.join(", ")})` : def.name;
}
const fullParams = (id: RecipeId, p: RecipeParams = {}): RecipeParams => {
  const out: RecipeParams = {};
  for (const d of getRecipe(id).params) out[d.key] = p[d.key] ?? d.default;
  return out;
};

function baseDecisions(goal: GoalSpec, learned: boolean): Decision[] {
  return fixtureUnits.map((u) => {
    const spec = PLAN[u.id] ?? { cands: [["keep"]] as C[], reason: "Kept." };
    let cands = spec.cands;
    if (goal.resolution.time && /ts$/.test(u.refs[0]!.column) && cands[0]?.[0] === "generalize_datetime") {
      const res = goal.resolution.time;
      if (getRecipe("generalize_datetime").params[0]!.options!.some((o) => o.value === res)) cands = [TIME(res), ...cands.filter((c) => c[1]?.resolution !== res)];
    }
    const n = cands.length;
    const logits = cands.map((_, i) => 2.4 - i * 1.1);
    const z = logits.reduce((a, l) => a + Math.exp(l), 0);
    const candidates: Candidate[] = [
      ...cands.map(([id, p], i): Candidate => ({
        recipeId: id, params: fullParams(id, p), valid: true, invalidReasons: [], label: candidateLabel(id, fullParams(id, p)),
        policyRank: learned ? undefined : i + 1, logit: learned ? logits[i] : undefined, preference: learned ? Math.exp(logits[i]!) / z : undefined,
      })),
      ...(spec.invalid ?? []).map(([id, why]): Candidate => ({ recipeId: id, params: fullParams(id), valid: false, invalidReasons: [why], label: getRecipe(id).name })),
    ];
    void n;
    const sel = candidates[0]!;
    return {
      unitId: u.id, candidates, selected: { recipeId: sel.recipeId, params: sel.params }, abstained: false,
      reason: spec.reason, detail: [...(spec.detail ?? []), `fixture rule order: ${cands.map((c) => c[0]).join(" > ")}`],
      source: "selector", reviewState: spec.review ? "flagged" : "proposed", needsReview: !!spec.review, reviewReasons: spec.review ?? [],
    };
  });
}

function buildProposal(goal: GoalSpec, selectorId: "policy" | "learned", overrides: DecisionOverride[], modelId: string | null): Proposal {
  const decisions = baseDecisions(goal, selectorId === "learned");
  const warnings: string[] = [];
  for (const o of overrides) {
    const d = decisions.find((x) => x.unitId === o.unitId);
    if (!d) { warnings.push(`override for unknown unit ${o.unitId} ignored`); continue; }
    if (o.recipeId === null) { d.selected = null; d.abstained = true; d.abstainReason = "removed by user"; d.source = "user"; d.reviewState = "edited"; continue; }
    const cand = d.candidates.find((c) => c.recipeId === o.recipeId);
    if (!cand) { warnings.push(`override ${o.recipeId} is not a candidate for ${o.unitId}`); continue; }
    d.selected = { recipeId: o.recipeId, params: o.params };
    d.source = "user"; d.reviewState = "edited";
    d.reason = `Edited by you: ${candidateLabel(o.recipeId, o.params)}.`;
    d.needsReview = !cand.valid; d.reviewReasons = cand.valid ? [] : cand.invalidReasons;
  }
  const plan = decisions.map((d) => ({ u: d.unitId, r: d.selected?.recipeId ?? null, p: d.selected?.params ?? {} }));
  const tokCols = decisions.filter((d) => d.selected?.recipeId === "tokenize_keyed").flatMap((d) => fixtureUnits.find((u) => u.id === d.unitId)?.refs ?? []);
  return {
    version: 1, proposalId: `fixture-prop-${hashOf(plan).slice(0, 6)}`, inputHash: fixtureManifest.inputHash, goalId: goal.goalId,
    selector: selectorId === "learned"
      ? { id: "learned", version: "fixture", modelArtifact: modelId ?? "fixture-model", registryVersion: REGISTRY_VERSION }
      : { id: "policy", version: "fixture", registryVersion: REGISTRY_VERSION },
    units: fixtureUnits, decisions,
    tokenScopes: tokCols.length ? [{ id: "dataset", columns: tokCols, keyId: "fixture-key" }] : [],
    planHash: hashOf({ goal: goal.goalId, plan, selectorId }).slice(0, 32), createdAt: T0, warnings,
  };
}

// ---------------------------------------------------------------- execution (toy transforms)
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
};
function coarsenTime(v: string, res: string): string {
  const [date = "", time = "00:00:00"] = v.split(" ");
  const [hh = "00", mm = "00"] = time.split(":");
  switch (res) {
    case "15min": return `${date} ${hh}:${String(Math.floor(Number(mm) / 15) * 15).padStart(2, "0")}`;
    case "hour": return `${date} ${hh}:00`;
    case "day": return date;
    case "week": { const d = new Date(`${date}T00:00:00Z`); const jan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return `${d.getUTCFullYear()}-W${String(Math.ceil(((+d - +jan) / 864e5 + jan.getUTCDay() + 1) / 7)).padStart(2, "0")}`; }
    case "month": return date.slice(0, 7);
    case "year": return date.slice(0, 4);
    default: return v;
  }
}
function hetuDerive(v: string, band: number): [string, string] {
  const m = /^(\d{2})(\d{2})(\d{2})([-+A-F])(\d{3})/.exec(v);
  if (!m) return ["", ""];
  const century = m[4] === "+" ? 1800 : m[4] === "-" ? 1900 : 2000;
  const year = century + Number(m[3]);
  const age = 2025 - year - (Number(m[2]) * 100 + Number(m[1]) > 1231 ? 1 : 0);
  const lo = Math.floor(age / band) * band;
  return [`${lo}–${lo + band - 1}`, Number(m[5]) % 2 ? "M" : "F"];
}
const SURROGATES: Partial<Record<SpanLabel, string[]>> = {
  PERSON: ["Anna Lind", "Mikko Salo", "Eeva Ranta", "Paavo Kivi"], ADDRESS: ["Koivutie 4", "Rantakatu 12 B"], LOCATION: ["Pori", "Kotka"], ORG: ["Pankki Oy"],
};

interface ExecTable { name: string; columns: OutputColumn[]; data: (string | null)[][]; textChanges: Map<string, CellChange> }
interface Exec { planHash: string; outputHash: string; tables: ExecTable[] }

function execute(p: Proposal): Exec {
  const dec = new Map(p.decisions.map((d) => [d.unitId, d]));
  const unitOf = (table: string, column: string) => fixtureUnits.find((u) => u.kind !== "span_class" && u.refs.some((r) => r.table === table && r.column === column));
  const tables = FIXTURE_TABLES.map((t): ExecTable => {
    const columns: OutputColumn[] = [];
    const data: (string | null)[][] = [];
    const textChanges = new Map<string, CellChange>();
    t.columns.forEach((col, ci) => {
      const unit = unitOf(t.name, col);
      const d = unit ? dec.get(unit.id) : undefined;
      const sel = d?.selected;
      const src = t.rows.map((r) => r[ci] ?? null);
      const push = (name: string, status: OutputColumn["status"], vals: (string | null)[]) => { columns.push({ name, sourceColumn: col, unitId: unit?.id ?? null, status }); data.push(vals); };
      if (!sel || sel.recipeId === "suppress") return push(col, "suppressed", src.map(() => null));
      switch (sel.recipeId) {
        case "keep": return push(col, "kept", src);
        case "tokenize_keyed": {
          const scope = sel.params.scope === "table" ? t.name : "";
          return push(col, "transformed", src.map((v) => v === null ? null : sel.params.format === "prefix" ? `${v.slice(0, 2)}_${fnv(scope + v)}` : `tok_${fnv(scope + v)}${fnv(v + "x").slice(0, 4)}`));
        }
        case "generalize_datetime": return push(col, "transformed", src.map((v) => v === null ? null : coarsenTime(v, String(sel.params.resolution))));
        case "generalize_postcode": { const n = Number(sel.params.digits); return push(col, "transformed", src.map((v) => v === null ? null : v.slice(0, n) + "*".repeat(Math.max(0, v.length - n)))); }
        case "generalize_numeric_bin": {
          const w = Number(sel.params.width) || 1, top = Number(sel.params.topCode) || 0;
          return push(col, "transformed", src.map((v) => { if (v === null) return null; const n = Number(v); if (top && n >= top) return `${top}+`; const lo = Math.floor(n / w) * w; return `${lo}–${lo + w - 1}`; }));
        }
        case "generalize_category_rare": {
          const min = Number(sel.params.minGroup) || 5;
          const counts = new Map<string, number>();
          src.forEach((v) => v !== null && counts.set(v, (counts.get(v) ?? 0) + 1));
          return push(col, "transformed", src.map((v) => v === null ? null : (counts.get(v) ?? 0) < min ? "other" : v));
        }
        case "derive_hetu": {
          const band = Number(sel.params.ageBandYears) || 10;
          const pairs = src.map((v) => v === null ? null : hetuDerive(v, band));
          columns.push({ name: `${col}_age_band`, sourceColumn: col, unitId: unit!.id, status: "derived" }); data.push(pairs.map((x) => x?.[0] ?? null));
          columns.push({ name: `${col}_sex`, sourceColumn: col, unitId: unit!.id, status: "derived" }); data.push(pairs.map((x) => x?.[1] ?? null));
          return;
        }
        case "redact_text": {
          const outIdx = columns.length;
          const vals = src.map((v, r) => {
            if (v === null) return null;
            const spans = (turnSpans[r] ?? []).map((s) => {
              const sd = dec.get(`s:${t.name}.${col}:${s.label}`)?.selected;
              const rid = sd?.recipeId ?? "redact_typed";
              const orig = v.slice(s.start, s.end);
              const list = SURROGATES[s.label] ?? [`[${s.label}]`];
              const key = sd?.params.consistency === "none" ? `${r}:${s.start}` : sd?.params.consistency === "dataset" ? orig : `${t.rows[r]?.[1]}:${orig}`;
              const replacement = rid === "keep" ? orig : rid === "suppress" ? "" : rid === "redact_surrogate" ? list[parseInt(fnv(key), 16) % list.length]! : `[${s.label}]`;
              return { ...s, replacement, unitId: `s:${t.name}.${col}:${s.label}`, recipeId: rid };
            });
            const changed = spans.filter((s) => s.recipeId !== "keep");
            if (spans.length) textChanges.set(`${outIdx}:${r}`, { kind: "redact", unitId: unit!.id, recipeId: "redact_text", spans });
            let out = "", last = 0;
            for (const s of spans) { out += v.slice(last, s.start) + s.replacement; last = s.end; }
            void changed;
            return out + v.slice(last);
          });
          return push(col, "transformed", vals);
        }
        default: return push(col, "kept", src);
      }
    });
    return { name: t.name, columns, data, textChanges };
  });
  return { planHash: p.planHash, outputHash: hashOf(tables.map((t) => t.data)).slice(0, 32), tables };
}

function highlightOf(p: Proposal, unitId: string, recipeId: RecipeId): HighlightKind {
  const d = p.decisions.find((x) => x.unitId === unitId);
  return d?.needsReview ? "review" : getRecipe(recipeId).highlight;
}

function changeFor(p: Proposal, t: ExecTable, ci: number, row: number): CellChange | null {
  const col = t.columns[ci];
  if (!col?.unitId) return null;
  const d = p.decisions.find((x) => x.unitId === col.unitId);
  const tc = t.textChanges.get(`${ci}:${row}`);
  if (tc) return { ...tc, kind: highlightOf(p, col.unitId, "redact_text") };
  if (col.status === "kept" || !d?.selected) return col.status === "suppressed" && d ? { kind: highlightOf(p, col.unitId, "suppress"), unitId: col.unitId, recipeId: "suppress" } : null;
  return { kind: highlightOf(p, col.unitId, d.selected.recipeId), unitId: col.unitId, recipeId: d.selected.recipeId };
}

// ---------------------------------------------------------------- evaluation (placeholders)
function evaluate(p: Proposal, goal: GoalSpec): Evaluation {
  const directKept = p.decisions.filter((d) => {
    const u = fixtureUnits.find((x) => x.id === d.unitId);
    const det = fields.find((f) => u?.kind === "field" && columnKey(f.ref) === columnKey(u.refs[0]!));
    return det?.role === "direct_identifier" && d.selected?.recipeId === "keep";
  });
  const postcode = p.decisions.find((d) => d.unitId === "f:customers.postcode")?.selected;
  const k = postcode?.recipeId === "suppress" || postcode?.params.digits === "2" ? 6 : 3;
  const M = (m: Partial<MetricResult> & Pick<MetricResult, "id" | "name" | "kind" | "status" | "value" | "basis">): MetricResult => ({
    definition: "Development fixture placeholder: not computed from data.", scope: "dataset", unit: "ratio", direction: m.kind === "risk" ? "lower_better" : "higher_better",
    passed: null, detail: "Fixture value, not a measurement.", ...m,
  });
  const metrics: MetricResult[] = [
    M({ id: "direct_identifier_retained", name: "Direct identifiers kept", kind: "risk", status: "evaluated", value: directKept.length, unit: "count", basis: "structural",
      threshold: { op: "<=", value: 0, hard: true }, passed: directKept.length === 0, unitIds: fixtureUnits.filter((u) => fields.some((f) => f.role === "direct_identifier" && u.refs.some((r) => columnKey(r) === columnKey(f.ref)))).map((u) => u.id),
      definition: "Columns detected as direct identifiers that the plan keeps verbatim." }),
    M({ id: "k_anonymity", name: "Smallest matching group", kind: "risk", status: "evaluated", value: k, unit: "count", basis: "own_detections", direction: "higher_better",
      threshold: { op: ">=", value: 5, hard: false }, passed: k >= 5, unitIds: ["f:customers.postcode", "f:customers.city", "f:customers.hetu"],
      definition: "Fewest customers sharing the same combination of indirect identifiers (k)." }),
    M({ id: "text_leakage", name: "Detected spans left in text", kind: "risk", status: "evaluated", value: 0, basis: "own_detections", threshold: { op: "<=", value: 0, hard: true }, passed: true,
      unitIds: fixtureUnits.filter((u) => u.kind === "span_class").map((u) => u.id), definition: "Share of Mask-detected hard identifiers still verbatim in output text." }),
    M({ id: "text_leakage_independent", name: "Leakage against independent labels", kind: "risk", status: "unsupported", value: null, basis: "independent_labels", detail: "No independent labels loaded for this data." }),
    M({ id: "join_integrity", name: "Joins preserved", kind: "utility", status: "evaluated", value: 1, basis: "structural", threshold: { op: ">=", value: 1, hard: true }, passed: true,
      unitIds: fixtureUnits.filter((u) => u.kind === "field_group").map((u) => u.id), definition: "Share of foreign-key matches that still match after tokenisation." }),
    M({ id: "required_fields", name: "Required fields available", kind: "utility", status: "evaluated", value: 1, basis: "goal_requirement", threshold: { op: ">=", value: 1, hard: false }, passed: true,
      unitIds: ["f:conversations.intent", "f:conversations.handle_time_s", "f:turns.text"], definition: `Fields the goal needs (${goal.requiredFields.join(", ")}) present in a usable form.` }),
    M({ id: "temporal_resolution", name: "Time resolution meets goal", kind: "utility", status: "evaluated", value: 1, basis: "goal_requirement", passed: true, unitIds: ["f:conversations.started_ts", "f:turns.ts"] }),
    M({ id: "location_resolution", name: "Location resolution", kind: "utility", status: "not_applicable", value: null, basis: "goal_requirement", detail: "The goal does not use location." }),
    M({ id: "row_counts", name: "Row counts preserved", kind: "integrity", status: "evaluated", value: 1, basis: "structural", threshold: { op: ">=", value: 1, hard: true }, passed: true }),
  ];
  const hardFailures = metrics.filter((m) => m.threshold?.hard && m.passed === false).map((m) => `${m.name}: ${m.value}`);
  return {
    version: 1, evaluationId: `fixture-eval-${p.planHash.slice(0, 6)}`, inputHash: p.inputHash, goalId: p.goalId, planHash: p.planHash,
    outputHash: "fixture", metrics, hardFailures, unsupported: ["Leakage against independent labels"], coverage: fixtureCoverage(), createdAt: T0, durationMs: 0,
  };
}

function fixtureCoverage(): Evaluation["coverage"] {
  return [
    { threatId: "singling_out", description: "Singling out a customer by indirect identifiers", attackerKnowledge: "Public registers: postcode, age, sex", status: "evaluated", evaluatedBy: ["k_anonymity"] },
    { threatId: "direct_reidentification", description: "Re-identification from direct identifiers left in columns", attackerKnowledge: "None beyond the shared files", status: "evaluated", evaluatedBy: ["direct_identifier_retained"] },
    { threatId: "text_leakage", description: "Personal details left in conversation text", attackerKnowledge: "None beyond the shared files", status: "evaluated", evaluatedBy: ["text_leakage"],
      statusReason: "Against Mask's own detections only; undetected spans are not counted" },
    { threatId: "attribute_inference_customer_list", description: "Attribute inference via a leaked customer list", attackerKnowledge: "Customer list with names, postcodes and products", status: "unsupported", evaluatedBy: [],
      statusReason: "Unsupported in-app: requires attacker knowledge files; measured only in the private benchmark" },
    { threatId: "linkage_call_logs", description: "Linking conversations to telecom call logs by time", attackerKnowledge: "Call logs with timestamps to the second", status: "unsupported", evaluatedBy: [],
      statusReason: "No call-log data available to test against" },
    { threatId: "membership_inference", description: "Membership inference on a trained model", attackerKnowledge: "Model access", status: "not_applicable", evaluatedBy: [],
      statusReason: "The goal shares data, not a trained model" },
  ];
}

// ---------------------------------------------------------------- backend
export class FixtureBackend implements Backend {
  readonly kind = "fixture" as const;
  private proposal: Proposal | null = null;
  private exec: Exec | null = null;
  private goal: GoalSpec | null = null;
  private modelId: string | null = null;
  private progressCb: (p: Progress) => void = () => {};

  onProgress(cb: (p: Progress) => void) { this.progressCb = cb; }
  dispose() {}

  async importFiles(_files: ImportFile[]) {
    await tick();
    this.proposal = null; this.exec = null;
    return { manifest: fixtureManifest, errors: [] };
  }
  async profile() { await tick(); return fixtureDetections; }
  async interpret(text: string, ctx: { answers: Record<string, string> }) { await tick(); return fixtureGoal(text, ctx.answers); }
  async propose(goal: GoalSpec, selectorId: "policy" | "learned", overrides: DecisionOverride[]) {
    await tick();
    if (selectorId === "learned" && !this.modelId) throw new Error("no learned model loaded");
    this.goal = goal;
    this.proposal = buildProposal(goal, selectorId, overrides, this.modelId);
    this.exec = null;
    return this.proposal;
  }
  async execute(planHash: string): Promise<ExecutedSummary> {
    await tick();
    const p = this.requireProposal(planHash);
    this.exec = execute(p);
    return {
      planHash, outputHash: this.exec.outputHash, durationMs: 0,
      tables: this.exec.tables.map((t) => ({ name: t.name, rowCount: t.data[0]?.length ?? 0, columns: t.columns, sha256: hashOf(t.data).slice(0, 32) })),
    };
  }
  async evaluate(planHash: string) {
    await tick();
    const p = this.requireProposal(planHash);
    if (!this.exec || this.exec.planHash !== planHash) throw new Error("execute the plan before evaluating");
    return evaluate(p, this.goal!);
  }
  async rows(q: RowsQuery): Promise<RowsResult> {
    const src = FIXTURE_TABLES.find((t) => t.name === q.table);
    if (!src) throw new Error(`unknown table ${q.table}`);
    const out = q.view === "protected" ? this.exec?.tables.find((t) => t.name === q.table) ?? null : null;
    if (q.view === "protected" && !out) throw new Error("no protected output for this plan yet");
    const p = this.proposal!;
    let idx = src.rows.map((_, i) => i);
    const f: RowFilter | undefined = q.filter;
    if (f && out) {
      const units = f.unitIds ? new Set(f.unitIds) : null, hl = f.highlights ? new Set(f.highlights) : null, s = f.search?.toLowerCase();
      idx = idx.filter((r) => {
        let changed = false, mu = !units, mh = !hl, mr = !f.needsReview, ms = !s;
        out.columns.forEach((_, ci) => {
          const ch = changeFor(p, out, ci, r);
          if (ch) { changed = true; if (units?.has(ch.unitId)) mu = true; if (hl?.has(ch.kind)) mh = true; if (ch.kind === "review") mr = true; }
          if (s && (out.data[ci]?.[r] ?? "").toLowerCase().includes(s)) ms = true;
        });
        return (!f.onlyChanged || changed) && mu && mh && mr && ms;
      });
    } else if (f?.search) {
      const s = f.search.toLowerCase();
      idx = idx.filter((r) => src.rows[r]!.some((v) => (v ?? "").toLowerCase().includes(s)));
    }
    if (q.sort) {
      const names = out ? out.columns.map((c) => c.name) : src.columns;
      const ci = names.indexOf(q.sort.column);
      if (ci >= 0) {
        const col = out ? out.data[ci]! : src.rows.map((r) => r[ci] ?? null);
        const numeric = col.every((v) => v === null || !Number.isNaN(Number(v)));
        const dir = q.sort.dir === "asc" ? 1 : -1;
        idx.sort((a, b) => { const va = col[a] ?? null, vb = col[b] ?? null; if (va === vb) return 0; if (va === null) return 1; if (vb === null) return -1; return dir * (numeric ? Number(va) - Number(vb) : va.localeCompare(vb)); });
      }
    }
    const slice = idx.slice(q.offset, q.offset + q.limit);
    const rows: RowView[] = slice.map((r) => {
      if (!out) return { row: r, cells: src.rows[r]!.map((v) => v ?? null) };
      const changes: Record<string, CellChange> = {};
      out.columns.forEach((c, ci) => { const ch = changeFor(p, out, ci, r); if (ch) changes[c.name] = ch; });
      return { row: r, cells: out.columns.map((_, ci) => out.data[ci]?.[r] ?? null), changes };
    });
    return { total: idx.length, columns: out ? out.columns.map((c) => c.name) : src.columns, rows, offset: q.offset };
  }
  async cell(table: string, row: number, column: string): Promise<CellResult> {
    const src = FIXTURE_TABLES.find((t) => t.name === table);
    if (!src) throw new Error(`unknown table ${table}`);
    const ci = src.columns.indexOf(column);
    const original = ci >= 0 ? src.rows[row]?.[ci] ?? null : null;
    const out = this.exec?.tables.find((t) => t.name === table);
    const oi = out?.columns.findIndex((c) => c.sourceColumn === column || c.name === column) ?? -1;
    const prot = out && oi >= 0 ? out.data[oi]?.[row] ?? null : null;
    return { original, protected: prot, change: out && oi >= 0 && this.proposal ? changeFor(this.proposal, out, oi, row) : null };
  }
  async exportPlan(planHash: string) {
    const p = this.requireProposal(planHash);
    if (!this.exec || this.exec.planHash !== planHash) throw new Error("execute the plan before exporting");
    this.progressCb({ stage: "exporting", done: 0, total: 1 });
    const enc = new TextEncoder();
    const csv = (v: string | null) => (v === null ? "" : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const files = this.exec.tables.map((t) => {
      const cols = t.columns.filter((c) => c.status !== "suppressed");
      const idx = cols.map((c) => t.columns.indexOf(c));
      const n = t.data[0]?.length ?? 0;
      const lines = [cols.map((c) => csv(c.name)).join(",")];
      for (let r = 0; r < n; r++) lines.push(idx.map((ci) => csv(t.data[ci]?.[r] ?? null)).join(","));
      return { name: `FIXTURE_${t.name}.csv`, data: enc.encode(lines.join("\n") + "\n").buffer as ArrayBuffer, mime: "text/csv" };
    });
    const report = { fixture: true, note: "Development fixture export. Nothing in it was measured.", planHash, decisions: p.decisions.map((d) => ({ unit: d.unitId, recipe: d.selected?.recipeId ?? null, reason: d.reason })) };
    files.push({ name: "FIXTURE_report.json", data: enc.encode(JSON.stringify(report, null, 2)).buffer as ArrayBuffer, mime: "application/json" });
    const artifacts = files.map((f) => ({ name: f.name, kind: (f.name.endsWith(".json") ? "report" : "table") as "report" | "table", bytes: f.data.byteLength, sha256: sha256Hex(f.data) }));
    const receipt = {
      version: 1, receiptId: `fixture-receipt-${planHash.slice(0, 6)}`, inputHash: p.inputHash, goalId: p.goalId, planHash, outputHash: this.exec.outputHash,
      artifacts, confirmedAt: new Date().toISOString(),
      report: {
        tool: { name: "Mask", version: "fixture", registryVersion: REGISTRY_VERSION }, selector: p.selector,
        goal: { task: this.goal?.task.description ?? "", recipient: this.goal?.recipient.description ?? "", trustLevel: this.goal?.recipient.trustLevel ?? "", outputForm: this.goal?.outputForm ?? "", measures: this.goal?.measures ?? [] },
        input: { inputHash: p.inputHash, tables: fixtureManifest.tables.map((t) => ({ name: t.name, rows: t.rowCount, columns: t.columns.length })) },
        decisions: [], metrics: [], hardFailures: [], unsupported: [], coverage: fixtureCoverage().map((c) => ({ threatId: c.threatId, description: c.description, status: c.status, evaluatedBy: c.evaluatedBy })), limitations: ["development fixture"], confirmedAt: new Date().toISOString(),
      },
    } as ExportReceipt;
    return { receipt, files };
  }
  async loadModel(_url: string) {
    await tick();
    this.modelId = "fixture-learned-0";
    return { modelId: this.modelId, registryVersion: REGISTRY_VERSION };
  }
  private requireProposal(planHash: string): Proposal {
    if (!this.proposal) throw new Error("no proposal");
    if (this.proposal.planHash !== planHash) throw new Error("stale plan: the proposal changed");
    return this.proposal;
  }
}

/** The goal text the fixture session starts with. */
export const FIXTURE_GOAL_TEXT = "We want an external analytics vendor to find the main contact reasons and handle time by intent from our customer-service conversations.";
