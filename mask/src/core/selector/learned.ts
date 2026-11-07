/**
 * Learned selector: goal-conditioned softmax over valid candidate recipes.
 *
 *   logit(unit, class) = W[class] . x(unit, goal) + b[class]          (x from ./features, mapped by name)
 *   preference = softmax(logit / T) over valid candidates that have a class in the artifact
 *
 * Invalid candidates and candidates whose class the model never saw are masked (never normalised in).
 * If nothing remains the selector abstains. Argmax is deterministic: ties go to the lower class key.
 * The reason is taken from the actual decision: per-feature-group contributions of the chosen class and the
 * margin over the runner-up.
 */
import type { Candidate, Decision, DecisionUnit, ModelArtifact, Proposal } from "@/contracts";
import { ModelArtifactSchema } from "@/contracts";
import { REGISTRY_VERSION } from "@/core/registry";
import { assembleProposal } from "./assemble";
import { enumerateCandidates, keyOf, primaryDetection } from "./candidates";
import { FEATURE_SPEC_VERSION, baseFeatures, describeGroup, featureContextFrom, featureGroup, featureNames, type FeatureContext } from "./features";
import { detectionFor, type SelectionContext, type Selector } from "./types";

/** preference below this marks the decision for review: the model has no clear favourite */
const LOW_PREFERENCE = 0.4;

interface Compiled {
  artifact: ModelArtifact;
  /** for each artifact feature, the index into the base feature vector */
  featureIndex: number[];
  classIndex: Map<string, number>;
  temperature: number;
}

function compile(raw: ModelArtifact): Compiled {
  const parsed = ModelArtifactSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`model artifact does not match contracts/model.ts: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const a = parsed.data;
  if (a.registryVersion !== REGISTRY_VERSION) throw new Error(`model ${a.modelId} was trained for recipe registry ${a.registryVersion}, the app has ${REGISTRY_VERSION}; retrain or load a matching model`);
  if (a.featureSpec.version !== FEATURE_SPEC_VERSION) throw new Error(`model ${a.modelId} uses feature spec ${a.featureSpec.version}, the app computes ${FEATURE_SPEC_VERSION}; retrain or load a matching model`);
  const base = featureNames();
  const pos = new Map(base.map((n, i) => [n, i]));
  const featureIndex = a.featureSpec.baseFeatures.map((n) => {
    const i = pos.get(n);
    if (i === undefined) throw new Error(`model ${a.modelId} uses feature "${n}" that feature spec ${FEATURE_SPEC_VERSION} does not produce`);
    return i;
  });
  const F = featureIndex.length;
  if (a.weights.length !== a.classes.length || a.bias.length !== a.classes.length) throw new Error(`model ${a.modelId}: weights/bias rows (${a.weights.length}/${a.bias.length}) do not match ${a.classes.length} classes`);
  a.weights.forEach((row, c) => { if (row.length !== F) throw new Error(`model ${a.modelId}: class ${a.classes[c]?.key} has ${row.length} weights, expected ${F}`); });
  const classIndex = new Map(a.classes.map((c, i) => [c.key, i]));
  if (classIndex.size !== a.classes.length) throw new Error(`model ${a.modelId}: duplicate class keys`);
  const temperature = a.calibration.method === "temperature" ? a.calibration.temperature : 1;
  if (!(temperature > 0)) throw new Error(`model ${a.modelId}: calibration temperature must be positive`);
  return { artifact: a, featureIndex, classIndex, temperature };
}

export class LearnedSelector implements Selector {
  readonly id = "learned" as const;
  readonly version: string;
  private readonly m: Compiled;

  constructor(artifact: ModelArtifact) {
    this.m = compile(artifact);
    this.version = this.m.artifact.modelId;
  }

  async propose(ctx: SelectionContext): Promise<Proposal> {
    const fctx = featureContextFrom(ctx);
    const decisions = ctx.units.map((u) => this.decide(u, ctx, fctx));
    const a = this.m.artifact;
    return assembleProposal(ctx, { id: "learned", version: a.modelId, modelArtifact: a.modelId, embeddingModel: a.embedding?.model }, decisions);
  }

  /** Score one unit. Exposed for evaluation scripts; propose() is the app entry point. */
  decide(unit: DecisionUnit, ctx: SelectionContext, fctx: FeatureContext = featureContextFrom(ctx)): Decision {
    const { artifact: a, featureIndex, classIndex, temperature } = this.m;
    const candidates = enumerateCandidates(unit, ctx);
    const det = primaryDetection(detectionFor(ctx, unit));
    const fv = baseFeatures(unit, fctx, { embeddingModel: a.embedding?.model });
    const x = featureIndex.map((i) => fv.values[i] ?? 0);

    const scored: { c: Candidate; key: string; cls: number; logit: number }[] = [];
    const unmodelled: string[] = [];
    for (const c of candidates) {
      if (!c.valid) continue;
      const key = keyOf(c);
      const cls = classIndex.get(key);
      if (cls === undefined) { unmodelled.push(key); continue; }
      const w = a.weights[cls]!;
      let z = a.bias[cls]!;
      for (let j = 0; j < x.length; j++) if (x[j] !== 0) z += w[j]! * x[j]!;
      c.logit = z;
      scored.push({ c, key, cls, logit: z });
    }
    const reviewReasons: string[] = [];
    if (det?.needsReview) reviewReasons.push(...det.reviewReasons.map((r) => `detection: ${r}`));
    if (det && (det.confidence === "low" || det.confidence === "unknown")) reviewReasons.push(`detection confidence is ${det.confidence}`);
    const notes = [...fv.notes, ...unmodelled.map((k) => `valid candidate ${k} is masked: the model has no class for it`)];

    if (scored.length === 0) {
      const anyValid = candidates.some((c) => c.valid);
      return {
        unitId: unit.id, candidates, selected: null, abstained: true,
        abstainReason: anyValid ? "The model has no class for any valid recipe here." : "No supported recipe is valid for this unit under the current goal.",
        reason: "Mask cannot propose a transformation here.",
        detail: [...candidates.map((c) => `${c.label}: ${c.valid ? "valid, not modelled" : c.invalidReasons.join("; ")}`), ...notes],
        source: "selector", reviewState: "flagged", needsReview: true,
        reviewReasons: [anyValid ? "no modelled candidate" : "no valid candidate", ...reviewReasons],
      };
    }

    // softmax with temperature over the unmasked candidates (max-shifted for stability)
    const zmax = Math.max(...scored.map((s) => s.logit / temperature));
    const exps = scored.map((s) => Math.exp(s.logit / temperature - zmax));
    const total = exps.reduce((p, q) => p + q, 0);
    scored.forEach((s, i) => { s.c.preference = exps[i]! / total; });
    // deterministic order: logit desc, ties by class key asc
    const ranked = [...scored].sort((p, q) => (q.logit - p.logit) || (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
    const best = ranked[0]!;
    const runner = ranked[1];

    const reason = explain(a, featureIndex, x, fv.names, best, runner);
    if ((best.c.preference ?? 0) < LOW_PREFERENCE) reviewReasons.push(`model preference is low (${pct(best.c.preference ?? 0)})`);
    const detail = [
      ...ranked.map((s) => `${s.c.label} [${s.key}]: preference ${pct(s.c.preference ?? 0)}, logit ${s.logit.toFixed(3)}`),
      ...candidates.filter((c) => !c.valid).map((c) => `${c.label}: masked (${c.invalidReasons.join("; ")})`),
      ...notes,
      `model ${a.modelId}, temperature ${temperature.toFixed(3)}; preference is the model's ranking, not a privacy guarantee`,
    ];
    return {
      unitId: unit.id, candidates, selected: { recipeId: best.c.recipeId, params: best.c.params }, abstained: false,
      reason, detail, source: "selector",
      reviewState: reviewReasons.length ? "flagged" : "proposed", needsReview: reviewReasons.length > 0, reviewReasons,
    };
  }
}

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;

