/**
 * LlmGoalInterpreter: provider-agnostic adapter. Sends only the goal text, the GoalSpec field schema and a
 * column summary (table, column, type, detected role/subtype; never cell values) to a configurable endpoint,
 * validates the JSON answer field by field against GoalSpecSchema and merges it over the heuristic result.
 * Any failure falls back to the heuristic spec with a provenance note "llm unavailable: ...".
 */
import type { GoalSpec } from "@/contracts";
import { GoalSpecSchema, LOCATION_RESOLUTIONS, OUTPUT_FORMS, TASK_KINDS, TEXT_NEEDS, TIME_RESOLUTIONS, TRUST_LEVELS } from "@/contracts";
import type { GoalContext, GoalInterpreter } from "./types";
import { HeuristicGoalInterpreter, applyAnswersToSpec, keepUserEdits } from "./heuristic";
import { withGoalId } from "./spec";

export const LLM_INTERPRETER_VERSION = "1.0.0";

export type LlmProvider = "generic" | "openai" | "gemini";

export interface LlmGoalConfig {
  /** URL to POST to. For Gemini, "{model}" in the URL is replaced by the model name. */
  endpoint: string;
  apiKey?: string;
  model: string;
  /** request/response shape; default "generic" */
  provider?: LlmProvider;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** injectable fetch (tests, proxies); defaults to globalThis.fetch */
  fetch?: typeof fetch;
}

const LLM_FIELDS = ["task", "recipient", "outputForm", "measures", "groupings", "resolution", "requiredFields", "linkage", "textNeed", "exclusions", "threatAssumptions", "unresolved"] as const;
type LlmField = (typeof LLM_FIELDS)[number];

export const LLM_INSTRUCTIONS = [
  "You turn a data-sharing request into a GoalSpec JSON object for a privacy tool. Answer with JSON only.",
  "Fields (omit any you cannot infer; never invent column names that are not in the column list):",
  `task: {kind: one of ${TASK_KINDS.join("|")}, description: short phrase}`,
  `recipient: {description: who receives the data, trustLevel: one of ${TRUST_LEVELS.join("|")}}`,
  `outputForm: one of ${OUTPUT_FORMS.join("|")} (aggregate for published statistics, text_corpus when the purpose is about text)`,
  "measures: list of analyses in plain words (e.g. 'handle time by intent')",
  "groupings: column names the analysis groups or filters by; requiredFields: column names the analysis needs",
  `resolution: {time?: ${TIME_RESOLUTIONS.join("|")}, location?: ${LOCATION_RESOLUTIONS.join("|")}, ageBandYears?: integer}`,
  "linkage: none|within_table|across_tables (must rows of the same person stay linkable, and across tables?)",
  `textNeed: ${TEXT_NEEDS.join("|")} (verbatim_evidence for audits, fluent for model or chatbot training, topic_only for topic mining)`,
  "exclusions: e.g. ['special_category'] when health or other Art. 9 data must not reach the recipient",
  "threatAssumptions: short phrases about who might try to re-identify people",
  "unresolved: questions [{id, question, affects, options:[{value,label}]}] only when the answer changes the protection",
  "A draft from a rule-based interpreter is included; correct it where the text says otherwise. Goal wording never grants permission.",
].join("\n");

export interface LlmRequest { url: string; init: { method: "POST"; headers: Record<string, string>; body: string } }

/** Schema-level summary of the dataset: names, types and detected roles only. */
export function columnSummary(ctx: GoalContext): { table: string; column: string; type: string; role?: string; subtype?: string }[] {
  if (!ctx.manifest) return [];
  const det = new Map((ctx.detections?.fields ?? []).map((d) => [`${d.ref.table}.${d.ref.column}`, d]));
  return ctx.manifest.tables.flatMap((t) => t.columns.map((c) => {
    const d = det.get(`${t.name}.${c.name}`);
    return { table: t.name, column: c.name, type: c.inferredType, ...(d ? { role: d.role, subtype: d.subtype } : {}) };
  }));
}

