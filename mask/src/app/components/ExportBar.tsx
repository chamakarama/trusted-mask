import { useEffect, useState } from "react";
import { useAppState, useController } from "../store/store";
import { canExport } from "../store/state";
import { fmtBytes, fmtInt, shortHash } from "../lib/labels";
import { IconCheck, IconDownload, IconAlert } from "../lib/icons";

/** One primary action. Enabled only for a settled plan whose execution and evaluation match the proposal. */
export function ExportBar() {
  const s = useAppState();
  const c = useController();
  const [showFiles, setShowFiles] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  // a new export or any change afterwards collapses the receipt and file list
  useEffect(() => { setShowReceipt(false); setShowFiles(false); }, [s.exported?.receipt.receiptId, s.exportStale]);
  const ok = canExport(s);
  const tables = s.executed?.tables ?? [];
  const done = s.phase === "complete" && s.exported && !s.exportStale;

  let reason = "";
  if (!ok) {
    if (s.evaluation?.hardFailures.length && s.evaluation.planHash === s.proposal?.planHash) reason = "Resolve the blocking check above to export.";
    else if (s.phase === "updating" || s.phase === "proposing" || s.phase === "evaluating") reason = "Waiting for the updated plan to be applied and measured.";
    else if (s.phase === "exporting") reason = "Preparing files…";
    else if (s.phase === "failed" || s.phase === "cancelled") reason = "The plan has not been fully applied and measured.";
    else if (!done) reason = "Export becomes available once the plan is applied and measured.";
  }

  return (
    <section className="exportbar" aria-label="Export">
      <div className="export-line small">
        {done && s.exported ? (
          <span className="export-text export-ok">
            <IconCheck size={13} /> Exported {s.exported.files.length} files.{" "}
            <button className="btn-link" onClick={() => setShowReceipt((x) => !x)} aria-expanded={showReceipt}>{showReceipt ? "Hide receipt" : "Receipt"}</button>
          </span>
        ) : s.exported && s.exportStale ? (
          <span className="export-text export-stale" data-testid="export-stale">
            <IconAlert size={12} /> Export stale: the plan changed after your last export. Export again for the current version.
          </span>
        ) : (
          <span className="export-text">
            {reason || <>Confirming approves this exact output; it is not evidence that the data is anonymous.</>}{" "}
            <button className="btn-link quiet" onClick={() => setShowFiles((x) => !x)} aria-expanded={showFiles}>Files</button>
          </span>
        )}
        <button className="btn btn-primary export-btn" disabled={!ok} onClick={() => void c.exportNow()}>
          <IconDownload size={14} /> Confirm and export
        </button>
      </div>
      {showFiles && !done && (
        <ul className="file-list small">
          {tables.map((t) => (
            <li key={t.name}><span className="mono">{t.name}.csv</span> <span className="muted num">{fmtInt(t.rowCount)} rows × {t.columns.filter((x) => x.status !== "suppressed").length} columns</span></li>
          ))}
          <li><span className="mono">report.json</span> <span className="muted">decisions, checks and a coverage summary; no original values; benchmark details are not exported</span></li>
          <li className="muted xsmall">Sizes and hashes appear on the receipt after export.</li>
        </ul>
      )}
      {showReceipt && done && s.exported && (
        <div className="receipt small">
          <p className="mono xsmall">plan {shortHash(s.exported.receipt.planHash, 16)} · input {shortHash(s.exported.receipt.inputHash, 16)} · output {shortHash(s.exported.receipt.outputHash, 16)}</p>
          <ul>
            {s.exported.receipt.artifacts.map((a) => (
              <li key={a.name}><span className="mono">{a.name}</span> <span className="muted num">{fmtBytes(a.bytes)}</span> <span className="mono xsmall muted">sha256 {shortHash(a.sha256, 16)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
