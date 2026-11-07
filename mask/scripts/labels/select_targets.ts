/**
 * Benchmark-derived training targets.
 *
 *   npx vite-node scripts/labels/select_targets.ts [--dataset health] [--scenario HEALTH-S1]
 *        [--bench ml/bench/results] [--out ml/labels/bench_targets] [--constraints ml/CONSTRAINTS.json]
 *
 * For each (dataset, scenario) reads every executed plan under <bench>/<dataset>/<scenario>/: BenchmarkReport JSON
 * files (contracts/benchmark.ts) and the Proposal JSON of the same planHash. Applies the predeclared constraints in
 * ml/CONSTRAINTS.json, ranks qualifying plans by mean relevant utility and writes one target per unit of the best
 * plan: chosen = the best plan's recipe, acceptable = differing choices of other qualifying plans. The surrounding plan
 * (all other units' choices, planHash, report id and test outcomes) is kept with every target.
 * When no plan qualifies, an explicit failure record is written instead; a success is never invented.
 * Missing, unsupported or failed tests never satisfy a constraint.
 */
import path from "node:path";
import { parseArgs } from "./common";
import { selectTargets } from "./lib/select_targets";

// CLI entry; the implementation lives in ./lib/select_targets.ts
const a = parseArgs();
const s = (k: string) => (typeof a[k] === "string" ? path.resolve(a[k] as string) : undefined);
const list = (k: string) => (typeof a[k] === "string" ? (a[k] as string).split(",") : undefined);
const summary = selectTargets({ benchDir: s("bench"), outDir: s("out"), constraintsFile: s("constraints"), datasets: list("dataset"), scenarios: list("scenario") });
for (const r of summary) console.log(`${r.dataset}/${r.scenarioId}: ${r.plans} plans, ${r.qualifying} qualifying, ${r.targets} targets${r.failure ? `, FAILURE ${r.failure}` : ""}${r.problems.length ? `, problems: ${r.problems.join("; ")}` : ""}`);
if (!summary.length) console.log("no benchmark results found");
