import { describe, expect, it } from "vitest";
import type { ColumnStats, DatasetManifest, FieldDetection, GoalSpec, ModelArtifact, PrivacyRole, Subtype } from "@/contracts";
import { ModelArtifactSchema } from "@/contracts";
import { REGISTRY_VERSION, registry } from "@/core/registry";
import { buildDecisionUnits } from "./units";
import { enumerateCandidates } from "./candidates";
import { FEATURE_SPEC_VERSION, baseFeatures, featureNames } from "./features";
import { createLearnedSelector, LearnedSelector } from "./learned";
import type { SelectionContext } from "./types";

const stats = (over: Partial<ColumnStats> = {}): ColumnStats => ({
  count: 1000, nonEmpty: 1000, distinct: 1000, uniqueRatio: 1, meanLength: 10, maxLength: 20, spaceShare: 0, numericShare: 0, ...over,
});
const manifest: DatasetManifest = {
  version: 1, inputHash: "in", createdAt: "now", relationships: [],
  tables: [{ name: "people", fileName: "people.csv", rowCount: 1000, byteSize: 1, sha256: "a", parseWarnings: [], columns: [
    { name: "full_name", index: 0, inferredType: "string", stats: stats() },
    { name: "email", index: 1, inferredType: "string", stats: stats() },
    { name: "note", index: 2, inferredType: "string", stats: stats({ meanLength: 80, spaceShare: 1 }) },
  ] }],
};
const det = (column: string, role: PrivacyRole, subtype: Subtype, over: Partial<FieldDetection> = {}): FieldDetection => ({
  id: `d:people.${column}`, kind: "field", ref: { table: "people", column }, role, subtype, art9: false, confidence: "high", score: 0.9,
  evidence: [], needsReview: false, reviewReasons: [], relationships: [], alternatives: [], detector: { id: "t", version: "0" }, ...over,
});
const detections = [
  det("full_name", "direct_identifier", "PERSON_NAME"),
  det("email", "direct_identifier", "EMAIL"),
  det("note", "free_text", "FREE_TEXT", { spanSummary: { rowsScanned: 1000, rowsWithSpans: 10, byLabel: { PERSON: 10 }, detectorId: "t", detectorVersion: "0" } }),
];
const goal = (over: Partial<GoalSpec> = {}): GoalSpec => ({
  version: 1, goalId: "g", rawText: "", task: { kind: "research", description: "" }, recipient: { description: "lab", trustLevel: "contractual" },
  outputForm: "row_level", measures: [], groupings: [], resolution: {}, requiredFields: [], linkage: "none", textNeed: "topic_only",
  exclusions: [], threatAssumptions: [], unresolved: [], provenance: { interpreter: "t", version: "0", notes: [] }, ...over,
});
const ctxFor = (g: GoalSpec): SelectionContext => ({ manifest, goal: g, detections, units: buildDecisionUnits(manifest, detections), registry, overrides: [] });

/** Tiny artifact over three features: suppress likes direct identifiers, tokenize likes linkage across tables. */
function artifact(over: Partial<ModelArtifact> = {}): ModelArtifact {
  const feats = ["unit.role:direct_identifier", "goal.linkage:across_tables", "goal.trust:contractual"];
  return {
    version: 1, modelId: "tiny-1", createdAt: "now", registryVersion: REGISTRY_VERSION,
    featureSpec: { version: FEATURE_SPEC_VERSION, baseFeatures: feats }, embedding: null,
    classes: [
      { key: "keep", recipeId: "keep", params: {} },
      { key: "suppress", recipeId: "suppress", params: {} },
      { key: "tokenize_keyed@format=token,scope=dataset", recipeId: "tokenize_keyed", params: { format: "token", scope: "dataset" } },
    ],
    weights: [[5, 0, 0], [2, 0, 1], [1, 4, 0]],
    bias: [3, 0, 0],
    calibration: { method: "temperature", temperature: 1, fittedOn: "test" },
    training: { codeRevision: "x", dataHash: "x", splitHash: "x", config: {}, examples: { train: 0, val: 0, test: 0 }, environment: "test" },
    evaluation: { heldOut: {}, baselines: {}, notes: [] },
    ...over,
  };
}

