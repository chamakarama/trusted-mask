import { useAppState, useController } from "../store/store";
import { EmptyState } from "./EmptyState";
import { StatusStrip } from "./StatusStrip";
import { TableTabs } from "./TableTabs";
import { ReviewToolbar } from "./ReviewToolbar";
import { DataGrid } from "./DataGrid";
import { DetailDrawer } from "./DetailDrawer";
import { ExportBar } from "./ExportBar";

function ViewToggle() {
  const s = useAppState();
  const c = useController();
  if (!s.executed) return null;
  return (
    <div className="view-toggle" role="radiogroup" aria-label="View">
      {(["original", "protected"] as const).map((v, i) => (
        <span key={v}>
          {i > 0 && <span className="sep" aria-hidden="true">/</span>}
          <button
            role="radio"
            aria-checked={s.view === v}
            className={s.view === v ? "on" : ""}
            title={`${v === "original" ? "Original" : "Protected"} (${v[0]})`}
            onClick={() => c.store.dispatch({ type: "setView", view: v })}
          >
            {v === "original" ? "Original" : "Protected"}
          </button>
        </span>
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
  return (
    <div className="data">
      <h2 id="data-title" className="sr-only">Data</h2>
      <div className={`panel ${s.manifest ? "has-data" : "is-empty"}`}>
        {!s.manifest ? (
          <div className="panel-empty">
            <EmptyState />
            <StatusStrip />
          </div>
        ) : (
          <>
            <ViewToggle />
            <TableTabs />
            <div className="panel-main">
              <ImportNotes />
              <div className={`grid-area ${dim ? "is-stale" : ""}`} id="grid-panel" role="tabpanel" aria-labelledby={s.activeTable ? `tab-${s.activeTable}` : undefined}>
                {s.activeTable && <DataGrid key={s.activeTable} table={s.activeTable} />}
                <DetailDrawer />
              </div>
              <StatusStrip />
              <ReviewToolbar />
            </div>
          </>
        )}
      </div>
      {/* the export row's space is reserved so the panel never moves when a proposal arrives */}
      <div className="export-slot">{s.proposal && <ExportBar />}</div>
    </div>
  );
}
