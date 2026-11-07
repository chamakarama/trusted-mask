/**
 * ExportReceipt: binds the confirmed plan, input and output hashes to the downloaded artifacts.
 * The sanitised report excludes raw values, token maps, keys and original redacted content.
 */
import { z } from "zod";
import { SelectorInfoSchema } from "./proposal";
import { MetricResultSchema } from "./evaluation";

export const ArtifactRefSchema = z.object({
  name: z.string(),
  kind: z.enum(["table", "report", "manifest"]),
  bytes: z.number().int(),
  sha256: z.string(),
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const ReportDecisionSchema = z.object({
  unit: z.string(),
  kind: z.string(),
  recipe: z.string(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])),
  reason: z.string(),
});

export const SanitisedReportSchema = z.object({
  tool: z.object({ name: z.literal("Mask"), version: z.string(), registryVersion: z.string() }),
  selector: SelectorInfoSchema,
  goal: z.object({
    task: z.string(),
    recipient: z.string(),
    trustLevel: z.string(),
    outputForm: z.string(),
    measures: z.array(z.string()),
  }),
  input: z.object({ inputHash: z.string(), tables: z.array(z.object({ name: z.string(), rows: z.number(), columns: z.number() })) }),
  decisions: z.array(ReportDecisionSchema),
  metrics: z.array(MetricResultSchema),
  hardFailures: z.array(z.string()),
  unsupported: z.array(z.string()),
  /** threat coverage with statuses; benchmark details themselves stay private */
  coverage: z.array(z.object({ threatId: z.string(), description: z.string(), status: z.string(), evaluatedBy: z.array(z.string()) })),
  limitations: z.array(z.string()),
  confirmedAt: z.string(),
});
export type SanitisedReport = z.infer<typeof SanitisedReportSchema>;

export const ExportReceiptSchema = z.object({
  version: z.literal(1),
  receiptId: z.string(),
  inputHash: z.string(),
  goalId: z.string(),
  planHash: z.string(),
  outputHash: z.string(),
  artifacts: z.array(ArtifactRefSchema),
  report: SanitisedReportSchema,
  confirmedAt: z.string(),
});
export type ExportReceipt = z.infer<typeof ExportReceiptSchema>;
