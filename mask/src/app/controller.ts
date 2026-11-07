/**
 * Orchestrates the pipeline: import → profile → interpret → propose → execute → evaluate → export.
 * Each step is tagged; the reducer discards results whose tag or plan hash is no longer current.
 */
import type { DecisionOverride, GoalSpec, ImportFile, TrustLevel } from "@/contracts";
import { TRUST_LEVELS } from "@/contracts";
import { hashOf } from "@/core/util/hash";
import type { Backend } from "./backend/types";
import { isSuperseded } from "./backend/types";
import type { Store } from "./store/store";
import type { Step } from "./store/state";
import { goalReady } from "./store/state";
import { downloadFiles } from "./lib/download";
import { TRUST_LABEL } from "./lib/labels";

const SAMPLE_FILES = ["customers.csv", "conversations.csv", "turns.csv"];
const SAMPLE_BASE = "/samples/customer_service_small/";
export const FALLBACK_INTERPRETER = "mask-ui-fallback";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Recompute the goal id over the structured content after a local edit. */
export function rehashGoal(g: GoalSpec): GoalSpec {
  const { task, recipient, outputForm, measures, groupings, resolution, requiredFields, linkage, textNeed, exclusions } = g;
  return { ...g, goalId: hashOf({ task, recipient, outputForm, measures, groupings, resolution, requiredFields, linkage, textNeed, exclusions }).slice(0, 16) };
}

/** Used only when the goal interpreter is unavailable: conservative defaults plus one question. */
export function fallbackGoal(text: string): GoalSpec {
  return rehashGoal({
    version: 1, goalId: "", rawText: text,
    task: { kind: "other", description: text.trim().slice(0, 160) },
    recipient: { description: "Not stated", trustLevel: "contractual" },
    outputForm: "row_level", measures: [], groupings: [], resolution: {}, requiredFields: [],
    linkage: "within_table", textNeed: "topic_only", exclusions: [], threatAssumptions: [],
    unresolved: [{
      id: "fallback_recipient", question: "Who will receive the data?", affects: ["recipient.trustLevel"],
      options: TRUST_LEVELS.map((t) => ({ value: t, label: TRUST_LABEL[t] })),
    }],
    provenance: { interpreter: FALLBACK_INTERPRETER, version: "1", notes: ["interpreter unavailable; defaults set by the interface"] },
  });
}

export class Controller {
  private seq = 0;
  private lastFiles: ImportFile[] = [];
  /** progress stages seen during the current step, for per-stage timing */
  private stageClock = new Map<string, { step: Step; first: number; last: number; events: number }>();

  /** Turn the stages seen during `step` into elapsed times: each stage runs until the next one starts or the step ends. */
  private flushStages(step: Step, end: number) {
    const seen = [...this.stageClock.entries()].filter(([, v]) => v.step === step).sort((a, b) => a[1].first - b[1].first);
    if (!seen.length) return;
    const timings: Record<string, { ms: number; events: number; step: Step }> = {};
    seen.forEach(([stage, v], i) => { timings[stage] = { ms: (seen[i + 1]?.[1].first ?? end) - v.first, events: v.events, step }; });
    for (const [stage] of seen) this.stageClock.delete(stage);
    this.dispatch({ type: "stageTimings", timings });
  }

  constructor(readonly store: Store, readonly backend: Backend) {
    backend.onProgress((p) => {
      const s = store.getState();
      const step = (["export", "evaluate", "execute", "propose", "profile", "import"] as Step[]).find((k) => s.pending[k] !== undefined);
      if (!step) return;
      const t = now();
      const clock = this.stageClock.get(p.stage);
      if (clock && clock.step === step) { clock.last = t; clock.events += 1; } else this.stageClock.set(p.stage, { step, first: t, last: t, events: 1 });
      store.dispatch({ type: "progress", step, tag: s.pending[step]!, progress: p });
    });
  }

  private get state() { return this.store.getState(); }
  private dispatch = (a: Parameters<Store["dispatch"]>[0]) => this.store.dispatch(a);

