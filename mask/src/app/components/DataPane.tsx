import { useAppState, useController } from "../store/store";
import { EmptyState } from "./EmptyState";
import { StatusStrip } from "./StatusStrip";
import { TableTabs } from "./TableTabs";
import { ReviewToolbar } from "./ReviewToolbar";
import { EvaluationBar } from "./EvaluationBar";
import { DataGrid } from "./DataGrid";
import { DetailDrawer } from "./DetailDrawer";
import { ExportBar } from "./ExportBar";
import { DevPanel } from "./DevPanel";

function ViewToggle() {
  const s = useAppState();
  const c = useController();
  const enabled = !!s.executed;
  return (
    <div className="seg" role="radiogroup" aria-label="View">
      {(["original", "protected"] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={s.view === v}
          className={s.view === v ? "on" : ""}
          disabled={!enabled}
          title={enabled ? `${v === "original" ? "Original" : "Protected"} (${v[0]})` : "Available once a plan has been applied"}
          onClick={() => c.store.dispatch({ type: "setView", view: v })}
        >
          {v === "original" ? "Original" : "Protected"}<kbd aria-hidden="true">{v[0]}</kbd>
        </button>
      ))}
    </div>
  );
}

function ImportNotes() {
  const s = useAppState();
  const t = s.manifest?.tables.find((x) => x.name === s.activeTable);
  if (!s.importErrors.length && !t?.parseWarnings.length) return null;
  return (
    <div className="import-notes small">
      {s.importErrors.map((e) => <p key={e} className="note-error" role="alert">{e}</p>)}
      {t && t.parseWarnings.length > 0 && (
        <details>
          <summary>{t.parseWarnings.length} parse {t.parseWarnings.length === 1 ? "warning" : "warnings"} in {t.fileName}</summary>
          <ul className="mono xsmall">{t.parseWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export function DataPane() {
  const s = useAppState();
  const dim = s.phase === "updating";
  if (!s.manifest) {
    return (
      <div className="data">
        <div className="pane-head"><h2 id="data-title">Data</h2></div>
        <StatusStrip />
        <EmptyState />
        {s.devOpen && <DevPanel />}
      </div>
    );
  }
  return (
    <div className="data">
      <div className="data-head">
        <h2 id="data-title" className="sr-only">Data</h2>
        <TableTabs />
        <ViewToggle />
      </div>
      <StatusStrip />
      <ImportNotes />
      {s.evaluation && <EvaluationBar />}
      <ReviewToolbar />
      <div className={`grid-area ${dim ? "is-stale" : ""}`} id="grid-panel" role="tabpanel" aria-labelledby={s.activeTable ? `tab-${s.activeTable}` : undefined}>
        {s.activeTable && <DataGrid key={s.activeTable} table={s.activeTable} />}
        <DetailDrawer />
      </div>
      {s.proposal && <ExportBar />}
      {s.devOpen && <DevPanel />}
    </div>
  );
}
