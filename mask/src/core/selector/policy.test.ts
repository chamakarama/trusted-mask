import { describe, expect, it } from "vitest";
import type { ColumnStats, DatasetManifest, FieldDetection, GoalSpec, PrivacyRole, Subtype } from "@/contracts";
import { registry } from "@/core/registry";
import { buildDecisionUnits } from "./units";
import { enumerateCandidates } from "./candidates";
import { PolicySelector } from "./policy";
import type { SelectionContext } from "./types";

const stats = (over: Partial<ColumnStats> = {}): ColumnStats => ({
  count: 1000, nonEmpty: 1000, distinct: 1000, uniqueRatio: 1, meanLength: 10, maxLength: 20, spaceShare: 0, numericShare: 0, ...over,
});

const col = (name: string, inferredType: "string" | "datetime" | "integer" | "boolean" | "number" = "string", over: Partial<ColumnStats> = {}, index = 0) =>
  ({ name, index, inferredType, stats: stats(over) });

const manifest: DatasetManifest = {
  version: 1, inputHash: "in", createdAt: "now",
  tables: [
    { name: "customers", fileName: "customers.csv", rowCount: 1000, byteSize: 1, sha256: "a", parseWarnings: [], columns: [
      col("customer_id"), col("full_name"), col("hetu"), col("postcode", "string", { distinct: 40, uniqueRatio: 0.04 }), col("email"),
      col("preferred_language", "string", { distinct: 3, uniqueRatio: 0.003 }), col("accessibility_needs", "string", { distinct: 3, uniqueRatio: 0.003, nonEmpty: 50 }),
    ] },
    { name: "conversations", fileName: "conversations.csv", rowCount: 1200, byteSize: 1, sha256: "b", parseWarnings: [], columns: [
      col("conversation_id"), col("customer_id", "string", { distinct: 900, uniqueRatio: 0.75 }), col("agent_name", "string", { distinct: 60, uniqueRatio: 0.05 }),
      col("started_ts", "datetime"), col("intent", "string", { distinct: 15, uniqueRatio: 0.0125 }), col("handle_time_s", "integer", { numericShare: 1 }),
      col("agent_note", "string", { meanLength: 120, spaceShare: 1 }),
    ] },
    { name: "turns", fileName: "turns.csv", rowCount: 14000, byteSize: 1, sha256: "c", parseWarnings: [], columns: [
      col("turn_id"), col("conversation_id", "string", { distinct: 1200, uniqueRatio: 0.085 }), col("text", "string", { meanLength: 90, spaceShare: 1 }),
    ] },
  ],
  relationships: [
    { id: "r1", kind: "foreign_key", from: { table: "conversations", column: "customer_id" }, to: { table: "customers", column: "customer_id" }, matchRate: 1, evidence: "name + values" },
    { id: "r2", kind: "foreign_key", from: { table: "turns", column: "conversation_id" }, to: { table: "conversations", column: "conversation_id" }, matchRate: 1, evidence: "name + values" },
  ],
};

const det = (table: string, column: string, role: PrivacyRole, subtype: Subtype, over: Partial<FieldDetection> = {}): FieldDetection => ({
  id: `d:${table}.${column}`, kind: "field", ref: { table, column }, role, subtype, art9: false, confidence: "high", score: 0.95,
  evidence: [{ ruleId: "test", description: "test" }], needsReview: false, reviewReasons: [], relationships: [], alternatives: [],
  detector: { id: "test", version: "0" }, ...over,
});

