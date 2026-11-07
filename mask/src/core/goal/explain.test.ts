import { describe, expect, it } from "vitest";
import { GOAL_FIELD_OPTIONS, explainGoal } from "./explain";
import { interpretGoalText } from "./heuristic";
import { SCENARIO_GOALS } from "./scenarios";

describe("explainGoal", () => {
  it("summarises a short request in plain lines", () => {
    const lines = explainGoal(interpretGoalText("Find contact reason trends with our cloud AI vendor", { answers: {} }));
    expect(lines).toContain("Recipient: cloud AI vendor (contractual)");
    expect(lines).toContain("Text: topic only, identifiers become placeholders");
    expect(lines).toContain("Linkage: not needed");
    expect(lines).toContain("Time: rounded to the hour");
    expect(lines.some((l) => l.startsWith("Task: find contact reason trends"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Scenario: CS-S1"))).toBe(true);
  });

  it("explains every scenario without throwing", () => {
    for (const g of Object.values(SCENARIO_GOALS)) expect(explainGoal(g).length).toBeGreaterThanOrEqual(5);
  });

  it("lists editable fields with options for the enums", () => {
    const trust = GOAL_FIELD_OPTIONS.find((f) => f.path === "recipient.trustLevel")!;
    expect(trust.options!.map((o) => o.value)).toEqual(["internal", "contractual", "controlled_research", "public"]);
    expect(GOAL_FIELD_OPTIONS.find((f) => f.path === "resolution.time")!.options).toHaveLength(8);
  });
});
