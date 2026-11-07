/**
 * BenchmarkReport: results of running a complete executed plan through the supplied adversarial/utility
 * benchmark (pets-eval) or Mask's own additional attacks. Produced offline/privately; never exported.
 * Every test carries a status. Missing, skipped or failed tests are never zero risk.
 */
import { z } from "zod";

export const TEST_STATUS = ["evaluated", "not_applicable", "unsupported", "failed"] as const;
export const TestStatusSchema = z.enum(TEST_STATUS);
export type TestStatus = z.infer<typeof TestStatusSchema>;

export const BENCHMARK_TEST_KINDS = ["attack", "residual_check", "text_leakage", "utility", "representation", "aggregate_score"] as const;

export const BenchmarkTestSchema = z.object({
  id: z.string(),
  kind: z.enum(BENCHMARK_TEST_KINDS),
  name: z.string(),
  /** which supplied spec or task this corresponds to (attack spec adversary id, utility task id, etc.) */
  source: z.string(),
  status: TestStatusSchema,
  /** why not_applicable / unsupported / failed */
  statusReason: z.string().optional(),
  scope: z.string(),
  metrics: z.record(z.number().nullable()),
  /** denominators, sample sizes, limits: what the numbers are over */
  denominators: z.record(z.number()),
  sampling: z.string().optional(),
  assumptions: z.array(z.string()),
  /** original-run value of the same test, when the benchmark compares original and protected */
  original: z.record(z.number().nullable()).optional(),
  /** threat ids (from ThreatCoverage) this test covers */
  covers: z.array(z.string()),
});
export type BenchmarkTest = z.infer<typeof BenchmarkTestSchema>;

export const BenchmarkReportSchema = z.object({
  version: z.literal(1),
  reportId: z.string(),
  adapterVersion: z.string(),
  toolkit: z.object({ name: z.string(), version: z.string(), commandLog: z.array(z.string()) }),
  dataset: z.string(),
  scenarioId: z.string(),
  split: z.string(),
  inputHash: z.string(),
  goalId: z.string(),
  planHash: z.string(),
  outputHash: z.string(),
  /** representation the toolkit used per table: row_level (rowmap present) / synthetic / withheld */
  representation: z.record(z.enum(["row_level", "synthetic", "withheld", "aggregate"])),
  tests: z.array(BenchmarkTestSchema),
  /** private staging paths (never shipped with an export) */
  privateArtifacts: z.array(z.object({ name: z.string(), path: z.string(), sha256: z.string() })),
  createdAt: z.string(),
  durationMs: z.number(),
  notes: z.array(z.string()),
});
export type BenchmarkReport = z.infer<typeof BenchmarkReportSchema>;

/**
 * ThreatCoverage: for each threat the goal's sharing setting implies, which test covers it and with what status.
 * Shown in the UI separately from recipe preference. Uncovered threats are explicit.
 */
export const ThreatCoverageSchema = z.object({
  threatId: z.string(),
  description: z.string(),
  /** attacker knowledge assumed */
  attackerKnowledge: z.string(),
  status: TestStatusSchema,
  /** metric ids (Evaluation) or benchmark test ids that evaluate it */
  evaluatedBy: z.array(z.string()),
  statusReason: z.string().optional(),
});
export type ThreatCoverage = z.infer<typeof ThreatCoverageSchema>;
