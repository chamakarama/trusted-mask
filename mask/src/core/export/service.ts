/**
 * ExportService: serialises exactly the executed tables (no regeneration), a sanitised report (JSON + Markdown),
 * a receipt binding plan, input and output hashes to every artifact, and a zip of all of them.
 */
import JSZip from "jszip";
import type { ArtifactRef, Decision, DecisionUnit, ExportReceipt, MetricResult, SanitisedReport } from "@/contracts";
import { MASK_VERSION } from "@/contracts";
import { getRecipe, REGISTRY_VERSION } from "@/core/registry";
import { unitLabel } from "@/core/selector/assemble";
import { hashOf, newId, nowIso, sha256Hex } from "@/core/util/hash";
import { executedTableCsv, isWithheld } from "@/core/execute";
import type { ExportFile, ExportInput, ExportService } from "./types";

const enc = new TextEncoder();

/** Benchmark staging material that must never ship, even if it was imported as a table. */
export const PRIVATE_FILE = /(^|[\/_-])(rowmap|truth|ground_?truth|attacker|holdout|gold)([\/_.-]|$)/i;

export const CORE_LIMITATION = "Pseudonymised data remains personal data; confirmation is approval of the artifact, not evidence of anonymity.";

export function createService(): ExportService {
  return { build };
}

async function build(input: ExportInput): Promise<{ receipt: ExportReceipt; files: ExportFile[] }> {
  const { manifest, goal, proposal, executed, evaluation } = input;
  if (executed.planHash !== proposal.planHash) throw new Error("executed output does not belong to this plan");
  if (evaluation.planHash !== proposal.planHash || evaluation.outputHash !== executed.outputHash) throw new Error("evaluation does not belong to this executed output");
  const confirmedAt = nowIso();
  const files: ExportFile[] = [];
  const artifacts: ArtifactRef[] = [];
  const add = (name: string, data: Uint8Array, mime: string, kind: ArtifactRef["kind"] | null) => {
    files.push({ name, data, mime });
    if (kind) artifacts.push({ name, kind, bytes: data.byteLength, sha256: sha256Hex(data) });
  };

  // tables: exactly the executed data
  const withheld: string[] = [];
  const excluded: string[] = [];
  const tableHashes: { name: string; sha256: string }[] = [];
  for (const t of executed.tables) {
    tableHashes.push({ name: t.name, sha256: t.sha256 });
    if (isWithheld(t)) { withheld.push(t.name); continue; }
    const fileName = manifest.tables.find((m) => m.name === t.name)?.fileName ?? `${t.name}.csv`;
    if (PRIVATE_FILE.test(fileName) || PRIVATE_FILE.test(t.name)) { excluded.push(t.name); continue; }
    const bytes = enc.encode(executedTableCsv(t));
    const h = sha256Hex(bytes);
    if (h !== t.sha256) throw new Error(`table ${t.name} does not serialise to the executed hash`);
    add(fileName, bytes, "text/csv;charset=utf-8", "table");
  }
  if (hashOf(tableHashes) !== executed.outputHash) throw new Error("output hash mismatch");

  const report = buildReport(input, confirmedAt, withheld, excluded);
  add("mask_report.json", enc.encode(JSON.stringify(report, null, 2)), "application/json", "report");
  add("mask_report.md", enc.encode(renderMarkdown(input, report, withheld)), "text/markdown;charset=utf-8", "report");

  const receipt: ExportReceipt = {
    version: 1, receiptId: newId("rcpt"), inputHash: manifest.inputHash, goalId: goal.goalId, planHash: proposal.planHash,
    outputHash: executed.outputHash, artifacts, report, confirmedAt,
  };
  add("mask_receipt.json", enc.encode(JSON.stringify(receipt, null, 2)), "application/json", null);

  const zip = new JSZip();
  const date = new Date(confirmedAt);
  for (const f of files) zip.file(f.name, f.data, { date, binary: true });
  const zipped = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  add("mask_export.zip", zipped, "application/zip", null);
  return { receipt, files };
}

function decisionRecipe(d: Decision): string { return d.selected?.recipeId ?? "none"; }

export function buildReport(input: ExportInput, confirmedAt: string, withheld: string[] = [], excluded: string[] = []): SanitisedReport {
  const { manifest, goal, proposal, executed, evaluation } = input;
  const units = new Map(proposal.units.map((u) => [u.id, u]));
  const decisions = proposal.decisions.map((d) => {
    const u = units.get(d.unitId);
    return {
      unit: u ? unitLabel(u) : d.unitId,
      kind: u?.kind ?? "unknown",
      recipe: decisionRecipe(d),
      params: { ...(d.selected?.params ?? {}) },
      reason: d.selected ? d.reason : `${d.abstainReason ?? "No recipe selected"}; the column is removed.`,
    };
  });
  const used = [...new Set(proposal.decisions.map((d) => d.selected?.recipeId).filter((r): r is NonNullable<typeof r> => !!r))];
  const limitations = [
    CORE_LIMITATION,
    ...used.map((r) => `${getRecipe(r).name}: ${getRecipe(r).limitations}`),
    "Risk metrics are measured against Mask's own detections unless marked as independent labels; identifiers Mask did not detect are not counted.",
    "Keyed tokens are reproducible only within this session; the key is never exported.",
    ...(withheld.length ? [`Withheld tables (every column removed): ${withheld.join(", ")}.`] : []),
    ...(excluded.length ? [`Not exported (benchmark staging material such as row maps, truth or attacker files): ${excluded.join(", ")}.`] : []),
    ...(evaluation.benchmark ? ["Private benchmark results exist for this plan; they are not included in this export."] : []),
    ...executed.notes.map((n) => `Execution note: ${n}`),
  ];
  return {
    tool: { name: "Mask", version: MASK_VERSION, registryVersion: REGISTRY_VERSION },
    selector: proposal.selector,
    goal: { task: goal.task.description || goal.task.kind, recipient: goal.recipient.description, trustLevel: goal.recipient.trustLevel, outputForm: goal.outputForm, measures: [...goal.measures] },
    input: { inputHash: manifest.inputHash, tables: manifest.tables.map((t) => ({ name: t.name, rows: t.rowCount, columns: t.columns.length })) },
    decisions,
    metrics: evaluation.metrics,
    hardFailures: evaluation.hardFailures,
    unsupported: evaluation.unsupported,
    coverage: evaluation.coverage.map((c) => ({ threatId: c.threatId, description: c.description, status: c.status, evaluatedBy: [...c.evaluatedBy] })),
    limitations,
    confirmedAt,
  };
}