describe("base features", () => {
  it("are deterministic, named and fixed-length", () => {
    const c = ctxFor(goal());
    const u = c.units.find((x) => x.id === "f:people.email")!;
    const a = baseFeatures(u, c), b = baseFeatures(u, c);
    expect(a.values).toEqual(b.values);
    expect(a.names).toEqual(featureNames());
    expect(a.values.length).toBe(a.names.length);
    expect(new Set(a.names).size).toBe(a.names.length);
    expect(a.names.every((n) => n.includes(":"))).toBe(true);
    const at = (n: string) => a.values[a.names.indexOf(n)];
    expect(at("unit.role:direct_identifier")).toBe(1);
    expect(at("goal.trust:contractual")).toBe(1);
    expect(at("x.trust_role:contractual|direct_identifier")).toBe(1);
    expect(at("unit.span:PERSON")).toBe(0);
  });
  it("encodes span labels and the goal-text interaction for span units", () => {
    const c = ctxFor(goal({ textNeed: "fluent" }));
    const u = c.units.find((x) => x.id === "s:people.note:PERSON")!;
    const f = baseFeatures(u, c);
    expect(f.values[f.names.indexOf("unit.span:PERSON")]).toBe(1);
    expect(f.values[f.names.indexOf("x.textNeed_span:fluent|PERSON")]).toBe(1);
    expect(f.values[f.names.indexOf("unit.spanFreq:share")]).toBeCloseTo(0.01);
  });
  it("changes with the goal", () => {
    const u = ctxFor(goal()).units.find((x) => x.id === "f:people.email")!;
    expect(baseFeatures(u, ctxFor(goal())).values).not.toEqual(baseFeatures(u, ctxFor(goal({ linkage: "across_tables" }))).values);
  });
});

describe("learned selector", () => {
  it("validates against the contract schema", () => {
    expect(ModelArtifactSchema.safeParse(artifact()).success).toBe(true);
  });

  it("picks the highest-logit valid class, masks invalid ones and reports preferences", async () => {
    const sel = createLearnedSelector(artifact());
    expect(sel.id).toBe("learned");
    expect(sel.version).toBe("tiny-1");
    const p = await sel.propose(ctxFor(goal()));
    const d = p.decisions.find((x) => x.unitId === "f:people.email")!;
    // keep has the highest raw logit (3+5=8) but is invalid for a contractual recipient: masked
    const keep = d.candidates.find((c) => c.recipeId === "keep")!;
    expect(keep.valid).toBe(false);
    expect(keep.preference).toBeUndefined();
    expect(d.selected?.recipeId).toBe("suppress"); // 2+1=3 vs tokenize 1
    const prefs = d.candidates.filter((c) => c.preference !== undefined).map((c) => c.preference!);
    expect(prefs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(d.reason).toMatch(/chosen mainly because/);
    expect(d.reason).toMatch(/runner-up 'Keyed token'/);
    expect(p.selector.id).toBe("learned");
  });

  it("lets the goal change the ranking", async () => {
    const sel = new LearnedSelector(artifact());
    const p = await sel.propose(ctxFor(goal({ linkage: "across_tables" })));
    expect(p.decisions.find((x) => x.unitId === "f:people.email")!.selected?.recipeId).toBe("tokenize_keyed"); // 1+4=5 > 3
  });

  it("breaks ties by the lower class key", async () => {
    const a = artifact({ weights: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bias: [0, 0, 0] });
    const d = (await createLearnedSelector(a).propose(ctxFor(goal()))).decisions.find((x) => x.unitId === "f:people.email")!;
    expect(d.selected?.recipeId).toBe("suppress"); // "suppress" < "tokenize_keyed@..."
  });

  it("abstains when no valid candidate has a class", async () => {
    // span unit: valid candidates are redact_typed / surrogate / suppress; only keep is modelled
    const a = artifact({ classes: [{ key: "keep", recipeId: "keep", params: {} }], weights: [[0, 0, 0]], bias: [0] });
    const c = ctxFor(goal());
    const p = await createLearnedSelector(a).propose(c);
    const d = p.decisions.find((x) => x.unitId === "f:people.email")!;
    expect(d.abstained).toBe(true);
    expect(d.selected).toBeNull();
    expect(d.abstainReason).toMatch(/no class/);
  });

  it("abstains when every candidate is invalid (all-masked vector is never normalised)", () => {
    const c = ctxFor(goal());
    const tableUnit = { id: "t:people", kind: "table" as const, refs: [{ table: "people", column: "full_name" }], detectionIds: [] };
    expect(enumerateCandidates(tableUnit, c).filter((x) => x.valid)).toHaveLength(0);
    const d = new LearnedSelector(artifact()).decide(tableUnit, c);
    expect(d.abstained).toBe(true);
    expect(d.abstainReason).toMatch(/No supported recipe is valid/);
    expect(d.candidates.every((x) => x.preference === undefined)).toBe(true);
  });

  it("rejects a wrong registry or feature spec version and unknown features", () => {
    expect(() => createLearnedSelector(artifact({ registryVersion: "0.0.1" }))).toThrow(/registry/);
    expect(() => createLearnedSelector(artifact({ featureSpec: { version: "0.0.0", baseFeatures: [] } }))).toThrow(/feature spec/);
    expect(() => createLearnedSelector(artifact({ featureSpec: { version: FEATURE_SPEC_VERSION, baseFeatures: ["a:b", "c:d", "e:f"] } }))).toThrow(/does not produce/);
  });
});
