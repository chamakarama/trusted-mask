import { describe, expect, it } from "vitest";
import type { DetectionSet, GoalSpec, MetricResult, SpanDetection } from "@/contracts";
import { createExecutor } from "@/core/execute";
import { fieldUnit, groupUnit, KEY, mkDetection, mkGoal, mkManifest, mkProposal, mkTable, spanOf, spanUnit, stubSpans, type PlanEntry } from "@/core/execute/testkit";
import { createEvaluator, binMidpoint } from "./index";

const ages = ["30", "31", "32", "33", "34", "40", "41", "42", "43", "44", "50", "51"];
const pcs = ["20100", "20120", "20100", "20130", "20140", "20100", "20100", "20150", "20100", "20100", "33100", "33150"];
const sex = ["F", "F", "F", "F", "F", "M", "M", "M", "M", "M", "F", "F"];
const people = mkTable("people", ["id", "name", "age", "postcode", "gender"], ages.map((a, i) => [String(i + 1), `Person Number${i}`, a, pcs[i]!, sex[i]!]));
const N0 = "mail a@b.fi and again a@b.fi";
const N1 = "Call Anna now";
const orders = mkTable("orders", ["order_id", "customer_id", "ts", "note"], [
  ["O1", "1", "2025-01-29 09:23", N0], ["O2", "2", "2025-01-29 10:00", N1], ["O3", "3", "2025-01-30 11:00", null], ["O4", "99", "2025-01-30 12:00", "hello"],
]);
const tables = [people, orders];
const manifest = mkManifest(tables, [{ from: { table: "orders", column: "customer_id" }, to: { table: "people", column: "id" }, matchRate: 0.75 }]);
const detections: DetectionSet = {
  version: 1, inputHash: manifest.inputHash, createdAt: "x", fields: [
    mkDetection("people", "id", "record_key", "CUSTOMER_ID"), mkDetection("people", "name", "direct_identifier", "PERSON_NAME"),
    mkDetection("people", "age", "quasi_identifier", "AGE"), mkDetection("people", "postcode", "quasi_identifier", "POSTCODE"),
    mkDetection("people", "gender", "quasi_identifier", "SEX"), mkDetection("orders", "order_id", "record_key", "RECORD_ID"),
    mkDetection("orders", "customer_id", "technical_identifier", "CUSTOMER_ID"), mkDetection("orders", "ts", "quasi_identifier", "TIMESTAMP"),
    mkDetection("orders", "note", "free_text", "FREE_TEXT"),
  ],
};
const spans: Record<string, SpanDetection[]> = {
  "orders.note:0": [spanOf(N0, "a@b.fi", "EMAIL")], // second occurrence not detected: it will survive
  "orders.note:1": [spanOf(N1, "Anna", "PERSON")],
};

const common: PlanEntry[] = [
  { unit: fieldUnit("people", "age"), recipe: "generalize_numeric_bin", params: { width: 10, topCode: 90 } },
  { unit: fieldUnit("people", "postcode"), recipe: "generalize_postcode", params: { digits: "3" } },
  { unit: fieldUnit("people", "gender"), recipe: "keep" },
  { unit: fieldUnit("orders", "order_id"), recipe: "keep" },
  { unit: fieldUnit("orders", "ts"), recipe: "generalize_datetime", params: { resolution: "hour" } },
  { unit: fieldUnit("orders", "note"), recipe: "redact_text" },
  { unit: spanUnit("orders", "note", "EMAIL"), recipe: "redact_typed" },
  { unit: spanUnit("orders", "note", "PERSON"), recipe: "redact_typed" },
];

function evaluate(entries: PlanEntry[], goal: GoalSpec, devLabels?: { table: string; column: string; idColumn: string; spans: Record<string, SpanDetection[]> }[]) {
  const proposal = mkProposal(entries, manifest.inputHash, goal.goalId);
  const executed = createExecutor().execute({ tables, manifest, proposal, spans: stubSpans(spans), sessionKey: KEY });
  return { executed, proposal, evaluation: createEvaluator().evaluate({ original: tables, manifest, detections, spans: stubSpans(spans), goal, proposal, executed, devLabels }) };
}
const find = (ms: MetricResult[], id: string, scope: string) => { const m = ms.find((x) => x.id === id && x.scope === scope); if (!m) throw new Error(`no ${id} ${scope}`); return m; };

