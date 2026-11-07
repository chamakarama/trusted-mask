import type { GoalInterpreter, GoalEmbedder } from "./types";
export * from "./types";
export function createGoalInterpreter(): GoalInterpreter {
  return { id: "stub", version: "0", interpret: async () => { throw new Error("GoalInterpreter.interpret is not implemented yet"); } };
}
/** Returns null when no embedding model is available in this environment. */
export async function createGoalEmbedder(): Promise<GoalEmbedder | null> { return null; }
