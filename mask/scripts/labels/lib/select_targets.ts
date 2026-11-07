/**
 * Benchmark-derived training targets.
 *
 *   npx vite-node scripts/labels/select_targets.ts [--dataset health] [--scenario HEALTH-S1]
 *        [--bench ml/bench/results] [--out ml/labels/bench_targets] [--constraints ml/CONSTRAINTS.json]
 *
 * For each (dataset, scenario) reads every executed plan under <bench>/<dataset>/<scenario>/: BenchmarkReport JSON
 * files (contracts/benchmark.ts) and the Proposal JSON of the same planHash. Applies the predeclared constraints in
 * ml/CONSTRAINTS.json, ranks qualifying plans by mean relevant utility and writes one target per unit of the best
 * plan: chosen = the best plan's recipe, acceptable = differing choices of other qualifying plans. The surrounding plan
 * (all other units' choices, planHash, report id and test outcomes) is kept with every target.
 * When no plan qualifies, an explicit failure record is written instead; a success is never invented.
 * Missing, unsupported or failed tests never satisfy a constraint.
 */
import fs from "node:fs";
import path from "node:path";
import type { BenchmarkReport, BenchmarkTest, Proposal, TestStatus } from "@/contracts";
import { BenchmarkReportSchema, ProposalSchema } from "@/contracts";
import { candidateKey } from "@/core/registry";
import { ML_DIR, loadScenarios, parseArgs, readJson, safeId, taskIdOf, writeJson, type Scenario } from "../common";

export interface ConstraintDef {
  id: string; description: string; trustLevels: string[];
  match: { kind: BenchmarkTest["kind"]; idPattern?: string; sourceFromScenario?: "utility_requirements" };
  metric?: string; op?: "==" | "<=" | ">="; threshold?: number; thresholdByTrust?: Record<string, number>;
  requireStatus?: TestStatus; notApplicablePasses: boolean;
}
export interface Constraints { version: string; metricAliases: Record<string, string[]>; constraints: ConstraintDef[]; ranking: { metric: string } }

export interface ConstraintOutcome { constraintId: string; status: TestStatus | "missing"; satisfied: boolean; tests: string[]; detail: string }

export interface PlanEval {
  planHash: string; reportId: string; qualifies: boolean; utility: number | null; removed: number;
  constraints: ConstraintOutcome[]; weak: boolean; weakReasons: string[];
  tests: Record<string, { status: TestStatus; kind: string; source: string; metrics: Record<string, number | null>; statusReason?: string }>;
}

export interface BenchTarget {
  version: 1; source: "benchmark"; taskId: string; dataset: string; scenarioId: string; unitId: string;
  chosen: { key: string }; acceptable: { key: string }[]; rationale: string; unresolved: string[];
  selector: { constraintsVersion: string; tool: string };
  planHash: string; planContext: { unitId: string; key: string | null }[];
  benchmark: { reportId: string; utility: number | null; tests: PlanEval["tests"]; constraints: ConstraintOutcome[] };
  qualifyingPlans: number; totalPlans: number; weak: boolean; weakReasons: string[];
}

export interface BenchFailure {
  version: 1; source: "benchmark"; dataset: string; scenarioId: string; kind: "no_qualifying_plan" | "no_plans" | "unit_abstained";
  constraintsVersion: string; detail: string;
  plans: { planHash: string; reportId: string; violated: ConstraintOutcome[] }[];
  units?: string[];
}

const metricValue = (t: BenchmarkTest, aliases: string[]): number | null => {
  for (const a of aliases) if (t.metrics[a] !== undefined && t.metrics[a] !== null) return t.metrics[a] as number;
  return null;
};

function matching(c: ConstraintDef, report: BenchmarkReport, sc: Scenario): BenchmarkTest[] {
  const re = c.match.idPattern ? new RegExp(c.match.idPattern, "i") : null;
  return report.tests.filter((t) => t.kind === c.match.kind && (!re || re.test(`${t.id} ${t.name} ${t.source}`))
    && (!c.match.sourceFromScenario || sc.utility_requirements.includes(t.source)));
}