describe("JointEvaluator", () => {
  const goal = mkGoal({ requiredFields: ["people.name", "gender", "ghost_col"], measures: ["membership inference risk"], resolution: { time: "15min" } });
  const good = evaluate([
    ...common,
    { unit: groupUnit(["orders", "customer_id"], ["people", "id"]), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } },
    { unit: fieldUnit("people", "name"), recipe: "suppress" },
  ], goal, [{ table: "orders", column: "note", idColumn: "order_id", spans: {
    O1: [spanOf(N0, "a@b.fi", "EMAIL"), spanOf(N0, "a@b.fi", "EMAIL", 10)], O2: [spanOf(N1, "Anna", "PERSON")], O9: [],
  } }]);
  const m = good.evaluation.metrics;

  it("measures k-anonymity over released quasi-identifiers", () => {
    const k = find(m, "k_anonymity", "people");
    expect(k.value).toBeCloseTo(2 / 12, 6);
    expect(k.breakdown).toMatchObject({ classes: 3, minClassSize: 2, rowsAtRisk: 2, columns: 3 });
    expect(k.passed).toBe(false);
    expect(k.detail).toContain("age, postcode, gender");
    expect(find(m, "k_anonymity", "orders").value).toBe(1); // ts alone: every hour is unique
  });

  it("measures text leakage against own detections, hard labels and independent labels", () => {
    // the detected e-mail was replaced, but an undetected second occurrence of the same value survives in the cell
    const tl = find(m, "text_leakage", "orders.note");
    expect(tl.value).toBe(0.5);
    expect(tl.breakdown).toMatchObject({ EMAIL: 1, PERSON: 0 });
    expect(tl.basis).toBe("own_detections");
    const hard = find(m, "text_leakage_hard_labels", "orders.note");
    expect(hard.value).toBe(1);
    expect(hard.passed).toBe(false);
    const ind = find(m, "text_leakage_independent", "orders.note");
    expect(ind.basis).toBe("independent_labels");
    expect(ind.value).toBeCloseTo(2 / 3, 6);
    expect(ind.breakdown).toMatchObject({ EMAIL: 1, PERSON: 0 });
    expect(ind.detail).toContain("1 labelled records not found");
  });

  it("measures join integrity and token uniqueness", () => {
    const j = find(m, "join_integrity", "orders.customer_id");
    expect(j.value).toBe(1);
    expect(j.breakdown).toMatchObject({ outputMatchRate: 0.75, originalMatchRate: 0.75 });
    expect(j.passed).toBe(true);
    expect(find(m, "token_uniqueness", "people.id").value).toBe(1);
  });

  it("measures direct identifiers, numeric fidelity, time resolution, rows and goal fields", () => {
    expect(find(m, "direct_identifier_retained", "people.name").value).toBe(0);
    expect(find(m, "numeric_fidelity", "people.age").value).toBeCloseTo(1 - 2.75 / 39.25, 6);
    const tr = find(m, "temporal_resolution", "orders.ts");
    expect([tr.value, tr.passed, tr.basis]).toEqual([0, false, "goal_requirement"]);
    expect(find(m, "rows_retained", "people").value).toBe(1);
    const req = find(m, "utility_field_required", "dataset");
    expect(req.value).toBe(0.5);
    expect(req.detail).toContain("Removed: people.name");
    expect(good.evaluation.hardFailures.sort()).toEqual(["text_leakage_hard_labels:orders.note", "utility_field_required:dataset"]);
    expect(good.evaluation.unsupported.some((u) => u.includes("ghost_col"))).toBe(true);
    expect(good.evaluation.unsupported.some((u) => /membership/i.test(u))).toBe(true);
    expect(good.evaluation.outputHash).toBe(good.executed.outputHash);
    expect(good.evaluation.planHash).toBe(good.proposal.planHash);
  });

  it("flags kept identifiers, broken joins and surviving secrets as hard failures", () => {
    const bad = evaluate([
      ...common.filter((e) => e.unit.id !== "s:orders.note:EMAIL"),
      { unit: spanUnit("orders", "note", "EMAIL"), recipe: "keep" },
      { unit: fieldUnit("people", "id"), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } },
      { unit: fieldUnit("orders", "customer_id"), recipe: "keep" },
      { unit: fieldUnit("people", "name"), recipe: "keep" },
    ], mkGoal());
    const bm = bad.evaluation.metrics;
    expect(find(bm, "direct_identifier_retained", "people.name").value).toBe(1);
    expect(find(bm, "join_integrity", "orders.customer_id").value).toBe(0);
    expect(find(bm, "text_leakage_hard_labels", "orders.note").value).toBe(1);
    const tl = find(bm, "text_leakage", "orders.note");
    expect(tl.value).toBe(0);
    expect(tl.breakdown).toMatchObject({ "kept:EMAIL": 1 });
    expect(bad.evaluation.hardFailures.sort()).toEqual(["direct_identifier_retained:people.name", "join_integrity:orders.customer_id", "text_leakage_hard_labels:orders.note"]);
    expect(find(bm, "utility_field_required", "dataset").status).toBe("not_applicable");
    expect(find(bm, "temporal_resolution", "orders.ts").passed).toBe(true); // goal states no resolution
  });

  it("internal goals have no hard threshold on direct identifiers", () => {
    const r = evaluate([...common, { unit: fieldUnit("people", "name"), recipe: "keep" }], mkGoal({ recipient: { description: "team", trustLevel: "internal" }, linkage: "none" }));
    const d = find(r.evaluation.metrics, "direct_identifier_retained", "people.name");
    expect(d.threshold).toBeUndefined();
    expect(d.passed).toBeNull();
    expect(find(r.evaluation.metrics, "join_integrity", "orders.customer_id").status).toBe("not_applicable");
  });
});

