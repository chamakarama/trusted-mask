/**
 * HeuristicGoalInterpreter: deterministic, offline interpretation of a plain-language goal into a GoalSpec.
 * English and Finnish phrasing, Swedish best-effort. Every inferred field gets a short provenance note.
 * Asks only questions whose answer changes the protection.
 */
import type {
  DatasetManifest, DetectionSet, GoalSpec, LocationResolution, OutputForm, TaskKind, TextNeed, TimeResolution, TrustLevel, UnresolvedQuestion,
} from "@/contracts";
import { LOCATION_RESOLUTIONS, TEXT_NEEDS, TIME_RESOLUTIONS, TRUST_LEVELS } from "@/contracts";
import { stableStringify } from "@/core/util/hash";
import type { GoalContext, GoalInterpreter } from "./types";
import {
  AGE_BAND_CUES, AUTHORITY_CUE, DOMAIN_CUES, FOREIGN_GROUPINGS, LINK_ACROSS_CUE, LINK_NONE_CUE, LINK_WITHIN_CUE, LOCATION_CUES,
  LOCATION_NOISE, MEASURE_NOUN_CUE, NEUTRALISE, OUTPUT_AGGREGATE_CUE, OUTPUT_ROW_CUE, OUTPUT_TEXT_CUE, SPECIAL_EXCLUDE_CUE,
  SPECIAL_NEEDED_CUE, TASK_CUES, TASK_LABEL, TEXT_EVIDENCE_CUE, TEXT_FLUENT_CUE, TEXT_MENTION_CUE, TEXT_NONE_CUE, TEXT_TOPIC_CUE,
  TEXT_RECORD_CUE, TIME_CUES, TIME_NOISE, TRUST_CUES, TRUST_LABEL,
} from "./lexicon";
import { columnsOfManifest, columnsOfNames, filterToColumns, matchPhraseToColumns, mentionedColumns, type ColumnInfo } from "./columns";
import { matchScenario, type MatchResult } from "./match";
import { SCENARIO_GOALS, SCENARIO_META, type ScenarioDataset } from "./scenarios";
import { EDITABLE_KEYS, withGoalId, type GoalSpecDraft } from "./spec";
import { STOPWORDS, findAll, hasCue, normalizeText, unique, wordTokens } from "./text";

export const HEURISTIC_VERSION = "1.0.0";

export interface HeuristicOptions {
  /** match scenarios at all (default true) */
  scenarioMatching?: boolean;
  /** leave-one-out matching: ignore corpus paraphrases identical to the input (honest matching tests) */
  holdOutExactText?: boolean;
}

export class HeuristicGoalInterpreter implements GoalInterpreter {
  readonly id = "heuristic";
  readonly version = HEURISTIC_VERSION;
  constructor(private readonly opts: HeuristicOptions = {}) {}
  async interpret(text: string, ctx: GoalContext): Promise<GoalSpec> {
    return interpretGoalText(text, ctx, this.opts);
  }
}

// ------------------------------------------------------------------------------------------------ questions

export const QUESTION_AFFECTS: Record<string, string[]> = {
  recipient: ["recipient.trustLevel", "exclusions", "threatAssumptions"],
  text_need: ["textNeed", "outputForm"],
  linkage: ["linkage"],
  time_resolution: ["resolution.time"],
};
const QUESTION_TOPKEY: Record<string, string[]> = {
  recipient: ["recipient", "exclusions", "threatAssumptions"],
  text_need: ["textNeed", "outputForm"],
  linkage: ["linkage"],
  time_resolution: ["resolution"],
};

export const QUESTIONS: Record<string, UnresolvedQuestion> = {
  recipient: {
    id: "recipient", question: "Who receives the data?", affects: QUESTION_AFFECTS.recipient!,
    options: [
      { value: "internal", label: "Our own team (internal)" },
      { value: "contractual", label: "An external vendor or partner under contract" },
      { value: "controlled_research", label: "Researchers in a controlled environment" },
      { value: "public", label: "The public (open data, publication)" },
    ],
  },
  text_need: {
    id: "text_need", question: "Does the recipient need the free text?", affects: QUESTION_AFFECTS.text_need!,
    options: [
      { value: "none", label: "No, drop the text" },
      { value: "topic_only", label: "Only what it is about (identifiers become placeholders)" },
      { value: "fluent", label: "Natural-reading text (for training language models)" },
      { value: "verbatim_evidence", label: "Readers must see what was said (audit evidence)" },
    ],
  },
  linkage: {
    id: "linkage", question: "Must rows of the same person stay linkable?", affects: QUESTION_AFFECTS.linkage!,
    options: [
      { value: "none", label: "No, each row stands alone" },
      { value: "within_table", label: "Yes, repeat events of the same person in one table" },
      { value: "across_tables", label: "Yes, and joined across tables" },
    ],
  },
  time_resolution: {
    id: "time_resolution", question: "How precise do times need to be?", affects: QUESTION_AFFECTS.time_resolution!,
    options: [
      { value: "exact", label: "Exact time" },
      { value: "hour", label: "To the hour" },
      { value: "day", label: "To the day" },
      { value: "week", label: "To the week" },
      { value: "month", label: "To the month" },
    ],
  },
};

