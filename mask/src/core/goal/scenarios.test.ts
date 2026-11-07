import { describe, expect, it } from "vitest";
import { GoalSpecSchema } from "@/contracts";
import { SCENARIO_GOALS, SCENARIO_IDS, SCENARIO_TEXTS } from "./scenarios";
import { goalIdOf } from "./spec";
import { interpretGoalText } from "./heuristic";

describe("SCENARIO_GOALS", () => {
  it("covers all 27 proving-ground scenarios", () => {
    expect(SCENARIO_IDS).toHaveLength(27);
    expect(Object.keys(SCENARIO_GOALS).sort()).toEqual([...SCENARIO_IDS].sort());
  });

  it.each(SCENARIO_IDS)("%s is a valid GoalSpec with a content goalId", (id) => {
    const g = SCENARIO_GOALS[id]!;
    expect(GoalSpecSchema.parse(g)).toBeTruthy();
    expect(g.goalId).toBe(goalIdOf(g));
    expect(g.provenance.scenarioMatch).toBe(id);
    expect(g.unresolved).toEqual([]);
    expect(g.measures.length).toBeGreaterThan(0);
    expect(g.requiredFields.length).toBeGreaterThan(0);
  });

  it("goalId ignores rawText, embedding and provenance", () => {
    const g = SCENARIO_GOALS["CS-S1"]!;
    expect(goalIdOf({ ...g, rawText: "other", provenance: { interpreter: "x", version: "9", notes: [] }, embedding: { model: "m", dims: 1, vector: [1] } })).toBe(g.goalId);
    expect(goalIdOf({ ...g, linkage: "across_tables" })).not.toBe(g.goalId);
  });

  it("maps the key scenario facts the selector depends on", () => {
    const g = SCENARIO_GOALS;
    expect(g["CS-S1"]!.resolution.time).toBe("hour");
    expect(g["CS-S1"]!.exclusions).toContain("special_category");
    expect(g["CS-S3"]!.textNeed).toBe("verbatim_evidence");
    expect(g["CS-S3"]!.resolution.time).toBe("week");
    expect(g["CS-S2"]!.textNeed).toBe("fluent");
    expect(g["HEALTH-S2"]!.outputForm).toBe("aggregate");
    expect(g["FIN-S1"]!.linkage).toBe("across_tables");
    expect(g["ENERGY-S2"]!.resolution.location).toBe("postcode3");
    expect(g["HEALTH-S1"]!.resolution).toMatchObject({ time: "week", ageBandYears: 10 });
  });

  it("has three distinct paraphrases per scenario", () => {
    for (const id of SCENARIO_IDS) {
      const t = SCENARIO_TEXTS[id]!;
      expect(t).toHaveLength(3);
      expect(new Set(t).size).toBe(3);
    }
  });
});

describe("paraphrases interpret to their scenario", () => {
  const rows = SCENARIO_IDS.flatMap((id) => SCENARIO_TEXTS[id]!.map((text) => ({ id, text })));

  function misses(holdOut: boolean): string[] {
    const out: string[] = [];
    for (const { id, text } of rows) {
      const s = interpretGoalText(text, { answers: {} }, { holdOutExactText: holdOut });
      const g = SCENARIO_GOALS[id]!;
      if (s.provenance.scenarioMatch !== id || s.recipient.trustLevel !== g.recipient.trustLevel || s.task.kind !== g.task.kind) {
        out.push(`${id}: "${text}" → ${s.provenance.scenarioMatch} ${s.recipient.trustLevel}/${s.task.kind}`);
      }
    }
    return out;
  }

  it("leave-one-out (the paraphrase itself is not in the corpus): at most 3 misses", () => {
    // Documented: currently 0 of 81 miss. Allowed budget is 3.
    const m = misses(true);
    expect(m, m.join("\n")).toHaveLength(0);
    expect(m.length).toBeLessThanOrEqual(3);
  });

  it("with the full corpus: no misses", () => {
    expect(misses(false)).toEqual([]);
  });

  it("trust level and task kind come from the text itself, not only from the scenario fill", () => {
    let fromText = 0;
    for (const { id, text } of rows) {
      const s = interpretGoalText(text, { answers: {} }, { scenarioMatching: false });
      const g = SCENARIO_GOALS[id]!;
      if (s.recipient.trustLevel === g.recipient.trustLevel && s.task.kind === g.task.kind) fromText++;
    }
    // without any scenario help most paraphrases are still read correctly
    expect(fromText).toBeGreaterThanOrEqual(70);
  });
});
