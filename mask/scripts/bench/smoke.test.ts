/**
 * End-to-end smoke on a relational 3000-customer subset of customer_service: policy, leaky and destructive controls,
 * plus a deliberately omitted rowmap. Needs python3 with pandas/numpy/scipy/scikit-learn and the challenge package.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BenchmarkReport } from "@/contracts";
import { runCandidates } from "./lib/candidates";
import { buildPlan } from "./lib/engine";
import { pythonAvailable, runBench } from "./lib/python";
import { runPlan } from "./lib/runplan";
import { prepare } from "./lib/setup";
import { validateReport } from "./lib/validate";

const ok = pythonAvailable();

describe.skipIf(!ok)("benchmark smoke (customer_service, --limit-rows 3000)", () => {
  it("controls behave and representation failures are reported", async () => {
    const runs = fs.mkdtempSync(path.join(os.tmpdir(), "mask-bench-smoke-"));
    const res = await runCandidates({ dataset: "customer_service", scenarios: ["CS-S1"], detections: "mask", only: ["policy", "leaky", "destructive"], k: 0, seed: 0, limitRows: 3000, runsRoot: runs, log: () => {} });
    expect(res.resultsRoot.startsWith(runs)).toBe(true); // subset results never go to ml/bench/results by default
    const rep = (label: string): BenchmarkReport => {
      const o = res.outcomes.find((x) => x.label === label)!;
      expect(o.status).toBe("ok");
      const v = validateReport(JSON.parse(fs.readFileSync(o.resultPath!, "utf8")));
      expect(v.errors).toEqual([]);
      return v.report!;
    };
    const t = (r: BenchmarkReport, id: string) => { const x = r.tests.find((y) => y.id === id); expect(x, id).toBeTruthy(); return x!; };
    const policy = rep("policy"), leaky = rep("policy+leaky"), destructive = rep("policy+destructive");
    for (const r of [policy, leaky, destructive]) for (const tb of ["customers", "conversations", "turns"]) expect(t(r, `representation.${tb}`).status).toBe("evaluated");
    // positive control
    expect(t(leaky, "direct_identifiers_retained.customers").metrics.direct_identifiers_retained).toBeGreaterThan(0);
    expect(t(leaky, "linkage.customers.leaked_customer_list").status).toBe("evaluated");
    expect(t(leaky, "linkage.customers.leaked_customer_list").metrics.reidentification_rate).toBeGreaterThan(0);
    // destructive control: required utility tasks are not answerable (unsupported), never a silent 0
    for (const u of ["CS-U1", "CS-U3", "CS-U4", "CS-U5"]) expect(t(destructive, `utility.${u}`).status).toBe("unsupported");
    // eval-split text leakage is unsupported locally
    expect(t(policy, "text_leakage.turns.text.eval_split").status).toBe("unsupported");
    expect(t(policy, "text_leakage.turns.text").status).toBe("evaluated");
    // export holds tables only
    const pol = res.outcomes.find((x) => x.label === "policy")!;
    expect(fs.readdirSync(path.join(pol.runDir!, "export", "customer_service")).sort()).toEqual(["conversations.csv", "customers.csv", "turns.csv"]);

    // deliberately omitted rowmap -> representation failed, dependent risks unsupported
    const prep = prepare({ dataset: "customer_service", scenarioId: "CS-S1", detections: "mask", limitRows: 3000 });
    const built = await buildPlan(prep.ctx, prep.goal, { kind: "policy" });
    const runDir = path.join(runs, "omit");
    await runPlan(prep.ctx, { runDir, dataset: "customer_service", scenarioId: "CS-S1", split: prep.split, goal: prep.goal, spec: { kind: "policy" }, seed: 0, catalog: prep.catalog, omitRowmaps: ["turns"], limitRows: 3000, subsetLog: prep.subsetLog }, built);
    expect(runBench(runDir, "CS-S1", [], true).status).toBe(0);
    const omit = validateReport(JSON.parse(fs.readFileSync(path.join(runDir, "report.json"), "utf8"))).report!;
    expect(t(omit, "representation.turns").status).toBe("failed");
    expect(t(omit, "text_leakage.turns.text").status).toBe("unsupported");
    expect(t(omit, "k_anonymity.turns").status).toBe("unsupported");
    expect(t(omit, "aggregate_score").status).toBe("unsupported");
  }, 400_000);
});