// ------------------------------------------------------------------------------------------------ analysis

interface Field<T> { value: T; stated: boolean }

interface Analysis {
  raw: string;
  norm: string;
  trust: Field<TrustLevel> & { description: string; evidence?: string };
  authority: boolean;
  task: Field<TaskKind> & { scores: Partial<Record<TaskKind, number>> };
  domain?: ScenarioDataset;
  outputForm: Field<OutputForm>;
  textNeed: Field<TextNeed>;
  linkage: Field<GoalSpec["linkage"]>;
  time?: TimeResolution;
  location?: LocationResolution;
  ageBandYears?: number;
  exclusions: Field<string[]>;
  measures: string[];
  groupingPhrases: string[];
  textMentioned: boolean;
  notes: string[];
}

const TRUST_RANK: Record<TrustLevel, number> = { internal: 0, contractual: 1, controlled_research: 2, public: 3 };
const TIME_ORDER = TIME_RESOLUTIONS;
const LOCATION_ORDER = LOCATION_RESOLUTIONS;
const TASK_ORDER: TaskKind[] = ["other", "fraud_security", "model_training", "quality_audit", "topic_mining", "statistics", "operations", "research"];

const LEFT_STOP = new Set([...STOPWORDS, "send", "share", "give", "publish", "release", "train", "build", "outsource", "pool", "asks", "asking", "wants", "needs", "provide", "transfer", "hand", "sell", "lähetä", "jaa", "anna", "luovuta", "skicka", "dela", "will", "under", "via", "mukaan", "wifi", "parking", "card", "taps", "tap", "kwh", "readings", "transactions", "student", "data", "transcripts", "logs"]);
const RIGHT_HEADS = new Set(["team", "teams", "group", "groups", "vendor", "vendors", "partner", "partners", "company", "provider", "community", "office", "portal", "environment", "researchers", "analysts", "association", "firm", "aggregator", "consortium", "scientists", "unit", "research", "science", "analytics", "data", "tiimi", "ryhmä", "tutkimusryhmä"]);

function neutralise(norm: string, list: RegExp[]): string {
  let s = norm;
  for (const re of list) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ");
}

/** Cue words that are not a recipient noun on their own ("internal", "publish", "outsourced"). */
const NON_HEAD = /^(internal\w*|in-house|inhouse|external\w*|academic\w*|outsourc\w*|publish\w*|release\w*|public\w*|online for|open data\w*|open-data\w*|universit\w*|sisäi\w*|ulkoi\w*|ulkopuoli\w*|julkai\w*|julkis\w*|julkinen|avoim\w*|yliopisto\w*|contract\w*|dpa|extern\w*|intern\w*)$/u;

