/**
 * App state and the phase state machine. Pure: no I/O. Every async result carries the tag of the request
 * it answers; results whose tag is not the latest for their step, or whose plan hash no longer matches the
 * current proposal, are discarded.
 */
import type {
  DatasetManifest, DecisionOverride, DetectionSet, Evaluation, ExportReceipt, GoalSpec, HighlightKind, OutputTableSummary,
  Phase, PrivacyRole, Proposal, RowSort, ViewMode,
} from "@/contracts";

export type Step = "import" | "profile" | "interpret" | "propose" | "execute" | "evaluate" | "export" | "model";

export interface ExecutedSummary { planHash: string; outputHash: string; tables: OutputTableSummary[]; durationMs: number }
export interface ExportResult { receipt: ExportReceipt; files: { name: string; bytes: number; mime: string }[]; planHash: string }
export interface Progress { stage: string; done: number; total: number; message?: string }

export type ThreadEntry =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "mask"; kind: "interpretation" }
  | { id: string; role: "mask"; kind: "note"; text: string; tone: "neutral" | "warn" | "error" };

export interface Filters {
  highlights: HighlightKind[];
  roles: PrivacyRole[];
  needsReview: boolean;
  onlyChanged: boolean;
  search: string;
}
export const EMPTY_FILTERS: Filters = { highlights: [], roles: [], needsReview: false, onlyChanged: false, search: "" };

export type Selection =
  | { kind: "column"; table: string; column: string; unitId: string | null }
  | { kind: "cell"; table: string; row: number; column: string; unitId: string | null; spanIndex?: number }
  | { kind: "unit"; unitId: string };

export type DevTab = "versions" | "decisions" | "coverage" | "benchmark" | "evaluation" | "originals" | "timing";

export interface AppState {
  phase: Phase;
  /** phase to return to after cancel/fail when the user retries */
  failedStep: Step | null;
  source: "worker" | "fixture";
  error: { step: Step; message: string } | null;
  progress: Progress | null;
  /** latest request tag per step; a result is applied only if its tag matches */
  pending: Partial<Record<Step, number>>;
  importErrors: string[];
  manifest: DatasetManifest | null;
  detections: DetectionSet | null;
  thread: ThreadEntry[];
  goal: GoalSpec | null;
  /** answers to the goal's unresolved questions, keyed by question id */
  answers: Record<string, string>;
  /** user chose to continue despite open questions */
  goalAccepted: boolean;
  selectorId: "policy" | "learned";
  model: { modelId: string; registryVersion: string } | null;
  proposal: Proposal | null;
  overrides: DecisionOverride[];
  /** undo stack: previous override lists */
  history: DecisionOverride[][];
  executed: ExecutedSummary | null;
  evaluation: Evaluation | null;
  exported: ExportResult | null;
  exportStale: boolean;
  view: ViewMode;
  activeTable: string | null;
  filters: Filters;
  metricFocus: string | null;
  sort: RowSort | null;
  selection: Selection | null;
  devOpen: boolean;
  devTab: DevTab;
  timings: Partial<Record<Step, number>>;
  /** per progress stage (worker stage names): elapsed ms between the step start and its last progress event */
  stageTimings: Record<string, { ms: number; events: number; step: Step }>;
  /** text for the polite live region */
  announce: string;
}

export const initialState = (source: AppState["source"] = "worker"): AppState => ({
  phase: "empty", failedStep: null, source, error: null, progress: null, pending: {}, importErrors: [],
  manifest: null, detections: null, thread: [], goal: null, answers: {}, goalAccepted: false,
  selectorId: "policy", model: null, proposal: null, overrides: [], history: [], executed: null, evaluation: null,
  exported: null, exportStale: false, view: "original", activeTable: null, filters: EMPTY_FILTERS, metricFocus: null,
  sort: null, selection: null, devOpen: false, devTab: "decisions", timings: {}, stageTimings: {}, announce: "",
});

