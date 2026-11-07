/** Candidate-plan generation and the plan -> execute -> benchmark loop (CLI: scripts/bench/candidates.ts). */
import fs from "node:fs";
import path from "node:path";
import type { DecisionUnit, Proposal } from "@/contracts";
import { BenchmarkReportSchema } from "@/contracts";
import { MASK_DIR, ML_DIR, readJson, safeId, writeJson } from "../../labels/common";
import { PKG } from "./data";
import { alternativesFor, buildPlan, selectionContext, type BuiltPlan, type EngineContext, type PlanSpec, type Variant } from "./engine";
import { detectionFor, primaryDetection, type SelectionContext } from "@/core/selector";
import { runBench } from "./python";
import { runPlan } from "./runplan";
import { prepare, goalFor } from "./setup";

const IDENTIFYING = new Set(["PERSON", "NATIONAL_ID", "EMAIL", "PHONE", "ADDRESS", "IBAN", "PAYMENT_CARD", "ACCOUNT_NUMBER", "IP_ADDRESS", "LICENSE_PLATE", "USERNAME", "SECRET", "DEVICE_ID", "PROPERTY_ID", "URL"]);
const ROLE_RANK: Record<string, number> = { direct_identifier: 1, quasi_identifier: 2, sensitive_attribute: 3, technical_identifier: 5, record_key: 5, free_text: 6 };

/** Risk relevance rank (lower = more relevant): attack-spec columns, direct ids, QIs, sensitive, identifying spans, keys, text. */
export function riskRank(unit: DecisionUnit, sctx: SelectionContext, attackCols: Set<string>): number {
  if (unit.refs.some((r) => attackCols.has(`${r.table}.${r.column}`)) && unit.kind !== "span_class") return 0;
  if (unit.kind === "span_class") return IDENTIFYING.has(unit.spanLabel ?? "") ? 4 : 7;
  const det = primaryDetection(detectionFor(sctx, unit));
  return ROLE_RANK[det?.role ?? ""] ?? 7;
}

function attackColumns(dataset: string): Set<string> {
  const specs = readJson<{ attacks: { dataset: string; table: string; qis: { protected: string[] }[]; sensitive?: string }[] }>(path.join(PKG, "metadata", "attack_specs.json")).attacks;
  const out = new Set<string>();
  for (const s of specs.filter((x) => x.dataset === dataset)) {
    for (const q of s.qis) for (const c of q.protected) out.add(`${s.table}.${c}`);
    if (s.sensitive) out.add(`${s.table}.${s.sensitive}`);
  }
  return out;
}

interface Candidate { label: string; spec: PlanSpec; variant?: Variant }

export function substitutionCandidates(ctx: EngineContext, sctx: SelectionContext, policy: Proposal, k: number, attackCols: Set<string>): Candidate[] {
  const alts = alternativesFor(sctx, policy);
  const ranked = sctx.units
    .filter((u) => (alts.get(u.id)?.length ?? 0) > 0)
    .map((u) => ({ u, rank: riskRank(u, sctx, attackCols) }))
    .sort((a, b) => a.rank - b.rank || a.u.id.localeCompare(b.u.id))
    .slice(0, k);
  const out: Candidate[] = [];
  for (const { u } of ranked) for (const alt of alts.get(u.id)!) {
    out.push({ label: `subst:${u.id}=${alt.key}`, spec: { kind: "overrides", overrides: [alt.override], source: `subst:${u.id}=${alt.key}` } });
  }
  void ctx;
  return out;
}

export interface CandidatesOptions {
  dataset: string; scenarios: string[]; detections: "mask" | "catalog"; only: string[]; k: number; seed: number;
  limitRows?: number; runsRoot?: string; resultsRoot?: string; model?: string; maxAdversary?: number; force?: boolean; split?: string;
  log?: (s: string) => void;
}

export interface CandidateOutcome { scenarioId: string; label: string; planHash: string; runDir?: string; reportPath?: string; resultPath?: string; status: "ok" | "exists" | "bench_failed"; error?: string; controls?: string[] }

