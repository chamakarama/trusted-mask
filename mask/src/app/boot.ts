import { createStore } from "./store/store";
import { initialState } from "./store/state";
import { Controller } from "./controller";
import { WorkerBackend } from "./backend/workerBackend";
import { FixtureBackend, FIXTURE_GOAL_TEXT } from "./dev/fixtureSession";

/** Build the controller for this page. `?dev=fixture` selects the development fixture backend. */
export function boot(search: string): Controller {
  const fixture = new URLSearchParams(search).get("dev") === "fixture";
  const store = createStore(initialState(fixture ? "fixture" : "worker"));
  const controller = new Controller(store, fixture ? new FixtureBackend() : new WorkerBackend());
  if (fixture) void startFixtureSession(controller);
  return controller;
}

export async function startFixtureSession(c: Controller): Promise<void> {
  await c.submitGoal(FIXTURE_GOAL_TEXT);
  await c.importFiles([{ name: "fixture.csv", data: new ArrayBuffer(0) }]);
}
