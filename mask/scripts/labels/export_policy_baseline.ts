/**
 * The fixed-policy baseline's choice for every training example (same expansion as export_features).
 *
 *   npx vite-node scripts/labels/export_policy_baseline.ts [--records ...] [--tasks ...] [--out ml/data] [--no-variants]
 *
 * Writes <out>/policy_baseline.jsonl: {exampleId, labelId, split, policyKey | null, abstained}.
 */
import path from "node:path";
import { parseArgs } from "./common";
import { exportPolicyBaseline } from "./lib/export_policy_baseline";

// CLI entry; the implementation lives in ./lib/export_policy_baseline.ts
const a = parseArgs();
const s = (k: string) => (typeof a[k] === "string" ? path.resolve(a[k] as string) : undefined);
exportPolicyBaseline({ recordsFile: s("records"), tasksDir: s("tasks"), outDir: s("out"), variants: !a["no-variants"] })
  .then((n) => console.log(`${n} policy choices written`)).catch((e) => { console.error(e); process.exit(1); });
