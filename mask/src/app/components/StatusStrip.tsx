import { useAppState, useController } from "../store/store";
import { fmtInt } from "../lib/labels";

const STAGE: Record<string, string> = {
  parsing: "Reading", profiling: "Profiling columns", detecting: "Finding personal data", executing: "Applying the plan",
  evaluating: "Measuring", exporting: "Building the download",
};
const PHASE_LINE: Record<string, string> = {
  importing: "Reading files", profiling: "Finding personal data in each column", proposing: "Choosing a protection for each field",
  evaluating: "Applying the plan and measuring the result", updating: "Updating the plan and re-measuring", exporting: "Building the download",
};

/** One line under the tabs: real progress for long steps, errors with retry. Never invents a percentage. */
export function StatusStrip() {
  const s = useAppState();
  const c = useController();
  if (s.phase === "failed" && s.error) {
    return (
      <div className="status-strip tone-fail" role="alert">
        <span><strong>Stopped.</strong> {s.error.message}</span>
        <span className="status-actions">
          {s.failedStep && s.failedStep !== "interpret" && <button className="btn btn-small" onClick={() => void c.retry()}>Try again</button>}
        </span>
      </div>
    );
  }
  if (s.phase === "cancelled") {
    return (
      <div className="status-strip tone-wait">
        <span>Stopped. Results of the stopped step are ignored.</span>
        <span className="status-actions"><button className="btn btn-small" onClick={() => void c.retry()}>Resume</button></span>
      </div>
    );
  }
  if (s.error && s.error.step === "export") {
    return <div className="status-strip tone-fail" role="alert"><span><strong>Export failed.</strong> {s.error.message}</span></div>;
  }
  if (s.error && s.error.step === "model") {
    return <div className="status-strip tone-fail" role="alert"><span><strong>Model not loaded.</strong> {s.error.message}</span></div>;
  }
  const line = PHASE_LINE[s.phase];
  if (!line) return null;
  const p = s.progress;
  return (
    <div className="status-strip tone-busy" aria-live="off">
      <span className="spinner" aria-hidden="true" />
      <span>
        {p ? (STAGE[p.stage] ?? p.stage) : line}
        {p && p.total > 0 && <span className="muted num"> · {fmtInt(p.done)} of {fmtInt(p.total)}</span>}
        {p?.message && <span className="muted"> · {p.message}</span>}
      </span>
      {s.phase !== "updating" && s.phase !== "exporting" && (
        <span className="status-actions"><button className="btn btn-ghost btn-small" onClick={() => c.cancel()}>Stop</button></span>
      )}
    </div>
  );
}
