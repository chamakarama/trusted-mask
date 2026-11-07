// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import { Controller } from "./controller";
import { createStore } from "./store/store";
import { initialState } from "./store/state";
import { FixtureBackend } from "./dev/fixtureSession";
import { startFixtureSession } from "./boot";
import type { Backend } from "./backend/types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  Element.prototype.scrollTo = function () {} as never;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null; host = null; });

function mount(c: Controller) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<App controller={c} />));
  return host;
}
const settle = async () => { for (let i = 0; i < 20; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const text = () => host!.textContent ?? "";

describe("App", () => {
  it("renders the empty state with a drop zone, file picker and sample data", () => {
    const c = new Controller(createStore(initialState("worker")), new FixtureBackend() as Backend);
    mount(c);
    expect(text()).toContain("Drop CSV files here");
    expect(host!.querySelector("input[type=file][multiple]")).not.toBeNull();
    const buttons = [...host!.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toContain("Choose files");
    expect(buttons).toContain("Try sample data");
    expect(host!.querySelector("textarea#goal-input")).not.toBeNull();
    expect(text()).not.toContain("Development fixture");
  });

  it("renders the fixture session with banner, tables, interpretation and labelled checks", async () => {
    const c = new Controller(createStore(initialState("fixture")), new FixtureBackend());
    mount(c);
    await act(async () => { await startFixtureSession(c); });
    await settle();
    expect(text()).toContain("Development fixture: nothing here is measured.");
    expect(c.store.getState().phase).toBe("needs_input");
    const answer = [...host!.querySelectorAll("button")].find((b) => b.textContent === "Yes, link contacts")!;
    await act(async () => { answer.click(); });
    await settle();
    const s = c.store.getState();
    expect(s.phase).toBe("review_ready");
    for (const t of ["customers", "conversations", "turns"]) expect(host!.querySelector(`#tab-${t}`)).not.toBeNull();
    expect(text()).toContain("Interpretation");
    expect(text()).toContain("Policy baseline");
    // risk and utility are separate labelled items; unsupported is stated, not shown as zero
    expect(text()).toContain("Direct identifiers kept");
    expect(text()).toContain("Joins preserved");
    expect(text()).toContain("Leakage against independent labels");
    expect(text()).toContain("not supported");
    expect(text()).toContain("Attribute inference via a leaked customer list");
    expect(text()).toContain("Benchmark not available for this upload");
    const exportBtn = [...host!.querySelectorAll("button")].find((b) => b.textContent?.includes("Confirm and export")) as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(false);
    expect(host!.querySelector("[role=grid]")).not.toBeNull();
  });

  it("editing the goal card re-proposes and changes the plan", async () => {
    const c = new Controller(createStore(initialState("fixture")), new FixtureBackend());
    mount(c);
    await act(async () => { await startFixtureSession(c); await c.answer("repeat_contacts", "yes"); });
    await settle();
    const before = c.store.getState();
    expect(before.phase).toBe("review_ready");
    const time = host!.querySelector<HTMLSelectElement>("#gc-time")!;
    expect(time.value).toBe("hour");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(time, "day");
      time.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    const after = c.store.getState();
    expect(after.goal?.resolution.time).toBe("day");
    expect(after.goal?.goalId).not.toBe(before.goal?.goalId);
    expect(after.proposal?.planHash).not.toBe(before.proposal?.planHash);
    const ts = after.proposal?.decisions.find((d) => d.unitId === "f:conversations.started_ts");
    expect(ts?.selected?.params.resolution).toBe("day");
    expect(after.phase).toBe("review_ready");
    expect(after.evaluation?.planHash).toBe(after.proposal?.planHash);
  });

  it("an override keeps previous results visible while updating, then undo restores the plan", async () => {
    const c = new Controller(createStore(initialState("fixture")), new FixtureBackend());
    mount(c);
    await act(async () => { await startFixtureSession(c); await c.answer("repeat_contacts", "yes"); });
    await settle();
    const base = c.store.getState().proposal!.planHash;
    let during: string | undefined;
    const unsub = c.store.subscribe(() => { if (c.store.getState().phase === "updating") during ??= c.store.getState().evaluation?.planHash; });
    await act(async () => { await c.setOverride({ unitId: "f:customers.postcode", recipeId: "generalize_postcode", params: { digits: "2" } }); });
    unsub();
    expect(during).toBe(base);
    const edited = c.store.getState();
    expect(edited.proposal!.planHash).not.toBe(base);
    expect(edited.evaluation!.metrics.find((m) => m.id === "k_anonymity")?.passed).toBe(true);
    await act(async () => { await c.undo(); });
    expect(c.store.getState().proposal!.planHash).toBe(base);
  });
});
