/**
 * The fixed-policy baseline's choice for every training example (same expansion as export_features).
 *
 *   npx vite-node scripts/labels/export_policy_baseline.ts [--records ...] [--tasks ...] [--out ml/data] [--no-variants]
 *
 * Writes <out>/policy_baseline.jsonl: {exampleId, labelId, split, policyKey | null, abstained}.
 */
import fs from "node:fs";
import path from "node:path";
import { PolicySelector, keyOf } from "@/core/selector";
import { parseArgs, paths } from "../common";
import { expand, readRecords, type ExpandOptions } from "../examples";

export async function exportPolicyBaseline(opts: ExpandOptions & { recordsFile?: string; outDir?: string } = {}) {
  const outDir = opts.outDir ?? paths.data();
  const { examples } = expand(readRecords(opts.recordsFile ?? paths.records()), opts);
  const sel = new PolicySelector();
  const lines: string[] = [];
  for (const e of examples) {
    const p = await sel.propose(e.ctx);
    const d = p.decisions.find((x) => x.unitId === e.unit.id)!;
    const key = d.selected ? keyOf({ ...d.selected, valid: true, invalidReasons: [], label: "" }) : null;
    lines.push(JSON.stringify({ exampleId: e.exampleId, labelId: e.record.labelId, split: e.record.split, policyKey: key, abstained: d.abstained }));
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "policy_baseline.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));
  return lines.length;
}