export function evaluatePlan(report: BenchmarkReport, plan: Proposal, sc: Scenario, cons: Constraints): PlanEval {
  const trust = sc.trust_level;
  const outcomes: ConstraintOutcome[] = [];
  const weakReasons: string[] = [];
  for (const c of cons.constraints.filter((x) => x.trustLevels.includes(trust))) {
    const tests = matching(c, report, sc);
    for (const t of tests) if (t.status === "failed" || t.status === "unsupported") weakReasons.push(`${t.id} (${c.id}) is ${t.status}`);
    if (c.match.sourceFromScenario) {
      // one evaluated test required per required task
      const missing = sc.utility_requirements.filter((u) => !tests.some((t) => t.source === u && t.status === (c.requireStatus ?? "evaluated")));
      outcomes.push({ constraintId: c.id, status: missing.length ? (tests.length ? tests.find((t) => t.status !== "evaluated")?.status ?? "missing" : "missing") : "evaluated",
        satisfied: missing.length === 0, tests: tests.map((t) => t.id), detail: missing.length ? `not answerable: ${missing.join(", ")}` : "all required tasks evaluated" });
      continue;
    }
    if (!tests.length) { outcomes.push({ constraintId: c.id, status: "missing", satisfied: false, tests: [], detail: "no matching test in the report" }); continue; }
    const evaluated = tests.filter((t) => t.status === "evaluated");
    const bad = tests.find((t) => t.status === "failed" || t.status === "unsupported");
    if (bad) { outcomes.push({ constraintId: c.id, status: bad.status, satisfied: false, tests: tests.map((t) => t.id), detail: `${bad.id}: ${bad.statusReason ?? bad.status}` }); continue; }
    if (!evaluated.length) {
      outcomes.push({ constraintId: c.id, status: "not_applicable", satisfied: c.notApplicablePasses, tests: tests.map((t) => t.id), detail: "all matching tests not_applicable" });
      continue;
    }
    const thr = c.thresholdByTrust?.[trust] ?? c.threshold;
    const aliases = cons.metricAliases[c.metric ?? ""] ?? [c.metric ?? ""];
    const fails: string[] = [];
    for (const t of evaluated) {
      const v = metricValue(t, aliases);
      if (v === null) { fails.push(`${t.id}: metric ${c.metric} missing`); continue; }
      if (thr === undefined) continue;
      const ok = c.op === "==" ? v === thr : c.op === "<=" ? v <= thr : c.op === ">=" ? v >= thr : true;
      if (!ok) fails.push(`${t.id}: ${c.metric}=${v} not ${c.op} ${thr}`);
    }
    outcomes.push({ constraintId: c.id, status: "evaluated", satisfied: fails.length === 0, tests: tests.map((t) => t.id), detail: fails.join("; ") || "satisfied" });
  }
  const util = report.tests.filter((t) => t.kind === "utility" && sc.utility_requirements.includes(t.source) && t.status === "evaluated")
    .map((t) => metricValue(t, cons.metricAliases[cons.ranking.metric] ?? [cons.ranking.metric])).filter((v): v is number => v !== null);
  const tests: PlanEval["tests"] = {};
  for (const t of report.tests) tests[t.id] = { status: t.status, kind: t.kind, source: t.source, metrics: t.metrics, ...(t.statusReason ? { statusReason: t.statusReason } : {}) };
  return {
    planHash: plan.planHash, reportId: report.reportId, qualifies: outcomes.every((o) => o.satisfied),
    utility: util.length ? util.reduce((a, b) => a + b, 0) / util.length : null,
    removed: plan.decisions.filter((d) => d.selected?.recipeId === "suppress").length,
    constraints: outcomes, weak: weakReasons.length > 0, weakReasons, tests,
  };
}

const keyOfSel = (d: Proposal["decisions"][number]): string | null => (d.selected ? candidateKey(d.selected.recipeId, d.selected.params) : null);

/** Read reports and proposals of one (dataset, scenario) directory, paired by planHash. */
export function loadPlans(dir: string): { pairs: { report: BenchmarkReport; plan: Proposal }[]; problems: string[] } {
  const problems: string[] = [];
  const reports = new Map<string, BenchmarkReport>();
  const plans = new Map<string, Proposal>();
  if (!fs.existsSync(dir)) return { pairs: [], problems };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const raw = readJson(path.join(dir, f));
    const r = BenchmarkReportSchema.safeParse(raw);
    if (r.success) { reports.set(r.data.planHash, r.data); continue; }
    const p = ProposalSchema.safeParse(raw);
    if (p.success) { plans.set(p.data.planHash, p.data); continue; }
    problems.push(`${f}: neither a BenchmarkReport nor a Proposal`);
  }
  const pairs: { report: BenchmarkReport; plan: Proposal }[] = [];
  for (const [h, report] of reports) {
    const plan = plans.get(h);
    if (!plan) problems.push(`report ${report.reportId}: no Proposal with planHash ${h}`);
    else pairs.push({ report, plan });
  }
  return { pairs, problems };
}

export interface SelectOptions { benchDir?: string; outDir?: string; constraintsFile?: string; datasets?: string[]; scenarios?: string[] }