/** Sum w.x per feature group for one class; returns groups with their active feature names. */
function groupContrib(w: number[], x: number[], names: string[], featureIndex: number[]): Map<string, { v: number; active: string[] }> {
  const out = new Map<string, { v: number; active: string[] }>();
  for (let j = 0; j < x.length; j++) {
    if (x[j] === 0) continue;
    const name = names[featureIndex[j]!]!;
    const g = featureGroup(name);
    const e = out.get(g) ?? { v: 0, active: [] };
    e.v += w[j]! * x[j]!;
    e.active.push(name);
    out.set(g, e);
  }
  return out;
}

function explain(
  a: ModelArtifact, featureIndex: number[], x: number[], names: string[],
  best: { c: Candidate; cls: number }, runner: { c: Candidate; cls: number } | undefined,
): string {
  const own = groupContrib(a.weights[best.cls]!, x, names, featureIndex);
  const because = [...own.entries()].filter(([, e]) => e.v > 0).sort((p, q) => q[1].v - p[1].v || (p[0] < q[0] ? -1 : 1)).slice(0, 2);
  const why = because.length ? because.map(([g, e]) => describeGroup(g, e.active)).join(" and ") : "it is the only option the model scores";
  let text = `${best.c.label}: chosen mainly because ${why}`;
  if (runner) {
    const diff = a.weights[best.cls]!.map((w, j) => w - a.weights[runner.cls]![j]!);
    const margin = groupContrib(diff, x, names, featureIndex);
    const lose = [...margin.entries()].filter(([, e]) => e.v > 0).sort((p, q) => q[1].v - p[1].v || (p[0] < q[0] ? -1 : 1))[0];
    if (lose) text += `; runner-up '${runner.c.label}' loses on ${describeGroup(lose[0], lose[1].active)}`;
    else text += `; runner-up '${runner.c.label}' differs mainly in its base rate`;
  }
  return `${text}.`;
}

export function createLearnedSelector(artifact: ModelArtifact): Selector {
  return new LearnedSelector(artifact);
}