function recipientPhrase(norm: string, index: number, term: string): string {
  if (NON_HEAD.test(term)) {
    const after = norm.slice(index + term.length).split(" ").filter(Boolean);
    const right: string[] = [];
    for (const w of after) {
      const clean = w.replace(/[.,:;!?()]+$/, "");
      if (right.length >= 3 || !(RIGHT_HEADS.has(clean) || (right.length === 0 && /^(data|research|analytics|science|security|ai|ml|it)$/u.test(clean)))) break;
      right.push(clean);
      if (clean !== w) break;
    }
    const last = right[right.length - 1];
    return last && RIGHT_HEADS.has(last) && !/^(data|research|analytics|science)$/u.test(last) ? [term, ...right].join(" ") : "";
  }
  const before = norm.slice(0, index).split(" ").filter(Boolean);
  const left: string[] = [];
  for (let i = before.length - 1; i >= 0 && left.length < 3; i--) {
    const w = before[i]!;
    if (/[.,:;!?()]$/.test(w)) break;
    const clean = w.replace(/^[("']+/, "");
    if (LEFT_STOP.has(clean) || /^\d+$/.test(clean)) break;
    left.unshift(clean);
    if (w.startsWith("(")) break;
  }
  const after = norm.slice(index + term.length).split(" ").filter(Boolean);
  const right: string[] = [];
  for (const w of after) {
    const clean = w.replace(/[.,:;!?()]+$/, "");
    if (right.length >= 2 || !RIGHT_HEADS.has(clean)) break;
    right.push(clean);
    if (clean !== w) break;
  }
  return [...left, term, ...right].join(" ").replace(/[()]/g, "").trim();
}

function restoreCase(raw: string, phrase: string): string {
  const i = raw.toLowerCase().replace(/\s+/g, " ").indexOf(phrase);
  if (i < 0) return phrase;
  const flat = raw.replace(/\s+/g, " ");
  return flat.slice(i, i + phrase.length);
}

function detectTrust(a: Analysis): void {
  const text = neutralise(a.norm, NEUTRALISE);
  let best: { level: TrustLevel; strength: number; term: string; index: number; label: string } | undefined;
  const seen = new Set<TrustLevel>();
  for (const c of TRUST_CUES) {
    for (const h of findAll(c.re, text)) {
      seen.add(c.trust);
      const sameRank = !!best && c.strength === best.strength && c.trust === best.level;
      const better = !best || c.strength > best.strength || (c.strength === best.strength && TRUST_RANK[c.trust] > TRUST_RANK[best.level])
        // same level: a recipient noun ("BPO", "data portal") describes the recipient better than an adjective or verb
        || (sameRank && NON_HEAD.test(best.term) && !NON_HEAD.test(h.term));
      if (better) best = { level: c.trust, strength: c.strength, term: h.term, index: h.index, label: c.label };
    }
  }
  a.authority = hasCue(AUTHORITY_CUE, a.norm);
  if (a.authority) {
    const h = findAll(AUTHORITY_CUE, a.norm)[0]!;
    a.trust = { value: "contractual", stated: false, description: restoreCase(a.raw, recipientPhrase(a.norm, h.index, h.term)) };
    a.notes.push(`recipient: '${h.term}' is an authority request; trust level is not inferred from wording`);
    return;
  }
  if (!best) {
    a.trust = { value: "contractual", stated: false, description: "" };
    return;
  }
  const phrase = recipientPhrase(text, best.index, best.term);
  a.trust = { value: best.level, stated: true, description: phrase ? restoreCase(a.raw, phrase) : TRUST_LABEL[best.level], evidence: best.term };
  a.notes.push(`recipient: '${phrase || best.term}' → ${best.level}${seen.size > 1 ? ` (also saw ${[...seen].filter((l) => l !== best!.level).join(", ")} cues; the stronger or more protective one wins)` : ""}`);
}

function detectDomain(a: Analysis): void {
  const counts: [ScenarioDataset, number][] = (Object.keys(DOMAIN_CUES) as ScenarioDataset[]).map((d) => [d, findAll(DOMAIN_CUES[d], a.norm).length]);
  counts.sort((x, y) => y[1] - x[1]);
  const [top, second] = counts;
  if (top && top[1] > 0 && (!second || top[1] > second[1])) a.domain = top[0];
}

function detectTask(a: Analysis): void {
  const text = neutralise(a.norm, NEUTRALISE);
  const scores: Partial<Record<TaskKind, number>> = {};
  const add = (k: TaskKind, w: number): void => { scores[k] = (scores[k] ?? 0) + w; };
  const evidence: string[] = [];
  for (const c of TASK_CUES) {
    const hits = findAll(c.re, text);
    if (hits.length) { add(c.kind, c.weight * Math.min(hits.length, 3)); evidence.push(`${hits[0]!.term}→${c.kind}`); }
  }
  const trust = a.trust.stated ? a.trust.value : undefined;
  if (trust === "public" && (scores.operations ?? 0) > 0) { add("statistics", scores.operations!); delete scores.operations; }
  if (trust === "public" && !(scores.model_training ?? 0) && !(scores.fraud_security ?? 0) && !(scores.quality_audit ?? 0)) add("statistics", 2);
  if (trust === "controlled_research" && (scores.research ?? 0) > 0) add("research", 1);
  if (trust === "internal" && (scores.operations ?? 0) > 0) add("operations", 1);
  if (a.domain === "cyber" && !(scores.model_training ?? 0)) add("fraud_security", 3);
  let kind: TaskKind | undefined;
  let top = 0;
  for (const k of TASK_ORDER) { const s = scores[k] ?? 0; if (s > top) { top = s; kind = k; } }
  if (kind && top >= 2) {
    a.task = { value: kind, stated: true, scores };
    a.notes.push(`task: ${evidence.slice(0, 4).join(", ")} → ${kind}`);
    return;
  }
  const fallback: TaskKind = trust === "public" ? "statistics" : trust === "internal" ? "operations" : "research";
  a.task = { value: fallback, stated: false, scores };
  a.notes.push(`task: no clear task words; assumed ${fallback}`);
}

function detectText(a: Analysis): void {
  const n = a.norm;
  // only a stated task may imply a text need; a guessed one must not
  const kind: TaskKind | undefined = a.task.stated ? a.task.value : undefined;
  const aggregateIntent = kind === "statistics" || kind === "operations" || hasCue(OUTPUT_AGGREGATE_CUE, n);
  a.textMentioned = hasCue(TEXT_MENTION_CUE, n) || (hasCue(TEXT_RECORD_CUE, n) && !aggregateIntent);
  if (hasCue(TEXT_NONE_CUE, n)) { a.textNeed = { value: "none", stated: true }; a.notes.push("text: user said no text → none"); return; }
  if (kind === "quality_audit" || (hasCue(TEXT_EVIDENCE_CUE, n) && a.textMentioned)) {
    a.textNeed = { value: "verbatim_evidence", stated: a.task.stated || hasCue(TEXT_EVIDENCE_CUE, n) };
    a.notes.push("text: auditors must see what was said → verbatim evidence (placeholders, no invented values)");
    return;
  }
  if (kind === "model_training" && (hasCue(TEXT_FLUENT_CUE, n) || a.textMentioned)) {
    a.textNeed = { value: "fluent", stated: true };
    a.notes.push("text: training on text → fluent (realistic surrogates)");
    return;
  }
  if (kind === "topic_mining" || hasCue(TEXT_TOPIC_CUE, n)) {
    a.textNeed = { value: "topic_only", stated: true };
    a.notes.push("text: topics only → identifiers become placeholders");
    return;
  }
  if (a.textMentioned) {
    a.textNeed = { value: "topic_only", stated: true };
    a.notes.push("text: text mentioned → kept with personal data redacted");
    return;
  }
  a.textNeed = { value: "none", stated: false };
}

function detectOutput(a: Analysis): void {
  const n = a.norm;
  const kind = a.task.value;
  const textual = a.textNeed.value !== "none";
  if (hasCue(OUTPUT_ROW_CUE, n)) { a.outputForm = { value: "row_level", stated: true }; a.notes.push("output: row-level requested"); return; }
  if (textual && (kind === "topic_mining" || kind === "quality_audit" || kind === "model_training") && (hasCue(OUTPUT_TEXT_CUE, n) || kind !== "model_training" || a.textNeed.value === "fluent")) {
    a.outputForm = { value: "text_corpus", stated: a.textNeed.stated };
    a.notes.push("output: text corpus for text analysis");
    return;
  }
  const aggregateCue = hasCue(OUTPUT_AGGREGATE_CUE, neutralise(n, [/dashboards?/gu]))
    || (a.trust.stated && a.trust.value === "public" && /dashboard/u.test(n));
  if (!textual && (aggregateCue || (kind === "statistics" && a.trust.value === "public"))) {
    a.outputForm = { value: "aggregate", stated: aggregateCue };
    a.notes.push(aggregateCue ? "output: aggregates (counts/statistics) requested" : "output: public statistics → aggregates");
    return;
  }
  a.outputForm = { value: "row_level", stated: false };
}

function detectLinkage(a: Analysis): void {
  const n = a.norm;
  const across = findAll(LINK_ACROSS_CUE, n)[0];
  const none = findAll(LINK_NONE_CUE, n)[0];
  const within = findAll(LINK_WITHIN_CUE, n)[0];
  if (none) { a.linkage = { value: "none", stated: true }; a.notes.push(`linkage: '${none.term}' → none`); return; }
  if (across) { a.linkage = { value: "across_tables", stated: true }; a.notes.push(`linkage: '${across.term}' → across tables`); return; }
  if (within) { a.linkage = { value: "within_table", stated: true }; a.notes.push(`linkage: '${within.term}' → within table`); return; }
  a.linkage = { value: "none", stated: false };
}

function finest<T extends string>(order: readonly T[], vals: T[]): T | undefined {
  return [...vals].sort((x, y) => order.indexOf(x) - order.indexOf(y))[0];
}

function detectResolution(a: Analysis): void {
  const tn = neutralise(a.norm, TIME_NOISE);
  const explicit = /round(?:ed|ing)?\s+(?:the\s+)?(?:time(?:stamp)?s?\s+)?to\s+(?:the\s+)?(minute|hour|day|week|month|year)/u.exec(tn);
  if (explicit) {
    a.time = explicit[1] as TimeResolution;
    a.notes.push(`time: '${explicit[0]}' → ${a.time}`);
  } else {
    const hits = TIME_CUES.filter((c) => hasCue(c.re, tn));
    const t = finest(TIME_ORDER, hits.map((h) => h.res));
    if (t) { a.time = t; a.notes.push(`time: ${hits.map((h) => h.res).join("/")} mentioned → ${t}`); }
  }
  const ln = neutralise(a.norm, LOCATION_NOISE);
  const lhits = LOCATION_CUES.filter((c) => hasCue(c.re, ln)).map((c) => c.res);
  // "postcode area" also matches the plain postcode cue; the 3-digit reading wins then
  const loc = lhits.includes("postcode3") ? finest(LOCATION_ORDER, lhits.filter((l) => l !== "postcode")) : finest(LOCATION_ORDER, lhits);
  if (loc) { a.location = loc; a.notes.push(`location: ${lhits.join("/")} mentioned → ${loc}`); }
  for (const c of AGE_BAND_CUES) if (hasCue(c.re, a.norm)) { a.ageBandYears = c.years; a.notes.push(`age: age bands of ${c.years} years`); break; }
}

function detectExclusions(a: Analysis): void {
  if (hasCue(SPECIAL_EXCLUDE_CUE, a.norm)) {
    a.exclusions = { value: ["special_category"], stated: true };
    a.notes.push("exclusions: user excluded health / special-category data");
    return;
  }
  const external = a.trust.value === "public" || a.trust.value === "contractual";
  const healthTask = hasCue(SPECIAL_NEEDED_CUE, a.norm) || a.domain === "health";
  if (a.trust.stated && external && !healthTask) {
    a.exclusions = { value: ["special_category"], stated: false };
    a.notes.push(`exclusions: ${a.trust.value} recipient and the task is not about health → special-category data excluded`);
    return;
  }
  a.exclusions = { value: [], stated: false };
}

// --------------------------------------------------------------------------- measures, groupings, description

const LEAD_STRIP = /^[\p{L}\p{N}\s'-]{0,60}?\b(?:want|wants|need|needs|would like|'d like|should be able to|will be able to|is asking for|are asking for|asks for|can|could|will)\s+(?:to\s+)?/u;
const VERB_STRIP = /^(?:download|analy[sz]e|study|studying|publish|find|see|track|compute|measure|look at|understand|show|identify|detect|train|build|predict|forecast|relate|share|send|give|release|score|check|checks|mine|know|test|estimate|calculate|count|report|monitor|hunt for|catch|put|pool|outsource|answer|explore|compare|map|tutki\w*|analysoi\w*|julkais\w*|laske\w*|selvit\w*|ennust\w*|kouluta\w*|seura\w*)\s+/u;
const ARTICLE_STRIP = /^(?:the|a|an|our|their|all|some|how|whether|what|which|why|on|of|for|about)\s+/u;

function cleanFragment(f: string): string {
  let s = f.trim().replace(/^[-–:,;\s]+|[-–:,;\s.?!]+$/gu, "");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/^(?:so that|so|and|then|also|in order to|to)\s+/u, "").replace(LEAD_STRIP, "").replace(VERB_STRIP, "").replace(ARTICLE_STRIP, "");
    s = dropRecipientTail(s);
    if (s === before) break;
  }
  return s.trim();
}

function dropRecipientTail(s: string): string {
  return s.replace(/\s+(?:with|to|for|from|on|in|under)\s+(?:the|our|an?|their)?\s*(?:[\w-]+\s+){0,3}(?:vendor|partner|consultancy|consultant|team|group|researchers|portal|association|community|office|provider|environment|bpo|aggregator|consortium|firm|public|anyone|company)s?\b.*$/u, "");
}

function extractMeasures(raw: string): string[] {
  const norm = normalizeText(raw).replace(/\([^)]*\)/g, " ");
  const afterColon = norm.includes(":") ? norm.slice(norm.indexOf(":") + 1) : norm;
  const sentences = [afterColon, ...(norm.includes(":") ? [norm.slice(0, norm.indexOf(":"))] : [])].flatMap((s) => s.split(/[.;!?]+\s|[.;!?]+$|\n/u));
  const out: string[] = [];
  for (const sentence of sentences) {
    const frags = sentence.split(/,|\s+(?:and|ja|sekä|och|as well as)\s+/u);
    const merged: string[] = [];
    for (const f of frags) {
      const c = cleanFragment(f);
      if (!c) continue;
      const isMeasure = hasCue(MEASURE_NOUN_CUE, c) || /\b(by|per)\b/u.test(c);
      if (!isMeasure && merged.length) merged[merged.length - 1] += ` and ${c}`;
      else merged.push(isMeasure ? c : `\u0000${c}`);
    }
    for (const m of merged) if (!m.startsWith("\u0000")) out.push(m);
  }
  return unique(out.map((m) => m.replace(/\s+/g, " ").trim()).filter((m) => m.length >= 3 && m.length <= 90 && wordTokens(m).length <= 12)).slice(0, 8);
}