export function buildLlmRequest(config: LlmGoalConfig, text: string, ctx: GoalContext, draft: GoalSpec): LlmRequest {
  const provider = config.provider ?? "generic";
  const draftFields = Object.fromEntries(LLM_FIELDS.map((k) => [k, draft[k]]));
  const input = { text, columns: columnSummary(ctx), draft: draftFields, answers: ctx.answers ?? {} };
  const headers: Record<string, string> = { "content-type": "application/json", ...(config.headers ?? {}) };
  switch (provider) {
    case "gemini": {
      if (config.apiKey) headers["x-goog-api-key"] = config.apiKey;
      return {
        url: config.endpoint.replace("{model}", encodeURIComponent(config.model)),
        init: { method: "POST", headers, body: JSON.stringify({
          systemInstruction: { parts: [{ text: LLM_INSTRUCTIONS }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }) },
      };
    }
    case "openai": {
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      return {
        url: config.endpoint,
        init: { method: "POST", headers, body: JSON.stringify({
          model: config.model, temperature: 0, response_format: { type: "json_object" },
          messages: [{ role: "system", content: LLM_INSTRUCTIONS }, { role: "user", content: JSON.stringify(input) }],
        }) },
      };
    }
    default: {
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
      return { url: config.endpoint, init: { method: "POST", headers, body: JSON.stringify({ model: config.model, instructions: LLM_INSTRUCTIONS, input }) } };
    }
  }
}

function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

/** Pull the JSON answer out of a provider response body. */
export function extractLlmAnswer(provider: LlmProvider, body: unknown): Record<string, unknown> {
  let content: unknown = body;
  const b = body as Record<string, any>;
  if (provider === "gemini") content = b?.candidates?.[0]?.content?.parts?.[0]?.text;
  else if (provider === "openai") content = b?.choices?.[0]?.message?.content;
  else if (b && typeof b === "object") content = b.spec ?? b.output ?? b.goal ?? b;
  if (typeof content === "string") content = JSON.parse(stripFences(content));
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("answer is not a JSON object");
  return content as Record<string, unknown>;
}

/** Merge validated LLM fields over the base spec; invalid fields are dropped with a note. */
export function mergeLlmAnswer(base: GoalSpec, answer: Record<string, unknown>, model: string): GoalSpec {
  const shape = GoalSpecSchema.shape;
  const merged: Record<string, unknown> = { ...base };
  const used: string[] = [];
  const dropped: string[] = [];
  for (const k of LLM_FIELDS) {
    if (!(k in answer)) continue;
    let value = answer[k];
    if ((k === "task" || k === "recipient" || k === "resolution") && value && typeof value === "object") value = { ...(base[k] as object), ...(value as object) };
    const parsed = (shape[k as LlmField] as unknown as { safeParse: (v: unknown) => { success: boolean; data?: unknown } }).safeParse(value);
    if (parsed.success) { merged[k] = parsed.data; used.push(k); } else dropped.push(k);
  }
  const notes = [...base.provenance.notes, `llm (${model}) set: ${used.join(", ") || "nothing"}`];
  if (dropped.length) notes.push(`llm answer failed validation for: ${dropped.join(", ")} (heuristic values kept)`);
  merged.provenance = { ...base.provenance, interpreter: "llm", version: LLM_INTERPRETER_VERSION, notes };
  delete merged.embedding;
  return GoalSpecSchema.parse(withGoalId(merged as GoalSpec));
}

export class LlmGoalInterpreter implements GoalInterpreter {
  readonly id = "llm";
  readonly version = LLM_INTERPRETER_VERSION;
  constructor(private readonly config: LlmGoalConfig, private readonly fallback: GoalInterpreter = new HeuristicGoalInterpreter()) {}

  async interpret(text: string, ctx: GoalContext): Promise<GoalSpec> {
    const { previous, ...rest } = ctx;
    const base = await this.fallback.interpret(text, rest);
    let spec: GoalSpec;
    try {
      const doFetch = this.config.fetch ?? globalThis.fetch;
      if (!doFetch) throw new Error("fetch is not available");
      const req = buildLlmRequest(this.config, text, ctx, base);
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), this.config.timeoutMs ?? 20000) : undefined;
      let res: Response;
      try { res = await doFetch(req.url, { ...req.init, signal: ctrl?.signal }); } finally { if (timer) clearTimeout(timer); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const answer = extractLlmAnswer(this.config.provider ?? "generic", await res.json());
      spec = applyAnswersToSpec(mergeLlmAnswer(base, answer, this.config.model), ctx.answers ?? {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      spec = { ...base, provenance: { ...base.provenance, notes: [...base.provenance.notes, `llm unavailable: ${msg}; heuristic interpretation used`] } };
    }
    return previous ? keepUserEdits(spec, previous, ctx.answers ?? {}) : spec;
  }
}