export async function runCandidates(o: CandidatesOptions): Promise<{ resultsRoot: string; runsRoot: string; outcomes: CandidateOutcome[] }> {
  const { dataset, scenarios, detections, k, seed, limitRows, model } = o;
  const only = new Set(o.only);
  const runsRoot = path.resolve(o.runsRoot ?? path.join(MASK_DIR, "bench", "runs"));
  const resultsRoot = path.resolve(o.resultsRoot ?? (limitRows ? path.join(runsRoot, "results-subset") : path.join(ML_DIR, "bench", "results")));
  const maxAdv = String(o.maxAdversary ?? 3000);
  const log = o.log ?? ((s: string) => console.log(`[candidates] ${s}`));
  const prep = prepare({ dataset, scenarioId: scenarios[0]!, detections, limitRows, split: o.split, log });
  const attackCols = attackColumns(dataset);
  const index: CandidateOutcome[] = [];
  for (const scenarioId of scenarios) {
    const goal = goalFor(scenarioId, dataset);
    const policy = await buildPlan(prep.ctx, goal, { kind: "policy" });
    const cands: Candidate[] = [];
    if (only.has("policy")) cands.push({ label: "policy", spec: { kind: "policy" } });
    if (only.has("leaky")) cands.push({ label: "policy+leaky", spec: { kind: "policy" }, variant: "leaky" });
    if (only.has("destructive")) cands.push({ label: "policy+destructive", spec: { kind: "policy" }, variant: "destructive" });
    if (only.has("subst")) cands.push(...substitutionCandidates(prep.ctx, selectionContext(prep.ctx, goal), policy.proposal, k, attackCols));
    if (only.has("learned") && model) cands.push({ label: "learned", spec: { kind: "learned", modelPath: path.resolve(model) } });
    log(`${scenarioId}: ${cands.length} candidate plans`);
    const seen = new Set<string>();
    const resDir = path.join(resultsRoot, dataset, scenarioId);
    for (const c of cands) {
      const built: BuiltPlan = c.label === "policy" ? policy : await buildPlan(prep.ctx, goal, c.spec, c.variant);
      const h = built.proposal.planHash;
      if (seen.has(h)) { log(`  ${c.label}: duplicate of an earlier plan (${h.slice(0, 12)}), skipped`); continue; }
      seen.add(h);
      const reportFile = path.join(resDir, `${h}.json`);
      if (fs.existsSync(reportFile) && !o.force) { log(`  ${c.label}: result exists (${h.slice(0, 12)}), skipped (use --force)`); index.push({ scenarioId, label: c.label, planHash: h, status: "exists", resultPath: reportFile }); continue; }
      const runDir = path.join(runsRoot, dataset, scenarioId, `${safeId(c.label).slice(0, 80)}-${h.slice(0, 12)}`);
      const t0 = Date.now();
      await runPlan(prep.ctx, { runDir, dataset, scenarioId, split: prep.split, goal, spec: c.spec, variant: c.variant, seed, catalog: prep.catalog, limitRows, subsetLog: prep.subsetLog }, { ...built, label: c.label });
      const r = runBench(runDir, scenarioId, ["--max-adversary", maxAdv], true);
      if (r.status !== 0) {
        log(`  ${c.label}: benchmark FAILED (exit ${r.status}): ${r.stderr.slice(-500)}`);
        index.push({ scenarioId, label: c.label, planHash: h, runDir, status: "bench_failed", error: r.stderr.slice(-2000) });
        continue;
      }
      const report = BenchmarkReportSchema.parse(readJson(r.reportPath));
      writeJson(reportFile, report);
      writeJson(path.join(resDir, `${h}.plan.json`), readJson(path.join(runDir, "plan.json")));
      const st = (id: string) => report.tests.find((t) => t.id === id);
      const counts = Object.fromEntries(["evaluated", "not_applicable", "unsupported", "failed"].map((s) => [s, report.tests.filter((t) => t.status === s).length]));
      log(`  ${c.label}: ${h.slice(0, 12)} ${JSON.stringify(counts)} composite=${st("aggregate_score")?.metrics.composite ?? "n/a"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      index.push({ scenarioId, label: c.label, planHash: h, runDir, reportPath: r.reportPath, resultPath: reportFile, status: "ok", controls: built.controls });
    }
  }
  writeJson(path.join(runsRoot, dataset, `_index_${new Date().toISOString().replace(/[:.]/g, "-")}.json`), { dataset, scenarios, detections, limitRows: limitRows ?? null, seed, resultsRoot, plans: index });
  log(`results in ${resultsRoot}`);
  return { resultsRoot, runsRoot, outcomes: index };
}