export type Action =
  | { type: "start"; step: Step; tag: number }
  | { type: "progress"; step: Step; tag: number; progress: Progress }
  | { type: "imported"; tag: number; manifest: DatasetManifest; errors: string[]; ms: number }
  | { type: "profiled"; tag: number; detections: DetectionSet; ms: number }
  | { type: "interpreted"; tag: number; goal: GoalSpec; ms: number; note?: string }
  | { type: "proposed"; tag: number; proposal: Proposal; ms: number }
  | { type: "executed"; tag: number; executed: ExecutedSummary; ms?: number }
  | { type: "evaluated"; tag: number; evaluation: Evaluation; ms: number }
  | { type: "exported"; tag: number; result: ExportResult; ms: number }
  | { type: "failed"; step: Step; tag: number; message: string }
  | { type: "modelLoaded"; tag: number; modelId: string; registryVersion: string }
  | { type: "stageTimings"; timings: Record<string, { ms: number; events: number; step: Step }> }
  | { type: "cancel" }
  | { type: "userMessage"; id: string; text: string }
  | { type: "note"; id: string; text: string; tone: "neutral" | "warn" | "error" }
  | { type: "answer"; questionId: string; value: string }
  | { type: "goalEdited"; goal: GoalSpec }
  | { type: "acceptGoal" }
  | { type: "setOverride"; override: DecisionOverride }
  | { type: "undo" }
  | { type: "resetOverrides" }
  | { type: "setSelector"; selectorId: "policy" | "learned" }
  | { type: "setView"; view: ViewMode }
  | { type: "setTable"; table: string }
  | { type: "setFilters"; filters: Partial<Filters> }
  | { type: "clearFilters" }
  | { type: "focusMetric"; metricId: string | null }
  | { type: "setSort"; sort: RowSort | null }
  | { type: "select"; selection: Selection | null }
  | { type: "toggleDev"; open?: boolean; tab?: DevTab }
  | { type: "reset"; source?: AppState["source"] };

const STEP_PHASE: Record<Step, Phase | null> = {
  import: "importing", profile: "profiling", interpret: null, propose: "proposing", execute: "evaluating", evaluate: "evaluating", export: "exporting", model: null,
};

const PHASE_MESSAGE: Partial<Record<Phase, string>> = {
  importing: "Reading files", profiling: "Finding personal data", needs_input: "Waiting for your answer",
  proposing: "Choosing protections", evaluating: "Applying and measuring", review_ready: "Ready for review",
  updating: "Updating the plan", exporting: "Preparing download", complete: "Exported", failed: "Something went wrong", cancelled: "Stopped",
};

/** Is the goal complete enough to propose? */
export function goalReady(s: Pick<AppState, "goal" | "goalAccepted">): boolean {
  return !!s.goal && (s.goal.unresolved.length === 0 || s.goalAccepted);
}

/** Phase to show once work settles with nothing in flight. */
function settledPhase(s: AppState): Phase {
  if (!s.manifest) return "empty";
  if (s.evaluation && s.proposal && s.evaluation.planHash === s.proposal.planHash) return s.exported && !s.exportStale ? "complete" : "review_ready";
  return "needs_input";
}

function withPhase(s: AppState, phase: Phase): AppState {
  if (s.phase === phase) return s;
  return { ...s, phase, announce: PHASE_MESSAGE[phase] ?? s.announce };
}

/** True when the plan the user sees has changed since the last export. */
function invalidateExport(s: AppState): AppState {
  return s.exported ? { ...s, exportStale: true } : s;
}