const TIME_WORD = /^(?:hours?|hour bands?|days?|weeks?|months?|years?|quarters?|minutes?|weekday|weekdays|time|date|tunti|päivä|viikko|kuukausi)$/u;

function extractGroupingPhrases(norm: string): string[] {
  const out: string[] = [];
  const trig = /(?<![\p{L}])(?:broken down by|grouped by|split by|for each|by|per)\s+/gu;
  const starts = [...norm.matchAll(trig)].map((m) => ({ at: m.index!, end: m.index! + m[0].length }));
  starts.forEach((t, i) => {
    const next = starts[i + 1];
    let seg = norm.slice(t.end, next ? next.at : undefined);
    const cutByNext = !!next && !/[.;:!?()]/u.test(seg);
    seg = seg.split(/[.;:!?()]/u)[0]!;
    seg = seg.replace(/\s(?:for|to|so|with|from|that|which|on|including|in|at|as|using|where|when|because|over|during|while|via|is|are|will|should|can|the vendor|our)\b.*$/u, "");
    let parts = seg.split(/\s*(?:,|\band\b|\bx\b|×|&|\/|\bor\b|\bja\b|\boch\b)\s*/u).map((p) => p.replace(/^(?:the|each|their|our|a|an|every)\s+/u, "").trim()).filter(Boolean);
    // "by age band and CRP by diagnosis group": the last piece before the next "by" is that group's measure
    if (cutByNext && parts.length > 1) parts = parts.slice(0, -1);
    // stop at the first piece that reads as an analysis ("by triage level, revisit rates")
    const firstMeasure = parts.findIndex((p, j) => j > 0 && hasCue(MEASURE_NOUN_CUE, p));
    if (firstMeasure > 0) parts = parts.slice(0, firstMeasure);
    for (const p of parts) {
      if (TIME_WORD.test(p) || wordTokens(p).length > 4 || wordTokens(p).length === 0) continue;
      out.push(p);
    }
  });
  for (const g of FOREIGN_GROUPINGS) if (hasCue(g.re, norm)) out.push(g.phrase);
  return unique(out);
}

