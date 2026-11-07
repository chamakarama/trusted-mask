import { useRef } from "react";
import { useAppState, useController } from "../store/store";
import { fmtInt } from "../lib/labels";
import { IconAlert } from "../lib/icons";

export function TableTabs() {
  const s = useAppState();
  const c = useController();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tables = s.manifest?.tables ?? [];
  const idx = Math.max(0, tables.findIndex((t) => t.name === s.activeTable));
  const go = (i: number) => {
    const t = tables[(i + tables.length) % tables.length];
    if (!t) return;
    c.store.dispatch({ type: "setTable", table: t.name });
    refs.current[(i + tables.length) % tables.length]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Tables">
      {tables.map((t, i) => {
        const out = s.executed?.tables.find((x) => x.name === t.name);
        const cols = s.view === "protected" && out ? out.columns.filter((x) => x.status !== "suppressed").length : t.columns.length;
        return (
          <button
            key={t.name}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            id={`tab-${t.name}`}
            aria-selected={i === idx}
            aria-controls="grid-panel"
            tabIndex={i === idx ? 0 : -1}
            className="tab"
            onClick={() => c.store.dispatch({ type: "setTable", table: t.name })}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
              else if (e.key === "Home") { e.preventDefault(); go(0); }
              else if (e.key === "End") { e.preventDefault(); go(tables.length - 1); }
            }}
            title={`${t.fileName}${t.parseWarnings.length ? `\n${t.parseWarnings.length} parse warning(s)` : ""}`}
          >
            <span className="tab-name">{t.name}</span>
            <span className="tab-meta num">{fmtInt(t.rowCount)} × {cols}</span>
            {t.parseWarnings.length > 0 && <span className="tab-warn" aria-label={`${t.parseWarnings.length} parse warnings`}><IconAlert size={12} /></span>}
          </button>
        );
      })}
    </div>
  );
}