const isCurrent = (s: AppState, step: Step, tag: number) => s.pending[step] === tag;
const clearPending = (s: AppState, step: Step): AppState => {
  const pending = { ...s.pending };
  delete pending[step];
  return { ...s, pending, progress: null };
};

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case "start": {
      const pending = { ...s.pending, [a.step]: a.tag };
      let next: AppState = { ...s, pending, error: null, failedStep: null, progress: null };
      let phase = STEP_PHASE[a.step];
      if (a.step === "import") {
        next = {
          ...next, manifest: null, detections: null, proposal: null, executed: null, evaluation: null, exported: null, exportStale: false,
          importErrors: [], activeTable: null, selection: null, filters: EMPTY_FILTERS, metricFocus: null, sort: null, view: "original",
          overrides: [], history: [],
        };
      }
      // a re-proposal while a reviewed plan exists keeps the old results visible (dimmed) in "updating"
      if ((a.step === "propose" || a.step === "execute" || a.step === "evaluate") && s.evaluation) phase = "updating";
      if (a.step === "export") next = { ...next, exportStale: false };
      return phase ? withPhase(next, phase) : next;
    }
    case "progress":
      if (!isCurrent(s, a.step, a.tag)) return s;
      return { ...s, progress: a.progress };
    case "imported": {
      if (!isCurrent(s, "import", a.tag)) return s;
      const next = clearPending(s, "import");
      return {
        ...next, manifest: a.manifest, importErrors: a.errors, activeTable: a.manifest.tables[0]?.name ?? null,
        timings: { ...s.timings, import: a.ms },
      };
    }
    case "profiled": {
      if (!isCurrent(s, "profile", a.tag)) return s;
      const next = { ...clearPending(s, "profile"), detections: a.detections, timings: { ...s.timings, profile: a.ms } };
      // the controller starts a proposal next if the goal is ready; otherwise we wait for the user
      return goalReady(next) ? next : withPhase(next, "needs_input");
    }
    case "interpreted": {
      if (!isCurrent(s, "interpret", a.tag)) return s;
      let next: AppState = {
        ...clearPending(s, "interpret"), goal: a.goal, goalAccepted: false, timings: { ...s.timings, interpret: a.ms },
      };
      const entry: ThreadEntry = { id: "interpretation", role: "mask", kind: "interpretation" };
      const thread = next.thread.filter((t) => !(t.role === "mask" && t.kind === "interpretation"));
      next = { ...next, thread: a.note ? [...thread, { id: `n-${a.tag}`, role: "mask", kind: "note", text: a.note, tone: "warn" }, entry] : [...thread, entry] };
      next = invalidateExport(next);
      if (next.detections && !goalReady(next) && !next.pending.import && !next.pending.profile) return withPhase(next, "needs_input");
      return next;
    }
    case "proposed": {
      if (!isCurrent(s, "propose", a.tag)) return s;
      return { ...clearPending(s, "propose"), proposal: a.proposal, timings: { ...s.timings, propose: a.ms } };
    }
    case "executed": {
      if (!isCurrent(s, "execute", a.tag)) return s;
      if (!s.proposal || a.executed.planHash !== s.proposal.planHash) return clearPending(s, "execute"); // stale plan: drop it
      return { ...clearPending(s, "execute"), executed: a.executed, timings: { ...s.timings, execute: a.ms ?? a.executed.durationMs } };
    }
    case "evaluated": {
      if (!isCurrent(s, "evaluate", a.tag)) return s;
      if (!s.proposal || a.evaluation.planHash !== s.proposal.planHash) return clearPending(s, "evaluate");
      if (!s.executed || s.executed.planHash !== s.proposal.planHash) return clearPending(s, "evaluate");
      const next: AppState = {
        ...clearPending(s, "evaluate"), evaluation: a.evaluation, timings: { ...s.timings, evaluate: a.ms },
        view: s.evaluation ? s.view : "protected",
      };
      const busy = Object.keys(next.pending).some((k) => k !== "model" && k !== "interpret");
      return busy ? next : withPhase(next, settledPhase(next) === "complete" ? "complete" : "review_ready");
    }
    case "exported": {
      if (!isCurrent(s, "export", a.tag)) return s;
      if (!s.proposal || a.result.planHash !== s.proposal.planHash) return s;
      return withPhase({ ...clearPending(s, "export"), exported: a.result, exportStale: false, timings: { ...s.timings, export: a.ms } }, "complete");
    }
    case "failed": {
      if (!isCurrent(s, a.step, a.tag)) return s;
      const next = { ...clearPending(s, a.step), error: { step: a.step, message: a.message } };
      if (a.step === "interpret" || a.step === "model") return next; // reported inline, not a phase change
      // an export failure leaves the reviewed plan intact
      if (a.step === "export") return withPhase(next, "review_ready");
      return withPhase({ ...next, failedStep: a.step }, "failed");
    }
    case "modelLoaded": {
      if (!isCurrent(s, "model", a.tag)) return s;
      return { ...clearPending(s, "model"), model: { modelId: a.modelId, registryVersion: a.registryVersion } };
    }
    case "stageTimings":
      return { ...s, stageTimings: { ...s.stageTimings, ...a.timings } };
    case "cancel": {
      const inflight = (["import", "profile", "propose", "execute", "evaluate", "export"] as Step[]).find((k) => s.pending[k] !== undefined);
      if (!inflight) return s;
      return withPhase({ ...s, pending: {}, progress: null, failedStep: inflight }, "cancelled");
    }
    case "userMessage":
      return { ...s, thread: [...s.thread, { id: a.id, role: "user", text: a.text }] };
    case "note":
      return { ...s, thread: [...s.thread, { id: a.id, role: "mask", kind: "note", text: a.text, tone: a.tone }] };
    case "answer":
      return { ...s, answers: { ...s.answers, [a.questionId]: a.value } };
    case "goalEdited":
      return invalidateExport({ ...s, goal: a.goal });
    case "acceptGoal":
      return { ...s, goalAccepted: true };
    case "setOverride": {
      const overrides = [...s.overrides.filter((o) => o.unitId !== a.override.unitId), a.override];
      return withPhase(invalidateExport({ ...s, history: [...s.history, s.overrides], overrides }), "updating");
    }
    case "undo": {
      if (!s.history.length) return s;
      const overrides = s.history[s.history.length - 1]!;
      return withPhase(invalidateExport({ ...s, overrides, history: s.history.slice(0, -1) }), "updating");
    }
    case "resetOverrides":
      if (!s.overrides.length) return s;
      return withPhase(invalidateExport({ ...s, history: [...s.history, s.overrides], overrides: [] }), "updating");
    case "setSelector":
      return s.selectorId === a.selectorId ? s : invalidateExport({ ...s, selectorId: a.selectorId });
    case "setView":
      return { ...s, view: a.view };
    case "setTable":
      return s.activeTable === a.table ? s : { ...s, activeTable: a.table, sort: null, selection: null };
    case "setFilters":
      return { ...s, filters: { ...s.filters, ...a.filters } };
    case "clearFilters":
      return { ...s, filters: EMPTY_FILTERS, metricFocus: null };
    case "focusMetric":
      return { ...s, metricFocus: s.metricFocus === a.metricId ? null : a.metricId };
    case "setSort":
      return { ...s, sort: a.sort };
    case "select":
      return { ...s, selection: a.selection };
    case "toggleDev":
      return { ...s, devOpen: a.open ?? !s.devOpen, devTab: a.tab ?? s.devTab };
    case "reset":
      return { ...initialState(a.source ?? s.source), thread: [] };
  }
}

/** Export is allowed only for a settled, fully evaluated plan without hard failures. */
export function canExport(s: AppState): boolean {
  if (s.phase !== "review_ready" && !(s.phase === "complete" && s.exportStale)) return false;
  if (!s.proposal || !s.executed || !s.evaluation) return false;
  if (s.executed.planHash !== s.proposal.planHash || s.evaluation.planHash !== s.proposal.planHash) return false;
  if (s.evaluation.hardFailures.length) return false;
  return !Object.keys(s.pending).some((k) => k !== "model" && k !== "interpret");
}

export const isBusy = (s: AppState): boolean => ["importing", "profiling", "proposing", "evaluating", "updating", "exporting"].includes(s.phase);