function describeTask(raw: string, kind: TaskKind, measures: string[]): string {
  let s = raw.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? raw;
  s = s.replace(/^(?:please\s+)?(?:i|we)\s+(?:want|need|would like|'d like)\s+to\s+/iu, "").replace(/^(?:haluamme|haluan|meidän pitää|vi vill)\s+/iu, "").replace(/[.!?]+$/u, "");
  if (s.length >= 8 && s.length <= 140) return s.charAt(0).toLowerCase() + s.slice(1);
  return measures[0] ? `${TASK_LABEL[kind]}: ${measures[0]}` : TASK_LABEL[kind];
}

// ------------------------------------------------------------------------------------------------ dataset facts

interface DatasetFacts { cols: ColumnInfo[]; hasFreeText: boolean; hasTimestamps: boolean; hasEntityIds: boolean; known: boolean }

function datasetFacts(manifest?: DatasetManifest, detections?: DetectionSet): DatasetFacts {
  if (!manifest) return { cols: [], hasFreeText: false, hasTimestamps: false, hasEntityIds: false, known: false };
  const cols = columnsOfManifest(manifest);
  const dets = detections?.fields ?? [];
  const allCols = manifest.tables.flatMap((t) => t.columns.map((c) => ({ t, c })));
  const hasFreeText = dets.length
    ? dets.some((d) => d.role === "free_text")
    : allCols.some(({ c }) => c.inferredType === "string" && c.stats.meanLength > 40 && c.stats.spaceShare > 0.5);
  const hasTimestamps = allCols.some(({ c }) => c.inferredType === "datetime" || c.inferredType === "date")
    || dets.some((d) => d.subtype === "TIMESTAMP" || d.subtype === "DATE");
  const idCols = allCols.filter(({ c }) => /(^|_)(id|hetu|upn|pan|mac|plate|account)$/i.test(c.name));
  const hasEntityIds = manifest.relationships.length > 0
    || dets.some((d) => (d.role === "direct_identifier" || d.role === "technical_identifier"))
    || new Set(idCols.map(({ c }) => c.name)).size !== idCols.length
    || idCols.length > manifest.tables.length;
  return { cols, hasFreeText, hasTimestamps, hasEntityIds, known: true };
}

// ------------------------------------------------------------------------------------------------ main

function analyse(raw: string): Analysis {
  const a = {
    raw, norm: normalizeText(raw), notes: [] as string[], measures: [] as string[], groupingPhrases: [] as string[], textMentioned: false, authority: false,
  } as unknown as Analysis;
  detectTrust(a);
  detectDomain(a);
  detectTask(a);
  detectText(a);
  detectOutput(a);
  detectLinkage(a);
  detectResolution(a);
  detectExclusions(a);
  a.measures = extractMeasures(raw);
  a.groupingPhrases = extractGroupingPhrases(a.norm);
  return a;
}

function applyAnswers(a: Analysis, answers: Record<string, string>): void {
  const r = answers.recipient;
  if (r && (TRUST_LEVELS as readonly string[]).includes(r)) {
    a.trust = { ...a.trust, value: r as TrustLevel, stated: true, description: a.trust.description || TRUST_LABEL[r as TrustLevel] };
    a.notes.push(`recipient: answered → ${r}`);
    detectTask(a); detectText(a); detectOutput(a); detectExclusions(a);
  }
  const t = answers.text_need;
  if (t && (TEXT_NEEDS as readonly string[]).includes(t)) {
    a.textNeed = { value: t as TextNeed, stated: true };
    a.notes.push(`text: answered → ${t}`);
    detectOutput(a);
  }
  const l = answers.linkage;
  if (l && ["none", "within_table", "across_tables"].includes(l)) { a.linkage = { value: l as GoalSpec["linkage"], stated: true }; a.notes.push(`linkage: answered → ${l}`); }
  const tr = answers.time_resolution;
  if (tr && (TIME_RESOLUTIONS as readonly string[]).includes(tr)) { a.time = tr as TimeResolution; a.notes.push(`time: answered → ${tr}`); }
}

const TIME_TOPIC = /(?<![\p{L}])(trend|trends|over time|when|time of day|hour of day|seasonal|peak|peaks|timing|time series|weekday|weekend|arrival curve|trendi|ajan myötä|kausivaihtel|ruuhk)/u;

export function interpretGoalText(text: string, ctx: GoalContext, opts: HeuristicOptions = {}): GoalSpec {
  const answers = ctx.answers ?? {};
  const a = analyse(text);
  applyAnswers(a, answers);
  const facts = datasetFacts(ctx.manifest, ctx.detections);

  // scenario matching
  let match: MatchResult | undefined;
  if (opts.scenarioMatching !== false && a.norm.length > 0) {
    match = matchScenario(text, {
      domain: a.domain,
      trust: a.trust.stated ? a.trust.value : undefined,
      kind: a.task.stated ? a.task.value : undefined,
    }, { holdOutText: opts.holdOutExactText ? text : undefined });
  }
  const scenario = match?.id ? SCENARIO_GOALS[match.id] : undefined;
  const notes = [...a.notes];
  const filled: string[] = [];

  let trust = a.trust.value;
  let recipientDesc = a.trust.description;
  let kind = a.task.value;
  let outputForm = a.outputForm.value;
  let textNeed = a.textNeed.value;
  let linkage = a.linkage.value;
  const resolution: GoalSpec["resolution"] = {};
  if (a.time) resolution.time = a.time;
  if (a.location) resolution.location = a.location;
  if (a.ageBandYears !== undefined) resolution.ageBandYears = a.ageBandYears;
  let exclusions = a.exclusions.value;
  let threats: string[] = [];
  let measures = a.measures;

  if (scenario) {
    if (!a.trust.stated) { trust = scenario.recipient.trustLevel; filled.push("recipient"); }
    if (!recipientDesc) recipientDesc = scenario.recipient.description;
    if (!a.task.stated) { kind = scenario.task.kind; filled.push("task"); }
    if (!a.outputForm.stated && (a.task.stated ? kind === scenario.task.kind : true)) { outputForm = scenario.outputForm; filled.push("outputForm"); }
    if (!a.textNeed.stated) { textNeed = scenario.textNeed; filled.push("textNeed"); }
    if (!a.linkage.stated) { linkage = scenario.linkage; filled.push("linkage"); }
    if (!resolution.time && scenario.resolution.time) { resolution.time = scenario.resolution.time; filled.push("time"); }
    if (!resolution.location && scenario.resolution.location) { resolution.location = scenario.resolution.location; filled.push("location"); }
    if (resolution.ageBandYears === undefined && scenario.resolution.ageBandYears !== undefined) { resolution.ageBandYears = scenario.resolution.ageBandYears; filled.push("age bands"); }
    if (!a.exclusions.stated && trust === scenario.recipient.trustLevel) { exclusions = scenario.exclusions; filled.push("exclusions"); }
    threats = scenario.threatAssumptions;
    filled.push("threats");
    if (!measures.length) { measures = scenario.measures; filled.push("measures"); }
  }
  if (!scenario && !a.trust.stated) {
    // re-derive dependent fields once the provisional trust is fixed
    exclusions = a.exclusions.value;
  }

  // groupings and required fields
  const scenarioNames = scenario ? unique([...scenario.groupings, ...scenario.requiredFields]) : [];
  const cols = facts.known ? facts.cols : columnsOfNames(scenarioNames);
  const groupings: string[] = [];
  for (const p of a.groupingPhrases) {
    const m = cols.length ? matchPhraseToColumns(p, cols) : [];
    if (m.length) { groupings.push(...m); notes.push(`grouping: '${p}' → ${m.join(", ")}`); } else groupings.push(p);
  }
  let groupingsOut = unique(groupings);
  const mentioned = cols.length ? mentionedColumns(text, cols) : [];
  if (mentioned.length) notes.push(`columns mentioned: ${mentioned.join(", ")}`);
  let required = unique([...mentioned, ...groupingsOut.filter((g) => cols.some((c) => c.column === g))]);
  if (scenario) {
    const fromScenario = (names: string[]): string[] => (facts.known ? filterToColumns(names, facts.cols) : names);
    if (!groupingsOut.length) { groupingsOut = fromScenario(scenario.groupings); filled.push("groupings"); }
    if (!required.length) { required = fromScenario(scenario.requiredFields); filled.push("requiredFields"); }
  }

  if (scenario && match) {
    notes.push(`scenario: ${match.reason}`);
    notes.push(`scenario ${match.id}: filled ${filled.join(", ")} (not stated in the text); stated fields kept`);
  } else if (match?.best) {
    notes.push(`scenario: no clear match (${match.reason})`);
  }

  if (!threats.length) threats = defaultThreats(trust, kind, a.norm);

  // questions
  const unresolved: UnresolvedQuestion[] = [];
  // The recipient decides most of the protection: if the user did not say who gets the data, ask,
  // even when a matched scenario supplies a provisional trust level.
  if (!a.trust.stated) {
    unresolved.push(QUESTIONS.recipient!);
    notes.push(a.authority ? `recipient: authority request; trust level needs your answer (provisionally ${trust})`
      : scenario ? `recipient: not stated; provisionally ${trust} from scenario ${match!.id}, please confirm`
      : "recipient: not stated; assumed an external processor until answered");
  }
  const textImplied = a.textNeed.stated || !!scenario;
  if (facts.hasFreeText && !textImplied && outputForm !== "aggregate" && answers.text_need === undefined) unresolved.push(QUESTIONS.text_need!);
  const linkAmbiguous = !a.linkage.stated && !scenario && (["research", "model_training", "fraud_security", "operations"] as TaskKind[]).includes(kind) && outputForm !== "aggregate";
  if (linkAmbiguous && (!facts.known || facts.hasEntityIds) && answers.linkage === undefined) unresolved.push(QUESTIONS.linkage!);
  if (facts.hasTimestamps && !resolution.time && TIME_TOPIC.test(a.norm) && answers.time_resolution === undefined) unresolved.push(QUESTIONS.time_resolution!);

  const draft: GoalSpecDraft = {
    version: 1,
    rawText: text,
    task: { kind, description: describeTask(text, kind, measures) },
    recipient: { description: recipientDesc || TRUST_LABEL[trust], trustLevel: trust },
    outputForm,
    measures,
    groupings: groupingsOut,
    resolution,
    requiredFields: required,
    linkage,
    textNeed,
    exclusions,
    threatAssumptions: threats,
    unresolved,
    provenance: { interpreter: "heuristic", version: HEURISTIC_VERSION, ...(scenario ? { scenarioMatch: match!.id } : {}), notes },
  };
  let spec = withGoalId(draft);
  if (ctx.previous) spec = keepUserEdits(spec, ctx.previous, answers);
  return spec;
}

function defaultThreats(trust: TrustLevel, kind: TaskKind, norm: string): string[] {
  const t: string[] = [];
  switch (trust) {
    case "public": t.push("anyone can download the release and link it with public sources", "differencing between releases"); break;
    case "contractual": t.push("recipient staff or a breach at the recipient may see all shared data", "insider linkage with leaked or public lists"); break;
    case "controlled_research": t.push("researchers may attempt record linkage on quasi-identifiers with public data"); break;
    case "internal": t.push("curious colleagues with insider knowledge"); break;
  }
  if (kind === "model_training") t.push("models can memorise and regurgitate verbatim identifiers or rare records");
  if (/outside (the )?eu|non-eu|cloud/u.test(norm)) t.push("processing may happen outside the EU");
  return t;
}

/** When the same text is re-interpreted, fields the user edited in the previous spec are kept. */
export function keepUserEdits(fresh: GoalSpec, previous: GoalSpec, answers: Record<string, string>): GoalSpec {
  if (normalizeText(previous.rawText) !== normalizeText(fresh.rawText)) return fresh;
  const answeredKeys = new Set(Object.keys(answers).flatMap((q) => QUESTION_TOPKEY[q] ?? []));
  const out = { ...fresh } as Record<string, unknown>;
  const kept: string[] = [];
  for (const k of EDITABLE_KEYS) {
    if (answeredKeys.has(k)) continue;
    const p = (previous as Record<string, unknown>)[k];
    if (p !== undefined && stableStringify(p) !== stableStringify(out[k])) { out[k] = p; kept.push(k); }
  }
  if (!kept.length) return fresh;
  const editedQ = new Set(Object.entries(QUESTION_TOPKEY).filter(([, keys]) => keys.some((k) => kept.includes(k))).map(([q]) => q));
  const spec = { ...(out as GoalSpec), unresolved: fresh.unresolved.filter((q) => !editedQ.has(q.id)) };
  spec.provenance = { ...fresh.provenance, notes: [...fresh.provenance.notes, `kept your edits: ${kept.join(", ")}`] };
  return withGoalId(spec);
}

/** Apply question answers to a finished spec (used after an LLM merge so user answers always win). */
export function applyAnswersToSpec(spec: GoalSpec, answers: Record<string, string>): GoalSpec {
  if (!Object.keys(answers).length) return spec;
  const out: GoalSpec = { ...spec, recipient: { ...spec.recipient }, resolution: { ...spec.resolution } };
  if (answers.recipient && (TRUST_LEVELS as readonly string[]).includes(answers.recipient)) out.recipient.trustLevel = answers.recipient as TrustLevel;
  if (answers.text_need && (TEXT_NEEDS as readonly string[]).includes(answers.text_need)) out.textNeed = answers.text_need as TextNeed;
  if (answers.linkage && ["none", "within_table", "across_tables"].includes(answers.linkage)) out.linkage = answers.linkage as GoalSpec["linkage"];
  if (answers.time_resolution && (TIME_RESOLUTIONS as readonly string[]).includes(answers.time_resolution)) out.resolution.time = answers.time_resolution as TimeResolution;
  out.unresolved = spec.unresolved.filter((q) => answers[q.id] === undefined);
  return withGoalId(out);
}

export { SCENARIO_META };
