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
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LabelRecord } from "@/contracts";
import { LabelRecordSchema } from "@/contracts";
import { CHALLENGER_PROMPT_VERSION, ML_DIR, PROMPT_VERSION, parseArgs, paths, readJson, sha256Str, writeJson } from "../common";
import type { AnnotationTask } from "./make_tasks";
import type { BenchTarget } from "./select_targets";

const KeyRef = z.object({ key: z.string().min(1) }).strict();
export const AnnotationSchema = z.object({
  taskId: z.string(),
  chosen: KeyRef,
  acceptable: z.array(KeyRef),
  rationale: z.string().min(1),
  unresolved: z.array(z.string()),
  annotator: z.object({ model: z.string().min(1), promptVersion: z.string().min(1) }),
  at: z.string().optional(),
}).strict();
export type Annotation = z.infer<typeof AnnotationSchema>;

export const ChallengeSchema = z.object({
  taskId: z.string(),
  agrees: z.boolean(),
  objections: z.array(z.string()),
  counterChoice: KeyRef.nullable(),
  challenger: z.object({ model: z.string().min(1), promptVersion: z.string().min(1) }).optional(),
  at: z.string().optional(),
}).strict();

export const ReviewSchema = z.object({
  taskId: z.string(),
  status: z.enum(["human_approved", "human_rejected"]),
  notes: z.string().default(""),
  reviewer: z.string().min(1),
  /** optional corrected choice; replaces the annotator's when the reviewer approves with a change */
  chosen: KeyRef.optional(),
  acceptable: z.array(KeyRef).optional(),
  at: z.string().optional(),
});

/** reviewer status -> training weight before dividing over goal variants */
export const STATUS_WEIGHT: Record<LabelRecord["reviewer"]["status"], number> = {
  human_approved: 1, agreement: 1, unreviewed: 0.6, disagreement: 0.3, human_rejected: 0,
};

export interface ValidateOptions { tasksDir?: string; annotationsDir?: string; challengesDir?: string; reviewsDir?: string; benchTargetsDir?: string; outDir?: string; auditSample?: number; now?: string }
export interface InvalidFile { file: string; reasons: string[] }

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

