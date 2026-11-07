import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import JSZip from "jszip";
import type { DetectionSet, SpanDetection } from "@/contracts";
import { ExportReceiptSchema, SanitisedReportSchema } from "@/contracts";
import { createExecutor } from "@/core/execute";
import { createEvaluator } from "@/core/evaluate";
import { sha256Hex } from "@/core/util/hash";
import { fieldUnit, KEY, mkDetection, mkGoal, mkManifest, mkProposal, mkTable, spanOf, spanUnit, stubSpans, type PlanEntry } from "@/core/execute/testkit";
import { createExportService, CORE_LIMITATION } from "./index";

const NOTE = 'Customer Ksenia Sokolova, "VIP", called from +358401234567,\nwants refund';
const t = mkTable("calls", ["call_id", "name", "hetu", "ts", "note", "secret"], [
  ["C1", "Ksenia Sokolova", "020782-918P", "2025-01-29 09:23", NOTE, "pw1"],
  ["C2", "Esa Oravalehto", "311064-9219", "2025-01-29 10:41", null, "pw2"],
], "calls.csv");
const hidden = mkTable("hidden", ["x"], [["secretvalue"]], "hidden.csv");
const rowmap = mkTable("rowmap_calls", ["protected_row", "original_record_id"], [["0", "C1"]], "rowmap_calls.csv");
const manifest = mkManifest([t, hidden, rowmap]);
const spans: Record<string, SpanDetection[]> = { "calls.note:0": [spanOf(NOTE, "Ksenia Sokolova", "PERSON"), spanOf(NOTE, "+358401234567", "PHONE")] };
const entries: PlanEntry[] = [
  { unit: fieldUnit("calls", "call_id"), recipe: "tokenize_keyed", params: { scope: "dataset", format: "token" } },
  { unit: fieldUnit("calls", "name"), recipe: "suppress" },
  { unit: fieldUnit("calls", "hetu"), recipe: "derive_hetu", params: { ageBandYears: "10", referenceDate: "2025-12-31" } },
  { unit: fieldUnit("calls", "ts"), recipe: "generalize_datetime", params: { resolution: "day" } },
  { unit: fieldUnit("calls", "note"), recipe: "redact_text" },
  { unit: spanUnit("calls", "note", "PERSON"), recipe: "redact_surrogate", params: { consistency: "conversation" } },
  { unit: spanUnit("calls", "note", "PHONE"), recipe: "redact_typed" },
  { unit: fieldUnit("calls", "secret"), recipe: null },
  { unit: fieldUnit("hidden", "x"), recipe: "suppress" },
  { unit: fieldUnit("rowmap_calls", "protected_row"), recipe: "keep" },
  { unit: fieldUnit("rowmap_calls", "original_record_id"), recipe: "keep" },
];
const goal = mkGoal({ goalId: "g1" });
const proposal = mkProposal(entries, manifest.inputHash, goal.goalId);
const executed = createExecutor().execute({ tables: [t, hidden, rowmap], manifest, proposal, spans: stubSpans(spans), sessionKey: KEY });
const detections: DetectionSet = { version: 1, inputHash: manifest.inputHash, createdAt: "x", fields: [mkDetection("calls", "name", "direct_identifier", "PERSON_NAME"), mkDetection("calls", "hetu", "direct_identifier", "NATIONAL_ID"), mkDetection("calls", "note", "free_text", "FREE_TEXT")] };
const evaluation0 = createEvaluator().evaluate({ original: [t, hidden, rowmap], manifest, detections, spans: stubSpans(spans), goal, proposal, executed });
// a private benchmark report attached by the offline adapter must never reach the export
const evaluation = { ...evaluation0, benchmark: { version: 1 as const, reportId: "bench-private-1", adapterVersion: "0", toolkit: { name: "pets-eval", version: "0", commandLog: ["/private/path"] }, dataset: "d", scenarioId: "s", split: "dev", inputHash: "i", goalId: "g1", planHash: proposal.planHash, outputHash: executed.outputHash, representation: {}, tests: [], privateArtifacts: [{ name: "rowmap", path: "/private/rowmap.csv", sha256: "x" }], createdAt: "x", durationMs: 0, notes: [] } };
const RAW = ["bench-private-1", "/private/", "\"benchmark\"", "Ksenia", "Sokolova", "Oravalehto", "020782-918P", "311064-9219", "+358401234567", "pw1", "pw2", "secretvalue", "C1"];