const detections: FieldDetection[] = [
  det("customers", "customer_id", "record_key", "RECORD_ID"),
  det("customers", "full_name", "direct_identifier", "PERSON_NAME"),
  det("customers", "hetu", "direct_identifier", "NATIONAL_ID", { evidence: [{ ruleId: "value.hetu", description: "valid HETU", matchRate: 0.99 }] }),
  det("customers", "postcode", "quasi_identifier", "POSTCODE"),
  det("customers", "email", "direct_identifier", "EMAIL"),
  det("customers", "preferred_language", "quasi_identifier", "LANGUAGE"),
  det("customers", "accessibility_needs", "sensitive_attribute", "HEALTH_DATA", { art9: true }),
  det("conversations", "conversation_id", "record_key", "RECORD_ID"),
  det("conversations", "customer_id", "technical_identifier", "CUSTOMER_ID"),
  det("conversations", "agent_name", "direct_identifier", "PERSON_NAME"),
  det("conversations", "started_ts", "quasi_identifier", "TIMESTAMP"),
  det("conversations", "intent", "non_sensitive", "CATEGORY"),
  det("conversations", "handle_time_s", "non_sensitive", "DURATION"),
  det("conversations", "agent_note", "free_text", "FREE_TEXT", { spanSummary: { rowsScanned: 1200, rowsWithSpans: 1100, byLabel: { PERSON: 1000, NATIONAL_ID: 300, HEALTH: 30 }, detectorId: "t", detectorVersion: "0" } }),
  det("turns", "turn_id", "record_key", "RECORD_ID"),
  det("turns", "conversation_id", "technical_identifier", "RECORD_ID"),
  det("turns", "text", "free_text", "FREE_TEXT", { spanSummary: { rowsScanned: 3000, rowsWithSpans: 900, byLabel: { PERSON: 800, NATIONAL_ID: 200, PHONE: 100, PAYMENT_CARD: 20, SECRET: 10, HEALTH: 25 }, detectorId: "t", detectorVersion: "0" } }),
];

const goal = (over: Partial<GoalSpec>): GoalSpec => ({
  version: 1, goalId: "g", rawText: "", task: { kind: "topic_mining", description: "topic mining" },
  recipient: { description: "external AI vendor", trustLevel: "contractual" }, outputForm: "text_corpus",
  measures: ["intent mix", "handle time by intent"], groupings: ["intent"], resolution: { time: "hour" }, requiredFields: ["intent", "handle_time_s"],
  linkage: "none", textNeed: "topic_only", exclusions: ["special_category"], threatAssumptions: [], unresolved: [],
  provenance: { interpreter: "test", version: "0", notes: [] }, ...over,
});

const vendorGoal = goal({});
const internalModelGoal = goal({ goalId: "g2", task: { kind: "model_training", description: "train an intent model" }, recipient: { description: "our data science team", trustLevel: "internal" }, textNeed: "fluent", exclusions: [] });
const auditGoal = goal({ goalId: "g3", task: { kind: "quality_audit", description: "quality audit" }, recipient: { description: "QA partner", trustLevel: "contractual" }, outputForm: "row_level", resolution: { time: "week" }, textNeed: "verbatim_evidence", linkage: "none" });
const publicGoal = goal({ goalId: "g4", task: { kind: "statistics", description: "publish" }, recipient: { description: "anyone", trustLevel: "public" }, outputForm: "row_level", textNeed: "none" });

function ctxFor(g: GoalSpec): SelectionContext {
  const units = buildDecisionUnits(manifest, detections);
  return { manifest, goal: g, detections, units, registry, overrides: [] };
}
const chosen = (p: Awaited<ReturnType<PolicySelector["propose"]>>, unitId: string) => p.decisions.find((d) => d.unitId === unitId)?.selected;

describe("decision units", () => {
  it("groups linked identifier columns and creates span classes", () => {
    const units = buildDecisionUnits(manifest, detections);
    const ids = units.map((u) => u.id);
    expect(ids).toContain("g:conversations.customer_id+customers.customer_id");
    expect(ids).toContain("g:conversations.conversation_id+turns.conversation_id");
    expect(ids).toContain("s:turns.text:PERSON");
    expect(ids).toContain("s:turns.text:SECRET");
    expect(units.find((u) => u.id === "s:turns.text:PERSON")?.parentUnitId).toBe("f:turns.text");
    // every column is covered exactly once by a field/group unit
    const covered = units.filter((u) => u.kind !== "span_class").flatMap((u) => u.refs.map((r) => `${r.table}.${r.column}`));
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered.length).toBe(manifest.tables.reduce((n, t) => n + t.columns.length, 0));
  });
});

