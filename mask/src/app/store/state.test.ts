import { describe, expect, it } from "vitest";
import { reducer, initialState, canExport, type AppState, type Action } from "./state";
import { fixtureDetections, fixtureGoal, fixtureManifest, FixtureBackend } from "../dev/fixtureSession";

const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);

async function reviewed(): Promise<AppState> {
  const b = new FixtureBackend();
  const goal = fixtureGoal("x", { repeat_contacts: "yes" });
  const proposal = await b.propose(goal, "policy", []);
  const executed = await b.execute(proposal.planHash);
  const evaluation = await b.evaluate(proposal.planHash);
  return run(initialState("fixture"),
    { type: "start", step: "import", tag: 1 }, { type: "imported", tag: 1, manifest: fixtureManifest, errors: [], ms: 1 },
    { type: "start", step: "profile", tag: 2 }, { type: "profiled", tag: 2, detections: fixtureDetections, ms: 1 },
    { type: "start", step: "interpret", tag: 3 }, { type: "interpreted", tag: 3, goal, ms: 1 },
    { type: "start", step: "propose", tag: 4 }, { type: "proposed", tag: 4, proposal, ms: 1 },
    { type: "start", step: "execute", tag: 5 }, { type: "executed", tag: 5, executed },
    { type: "start", step: "evaluate", tag: 6 }, { type: "evaluated", tag: 6, evaluation, ms: 1 },
  );
}

describe("phase state machine", () => {
  it("walks import → profiling → needs_input when no goal", () => {
    let s = run(initialState(), { type: "start", step: "import", tag: 1 });
    expect(s.phase).toBe("importing");
    s = run(s, { type: "imported", tag: 1, manifest: fixtureManifest, errors: [], ms: 1 }, { type: "start", step: "profile", tag: 2 });
    expect(s.phase).toBe("profiling");
    s = run(s, { type: "profiled", tag: 2, detections: fixtureDetections, ms: 1 });
    expect(s.phase).toBe("needs_input");
  });

  it("asks for input while the goal has unresolved questions", () => {
    const s = run(initialState(),
      { type: "start", step: "import", tag: 1 }, { type: "imported", tag: 1, manifest: fixtureManifest, errors: [], ms: 1 },
      { type: "start", step: "profile", tag: 2 }, { type: "profiled", tag: 2, detections: fixtureDetections, ms: 1 },
      { type: "start", step: "interpret", tag: 3 }, { type: "interpreted", tag: 3, goal: fixtureGoal("x", {}), ms: 1 });
    expect(s.goal?.unresolved.length).toBe(1);
    expect(s.phase).toBe("needs_input");
  });

  it("reaches review_ready, switches to the protected view and allows export", async () => {
    const s = await reviewed();
    expect(s.phase).toBe("review_ready");
    expect(s.view).toBe("protected");
    expect(s.evaluation?.hardFailures).toEqual([]);
    expect(canExport(s)).toBe(true);
  });

  it("discards a response whose tag is no longer the latest", async () => {
    const s0 = await reviewed();
    const b = new FixtureBackend();
    const older = await b.propose(fixtureGoal("older", { repeat_contacts: "no" }), "policy", []);
    const s1 = run(s0, { type: "start", step: "propose", tag: 10 }, { type: "start", step: "propose", tag: 11 });
    const s2 = reducer(s1, { type: "proposed", tag: 10, proposal: older, ms: 1 });
    expect(s2).toBe(s1);
    expect(s2.proposal?.planHash).toBe(s0.proposal?.planHash);
  });

  it("discards execute/evaluate results for a plan hash that is not the current proposal", async () => {
    const s0 = await reviewed();
    const s1 = run(s0, { type: "start", step: "execute", tag: 20 },
      { type: "executed", tag: 20, executed: { ...s0.executed!, planHash: "stale" } });
    expect(s1.executed).toBe(s0.executed);
    expect(s1.pending.execute).toBeUndefined();
    const s2 = run(s1, { type: "start", step: "evaluate", tag: 21 },
      { type: "evaluated", tag: 21, evaluation: { ...s0.evaluation!, planHash: "stale", evaluationId: "new" }, ms: 1 });
    expect(s2.evaluation?.evaluationId).toBe(s0.evaluation?.evaluationId);
  });

  it("disables export as soon as the plan is edited, and marks a finished export stale", async () => {
    const s0 = await reviewed();
    const exported = run(s0, { type: "start", step: "export", tag: 30 }, {
      type: "exported", tag: 30, ms: 1,
      result: { planHash: s0.proposal!.planHash, files: [], receipt: {} as never },
    });
    expect(exported.phase).toBe("complete");
    const edited = reducer(exported, { type: "setOverride", override: { unitId: "f:customers.postcode", recipeId: "suppress", params: {} } });
    expect(edited.phase).toBe("updating");
    expect(edited.exportStale).toBe(true);
    expect(canExport(edited)).toBe(false);
    expect(edited.history.length).toBe(1);
    const undone = reducer(edited, { type: "undo" });
    expect(undone.overrides).toEqual([]);
    expect(canExport(undone)).toBe(false);
  });

  it("blocks export while a hard failure is present", async () => {
    const s0 = await reviewed();
    const s1 = { ...s0, evaluation: { ...s0.evaluation!, hardFailures: ["Direct identifiers kept: 1"] } };
    expect(canExport(s1)).toBe(false);
  });

  it("cancel stops the in-flight step and ignores its result", () => {
    const s = run(initialState(), { type: "start", step: "import", tag: 1 }, { type: "cancel" });
    expect(s.phase).toBe("cancelled");
    expect(reducer(s, { type: "imported", tag: 1, manifest: fixtureManifest, errors: [], ms: 1 })).toBe(s);
  });

  it("a failure moves to failed with the step to retry", () => {
    const s = run(initialState(), { type: "start", step: "import", tag: 1 }, { type: "failed", step: "import", tag: 1, message: "boom" });
    expect(s.phase).toBe("failed");
    expect(s.failedStep).toBe("import");
    expect(s.error?.message).toBe("boom");
  });
});