describe("JointEvaluator: utility on text and categories", () => {
  it("vocabulary retained and category fidelity", () => {
    const rows = Array.from({ length: 10 }, (_, i) => [`R${i}`, i < 7 ? "phone" : i < 9 ? "chat" : "letter", `the router is broken says ${["Aino", "Eero", "Helmi", "Ilkka", "Kalle", "Laura", "Mikko", "Noora", "Otto", "Sanna"][i]}`]);
    const t = mkTable("c", ["id", "channel", "text"], rows);
    const man = mkManifest([t]);
    const sp: Record<string, SpanDetection[]> = {};
    rows.forEach((r, i) => { sp[`c.text:${i}`] = [spanOf(r[2]!, r[2]!.split(" ").pop()!, "PERSON"), spanOf(r[2]!, "router", "DEVICE_ID")]; });
    const entries: PlanEntry[] = [
      { unit: fieldUnit("c", "id"), recipe: "keep" },
      { unit: fieldUnit("c", "channel"), recipe: "generalize_category_rare", params: { minGroup: 3 } },
      { unit: fieldUnit("c", "text"), recipe: "redact_text" },
      { unit: spanUnit("c", "text", "PERSON"), recipe: "redact_typed" },
      { unit: spanUnit("c", "text", "DEVICE_ID"), recipe: "redact_typed" },
    ];
    const proposal = mkProposal(entries, man.inputHash);
    const executed = createExecutor().execute({ tables: [t], manifest: man, proposal, spans: stubSpans(sp), sessionKey: KEY });
    const det: DetectionSet = { version: 1, inputHash: man.inputHash, createdAt: "x", fields: [mkDetection("c", "text", "free_text", "FREE_TEXT"), mkDetection("c", "channel", "non_sensitive", "CATEGORY")] };
    const ev = createEvaluator().evaluate({ original: [t], manifest: man, detections: det, spans: stubSpans(sp), goal: mkGoal(), proposal, executed });
    // common words: the, router, broken, says (df 10 >= 5); router is redacted -> 30 of 40 kept
    expect(find(ev.metrics, "vocabulary_retained", "c.text").value).toBe(0.75);
    // channel: letter (1 row) and chat (2 rows) merged -> moved mass 3/10, TVD 0.3, fidelity 0.4
    expect(find(ev.metrics, "category_fidelity", "c.channel").value).toBeCloseTo(0.4, 6);
    expect(find(ev.metrics, "k_anonymity", "c").status).toBe("not_applicable");
  });

  it("bin midpoints", () => {
    expect(binMidpoint("10-19")).toBe(14.5);
    expect(binMidpoint("90+")).toBe(90);
    expect(binMidpoint("x")).toBeNull();
  });
});
