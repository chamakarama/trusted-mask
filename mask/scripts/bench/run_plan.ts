/**
 * Execute one complete Mask plan on a supplied challenge dataset and write the private benchmark run folder.
 *
 *   npx vite-node scripts/bench/run_plan.ts --dataset customer_service --scenario CS-S1 --out <run dir>
 *     [--split train|val|test] [--detections catalog|mask] [--plan policy|learned:<model.json>|overrides:<file.json>]
 *     [--variant leaky|destructive] [--limit-rows N] [--seed N] [--omit-rowmap table[,table]] [--shuffle] [--bench]
 *
 * --bench additionally runs bench/run_bench.py on the run folder (python3 with pandas/numpy/scipy/scikit-learn).
 * Benchmark runs are reproducible for a seed (the keyed-token/surrogate key derives from it); the app uses a random key.
 */
import path from "node:path";
import { parseArgs } from "../labels/common";
import { runBench } from "./lib/python";
import { runPlan } from "./lib/runplan";
import { parsePlanArg, prepare } from "./lib/setup";

const a = parseArgs();
const str = (k: string): string | undefined => (typeof a[k] === "string" ? (a[k] as string) : undefined);
const dataset = str("dataset") ?? "customer_service";
const scenarioId = str("scenario");
const out = str("out");
if (!scenarioId || !out) { console.error("usage: run_plan.ts --dataset <d> --scenario <id> --out <run dir> [...]"); process.exit(2); }
const detections = (str("detections") ?? "mask") as "mask" | "catalog";
if (detections !== "mask" && detections !== "catalog") throw new Error("--detections must be catalog or mask");
const variant = str("variant") as "leaky" | "destructive" | undefined;
if (variant && variant !== "leaky" && variant !== "destructive") throw new Error("--variant must be leaky or destructive");
const limitRows = str("limit-rows") ? Number(str("limit-rows")) : undefined;
const seed = Number(str("seed") ?? 0);
const log = (s: string) => console.log(`[run_plan] ${s}`);

const p = prepare({ dataset, scenarioId, detections, limitRows, split: str("split"), log });
const res = await runPlan(p.ctx, {
  runDir: path.resolve(out), dataset, scenarioId, split: p.split, goal: p.goal, spec: parsePlanArg(str("plan")), variant, seed,
  catalog: p.catalog, omitRowmaps: str("omit-rowmap")?.split(","), limitRows, subsetLog: p.subsetLog, shuffle: a.shuffle === true,
});
log(`plan ${res.built.label} planHash=${res.planHash.slice(0, 12)} outputHash=${res.outputHash.slice(0, 12)} -> ${res.runDir}`);
for (const w of res.built.proposal.warnings) log(`warning: ${w}`);
if (a.bench === true) {
  const r = runBench(res.runDir, scenarioId);
  log(`bench exit ${r.status}; report ${r.reportPath}`);
  if (r.status !== 0) process.exit(r.status ?? 1);
}