const md = (s: string): string => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const fmt = (m: MetricResult): string => (m.value === null ? "–" : m.unit === "ratio" ? m.value.toFixed(4) : String(m.value));
const thr = (m: MetricResult): string => (m.threshold ? `${m.threshold.op} ${m.threshold.value}${m.threshold.hard ? " (hard)" : ""}` : "–");
const pass = (m: MetricResult): string => (m.passed === null ? "–" : m.passed ? "pass" : "FAIL");

function renderMarkdown(input: ExportInput, report: SanitisedReport, withheld: string[]): string {
  const { proposal, executed } = input;
  const units = new Map<string, DecisionUnit>(proposal.units.map((u) => [u.id, u]));
  const L: string[] = [];
  L.push("# Mask protection report", "");
  L.push(`Confirmed ${report.confirmedAt} · Mask ${report.tool.version} · registry ${report.tool.registryVersion} · selector ${report.selector.id} ${report.selector.version}`, "");
  L.push("## Goal", "");
  L.push(`- Task: ${report.goal.task}`);
  L.push(`- Recipient: ${report.goal.recipient || "(not described)"} (trust level: ${report.goal.trustLevel})`);
  L.push(`- Output form: ${report.goal.outputForm}`);
  if (report.goal.measures.length) L.push(`- Measures: ${report.goal.measures.join("; ")}`);
  L.push("", "## Data", "");
  L.push(`Input hash \`${report.input.inputHash}\` · plan hash \`${proposal.planHash}\` · output hash \`${executed.outputHash}\``, "");
  L.push("| Table | Rows | Columns in | Columns out | Released |", "|---|---:|---:|---:|---|");
  for (const t of report.input.tables) {
    const out = executed.tables.find((x) => x.name === t.name);
    const live = out ? out.columns.filter((c) => c.status !== "suppressed").length : 0;
    L.push(`| ${md(t.name)} | ${t.rows} | ${t.columns} | ${live} | ${withheld.includes(t.name) ? "withheld" : "yes"} |`);
  }
  L.push("", "## Decisions", "");
  proposal.decisions.forEach((d, i) => {
    const r = report.decisions[i]!;
    const u = units.get(d.unitId);
    const params = Object.entries(r.params).map(([k, v]) => `${k}=${String(v)}`).join(", ");
    L.push(`### ${md(r.unit)}`, "");
    L.push(`- Unit: ${u?.kind ?? r.kind} · Recipe: **${r.recipe}**${params ? ` (${params})` : ""} · Source: ${d.source}${d.needsReview ? " · needs review" : ""}`);
    L.push(`- Reason: ${md(r.reason)}`);
    if (d.reviewReasons.length) L.push(`- Review notes: ${md(d.reviewReasons.join("; "))}`);
    L.push("");
  });
  L.push("## Measurements", "", "Each number is measured separately; there is no combined score.", "");
  L.push("| Metric | Scope | Kind | Value | Threshold | Result | Basis | Status |", "|---|---|---|---:|---|---|---|---|");
  for (const m of report.metrics) L.push(`| ${md(m.name)} (\`${m.id}\`) | ${md(m.scope)} | ${m.kind} | ${fmt(m)} | ${thr(m)} | ${pass(m)} | ${m.basis} | ${m.status} |`);
  L.push("", "### Metric details", "");
  for (const m of report.metrics) L.push(`- \`${m.id}\` ${md(m.scope)}: ${md(m.detail)} _${md(m.definition)}_`);
  L.push("", "## Hard failures", "");
  L.push(...(report.hardFailures.length ? report.hardFailures.map((h) => `- ${h}`) : ["None."]));
  L.push("", "## Threat coverage", "", "Unsupported or uncovered threats are not zero risk.", "");
  L.push("| Threat | Status | Evaluated by |", "|---|---|---|");
  for (const c of report.coverage) L.push(`| ${md(c.description)} | ${c.status} | ${md(c.evaluatedBy.join(", ") || "–")} |`);
  L.push("", "## Checks Mask cannot perform", "");
  L.push(...(report.unsupported.length ? report.unsupported.map((u) => `- ${md(u)}`) : ["None requested."]));
  L.push("", "## Limitations", "");
  L.push(...report.limitations.map((l) => `- ${md(l)}`));
  L.push("");
  return L.join("\n");
}
