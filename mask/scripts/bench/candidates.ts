/**
 * Generate a bounded set of complete candidate plans for (dataset, scenario), execute each, run the pets-eval benchmark
 * on it (one Python subprocess per plan) and store BenchmarkReport + Proposal where scripts/labels/select_targets.ts
 * reads them:  ml/bench/results/<dataset>/<scenario>/<planHash>.json  and  <planHash>.plan.json
 *
 *   npx vite-node scripts/bench/candidates.ts --dataset customer_service --scenario CS-S1[,CS-S2]
 *     [--detections mask|catalog] [--only policy,leaky,destructive,subst,learned] [--k 12] [--model ml/runs/<id>/model.json]
 *     [--limit-rows N] [--seed 0] [--runs bench/runs] [--results ml/bench/results] [--max-adversary 3000] [--force]
 *
 * Plans: the policy plan; the leaky positive control (direct identifiers and PERSON/PHONE/EMAIL spans kept);
 * the utility-destroying control (every non-key and text column removed); controlled single-unit substitutions
 * (for up to K units ranked by risk relevance, the policy choice swapped for each other valid candidate, everything
 * else unchanged); and, with --model, the learned selector's plan. De-duplicated by planHash.
 * With --limit-rows the results go to <runs>/results-subset unless --results is given (subset numbers are not
 * comparable with full-size runs).
 */
import { parseArgs } from "../labels/common";
import { runCandidates } from "./lib/candidates";

const a = parseArgs();
const str = (key: string): string | undefined => (typeof a[key] === "string" ? (a[key] as string) : undefined);
const scenarios = (str("scenario") ?? "").split(",").filter(Boolean);
if (!scenarios.length) { console.error("--scenario is required"); process.exit(2); }
const detections = (str("detections") ?? "mask") as "mask" | "catalog";
if (detections !== "mask" && detections !== "catalog") throw new Error("--detections must be catalog or mask");
const res = await runCandidates({
  dataset: str("dataset") ?? "customer_service", scenarios, detections,
  only: (str("only") ?? "policy,leaky,destructive,subst,learned").split(","), k: Number(str("k") ?? 12), seed: Number(str("seed") ?? 0),
  limitRows: str("limit-rows") ? Number(str("limit-rows")) : undefined, runsRoot: str("runs"), resultsRoot: str("results"), model: str("model"),
  maxAdversary: str("max-adversary") ? Number(str("max-adversary")) : undefined, force: a.force === true, split: str("split"),
});
const failed = res.outcomes.filter((x) => x.status === "bench_failed");
if (failed.length) { console.error(`${failed.length} plan(s) failed in the benchmark`); process.exit(1); }