export function selectTargets(opts: SelectOptions = {}) {
  const benchDir = opts.benchDir ?? path.join(ML_DIR, "bench", "results");
  const outDir = opts.outDir ?? path.join(ML_DIR, "labels", "bench_targets");
  const cons = readJson<Constraints>(opts.constraintsFile ?? path.join(ML_DIR, "CONSTRAINTS.json"));
  const scenarios = loadScenarios();
  const summary: { dataset: string; scenarioId: string; plans: number; qualifying: number; targets: number; failure?: string; problems: string[] }[] = [];
  for (const sc of scenarios) {
    if (opts.datasets && !opts.datasets.includes(sc.dataset)) continue;
    if (opts.scenarios && !opts.scenarios.includes(sc.id)) continue;
    const dir = path.join(benchDir, sc.dataset, sc.id);
    if (!fs.existsSync(dir)) continue;
    const { pairs, problems } = loadPlans(dir);
    const scOut = path.join(outDir, sc.dataset, sc.id);
    fs.rmSync(scOut, { recursive: true, force: true });
    const evals = pairs.map((p) => ({ ...p, ev: evaluatePlan(p.report, p.plan, sc, cons) }));
    const qualifying = evals.filter((e) => e.ev.qualifies)
      .sort((a, b) => (b.ev.utility ?? -Infinity) - (a.ev.utility ?? -Infinity) || a.ev.removed - b.ev.removed || a.ev.planHash.localeCompare(b.ev.planHash));
    const row = { dataset: sc.dataset, scenarioId: sc.id, plans: pairs.length, qualifying: qualifying.length, targets: 0, problems } as (typeof summary)[number];
    if (!qualifying.length) {
      const failure: BenchFailure = {
        version: 1, source: "benchmark", dataset: sc.dataset, scenarioId: sc.id, kind: pairs.length ? "no_qualifying_plan" : "no_plans",
        constraintsVersion: cons.version, detail: pairs.length ? `none of ${pairs.length} executed plans satisfies the predeclared constraints` : "no executed plans with reports",
        plans: evals.map((e) => ({ planHash: e.ev.planHash, reportId: e.ev.reportId, violated: e.ev.constraints.filter((c) => !c.satisfied) })),
      };
      writeJson(path.join(scOut, "_FAILURE.json"), failure);
      row.failure = failure.kind;
      summary.push(row);
      continue;
    }
    const best = qualifying[0]!;
    const planContext = best.plan.decisions.map((d) => ({ unitId: d.unitId, key: keyOfSel(d) }));
    const abstained: string[] = [];
    for (const d of best.plan.decisions) {
      const key = keyOfSel(d);
      if (!key) { abstained.push(d.unitId); continue; }
      const alt = new Set<string>();
      for (const q of qualifying.slice(1)) {
        const k = keyOfSel(q.plan.decisions.find((x) => x.unitId === d.unitId) ?? { selected: null } as Proposal["decisions"][number]);
        if (k && k !== key) alt.add(k);
      }
      const target: BenchTarget = {
        version: 1, source: "benchmark", taskId: taskIdOf(sc.id, d.unitId), dataset: sc.dataset, scenarioId: sc.id, unitId: d.unitId,
        chosen: { key }, acceptable: [...alt].sort().map((k) => ({ key: k })),
        rationale: `Best of ${qualifying.length} qualifying plans (of ${pairs.length}) by mean utility ${best.ev.utility === null ? "n/a" : best.ev.utility.toFixed(3)} under ${cons.version}.`,
        unresolved: [], selector: { constraintsVersion: cons.version, tool: "scripts/labels/select_targets.ts" },
        planHash: best.ev.planHash, planContext,
        benchmark: { reportId: best.ev.reportId, utility: best.ev.utility, tests: best.ev.tests, constraints: best.ev.constraints },
        qualifyingPlans: qualifying.length, totalPlans: pairs.length, weak: best.ev.weak, weakReasons: best.ev.weakReasons,
      };
      writeJson(path.join(scOut, `${safeId(d.unitId)}.json`), target);
      row.targets++;
    }
    if (abstained.length) {
      writeJson(path.join(scOut, "_FAILURE.json"), {
        version: 1, source: "benchmark", dataset: sc.dataset, scenarioId: sc.id, kind: "unit_abstained", constraintsVersion: cons.version,
        detail: `the selected plan ${best.ev.planHash} abstains on ${abstained.length} units: no target for them`, plans: [], units: abstained,
      } satisfies BenchFailure);
    }
    summary.push(row);
  }
  writeJson(path.join(outDir, "SUMMARY.json"), { constraintsVersion: cons.version, scenarios: summary });
  return summary;
}
