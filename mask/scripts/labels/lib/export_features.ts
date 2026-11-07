/**
 * Compute base features in TypeScript (the same code the app runs) and write the training table.
 *
 *   npx vite-node scripts/labels/export_features.ts [--records ml/labels/records.jsonl] [--tasks ml/labels/tasks]
 *        [--out ml/data] [--no-variants]
 *
 * Writes <out>/examples.jsonl (first line: header with featureNames), <out>/classes.json, <out>/meta.json.
 * Python never recomputes features.
 */
import fs from "node:fs";
import path from "node:path";
import { REGISTRY_VERSION } from "@/core/registry";
import { keyOf } from "@/core/selector";
import { EMBED_DIMS, FEATURE_SPEC_VERSION, baseFeatures, featureContextFrom, featureNames } from "@/core/selector/features";
import { gitRevision, loadSplits, parseArgs, paths, sha256File, writeJson } from "../common";
import { allClasses, expand, loadGoalSetIfPresent, readRecords, type ExpandOptions } from "../examples";

export interface ExportOptions extends ExpandOptions { recordsFile?: string; outDir?: string }

export function exportFeatures(opts: ExportOptions = {}) {
  const outDir = opts.outDir ?? paths.data();
  const recordsFile = opts.recordsFile ?? paths.records();
  const records = readRecords(recordsFile);
  const { hash: splitHash, splitOf } = loadSplits();
  const { examples, dropped, warnings } = expand(records, opts);
  const classEntries = allClasses();
  const classes = classEntries.map((c) => c.key);
  const classSet = new Set(classes);
  const goalSet = opts.goals === undefined ? loadGoalSetIfPresent() : opts.goals;
  const names = featureNames();
  const lines: string[] = [JSON.stringify({
    type: "header", featureSpecVersion: FEATURE_SPEC_VERSION, registryVersion: REGISTRY_VERSION, featureNames: names, embedDims: EMBED_DIMS, classes,
  })];
  const counts: Record<string, number> = { train: 0, val: 0, test: 0 };
  for (const e of examples) {
    const split = splitOf(e.record.sourceGroup);
    if (split !== e.record.split) throw new Error(`${e.exampleId}: record split ${e.record.split} disagrees with SPLITS.json (${split})`);
    const fv = baseFeatures(e.unit, featureContextFrom(e.ctx));
    const cls = e.candidates.map((c) => ({ key: keyOf(c), valid: c.valid }));
    for (const c of cls) if (!classSet.has(c.key)) throw new Error(`candidate class ${c.key} is not in the class list; update allClassKeys`);
    counts[split] = (counts[split] ?? 0) + 1;
    lines.push(JSON.stringify({
      type: "example", exampleId: e.exampleId, labelId: e.record.labelId, split, sourceGroup: e.record.sourceGroup, scenarioId: e.record.scenarioId,
      variantId: e.variantId, goalId: e.goal.goalId, unitId: e.unit.id, unitKind: e.unit.kind, status: e.record.reviewer.status, weak: e.record.weak,
      source: String(e.record.validation.checks.source ?? "annotation"),
      features: fv.values.map((v) => Math.round(v * 1e6) / 1e6), classes: cls, target: e.target, acceptable: e.acceptable, weight: e.weight,
    }));
  }
  fs.mkdirSync(outDir, { recursive: true });
  const exFile = path.join(outDir, "examples.jsonl");
  fs.writeFileSync(exFile, lines.join("\n") + "\n");
  writeJson(path.join(outDir, "classes.json"), { registryVersion: REGISTRY_VERSION, classes: classEntries });
  const meta = {
    featureSpecVersion: FEATURE_SPEC_VERSION, registryVersion: REGISTRY_VERSION, codeRevision: gitRevision(),
    dataHash: sha256File(exFile), splitHash, recordsHash: fs.existsSync(recordsFile) ? sha256File(recordsFile) : null,
    examples: counts, records: records.length, dropped: dropped.length, droppedDetail: dropped.slice(0, 200),
    embedder: goalSet?.embedder ?? null, goalInterpreter: goalSet?.interpreter ?? null,
    warnings, createdAt: new Date().toISOString(),
  };
  writeJson(path.join(outDir, "meta.json"), meta);
  return meta;
}
