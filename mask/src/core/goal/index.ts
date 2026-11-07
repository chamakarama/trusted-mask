import type { GoalEmbedder, GoalInterpreter } from "./types";
import { HeuristicGoalInterpreter } from "./heuristic";
import { LlmGoalInterpreter, type LlmGoalConfig } from "./llm";
import { HashedBowEmbedder } from "./embedder";

export * from "./types";
export { HeuristicGoalInterpreter, HEURISTIC_VERSION, QUESTIONS, interpretGoalText, applyAnswersToSpec } from "./heuristic";
export { LlmGoalInterpreter, LLM_INTERPRETER_VERSION, buildLlmRequest, extractLlmAnswer, mergeLlmAnswer, columnSummary, type LlmGoalConfig, type LlmProvider } from "./llm";
export { HashedBowEmbedder, HASHED_BOW_MODEL, HASHED_BOW_DIMS, hashedBowEmbed, fnv1a32, cosine } from "./embedder";
export { explainGoal, GOAL_FIELD_OPTIONS, type GoalFieldOption } from "./explain";
export { SCENARIO_GOALS, SCENARIO_TEXTS, SCENARIO_META, SCENARIO_IDS, type ScenarioMeta, type ScenarioDataset } from "./scenarios";
export { matchScenario, scoreScenarios } from "./match";
export { goalIdOf, withGoalId } from "./spec";

/** LLM interpreter only when an endpoint is configured; otherwise the deterministic heuristic one. */
export function createGoalInterpreter(config?: Partial<LlmGoalConfig>): GoalInterpreter {
  if (config?.endpoint) return new LlmGoalInterpreter({ model: "default", ...config, endpoint: config.endpoint });
  return new HeuristicGoalInterpreter();
}

/** Deterministic hashed bag-of-words embedder (hashed-bow-v1, 256 dims); never null so embeddings exist offline. */
export async function createGoalEmbedder(): Promise<GoalEmbedder | null> {
  return new HashedBowEmbedder();
}