describe("candidate masking", () => {
  it("never allows keeping a national id span or a direct identifier for an external recipient", () => {
    const c = ctxFor(vendorGoal);
    const span = c.units.find((u) => u.id === "s:turns.text:NATIONAL_ID")!;
    const keep = enumerateCandidates(span, c).find((x) => x.recipeId === "keep")!;
    expect(keep.valid).toBe(false);
    const name = c.units.find((u) => u.id === "f:customers.full_name")!;
    expect(enumerateCandidates(name, c).find((x) => x.recipeId === "keep")!.valid).toBe(false);
    expect(enumerateCandidates(name, c).find((x) => x.recipeId === "suppress")!.valid).toBe(true);
  });
  it("masks tokenisation for public release", () => {
    const c = ctxFor(publicGoal);
    const g = c.units.find((u) => u.id.startsWith("g:conversations.customer_id"))!;
    expect(enumerateCandidates(g, c).find((x) => x.recipeId === "tokenize_keyed")!.valid).toBe(false);
  });
});

describe("policy selector", () => {
  it("produces a complete deterministic plan", async () => {
    const sel = new PolicySelector();
    const a = await sel.propose(ctxFor(vendorGoal));
    const b = await sel.propose(ctxFor(vendorGoal));
    expect(a.planHash).toBe(b.planHash);
    expect(a.decisions.length).toBe(a.units.length);
    expect(a.decisions.every((d) => d.selected !== null)).toBe(true);
    expect(a.selector.id).toBe("policy");
    expect(a.tokenScopes[0]?.columns.length).toBeGreaterThan(0);
  });
  it("changes justified recipes when the purpose changes", async () => {
    const sel = new PolicySelector();
    const vendor = await sel.propose(ctxFor(vendorGoal));
    const internal = await sel.propose(ctxFor(internalModelGoal));
    const audit = await sel.propose(ctxFor(auditGoal));
    const pub = await sel.propose(ctxFor(publicGoal));
    // names in text: placeholder for vendor, surrogate for internal model training, placeholder for auditors
    expect(chosen(vendor, "s:turns.text:PERSON")?.recipeId).toBe("redact_typed");
    expect(chosen(internal, "s:turns.text:PERSON")?.recipeId).toBe("redact_surrogate");
    expect(chosen(audit, "s:turns.text:PERSON")?.recipeId).toBe("redact_typed");
    // identity codes always placeholders
    for (const p of [vendor, internal, audit]) expect(chosen(p, "s:turns.text:NATIONAL_ID")?.recipeId).toBe("redact_typed");
    // timestamps: hour for the vendor, week for the audit
    expect(chosen(vendor, "f:conversations.started_ts")?.params.resolution).toBe("hour");
    expect(chosen(audit, "f:conversations.started_ts")?.params.resolution).toBe("week");
    // health flag removed for the vendor, text dropped for public
    expect(chosen(vendor, "f:customers.accessibility_needs")?.recipeId).toBe("suppress");
    expect(chosen(pub, "f:turns.text")?.recipeId).toBe("suppress");
    // direct identifiers removed externally
    expect(chosen(vendor, "f:customers.full_name")?.recipeId).toBe("suppress");
    expect(chosen(vendor, "f:customers.email")?.recipeId).toBe("suppress");
    // joins preserved by tokenising the linked group
    expect(chosen(vendor, "g:conversations.customer_id+customers.customer_id")?.recipeId).toBe("tokenize_keyed");
    expect(chosen(vendor, "g:conversations.conversation_id+turns.conversation_id")?.recipeId).toBe("tokenize_keyed");
    // required fields kept
    expect(chosen(vendor, "f:conversations.intent")?.recipeId).toBe("keep");
    expect(chosen(vendor, "f:conversations.handle_time_s")?.recipeId).toBe("keep");
    expect(vendor.planHash).not.toBe(internal.planHash);
  });
  it("applies user overrides and re-validates them", async () => {
    const sel = new PolicySelector();
    const c = ctxFor(vendorGoal);
    c.overrides = [{ unitId: "f:conversations.started_ts", recipeId: "generalize_datetime", params: { resolution: "day" } }, { unitId: "f:customers.full_name", recipeId: "keep", params: {} }];
    const p = await sel.propose(c);
    const ts = p.decisions.find((d) => d.unitId === "f:conversations.started_ts")!;
    expect(ts.selected?.params.resolution).toBe("day");
    expect(ts.source).toBe("user");
    const name = p.decisions.find((d) => d.unitId === "f:customers.full_name")!;
    expect(name.selected?.recipeId).toBe("keep");
    expect(name.needsReview).toBe(true);
    expect(p.warnings.some((w) => w.includes("invalid"))).toBe(true);
  });
});