  /** Run one tagged step. Returns null when the result is stale, superseded or failed (failure is dispatched). */
  private async run<T>(step: Step, fn: () => Promise<T>): Promise<{ tag: number; value: T; ms: number } | null> {
    const tag = ++this.seq;
    this.dispatch({ type: "start", step, tag });
    const t0 = now();
    for (const [k, v] of this.stageClock) if (v.step === step) this.stageClock.delete(k);
    try {
      const value = await fn();
      if (this.state.pending[step] !== tag) return null;
      const end = now();
      this.flushStages(step, end);
      return { tag, value, ms: end - t0 };
    } catch (e) {
      if (isSuperseded(e)) return null;
      this.dispatch({ type: "failed", step, tag, message: errMsg(e) });
      return null;
    }
  }

  // ---------- data ----------
  async importFiles(input: (File | ImportFile)[]): Promise<void> {
    const files: ImportFile[] = await Promise.all(
      input.map(async (f) => ("data" in f ? f : { name: f.name, data: await f.arrayBuffer() })),
    );
    if (!files.length) return;
    // keep a copy for retry: the buffers are transferred to the worker
    this.lastFiles = files.map((f) => ({ name: f.name, data: f.data.slice(0) }));
    const r = await this.run("import", () => this.backend.importFiles(files));
    if (!r) return;
    this.dispatch({ type: "imported", tag: r.tag, manifest: r.value.manifest, errors: r.value.errors, ms: r.ms });
    await this.runProfile();
  }

  async loadSample(): Promise<void> {
    try {
      const files = await Promise.all(SAMPLE_FILES.map(async (name) => {
        const res = await fetch(SAMPLE_BASE + name);
        if (!res.ok) throw new Error(`${name}: ${res.status}`);
        return { name, data: await res.arrayBuffer() };
      }));
      await this.importFiles(files);
    } catch (e) {
      this.dispatch({ type: "note", id: `n-${++this.seq}`, text: `The sample data could not be loaded (${errMsg(e)}).`, tone: "error" });
    }
  }

  private async runProfile(): Promise<void> {
    const r = await this.run("profile", () => this.backend.profile());
    if (!r) return;
    this.dispatch({ type: "profiled", tag: r.tag, detections: r.value, ms: r.ms });
    const s = this.state;
    // re-read the goal with the schema now available, so field names can be matched
    if (s.goal && s.goal.provenance.interpreter !== FALLBACK_INTERPRETER) await this.interpret(s.goal.rawText, false);
    else if (goalReady(this.state)) await this.runPlan();
  }

  // ---------- goal ----------
  async submitGoal(text: string): Promise<void> {
    const t = text.trim();
    if (!t) return;
    this.dispatch({ type: "userMessage", id: `u-${++this.seq}`, text: t });
    await this.interpret(t, true);
  }

  private async interpret(text: string, fresh: boolean): Promise<void> {
    const s = this.state;
    const tag = ++this.seq;
    this.dispatch({ type: "start", step: "interpret", tag });
    const t0 = now();
    let goal: GoalSpec;
    let note: string | undefined;
    try {
      goal = await this.backend.interpret(text, {
        manifest: s.manifest ?? undefined, detections: s.detections ?? undefined, answers: s.answers, previous: fresh ? undefined : s.goal ?? undefined,
      });
    } catch (e) {
      if (this.state.pending.interpret !== tag) return;
      const prev = this.state.goal;
      goal = prev && prev.rawText === text ? prev : fallbackGoal(text);
      note = `I could not interpret this automatically (${errMsg(e)}). I set cautious defaults below; adjust anything that is wrong.`;
    }
    if (this.state.pending.interpret !== tag) return;
    this.dispatch({ type: "interpreted", tag, goal, ms: now() - t0, note });
    if (goalReady(this.state) && this.state.detections && !this.state.pending.profile) await this.runPlan();
  }

