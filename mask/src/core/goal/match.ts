/**
 * Scenario matching: scores goal text against the 27 proving-ground scenarios using IDF-weighted token
 * coverage plus key signals (dataset domain, recipient trust level, task kind). A scenario is reported only
 * when it is clearly the best one.
 */
import type { TaskKind, TrustLevel } from "@/contracts";
import { SCENARIO_GOALS, SCENARIO_IDS, SCENARIO_META, SCENARIO_TEXTS, type ScenarioDataset } from "./scenarios";
import { contentStems, normalizeText } from "./text";

export interface MatchSignals {
  domain?: ScenarioDataset;
  trust?: TrustLevel;
  kind?: TaskKind;
}

export interface ScenarioScore { id: string; score: number; lexical: number; parts: string[] }

export interface MatchResult { id?: string; best?: ScenarioScore; runnerUp?: ScenarioScore; scores: ScenarioScore[]; reason: string }

export interface MatchOptions {
  /** leave-one-out: ignore corpus paraphrases equal to this text (used to test matching honestly) */
  holdOutText?: string;
  minScore?: number;
  minMargin?: number;
}

export const MATCH_MIN_SCORE = 0.85;
export const MATCH_MIN_MARGIN = 0.2;
/** Without a stated task kind the scenario would fill the task, so the wording itself must overlap more. */
export const MATCH_MIN_LEXICAL_UNSTATED_TASK = 0.45;

interface Doc { id: string; base: string[]; paraphrases: { norm: string; stems: string[] }[] }

let docsCache: Doc[] | null = null;
function docs(): Doc[] {
  if (docsCache) return docsCache;
  docsCache = SCENARIO_IDS.map((id) => {
    const m = SCENARIO_META[id]!;
    const g = SCENARIO_GOALS[id]!;
    const base = contentStems([m.title, m.recipient, m.purpose, g.task.description, ...g.measures].join(" "));
    const paraphrases = (SCENARIO_TEXTS[id] ?? []).map((t) => ({ norm: normalizeText(t), stems: contentStems(t) }));
    return { id, base, paraphrases };
  });
  return docsCache;
}

function vocab(d: Doc, holdOut?: string): Set<string> {
  const s = new Set(d.base);
  for (const p of d.paraphrases) if (p.norm !== holdOut) for (const t of p.stems) s.add(t);
  return s;
}

export function scoreScenarios(text: string, signals: MatchSignals, opts: MatchOptions = {}): ScenarioScore[] {
  const hold = opts.holdOutText !== undefined ? normalizeText(opts.holdOutText) : undefined;
  const all = docs();
  const vocabs = all.map((d) => vocab(d, hold));
  const df = new Map<string, number>();
  for (const v of vocabs) for (const t of v) df.set(t, (df.get(t) ?? 0) + 1);
  const n = all.length;
  const q = [...new Set(contentStems(text))];
  const idf = (t: string): number => Math.log((n + 1) / ((df.get(t) ?? 0) + 0.5));
  const total = q.reduce((a, t) => a + idf(t), 0) || 1;

  return all.map((d, i) => {
    const v = vocabs[i]!;
    const lexical = q.reduce((a, t) => a + (v.has(t) ? idf(t) : 0), 0) / total;
    const meta = SCENARIO_META[d.id]!;
    const spec = SCENARIO_GOALS[d.id]!;
    const parts = [`lexical ${lexical.toFixed(2)}`];
    let score = lexical;
    if (signals.domain) {
      if (signals.domain === meta.dataset) { score += 0.5; parts.push("domain +0.5"); } else { score -= 0.5; parts.push("domain -0.5"); }
    }
    if (signals.trust) {
      if (signals.trust === spec.recipient.trustLevel) { score += 0.35; parts.push("trust +0.35"); } else { score -= 0.4; parts.push("trust -0.4"); }
    }
    if (signals.kind) {
      if (signals.kind === spec.task.kind) { score += 0.3; parts.push("task +0.3"); } else { score -= 0.3; parts.push("task -0.3"); }
    }
    return { id: d.id, score: Math.round(score * 1000) / 1000, lexical, parts };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function matchScenario(text: string, signals: MatchSignals, opts: MatchOptions = {}): MatchResult {
  const scores = scoreScenarios(text, signals, opts);
  const best = scores[0];
  const runnerUp = scores[1];
  const minScore = opts.minScore ?? MATCH_MIN_SCORE;
  const minMargin = opts.minMargin ?? MATCH_MIN_MARGIN;
  if (!best) return { scores, reason: "no scenarios" };
  const margin = best.score - (runnerUp?.score ?? 0);
  if (best.score < minScore) return { best, runnerUp, scores, reason: `best scenario ${best.id} scored ${best.score.toFixed(2)} < ${minScore}` };
  if (!signals.kind && best.lexical < MATCH_MIN_LEXICAL_UNSTATED_TASK) return { best, runnerUp, scores, reason: `${best.id} matched only on domain/recipient (wording overlap ${best.lexical.toFixed(2)}) and the task is not stated` };
  if (margin < minMargin) return { best, runnerUp, scores, reason: `${best.id} and ${runnerUp?.id} are too close (${margin.toFixed(2)})` };
  return { id: best.id, best, runnerUp, scores, reason: `${best.id} scored ${best.score.toFixed(2)} (${best.parts.join(", ")}), next ${runnerUp?.id} ${runnerUp?.score.toFixed(2)}` };
}
