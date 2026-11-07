import { useAppState, useController } from "../store/store";
import type { Phase } from "@/contracts";
import { IconCode } from "../lib/icons";

const PHASE_TEXT: Record<Phase, string> = {
  empty: "No data yet",
  importing: "Reading files",
  profiling: "Finding personal data",
  needs_input: "Waiting for your input",
  proposing: "Choosing protections",
  evaluating: "Applying and measuring",
  review_ready: "Ready for review",
  updating: "Updating",
  exporting: "Preparing download",
  complete: "Exported",
  failed: "Stopped by an error",
  cancelled: "Stopped",
};
const PHASE_TONE: Partial<Record<Phase, string>> = {
  importing: "busy", profiling: "busy", proposing: "busy", evaluating: "busy", updating: "busy", exporting: "busy",
  review_ready: "ready", complete: "ok", failed: "fail", needs_input: "wait", cancelled: "wait",
};

export function TopBar() {
  const s = useAppState();
  const c = useController();
  const stale = s.exported && s.exportStale;
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="brand-mark">
          <rect x="1" y="1" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 9h8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <h1>Mask</h1>
      </div>
      <div className={`phase phase-${PHASE_TONE[s.phase] ?? "idle"}`} data-phase={s.phase}>
        <span className="phase-dot" aria-hidden="true" />
        <span>{PHASE_TEXT[s.phase]}{stale && s.phase === "review_ready" ? " · export out of date" : ""}</span>
      </div>
      <div className="topbar-right">
        {s.manifest && (
          <button className="btn btn-ghost btn-small" onClick={() => { if (confirm("Start over? The imported data and your edits are cleared from this tab.")) c.startOver(); }}>
            Start over
          </button>
        )}
        <button
          className={`btn btn-small ${s.devOpen ? "is-on" : "btn-ghost"}`}
          aria-pressed={s.devOpen}
          aria-controls="dev-panel"
          onClick={() => c.store.dispatch({ type: "toggleDev" })}
          title="Developer panel (d)"
        >
          <IconCode size={14} /> Developer
        </button>
      </div>
    </header>
  );
}
