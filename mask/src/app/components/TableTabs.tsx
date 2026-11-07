import { useRef } from "react";
import { useAppState, useController } from "../store/store";
import { fmtInt } from "../lib/labels";

/** The imported folder as a narrow vertical strip of table names. */
export function TableTabs() {
  const s = useAppState();
  const c = useController();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tables = s.manifest?.tables ?? [];
  const idx = Math.max(0, tables.findIndex((t) => t.name === s.activeTable));
  const go = (i: number) => {
    const n = (i + tables.length) % tables.length;
    const t = tables[n];
    if (!t) return;
    c.store.dispatch({ type: "setTable", table: t.name });
    refs.current[n]?.focus();
  };
  return (
    <div className="tables" role="tablist" aria-label="Tables" aria-orientation="vertical">
      {tables.map((t, i) => (
        <button
          key={t.name}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          id={`tab-${t.name}`}
          aria-selected={i === idx}
          aria-controls="grid-panel"
          tabIndex={i === idx ? 0 : -1}
          className="table-name"
          onClick={() => c.store.dispatch({ type: "setTable", table: t.name })}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
            else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
            else if (e.key === "Home") { e.preventDefault(); go(0); }
            else if (e.key === "End") { e.preventDefault(); go(tables.length - 1); }
          }}
          title={`${t.fileName} · ${fmtInt(t.rowCount)} rows × ${t.columns.length} columns${t.parseWarnings.length ? ` · ${t.parseWarnings.length} parse warning(s)` : ""}`}
        >
          <span className="table-label">{t.name}</span>
          {t.parseWarnings.length > 0 && <span className="table-warn" aria-label={`${t.parseWarnings.length} parse warnings`}>!</span>}
        </button>
      ))}
    </div>
  );
}