export function validateAnnotations(opts: ValidateOptions = {}) {
  const tasksDir = opts.tasksDir ?? paths.tasks();
  const annDir = opts.annotationsDir ?? paths.annotations();
  const chDir = opts.challengesDir ?? paths.challenges();
  const rvDir = opts.reviewsDir ?? path.join(ML_DIR, "labels", "reviews");
  const btDir = opts.benchTargetsDir ?? path.join(ML_DIR, "labels", "bench_targets");
  const outDir = opts.outDir ?? path.join(ML_DIR, "labels");
  const now = opts.now ?? new Date().toISOString();
  const records: LabelRecord[] = [];
  const invalid: InvalidFile[] = [];
  const warnings: string[] = [];

  for (const file of walk(annDir)) {
    const rel = path.relative(annDir, file);
    const reasons: string[] = [];
    const taskFile = path.join(tasksDir, rel);
    if (!fs.existsSync(taskFile)) { invalid.push({ file: rel, reasons: [`no task file at ${path.relative(ML_DIR, taskFile)}`] }); continue; }
    const task = readJson<AnnotationTask>(taskFile);
    let raw: unknown;
    try { raw = readJson(file); } catch (e) { invalid.push({ file: rel, reasons: [`not JSON: ${(e as Error).message}`] }); continue; }
    const parsed = AnnotationSchema.safeParse(raw);
    if (!parsed.success) { invalid.push({ file: rel, reasons: parsed.error.issues.map((i) => `schema: ${i.path.join(".") || "(root)"}: ${i.message}`) }); continue; }
    let ann = parsed.data;
    if (ann.taskId !== task.taskId) reasons.push(`taskId ${ann.taskId} does not match task ${task.taskId}`);

    // challenger + human review
    let challenger: LabelRecord["challenger"] = null;
    const chFile = path.join(chDir, rel);
    if (fs.existsSync(chFile)) {
      const ch = ChallengeSchema.safeParse(readJson(chFile));
      if (!ch.success) invalid.push({ file: `challenges/${rel}`, reasons: ch.error.issues.map((i) => `schema: ${i.path.join(".")}: ${i.message}`) });
      else if (ch.data.taskId !== task.taskId) invalid.push({ file: `challenges/${rel}`, reasons: ["taskId does not match the task"] });
      else {
        const counter = ch.data.counterChoice ? task.candidates.find((c) => c.key === ch.data.counterChoice!.key) : undefined;
        if (ch.data.counterChoice && (!counter || !counter.valid)) warnings.push(`${rel}: challenger counterChoice ${ch.data.counterChoice.key} is not a valid candidate; ignored`);
        challenger = {
          model: ch.data.challenger?.model ?? "unknown", promptVersion: ch.data.challenger?.promptVersion ?? CHALLENGER_PROMPT_VERSION, at: ch.data.at ?? now,
          agrees: ch.data.agrees, objections: ch.data.objections,
          counterChoice: counter?.valid ? { recipeId: counter.recipeId as LabelRecord["chosen"]["recipeId"], params: counter.params } : null,
        };
      }
    }
    let review: z.infer<typeof ReviewSchema> | null = null;
    const rvFile = path.join(rvDir, rel);
    if (fs.existsSync(rvFile)) {
      const rv = ReviewSchema.safeParse(readJson(rvFile));
      if (!rv.success) invalid.push({ file: `reviews/${rel}`, reasons: rv.error.issues.map((i) => `schema: ${i.path.join(".")}: ${i.message}`) });
      else review = rv.data;
    }
    if (review?.status === "human_approved" && review.chosen) ann = { ...ann, chosen: review.chosen, acceptable: review.acceptable ?? ann.acceptable };

    const byKey = new Map(task.candidates.map((c) => [c.key, c]));
    const chosen = byKey.get(ann.chosen.key);
    if (!chosen) reasons.push(`chosen key ${ann.chosen.key} is not a candidate`);
    else if (!chosen.valid) reasons.push(`chosen key ${ann.chosen.key} is an invalid candidate: ${chosen.invalidReasons.join("; ")}`);
    const accKeys = [...new Set(ann.acceptable.map((a) => a.key))].filter((k) => k !== ann.chosen.key);
    for (const k of accKeys) {
      const c = byKey.get(k);
      if (!c) reasons.push(`acceptable key ${k} is not a candidate`);
      else if (!c.valid) reasons.push(`acceptable key ${k} is an invalid candidate`);
    }
    if (reasons.length) { invalid.push({ file: rel, reasons }); continue; }
    const words = wordCount(ann.rationale);
    if (words > 60) warnings.push(`${rel}: rationale has ${words} words (limit 60)`);
    if (ann.annotator.promptVersion !== PROMPT_VERSION) warnings.push(`${rel}: annotator prompt ${ann.annotator.promptVersion}, current is ${PROMPT_VERSION}`);

    const status: LabelRecord["reviewer"]["status"] = review ? review.status : challenger ? (challenger.agrees ? "agreement" : "disagreement") : "unreviewed";
    const toChoice = (k: string) => { const c = byKey.get(k)!; return { recipeId: c.recipeId as LabelRecord["chosen"]["recipeId"], params: c.params }; };
    const unitKeys = task.unit.refs.map((r) => `${r.table}.${r.column}`);
    const record: LabelRecord = {
      version: 1,
      labelId: `lbl:${sha256Str(`${task.taskId}|${ann.annotator.model}|${ann.annotator.promptVersion}`).slice(0, 16)}`,
      split: task.split,
      sourceGroup: task.sourceGroup,
      scenarioId: task.scenarioId,
      goal: task.goal,
      unit: task.unit,
      context: {
        detections: task.detections,
        // aligned with unit.refs
        stats: task.columns.map((c) => c.stats),
        relationships: task.relationships,
        tableColumns: [
          ...task.columns.map((c) => ({ column: `${c.table}.${c.column}`, role: c.catalog?.role ?? "unknown", subtype: c.catalog?.subtype ?? "OTHER" })),
          ...task.siblings.map((s) => ({ column: `${s.table}.${s.column}`, role: s.role, subtype: s.subtype })),
        ],
      },
      candidates: task.candidates.map((c) => ({ recipeId: c.recipeId as LabelRecord["chosen"]["recipeId"], params: c.params, valid: c.valid, invalidReasons: c.invalidReasons, label: c.label })),
      chosen: toChoice(ann.chosen.key),
      acceptable: accKeys.map(toChoice),
      rationale: ann.rationale,
      unresolved: ann.unresolved,
      annotator: { model: ann.annotator.model, promptVersion: ann.annotator.promptVersion, at: ann.at ?? now },
      challenger,
      validation: {
        schemaOk: true, chosenIsValidCandidate: true, acceptableAllValid: true,
        executed: false,
        checks: {
          source: "annotation", planHash: null, planContext: null, benchmark: null,
          taskFile: path.relative(tasksDir, taskFile), unitColumns: unitKeys, rationaleWords: words,
          baselineKey: task.baseline.key, agreesWithBaseline: task.baseline.key === ann.chosen.key,
          execution: "not run: recipe execution/evaluation of labels is pending (core/execute)",
          ...(review?.chosen ? { correctedByReviewer: true } : {}),
        },
      },
      reviewer: { status, notes: review ? `${review.reviewer}: ${review.notes}` : challenger ? challenger.objections.join(" | ") : "" },
      weak: !(status === "agreement" || status === "human_approved"),
    };
    const check = LabelRecordSchema.safeParse(record);
    if (!check.success) { invalid.push({ file: rel, reasons: check.error.issues.map((i) => `record: ${i.path.join(".")}: ${i.message}`) }); continue; }
    records.push(record);
  }

  // ---- benchmark-derived targets (scripts/labels/select_targets.ts): a separate source, merged with provenance
  const benchFailures: unknown[] = [];
  for (const file of walk(btDir)) {
    const rel = path.relative(btDir, file);
    const base = path.basename(file);
    if (base === "SUMMARY.json") continue;
    if (base === "_FAILURE.json") { benchFailures.push(readJson(file)); continue; }
    const bt = readJson<BenchTarget>(file);
    const reasons: string[] = [];
    const taskFile = path.join(tasksDir, rel);
    if (!fs.existsSync(taskFile)) { invalid.push({ file: `bench_targets/${rel}`, reasons: [`no task for unit ${bt.unitId} (bench plan units must match make_tasks units)`] }); continue; }
    const task = readJson<AnnotationTask>(taskFile);
    if (bt.taskId !== task.taskId) reasons.push(`taskId ${bt.taskId} does not match task ${task.taskId}`);
    const byKey = new Map(task.candidates.map((c) => [c.key, c]));
    const ch = byKey.get(bt.chosen.key);
    if (!ch?.valid) reasons.push(`benchmark choice ${bt.chosen.key} is not a valid candidate of the task`);
    const acc = bt.acceptable.map((a) => a.key).filter((k) => k !== bt.chosen.key && byKey.get(k)?.valid);
    const droppedAcc = bt.acceptable.map((a) => a.key).filter((k) => k !== bt.chosen.key && !byKey.get(k)?.valid);
    if (reasons.length) { invalid.push({ file: `bench_targets/${rel}`, reasons }); continue; }
    if (droppedAcc.length) warnings.push(`bench_targets/${rel}: acceptable keys not valid in the task dropped: ${droppedAcc.join(", ")}`);
    const toChoice = (k: string) => { const c = byKey.get(k)!; return { recipeId: c.recipeId as LabelRecord["chosen"]["recipeId"], params: c.params }; };
    const record: LabelRecord = {
      version: 1,
      labelId: `lbl:${sha256Str(`${task.taskId}|benchmark|${bt.planHash}`).slice(0, 16)}`,
      split: task.split, sourceGroup: task.sourceGroup, scenarioId: task.scenarioId, goal: task.goal, unit: task.unit,
      context: {
        detections: task.detections, stats: task.columns.map((c) => c.stats), relationships: task.relationships,
        tableColumns: [
          ...task.columns.map((c) => ({ column: `${c.table}.${c.column}`, role: c.catalog?.role ?? "unknown", subtype: c.catalog?.subtype ?? "OTHER" })),
          ...task.siblings.map((x) => ({ column: `${x.table}.${x.column}`, role: x.role, subtype: x.subtype })),
        ],
      },
      candidates: task.candidates.map((c) => ({ recipeId: c.recipeId as LabelRecord["chosen"]["recipeId"], params: c.params, valid: c.valid, invalidReasons: c.invalidReasons, label: c.label })),
      chosen: toChoice(bt.chosen.key), acceptable: acc.map(toChoice),
      rationale: bt.rationale, unresolved: bt.unresolved,
      annotator: { model: "benchmark-selection", promptVersion: bt.selector.constraintsVersion, at: now },
      challenger: null,
      validation: {
        schemaOk: true, chosenIsValidCandidate: true, acceptableAllValid: droppedAcc.length === 0, executed: true,
        checks: {
          source: "benchmark", taskFile: rel, planHash: bt.planHash, planContext: bt.planContext,
          benchmark: { reportId: bt.benchmark.reportId, utility: bt.benchmark.utility, tests: bt.benchmark.tests, constraints: bt.benchmark.constraints },
          qualifyingPlans: bt.qualifyingPlans, totalPlans: bt.totalPlans, weakReasons: bt.weakReasons,
          baselineKey: task.baseline.key, agreesWithBaseline: task.baseline.key === bt.chosen.key,
        },
      },
      reviewer: { status: "unreviewed", notes: bt.weak ? `benchmark: ${bt.weakReasons.join("; ")}` : "benchmark-derived" },
      // benchmark targets are weak only when a constraint-covering test failed or was unsupported
      weak: bt.weak,
    };
    const check = LabelRecordSchema.safeParse(record);
    if (!check.success) { invalid.push({ file: `bench_targets/${rel}`, reasons: check.error.issues.map((i) => `record: ${i.path.join(".")}: ${i.message}`) }); continue; }
    records.push(record);
  }

  records.sort((a, b) => a.labelId.localeCompare(b.labelId));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "records.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""));
  const count = <K extends string>(f: (r: LabelRecord) => K) => records.reduce<Record<string, number>>((m, r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const withCh = records.filter((r) => r.challenger);
  const summary = {
    records: records.length,
    invalidFiles: invalid.length,
    bySplit: count((r) => r.split),
    byDataset: count((r) => r.sourceGroup),
    byScenario: count((r) => r.scenarioId),
    bySource: count((r) => String(r.validation.checks.source)),
    byStatus: count((r) => r.reviewer.status),
    benchmarkFailures: benchFailures,
    weak: records.filter((r) => r.weak).length,
    teacherAgreement: {
      note: "agreement between annotator and challenger agents: a triage signal, not validation",
      challenged: withCh.length,
      agreementRate: withCh.length ? withCh.filter((r) => r.challenger!.agrees).length / withCh.length : null,
    },
    agreesWithPolicyBaseline: records.length ? records.filter((r) => r.validation.checks.agreesWithBaseline).length / records.length : null,
    invalid,
    warnings,
  };
  writeJson(path.join(outDir, "SUMMARY.json"), summary);
  if (opts.auditSample) writeJson(path.join(outDir, "AUDIT_SAMPLE.json"), auditSample(records, opts.auditSample));
  return { records, invalid, warnings, summary };
}

/**
 * Stratified human-audit sample: per (dataset, status) stratum, proportional with at least one, deterministic
 * (ordered by a hash of the label id). Disagreements are always included in full.
 */
export function auditSample(records: LabelRecord[], n: number) {
  const strata = new Map<string, LabelRecord[]>();
  for (const r of records) {
    if (r.validation.checks.source !== "annotation") continue;
    if (r.reviewer.status === "human_approved" || r.reviewer.status === "human_rejected") continue;
    const k = `${r.sourceGroup}|${r.reviewer.status}`;
    strata.set(k, [...(strata.get(k) ?? []), r]);
  }
  const total = [...strata.values()].reduce((s, x) => s + x.length, 0);
  const picked: { taskFile: unknown; labelId: string; stratum: string }[] = [];
  for (const [k, rs] of [...strata.entries()].sort()) {
    const ordered = [...rs].sort((a, b) => sha256Str(a.labelId).localeCompare(sha256Str(b.labelId)));
    const take = k.endsWith("|disagreement") ? ordered.length : Math.max(1, Math.round((n * rs.length) / Math.max(1, total)));
    for (const r of ordered.slice(0, take)) picked.push({ taskFile: r.validation.checks.taskFile, labelId: r.labelId, stratum: k });
  }
  return { generatedFrom: records.length, requested: n, note: "write one review file per item under ml/labels/reviews/<taskFile> (see ml/README.md)", items: picked };
}
