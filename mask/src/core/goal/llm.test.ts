import { describe, expect, it } from "vitest";
import { GoalSpecSchema } from "@/contracts";
import { LlmGoalInterpreter, buildLlmRequest, extractLlmAnswer, type LlmGoalConfig } from "./llm";
import { HeuristicGoalInterpreter } from "./heuristic";
import { createGoalInterpreter } from "./index";
import { CS_MANIFEST } from "./testkit";

const TEXT = "Find contact reason trends with our cloud AI vendor";

function fakeFetch(body: unknown, status = 200, seen: { url?: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe("createGoalInterpreter", () => {
  it("is heuristic without an endpoint and llm with one", () => {
    expect(createGoalInterpreter().id).toBe("heuristic");
    expect(createGoalInterpreter({ model: "x" }).id).toBe("heuristic");
    expect(createGoalInterpreter({ endpoint: "https://example.invalid/goal", model: "m" }).id).toBe("llm");
  });
});

describe("LlmGoalInterpreter", () => {
  it("merges a validated generic answer over the heuristic spec", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const cfg: LlmGoalConfig = { endpoint: "https://llm.test/goal", model: "m1", apiKey: "k", fetch: fakeFetch({ spec: { linkage: "within_table", measures: ["contact reason trends by month"], task: { kind: "topic_mining" } } }, 200, seen) };
    const s = await new LlmGoalInterpreter(cfg).interpret(TEXT, { answers: {}, manifest: CS_MANIFEST });
    expect(GoalSpecSchema.parse(s)).toBeTruthy();
    expect(s.provenance.interpreter).toBe("llm");
    expect(s.linkage).toBe("within_table");
    expect(s.measures).toEqual(["contact reason trends by month"]);
    expect(s.task.description).toBeTruthy(); // partial task merged with the heuristic description
    expect(s.recipient.trustLevel).toBe("contractual"); // heuristic value kept
    expect(s.provenance.scenarioMatch).toBe("CS-S1");
    const body = JSON.parse(String(seen[0]!.init!.body));
    expect(body.input.text).toBe(TEXT);
    expect(body.input.columns.some((c: { column: string }) => c.column === "intent")).toBe(true);
    // schema summary only: no statistics, no values
    expect(JSON.stringify(body.input.columns)).not.toContain("stats");
    expect((seen[0]!.init!.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("drops invalid fields with a note", async () => {
    const cfg: LlmGoalConfig = { endpoint: "https://llm.test", model: "m", fetch: fakeFetch({ textNeed: "everything", recipient: { trustLevel: "friends" }, outputForm: "aggregate" }) };
    const s = await new LlmGoalInterpreter(cfg).interpret(TEXT, { answers: {} });
    expect(s.textNeed).toBe("topic_only");
    expect(s.recipient.trustLevel).toBe("contractual");
    expect(s.outputForm).toBe("aggregate");
    expect(s.provenance.notes.some((n) => n.includes("failed validation for: recipient, textNeed"))).toBe(true);
  });

  it("falls back to the heuristic on HTTP errors, bad JSON and network failures", async () => {
    const h = await new HeuristicGoalInterpreter().interpret(TEXT, { answers: {} });
    for (const f of [fakeFetch({}, 500), fakeFetch({ output: "not json" }), (async () => { throw new Error("offline"); }) as unknown as typeof fetch]) {
      const s = await new LlmGoalInterpreter({ endpoint: "https://llm.test", model: "m", fetch: f }).interpret(TEXT, { answers: {} });
      expect(s.goalId).toBe(h.goalId);
      expect(s.provenance.interpreter).toBe("heuristic");
      expect(s.provenance.notes.some((n) => n.startsWith("llm unavailable:"))).toBe(true);
    }
  });

  it("user answers win over the llm answer", async () => {
    const cfg: LlmGoalConfig = { endpoint: "https://llm.test", model: "m", fetch: fakeFetch({ recipient: { trustLevel: "public" } }) };
    const s = await new LlmGoalInterpreter(cfg).interpret("Analyse handle time by channel", { answers: { recipient: "internal" }, manifest: CS_MANIFEST });
    expect(s.recipient.trustLevel).toBe("internal");
    expect(s.unresolved.find((q) => q.id === "recipient")).toBeUndefined();
  });

  it("builds Gemini generateContent and OpenAI-compatible requests", async () => {
    const draft = await new HeuristicGoalInterpreter().interpret(TEXT, { answers: {} });
    const g = buildLlmRequest({ endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", model: "gemini-2.0-flash", apiKey: "gk", provider: "gemini" }, TEXT, { answers: {} }, draft);
    expect(g.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    expect(g.init.headers["x-goog-api-key"]).toBe("gk");
    const gb = JSON.parse(g.init.body);
    expect(gb.generationConfig.responseMimeType).toBe("application/json");
    expect(gb.contents[0].parts[0].text).toContain(TEXT);
    expect(extractLlmAnswer("gemini", { candidates: [{ content: { parts: [{ text: "```json\n{\"linkage\":\"none\"}\n```" }] } }] })).toEqual({ linkage: "none" });

    const o = buildLlmRequest({ endpoint: "https://api.test/v1/chat/completions", model: "gpt", provider: "openai" }, TEXT, { answers: {} }, draft);
    const ob = JSON.parse(o.init.body);
    expect(ob.response_format).toEqual({ type: "json_object" });
    expect(ob.messages[1].content).toContain(TEXT);
    expect(extractLlmAnswer("openai", { choices: [{ message: { content: "{\"textNeed\":\"none\"}" } }] })).toEqual({ textNeed: "none" });
  });
});
