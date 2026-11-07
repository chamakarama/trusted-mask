/**
 * Round trip on the synthetic development fixture: hand-made detections + a tiny regex span detector,
 * policy proposal, execution, joint evaluation (with the fixture's gold spans) and export.
 * Fixture numbers are development measurements, not benchmark results.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import JSZip from "jszip";
import type { DetectionSet, FieldDetection, PrivacyRole, SpanDetection, SpanLabel, Subtype } from "@/contracts";
import type { TableData } from "@/core/session/types";
import { createExecutor, type SpanIndex } from "@/core/execute";
import { createEvaluator } from "@/core/evaluate";
import { buildDecisionUnits, PolicySelector } from "@/core/selector";
import { registry } from "@/core/registry";
import { mkDetection, mkGoal, mkManifest } from "@/core/execute/testkit";
import { createExportService } from "./index";

const DIR = fileURLToPath(new URL("../../../fixtures/customer_service_small/", import.meta.url));

function loadCsv(file: string): TableData {
  const rows = Papa.parse<string[]>(readFileSync(DIR + file, "utf-8"), { header: false, skipEmptyLines: "greedy" }).data;
  const header = rows[0]!;
  const body = rows.slice(1);
  const data = header.map((_, c) => body.map((r) => (r[c] === undefined || r[c] === "" ? null : r[c]!)));
  return { name: file.replace(/\.csv$/, ""), fileName: file, columns: header, data, rowCount: body.length, byteSize: 0, sha256: file, parseWarnings: [] };
}

// --- tiny regex span detector (test only) ---
const RULES: { re: RegExp; label: SpanLabel; group?: number }[] = [
  { re: /\b\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]\b/g, label: "NATIONAL_ID" },
  { re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, label: "EMAIL" },
  { re: /\+358\d{7,10}\b/g, label: "PHONE" },
  { re: /\b[A-Z]{2}\d{2}(?: ?\d{4}){3,4}(?: ?\d{1,2})?\b/g, label: "IBAN" },
  { re: /\((\d{8})\)/g, label: "ACCOUNT_NUMBER", group: 1 },
  { re: /\b(?:Customer|Asiakas|Kunden?|this is|tässä on|my name is|nimeni on|här är)\s+([A-ZÅÄÖa-zåäö][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö-]+)?)/g, label: "PERSON", group: 1 },
  { re: /\/([A-ZÅÄÖ]{3,5})\b/g, label: "PERSON", group: 1 },
];
function detect(text: string): SpanDetection[] {
  const out: SpanDetection[] = [];
  for (const { re, label, group } of RULES) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const g = group ? m[group]! : m[0];
      const start = m.index + (group ? m[0].indexOf(g) : 0);
      out.push({ start, end: start + g.length, label, score: 1, ruleId: `test:${label}` });
    }
  }
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  const res: SpanDetection[] = [];
  let end = -1;
  for (const s of out) if (s.start >= end) { res.push(s); end = s.end; }
  return res;
}

const conversations = loadCsv("conversations.csv"), customers = loadCsv("customers.csv"), turns = loadCsv("turns.csv");
const tables = [conversations, customers, turns];
const manifest = mkManifest(tables, [
  { from: { table: "turns", column: "conversation_id" }, to: { table: "conversations", column: "conversation_id" }, matchRate: 1 },
  { from: { table: "conversations", column: "customer_id" }, to: { table: "customers", column: "customer_id" }, matchRate: 1 },
], { "conversations.started_ts": "datetime", "turns.ts": "datetime", "customers.customer_since": "date", "conversations.handle_time_s": "integer", "conversations.csat": "integer" });

const spanCache = new Map<string, SpanDetection[]>();
const spans: SpanIndex = {
  get(table, column, row) {
    const k = `${table}.${column}:${row}`;
    let s = spanCache.get(k);
    if (!s) {
      const t = tables.find((x) => x.name === table)!;
      const v = t.data[t.columns.indexOf(column)]![row];
      s = v ? detect(v) : [];
      spanCache.set(k, s);
    }
    return s;
  },
};

function spanSummary(t: TableData, column: string): FieldDetection["spanSummary"] {
  const byLabel: Record<string, number> = {};
  let withSpans = 0;
  for (let r = 0; r < t.rowCount; r++) {
    const s = spans.get(t.name, column, r);
    if (s.length) withSpans++;
    for (const x of s) byLabel[x.label] = (byLabel[x.label] ?? 0) + 1;
  }
  return { rowsScanned: t.rowCount, rowsWithSpans: withSpans, byLabel, detectorId: "test-regex", detectorVersion: "0" };
}

const D: [string, string, PrivacyRole, Subtype, Partial<FieldDetection>?][] = [
  ["conversations", "conversation_id", "record_key", "RECORD_ID"], ["conversations", "customer_id", "technical_identifier", "CUSTOMER_ID"],
  ["conversations", "agent_id", "technical_identifier", "EMPLOYEE_ID"], ["conversations", "agent_name", "direct_identifier", "PERSON_NAME"],
  ["conversations", "channel", "non_sensitive", "CATEGORY"], ["conversations", "language", "quasi_identifier", "LANGUAGE"],
  ["conversations", "started_ts", "quasi_identifier", "TIMESTAMP"], ["conversations", "intent", "non_sensitive", "CATEGORY"],
  ["conversations", "sentiment", "non_sensitive", "CATEGORY"], ["conversations", "csat", "non_sensitive", "MEASUREMENT"],
  ["conversations", "resolved", "non_sensitive", "CATEGORY"], ["conversations", "handle_time_s", "non_sensitive", "DURATION"],
  ["conversations", "n_turns", "non_sensitive", "MEASUREMENT"], ["conversations", "split", "non_sensitive", "CATEGORY"],
  ["conversations", "agent_note", "free_text", "FREE_TEXT", { spanSummary: spanSummary(conversations, "agent_note") }],
  ["customers", "customer_id", "record_key", "CUSTOMER_ID"], ["customers", "customer_number", "direct_identifier", "CUSTOMER_ID"],
  ["customers", "full_name", "direct_identifier", "PERSON_NAME"],
  ["customers", "hetu", "direct_identifier", "NATIONAL_ID", { evidence: [{ ruleId: "hetu_checksum", description: "valid HETU", matchRate: 1 }] }],
  ["customers", "street_address", "direct_identifier", "STREET_ADDRESS"], ["customers", "postcode", "quasi_identifier", "POSTCODE"],
  ["customers", "city", "quasi_identifier", "MUNICIPALITY"], ["customers", "email", "direct_identifier", "EMAIL"],
  ["customers", "phone", "direct_identifier", "PHONE"], ["customers", "preferred_language", "quasi_identifier", "LANGUAGE"],
  ["customers", "customer_since", "quasi_identifier", "DATE"], ["customers", "products", "non_sensitive", "CATEGORY"],
  ["customers", "contract_number", "direct_identifier", "ACCOUNT_ID"], ["customers", "payment_method", "non_sensitive", "CATEGORY"],
  ["customers", "iban", "direct_identifier", "IBAN"], ["customers", "marketing_consent", "non_sensitive", "CATEGORY"],
  ["customers", "payment_default_flag", "sensitive_attribute", "FINANCIAL_DATA"],
  ["customers", "accessibility_needs", "sensitive_attribute", "HEALTH_DATA", { art9: true }],
  ["turns", "turn_id", "record_key", "RECORD_ID"], ["turns", "conversation_id", "record_key", "RECORD_ID"],
  ["turns", "seq", "non_sensitive", "MEASUREMENT"], ["turns", "speaker", "non_sensitive", "CATEGORY"],
  ["turns", "ts", "quasi_identifier", "TIMESTAMP"], ["turns", "text", "free_text", "FREE_TEXT", { spanSummary: spanSummary(turns, "text") }],
];
const detections: DetectionSet = { version: 1, inputHash: manifest.inputHash, createdAt: "x", fields: D.map(([t, c, r, s, x]) => mkDetection(t, c, r, s, x)) };

function gold(file: string): Record<string, SpanDetection[]> {
  const out: Record<string, SpanDetection[]> = {};
  for (const line of readFileSync(DIR + "gold/" + file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { record_id: string; spans: { start: number; end: number; label: SpanLabel }[] };
    out[r.record_id] = r.spans.map((s) => ({ start: s.start, end: s.end, label: s.label, score: 1, ruleId: "gold" }));
  }
  return out;
}

describe("round trip on fixtures/customer_service_small", async () => {
  const goal = mkGoal({
    task: { kind: "topic_mining", description: "contact reasons and handle time for an analytics vendor" },
    measures: ["handle time by intent", "contacts by age band and sex"], groupings: ["intent", "channel", "language"],
    requiredFields: ["intent", "conversations.handle_time_s"], linkage: "across_tables", textNeed: "topic_only",
  });
  const units = buildDecisionUnits(manifest, detections.fields);
  const proposal = await new PolicySelector().propose({ manifest, goal, detections: detections.fields, units, registry, overrides: [] });
  const sessionKey = new Uint8Array(32).fill(7);
  const executed = createExecutor().execute({ tables, manifest, proposal, spans, sessionKey });
  const evaluation = createEvaluator().evaluate({
    original: tables, manifest, detections, spans, goal, proposal, executed,
    devLabels: [
      { table: "turns", column: "text", idColumn: "turn_id", spans: gold("turns__text.jsonl") },
      { table: "conversations", column: "agent_note", idColumn: "conversation_id", spans: gold("conversations__agent_note.jsonl") },
    ],
  });
  const { receipt, files } = await createExportService().build({ manifest, goal, proposal, executed, evaluation });
  const metric = (id: string, scope: string) => evaluation.metrics.find((m) => m.id === id && m.scope === scope)!;
  const outCsv = files.filter((f) => f.name.endsWith(".csv")).map((f) => new TextDecoder().decode(f.data)).join("\n");

  it("builds a plan with the expected decisions", () => {
    const sel = (id: string) => proposal.decisions.find((d) => d.unitId === id)?.selected?.recipeId;
    expect(units.some((u) => u.kind === "field_group" && u.refs.length === 2)).toBe(true);
    expect(sel("f:customers.hetu")).toBe("derive_hetu");
    expect(sel("f:customers.full_name")).toBe("suppress");
    expect(sel("f:turns.text")).toBe("redact_text");
    expect(sel("s:conversations.agent_note:NATIONAL_ID")).toBe("redact_typed");
  });

  it("executes deterministically and keeps joins", () => {
    const again = createExecutor().execute({ tables, manifest, proposal, spans, sessionKey });
    expect(again.outputHash).toBe(executed.outputHash);
    expect(metric("join_integrity", "turns.conversation_id").value).toBe(1);
    expect(metric("join_integrity", "conversations.customer_id").value).toBe(1);
    const cust = executed.tables.find((t) => t.name === "customers")!;
    expect(cust.columns.filter((c) => c.status === "derived").map((c) => c.name)).toEqual(["hetu_age_band", "hetu_sex"]);
  });

  it("leaves no direct identifier or detected identity code in the output", () => {
    for (const m of evaluation.metrics.filter((x) => x.id === "direct_identifier_retained")) expect([m.scope, m.value]).toEqual([m.scope, 0]);
    for (const h of customers.data[customers.columns.indexOf("hetu")]!) if (h) expect(outCsv).not.toContain(h);
    for (const n of customers.data[customers.columns.indexOf("email")]!) if (n) expect(outCsv).not.toContain(n);
    expect(metric("text_leakage_hard_labels", "conversations.agent_note").value).toBe(0);
    expect(metric("text_leakage", "turns.text").status).toBe("evaluated");
    const ind = metric("text_leakage_independent", "turns.text");
    expect(ind.basis).toBe("independent_labels");
    expect(ind.value).toBeGreaterThanOrEqual(0);
    const cov = new Map(evaluation.coverage.map((c) => [c.threatId, c]));
    expect(cov.get("membership_inference")!.status).toBe("unsupported");
    expect(cov.get("undetected_spoken_identifiers")!.status).toBe("evaluated"); // gold labels supplied
    expect(cov.get("free_text_identifier_leakage")!.statusReason).toContain("independent");
    expect(cov.get("cross_table_key_linkage")!.evaluatedBy).toContain("join_integrity:turns.conversation_id");
    expect(evaluation.hardFailures.filter((h) => /direct_identifier|join_integrity|hard_labels|utility_field/.test(h))).toEqual([]);
  });

  it("exports a consistent receipt and zip", async () => {
    expect(receipt.outputHash).toBe(executed.outputHash);
    expect(files.map((f) => f.name)).toEqual(["conversations.csv", "customers.csv", "turns.csv", "mask_report.json", "mask_report.md", "mask_receipt.json", "mask_export.zip"]);
    const zip = await JSZip.loadAsync(files.at(-1)!.data);
    expect(Object.keys(zip.files)).toHaveLength(6);
    const report = new TextDecoder().decode(files.find((f) => f.name === "mask_report.json")!.data);
    for (const n of customers.data[customers.columns.indexOf("full_name")]!.slice(0, 20)) if (n) expect(report).not.toContain(n);
    if (process.env.MASK_VERBOSE) {
      console.log(executed.durationMs, "ms;", evaluation.hardFailures, evaluation.unsupported);
      for (const m of evaluation.metrics) console.log(m.id, m.scope, m.value, m.passed, m.detail);
      const conv = executed.tables.find((t) => t.name === "conversations")!;
      const ni = conv.columns.findIndex((c) => c.name === "agent_note");
      console.log(conv.data[ni]!.slice(0, 6).join("\n"));
      const tt = executed.tables.find((t) => t.name === "turns")!;
      const ti = tt.columns.findIndex((c) => c.name === "text");
      console.log([...tt.textChanges.keys()].slice(0, 8).map((k) => tt.data[ti]![Number(k.split(":")[1])]).join("\n"));
    }
  });
});