describe("ExportService", async () => {
  const { receipt, files } = await createExportService().build({ manifest, goal, proposal, executed, evaluation });
  const byName = new Map(files.map((f) => [f.name, f]));
  const dec = new TextDecoder();

  it("writes exactly the executed data as RFC 4180 CSV with the input file name", () => {
    expect([...byName.keys()]).toEqual(["calls.csv", "mask_report.json", "mask_report.md", "mask_receipt.json", "mask_export.zip"]);
    const csv = dec.decode(byName.get("calls.csv")!.data);
    const parsed = Papa.parse<string[]>(csv, { header: false, skipEmptyLines: true }).data;
    const out = executed.tables[0]!;
    const live = out.columns.map((c, i) => ({ c, d: out.data[i]! })).filter((x) => x.c.status !== "suppressed");
    expect(parsed[0]).toEqual(live.map((x) => x.c.name));
    expect(parsed[0]).toEqual(["call_id", "hetu_age_band", "hetu_sex", "ts", "note"]);
    for (let r = 0; r < out.rowCount; r++) expect(parsed[r + 1]).toEqual(live.map((x) => x.d[r] ?? ""));
    expect(parsed[1]![4]).toContain("\n");
    expect(sha256Hex(byName.get("calls.csv")!.data)).toBe(out.sha256);
  });

  it("binds hashes in the receipt and never includes raw values in the report", () => {
    expect(ExportReceiptSchema.parse(receipt)).toBeTruthy();
    expect(receipt.outputHash).toBe(executed.outputHash);
    expect(receipt.planHash).toBe(proposal.planHash);
    for (const a of receipt.artifacts) expect(sha256Hex(byName.get(a.name)!.data)).toBe(a.sha256);
    expect(receipt.artifacts.map((a) => a.name)).toEqual(["calls.csv", "mask_report.json", "mask_report.md"]);
    const reportJson = dec.decode(byName.get("mask_report.json")!.data);
    const report = SanitisedReportSchema.parse(JSON.parse(reportJson));
    expect(report.limitations).toContain(CORE_LIMITATION);
    expect(report.coverage.map((c) => c.threatId)).toContain("membership_inference");
    expect(report.limitations.some((l) => l.includes("rowmap_calls"))).toBe(true);
    expect(report.limitations.some((l) => l.includes("hidden"))).toBe(true);
    const md = dec.decode(byName.get("mask_report.md")!.data);
    const receiptText = dec.decode(byName.get("mask_receipt.json")!.data);
    for (const text of [reportJson, md, receiptText]) for (const raw of RAW) expect(text).not.toContain(raw);
    expect(md).toContain("not evidence of anonymity");
    expect(md).toContain("## Measurements");
    expect(md).toContain("derive_hetu");
  });

  it("zips every artifact", async () => {
    const zip = await JSZip.loadAsync(byName.get("mask_export.zip")!.data);
    expect(Object.keys(zip.files).sort()).toEqual(["calls.csv", "mask_receipt.json", "mask_report.json", "mask_report.md"]);
    const inZip = await zip.file("calls.csv")!.async("uint8array");
    expect(sha256Hex(inZip)).toBe(executed.tables[0]!.sha256);
  });

  it("refuses an evaluation from another output", async () => {
    await expect(createExportService().build({ manifest, goal, proposal, executed, evaluation: { ...evaluation, outputHash: "x" } })).rejects.toThrow();
  });
});
