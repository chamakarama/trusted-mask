import { describe, expect, it } from "vitest";
import type { BenchmarkReport } from "@/contracts";
import { validateReport } from "./lib/validate";

const base: BenchmarkReport = {
  version: 1, reportId: "bench_x", adapterVersion: "mask-bench-1.0.0", toolkit: { name: "pets-eval", version: "1.0.0", commandLog: ["python3 -m pets_eval scorecard ..."] },
  dataset: "customer_service", scenarioId: "CS-S1", split: "test", inputHash: "i", goalId: "g", planHash: "p", outputHash: "o",
  representation: { customers: "row_level", turns: "withheld" },
  tests: [
    { id: "representation.customers", kind: "representation", name: "r", source: "s", status: "evaluated", scope: "customers", metrics: { row_map: 1 }, denominators: { rows_protected: 10 }, assumptions: [], covers: [] },
    { id: "text_leakage.turns.text.eval_split", kind: "text_leakage", name: "t", source: "s", status: "unsupported", statusReason: "organiser-held gold", scope: "turns.text", metrics: {}, denominators: {}, assumptions: [], covers: ["free_text_identifier_leakage"] },
    { id: "linkage.customers.leaked_customer_list", kind: "attack", name: "l", source: "s", status: "evaluated", scope: "customers", metrics: { reidentification_rate: 0.1, attribute_inference_success: null }, denominators: { n_targets_in_data: 2345 }, assumptions: [], covers: ["quasi_identifier_linkage"], original: { reidentification_rate: 0.84 } },
  ],
  privateArtifacts: [{ name: "staging/customer_service/rowmap_customers.csv", path: "bench/runs/x", sha256: "h" }],
  createdAt: "2026-11-07T00:00:00Z", durationMs: 1, notes: [],
};

describe("validateReport", () => {
  it("accepts a conforming report", () => { expect(validateReport(base)).toMatchObject({ ok: true, errors: [] }); });
  it("rejects an unknown status, a non-evaluated test without reason and a bad representation", () => {
    expect(validateReport({ ...base, tests: [{ ...base.tests[0]!, status: "skipped" }] }).ok).toBe(false);
    expect(validateReport({ ...base, tests: [...base.tests, { ...base.tests[1]!, id: "x", statusReason: undefined }] }).errors.join()).toMatch(/without statusReason/);
    expect(validateReport({ ...base, representation: { customers: "unknown" } }).ok).toBe(false);
    expect(validateReport({ ...base, tests: [...base.tests, base.tests[0]!] }).errors.join()).toMatch(/duplicate/);
  });
});
