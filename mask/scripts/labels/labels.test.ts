/**
 * Label pipeline tests. The end-to-end smoke test builds a tiny synthetic annotation set in a temp directory
 * (never in ml/labels/annotations), runs validate -> export_features -> export_policy_baseline -> ml/train.py and
 * loads the resulting artifact into the learned selector.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";
import type { BenchmarkReport, Proposal } from "@/contracts";
import { DecisionUnitSchema, GoalSpecSchema, LabelRecordSchema, ModelArtifactSchema } from "@/contracts";
import { SCENARIO_GOALS } from "@/core/goal/scenarios";
import { registry } from "@/core/registry";
import { createLearnedSelector } from "@/core/selector/learned";
import { MASK_DIR, readJson, writeJson } from "./common";
import { makeTasks, type AnnotationTask, type TaskIndexEntry } from "./lib/make_tasks";
import { validateAnnotations } from "./lib/validate";
import { exportFeatures } from "./lib/export_features";
import { exportPolicyBaseline } from "./lib/export_policy_baseline";
import { evaluatePlan, selectTargets, type Constraints } from "./lib/select_targets";
import { loadScenarios } from "./common";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mask-labels-"));
const tasksDir = path.join(tmp, "tasks");
let index: TaskIndexEntry[] = [];

beforeAll(async () => {
  // one train, one val and the test dataset, few units each
  const r = await makeTasks({ datasets: ["health", "education", "customer_service"], limit: 8, outDir: tasksDir, goalFor: (s) => SCENARIO_GOALS[s] });
  index = r.index;
}, 120_000);

describe("make_tasks", () => {
  it("writes valid task JSON with candidates, baseline and the expected output shape", () => {
    expect(index.length).toBe(8 * 9);
    for (const e of index.slice(0, 20)) {
      const t = readJson<AnnotationTask>(path.join(tasksDir, e.file));
      expect(t.taskId).toBe(e.taskId);
      expect(GoalSpecSchema.safeParse(t.goal).success).toBe(true);
      expect(DecisionUnitSchema.safeParse(t.unit).success).toBe(true);
      expect(["train", "val", "test"]).toContain(t.split);
      expect(new Set(t.candidates.map((c) => c.key)).size).toBe(t.candidates.length);
      expect(t.baseline.status).toBe("baseline suggestion, do not copy blindly");
      if (t.baseline.key) expect(t.candidates.find((c) => c.key === t.baseline.key)?.valid).toBe(true);
      expect(t.scenario.suggestedTargets.status).toBe("hint, not binding");
      expect(Object.keys(t.expectedOutput.shape)).toEqual(["taskId", "chosen", "acceptable", "rationale", "unresolved", "annotator"]);
      // statistics only: the manifest subset holds the unit's columns and no raw values
      expect(t.manifest.tables.flatMap((x) => x.columns).length).toBe(t.unit.refs.length);
    }
    expect(index.find((e) => e.dataset === "customer_service")?.split).toBe("test");
    expect(index.find((e) => e.dataset === "education")?.split).toBe("val");
  });
});

describe("select_targets", () => {
  const sc = loadScenarios().find((s) => s.id === "HEALTH-S1")!;
  const cons = readJson<Constraints>(path.join(MASK_DIR, "ml", "CONSTRAINTS.json"));
  let unitId = "f:ed_visits.patient_name";
  const plan = (hash: string, sel: string): Proposal => ({
    version: 1, proposalId: hash, inputHash: "in", goalId: "g", selector: { id: "policy", version: "1", registryVersion: registry.version }, units: [],
    decisions: [{ unitId, candidates: [], selected: { recipeId: sel as "suppress", params: {} }, abstained: false, reason: "", detail: [], source: "selector", reviewState: "proposed", needsReview: false, reviewReasons: [] }],
    tokenScopes: [], planHash: hash, createdAt: "now", warnings: [],
  });
  const report = (hash: string, retained: number, util: number, status: "evaluated" | "unsupported" = "evaluated"): BenchmarkReport => ({
    version: 1, reportId: `rep-${hash}`, adapterVersion: "t", toolkit: { name: "pets-eval", version: "t", commandLog: [] }, dataset: "health", scenarioId: "HEALTH-S1",
    split: "train", inputHash: "in", goalId: "g", planHash: hash, outputHash: "o", representation: {}, createdAt: "now", durationMs: 1, notes: [], privateArtifacts: [],
    tests: [
      { id: "direct_identifiers_retained.t", kind: "residual_check", name: "direct identifiers", source: "residual", status: "evaluated", scope: "all", metrics: { direct_identifiers_retained: retained }, denominators: {}, assumptions: [], covers: [] },
      { id: "text_leakage.t.text", kind: "text_leakage", name: "text leakage", source: "pii_spans", status: "evaluated", scope: "free text", metrics: { hard_label_leaks: 0 }, denominators: {}, assumptions: [], covers: [] },
      { id: "linkage.t.adversary", kind: "attack", name: "linkage", source: "attack_specs", status, scope: "all", metrics: { reidentification_rate: 0.01 }, denominators: {}, assumptions: [], covers: [] },
      ...sc.utility_requirements.map((u) => ({ id: `utility.${u}`, kind: "utility" as const, name: u, source: u, status: "evaluated" as const, scope: "t", metrics: { score: util }, denominators: {}, assumptions: [], covers: [] })),
    ],
  });
  it("never counts a missing or unsupported test as satisfied", () => {
    expect(evaluatePlan(report("a", 0, 0.9), plan("a", "suppress"), sc, cons).qualifies).toBe(true);
    expect(evaluatePlan(report("b", 2, 0.99), plan("b", "keep"), sc, cons).qualifies).toBe(false);
    const u = evaluatePlan(report("c", 0, 0.9, "unsupported"), plan("c", "suppress"), sc, cons);
    expect(u.qualifies).toBe(false);
    expect(u.weak).toBe(true);
  });
  it("picks the best qualifying plan, keeps the plan context and writes failures explicitly", () => {
    const TOK = "tokenize_keyed@format=token,scope=dataset";
    const e = index.filter((x) => x.scenarioId === "HEALTH-S1").find((x) => {
      const t = readJson<AnnotationTask>(path.join(tasksDir, x.file));
      return [TOK, "suppress"].every((k) => t.candidates.find((c) => c.key === k)?.valid);
    })!;
    expect(e).toBeDefined();
    unitId = e.unitId;
    const bench = path.join(tmp, "bench");
    const dir = path.join(bench, "health", "HEALTH-S1");
    const pairs: [string, number, number, string][] = [["p1", 0, 0.8, "suppress"], ["p2", 0, 0.9, "tokenize_keyed"], ["p3", 1, 1.0, "keep"]];
    for (const [h, r, u, sel] of pairs) {
      writeJson(path.join(dir, `${h}.json`), report(h, r, u));
      const p = plan(h, sel);
      if (sel === "tokenize_keyed") p.decisions[0]!.selected = { recipeId: "tokenize_keyed", params: { format: "token", scope: "dataset" } };
      writeJson(path.join(dir, `${h}.proposal.json`), p);
    }
    writeJson(path.join(bench, "health", "HEALTH-S2", "q1.json"), report("q1", 3, 1));
    writeJson(path.join(bench, "health", "HEALTH-S2", "q1.proposal.json"), plan("q1", "keep"));
    const out = path.join(tmp, "bench_targets");
    const summary = selectTargets({ benchDir: bench, outDir: out, datasets: ["health"] });
    expect(summary.find((s) => s.scenarioId === "HEALTH-S1")).toMatchObject({ plans: 3, qualifying: 2, targets: 1 });
    const t = readJson<{ chosen: { key: string }; acceptable: { key: string }[]; planHash: string; planContext: unknown[] }>(path.join(out, e.file.replace(/^health\/HEALTH-S1\//, "health/HEALTH-S1/")));
    expect(t.chosen.key).toBe("tokenize_keyed@format=token,scope=dataset");
    expect(t.acceptable).toEqual([{ key: "suppress" }]);
    expect(t.planHash).toBe("p2");
    expect(t.planContext).toHaveLength(1);
    expect(readJson<{ kind: string }>(path.join(out, "health", "HEALTH-S2", "_FAILURE.json")).kind).toBe("no_qualifying_plan");
  });
});

describe("pipeline smoke run", () => {
  it("validates synthetic annotations, exports features and trains a loadable artifact", async () => {
    const ann = path.join(tmp, "annotations"), ch = path.join(tmp, "challenges"), out = path.join(tmp, "labels"), data = path.join(tmp, "data");
    let i = 0;
    for (const e of index) {
      const t = readJson<AnnotationTask>(path.join(tasksDir, e.file));
      const valid = t.candidates.filter((c) => c.valid);
      if (!valid.length) continue;
      const chosen = t.baseline.key ?? valid[0]!.key;
      const other = valid.find((c) => c.key !== chosen);
      writeJson(path.join(ann, e.file), {
        taskId: t.taskId, chosen: { key: chosen }, acceptable: other && i % 2 ? [{ key: other.key }] : [], rationale: "synthetic test annotation",
        unresolved: [], annotator: { model: "synthetic-fixture", promptVersion: "annotator-1" },
      });
      if (i % 3 === 0) writeJson(path.join(ch, e.file), { taskId: t.taskId, agrees: i % 6 === 0, objections: i % 6 ? ["test objection"] : [], counterChoice: null });
      i++;
    }
    // one broken annotation must be listed, not recorded
    const bad = index[0]!;
    writeJson(path.join(ann, bad.file.replace(".json", "_broken.json")), { taskId: "x", chosen: { key: "keep" } });
    const v = validateAnnotations({ tasksDir, annotationsDir: ann, challengesDir: ch, reviewsDir: path.join(tmp, "none"), benchTargetsDir: path.join(tmp, "bench_targets"), outDir: out, auditSample: 5 });
    expect(v.invalid.length).toBeGreaterThanOrEqual(1);
    expect(v.records.length).toBeGreaterThan(30);
    for (const r of v.records) expect(LabelRecordSchema.safeParse(r).success).toBe(true);
    expect(v.records.some((r) => r.validation.checks.source === "benchmark")).toBe(true);
    expect(v.records.filter((r) => r.reviewer.status === "unreviewed" && r.validation.checks.source === "annotation").every((r) => r.weak)).toBe(true);

    const meta = exportFeatures({ recordsFile: path.join(out, "records.jsonl"), tasksDir, outDir: data, goals: null });
    expect(meta.examples.train).toBeGreaterThan(0);
    expect(meta.examples.val).toBeGreaterThan(0);
    expect(meta.examples.test).toBeGreaterThan(0);
    await exportPolicyBaseline({ recordsFile: path.join(out, "records.jsonl"), tasksDir, outDir: data, goals: null });

    let py = true;
    try { execFileSync("python3", ["-I", "-c", "import numpy"], { stdio: "ignore" }); } catch { py = false; }
    if (!py) { console.warn("python3 with numpy not available: skipping train.py"); return; }
    execFileSync("python3", ["-I", path.join(MASK_DIR, "ml", "train.py"), "--data", data, "--out", path.join(tmp, "runs"), "--run-id", "smoke", "--epochs", "80"], { stdio: "pipe" });
    const art = readJson(path.join(tmp, "runs", "smoke", "model.json"));
    const parsed = ModelArtifactSchema.safeParse(art);
    expect(parsed.success).toBe(true);
    expect(fs.existsSync(path.join(tmp, "runs", "smoke", "report.md"))).toBe(true);
    execFileSync("python3", ["-I", path.join(MASK_DIR, "ml", "evaluate.py"), "--model", path.join(tmp, "runs", "smoke", "model.json"), "--data", data, "--out", path.join(tmp, "eval.json")], { stdio: "pipe" });

    // the artifact runs in the app's selector on a context rebuilt from a task
    const sel = createLearnedSelector(parsed.data!);
    const e = index.find((x) => x.dataset === "customer_service")!;
    const t = readJson<AnnotationTask>(path.join(tasksDir, e.file));
    const prop = await sel.propose({ manifest: t.manifest, goal: t.goal, detections: t.detections, units: [t.unit], registry, overrides: [] });
    const d = prop.decisions[0]!;
    expect(d.abstained || t.candidates.some((c) => c.valid && c.recipeId === d.selected?.recipeId)).toBe(true);
    if (!d.abstained) expect(d.reason).toMatch(/chosen mainly because/);
  }, 180_000);
});
