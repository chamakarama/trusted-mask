/**
 * Validate agent annotations and build LabelRecords.
 *
 *   npx vite-node scripts/labels/validate.ts [--tasks ml/labels/tasks] [--annotations ml/labels/annotations]
 *        [--challenges ml/labels/challenges] [--reviews ml/labels/reviews] [--out ml/labels] [--audit-sample 40]
 *
 * For every annotation file (same relative path as its task file) checks schema, task id, and that chosen and
 * acceptable keys are VALID candidates of the task. Optional challenger and human review files at the same relative
 * path set the reviewer status. Writes <out>/records.jsonl, <out>/SUMMARY.json and optionally <out>/AUDIT_SAMPLE.json.
 * Agent output is candidate supervision: a record is weak unless the challenger agrees or a human approved it.
 * Benchmark-derived targets (ml/labels/bench_targets, from select_targets.ts) become records with
 * checks.source = "benchmark" and their plan context; they are weak when a constraint-covering test failed or was unsupported.
 */
import path from "node:path";
import { parseArgs } from "./common";
import { validateAnnotations } from "./lib/validate";

// CLI entry; the implementation lives in ./lib/validate.ts
const a = parseArgs();
const s = (k: string) => (typeof a[k] === "string" ? path.resolve(a[k] as string) : undefined);
const { summary } = validateAnnotations({
  tasksDir: s("tasks"), annotationsDir: s("annotations"), benchTargetsDir: s("bench-targets"), challengesDir: s("challenges"), reviewsDir: s("reviews"), outDir: s("out"),
  auditSample: typeof a["audit-sample"] === "string" ? Number(a["audit-sample"]) : undefined,
});
const { invalid, warnings, ...rest } = summary;
console.log(JSON.stringify(rest, null, 2));
for (const f of invalid) console.log(`INVALID ${f.file}: ${f.reasons.join("; ")}`);
for (const w of warnings.slice(0, 50)) console.log(`warning: ${w}`);
