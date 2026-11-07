/**
 * Compute base features in TypeScript (the same code the app runs) and write the training table.
 *
 *   npx vite-node scripts/labels/export_features.ts [--records ml/labels/records.jsonl] [--tasks ml/labels/tasks]
 *        [--out ml/data] [--no-variants]
 *
 * Writes <out>/examples.jsonl (first line: header with featureNames), <out>/classes.json, <out>/meta.json.
 * Python never recomputes features.
 */
import path from "node:path";
import { parseArgs } from "./common";
import { exportFeatures } from "./lib/export_features";

// CLI entry; the implementation lives in ./lib/export_features.ts
const a = parseArgs();
const s = (k: string) => (typeof a[k] === "string" ? path.resolve(a[k] as string) : undefined);
const meta = exportFeatures({ recordsFile: s("records"), tasksDir: s("tasks"), outDir: s("out"), variants: !a["no-variants"] });
console.log(JSON.stringify({ ...meta, droppedDetail: undefined }, null, 2));