  async answer(questionId: string, value: string): Promise<void> {
    const g = this.state.goal;
    if (!g) return;
    this.dispatch({ type: "answer", questionId, value });
    if (g.provenance.interpreter === FALLBACK_INTERPRETER) {
      const q = g.unresolved.find((u) => u.id === questionId);
      let next: GoalSpec = { ...g, unresolved: g.unresolved.filter((u) => u.id !== questionId) };
      if (q?.affects.includes("recipient.trustLevel")) next = { ...next, recipient: { ...next.recipient, trustLevel: value as TrustLevel } };
      await this.editGoal(next);
      return;
    }
    await this.interpret(g.rawText, false);
  }

  async editGoal(goal: GoalSpec): Promise<void> {
    this.dispatch({ type: "goalEdited", goal: rehashGoal({ ...goal, provenance: { ...goal.provenance, notes: [...new Set([...goal.provenance.notes, "edited by the user"])] } }) });
    if (goalReady(this.state) && this.state.detections) await this.runPlan();
  }

  async acceptGoal(): Promise<void> {
    this.dispatch({ type: "acceptGoal" });
    if (this.state.detections) await this.runPlan();
  }

  // ---------- plan ----------
  async setOverride(o: DecisionOverride): Promise<void> {
    this.dispatch({ type: "setOverride", override: o });
    await this.runPlan();
  }
  async undo(): Promise<void> {
    if (!this.state.history.length) return;
    this.dispatch({ type: "undo" });
    await this.runPlan();
  }
  async resetOverrides(): Promise<void> {
    if (!this.state.overrides.length) return;
    this.dispatch({ type: "resetOverrides" });
    await this.runPlan();
  }
  async setSelector(selectorId: "policy" | "learned"): Promise<void> {
    this.dispatch({ type: "setSelector", selectorId });
    if (this.state.proposal) await this.runPlan();
  }

  async runPlan(): Promise<void> {
    const s = this.state;
    if (!s.goal || !s.detections) return;
    const p = await this.run("propose", () => this.backend.propose(s.goal!, s.selectorId, s.overrides));
    if (!p) return;
    this.dispatch({ type: "proposed", tag: p.tag, proposal: p.value, ms: p.ms });
    const planHash = p.value.planHash;
    const e = await this.run("execute", () => this.backend.execute(planHash));
    if (!e) return;
    this.dispatch({ type: "executed", tag: e.tag, executed: e.value, ms: e.ms });
    if (this.state.executed?.planHash !== planHash) return;
    const v = await this.run("evaluate", () => this.backend.evaluate(planHash));
    if (!v) return;
    this.dispatch({ type: "evaluated", tag: v.tag, evaluation: v.value, ms: v.ms });
  }

  async loadModel(url: string): Promise<void> {
    const r = await this.run("model", () => this.backend.loadModel(url));
    if (!r) return;
    this.dispatch({ type: "modelLoaded", tag: r.tag, modelId: r.value.modelId, registryVersion: r.value.registryVersion });
  }

  // ---------- export ----------
  async exportNow(): Promise<void> {
    const s = this.state;
    if (!s.proposal) return;
    const planHash = s.proposal.planHash;
    const r = await this.run("export", () => this.backend.exportPlan(planHash));
    if (!r) return;
    const files = r.value.files.map((f) => ({ name: f.name, bytes: f.data.byteLength, mime: f.mime }));
    this.dispatch({ type: "exported", tag: r.tag, result: { receipt: r.value.receipt, files, planHash }, ms: r.ms });
    if (this.state.exported?.planHash === planHash) downloadFiles(r.value.files);
  }

  // ---------- recovery ----------
  cancel(): void { this.dispatch({ type: "cancel" }); }

  async retry(): Promise<void> {
    const step = this.state.failedStep;
    if (step === "import" && this.lastFiles.length) return this.importFiles(this.lastFiles.map((f) => ({ name: f.name, data: f.data.slice(0) })));
    if (step === "profile") return this.runProfile();
    if (step === "export") return this.exportNow();
    if (step === "propose" || step === "execute" || step === "evaluate") return this.runPlan();
  }

  startOver(): void { this.dispatch({ type: "reset" }); }
}
