/**
 * Build annotation tasks: one JSON file per (decision unit x challenge scenario) for every catalogued dataset.
 *
 *   npx vite-node scripts/labels/make_tasks.ts [--dataset health,finance] [--limit 20] [--refresh-stats] [--refresh-goals]
 *
 * Writes ml/labels/tasks/<dataset>/<scenario>/<unit-safe>.json, ml/labels/tasks/INDEX.json and ml/labels/BATCHES.md.
 * Tasks contain statistics and catalog descriptions only, never raw cell values.
 */
import fs from "node:fs";
import path from "node:path";
import { ML_DIR, parseArgs, paths } from "./common";
import { batchesMarkdown, makeTasks } from "./lib/make_tasks";

// CLI entry; the implementation lives in ./lib/make_tasks.ts
async function main() {
  const args = parseArgs();
  const datasets = typeof args.dataset === "string" ? args.dataset.split(",") : undefined;
  const limit = typeof args.limit === "string" ? Number(args.limit) : undefined;
  if (args["refresh-goals"]) { const { loadGoalSet } = await import("./goals"); await loadGoalSet({ refresh: true, log: console.log }); }
  const { index, warnings } = await makeTasks({ datasets, limit, refreshStats: !!args["refresh-stats"], log: console.log });
  fs.writeFileSync(path.join(ML_DIR, "labels", "BATCHES.md"), batchesMarkdown(index));
  console.log(`wrote ml/labels/BATCHES.md${limit ? " (from a --limit run: counts are partial)" : ""}`);
  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`${index.length} tasks written to ${paths.tasks()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
