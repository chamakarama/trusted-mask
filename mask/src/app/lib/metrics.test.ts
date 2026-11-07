import { describe, expect, it } from "vitest";
import type { MetricResult } from "@/contracts";
import { groupMetrics, metricContext } from "./metrics";

const m = (p: Partial<MetricResult>): MetricResult => ({
  id: "x", name: "X", kind: "risk", definition: "", scope: "t.c", status: "evaluated", value: 0, unit: "ratio",
  direction: "lower_better", passed: true, detail: "", basis: "structural", ...p,
});

describe("groupMetrics", () => {
  it("shows each metric id once with the worst scope and a scope count", () => {
    const g = groupMetrics([
      ...Array.from({ length: 9 }, (_, i) => m({ id: "direct_identifier_retained", scope: `t.c${i}`, value: 0 })),
      m({ id: "k_anonymity", scope: "a", value: 0.2, threshold: { op: "<=", value: 0.05, hard: false }, passed: false }),
      m({ id: "k_anonymity", scope: "b", value: 1, threshold: { op: "<=", value: 0.05, hard: false }, passed: false }),
      m({ id: "k_anonymity", scope: "c", value: 0.01, threshold: { op: "<=", value: 0.05, hard: false }, passed: true }),
    ]);
    expect(g.map((x) => x.id)).toEqual(["k_anonymity", "direct_identifier_retained"]);
    expect(g[0]!.worst.scope).toBe("b");
    expect(g[0]!.scopeNoun).toBe("3 tables");
    expect(g[1]!.scopeNoun).toBe("9 columns");
  });

  it("puts hard failures first and never lets unsupported read as a good value", () => {
    const g = groupMetrics([
      m({ id: "ok", kind: "utility", direction: "higher_better", value: 1, passed: true }),
      m({ id: "leak", value: null, status: "unsupported", passed: null }),
      m({ id: "leak", value: 0, passed: true }),
      m({ id: "hard", kind: "integrity", value: 0.5, passed: false, threshold: { op: ">=", value: 1, hard: true }, direction: "higher_better" }),
    ]);
    expect(g[0]!.id).toBe("hard");
    expect(g.find((x) => x.id === "leak")!.worst.status).toBe("unsupported");
  });

  it("adds the row count to small-sample k-anonymity results", () => {
    const manifest = { tables: [{ name: "customers", rowCount: 120 }] } as never;
    const text = metricContext(m({ id: "k_anonymity", scope: "customers", value: 1, breakdown: { classes: 120 } }), manifest);
    expect(text).toContain("Over 120 rows");
    expect(text).toContain("small samples make most combinations unique");
  });
});
