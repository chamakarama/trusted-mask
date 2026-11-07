import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CellChange, HighlightKind, RowView } from "@/contracts";
import { getRecipe } from "@/core/registry";
import { useAppState, useController } from "../store/store";
import type { AppState } from "../store/state";
import { gridColumns, rowFilterOf, highlightOf, methodKind, methodWord, paramSummary, type GridColumn } from "../lib/model";
import { CONFIDENCE_LABEL, HIGHLIGHT_LABEL, ROLE_LABEL, fmtInt, subtypeLabel } from "../lib/labels";
import { IconSort } from "../lib/icons";
import { useRows } from "./useRows";
import { SpanText } from "./SpanText";

const ROW_H = 36;
const HEADER_H = 52;
const ROWNUM_W = 48;

interface Active { r: number; c: number } // r = -1 is the header row

export function DataGrid({ table }: { table: string }) {
  const s = useAppState();
  const ctl = useController();
  const filter = rowFilterOf(s);
  const version = s.view === "protected" ? s.executed?.outputHash ?? "" : s.manifest?.inputHash ?? "";
  const rows = useRows(ctl.backend, { table, view: s.view === "protected" && s.executed ? "protected" : "original", sort: s.sort, filter, version });
  const baseColumns = useMemo(() => gridColumns(s, table, rows.columns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.manifest, s.detections, s.proposal, s.executed, s.view, table, rows.columns]);
  // the grid fills the panel: columns keep their content width, the last one takes what is left
  const [viewW, setViewW] = useState(0);
  const columns = useMemo(() => {
    if (!viewW || !baseColumns.length) return baseColumns;
    const used = ROWNUM_W + baseColumns.reduce((a, c) => a + c.width, 0);
    const spare = viewW - used;
    if (spare <= 0) return baseColumns;
    const lastCol = baseColumns[baseColumns.length - 1]!;
    return [...baseColumns.slice(0, -1), { ...lastCol, width: lastCol.width + spare }];
  }, [baseColumns, viewW]);
  const tm = s.manifest?.tables.find((t) => t.name === table);
  const total = rows.total ?? 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // rows fade in once, when the table first has rows (not on scroll)
  const [intro, setIntro] = useState<"wait" | "on" | "off">("wait");
  const hasRows = (rows.total ?? 0) > 0;
  useEffect(() => {
    if (intro !== "wait" || !hasRows) return;
    setIntro("on");
  }, [hasRows, intro]);
  useEffect(() => {
    if (intro !== "on") return;
    const t = window.setTimeout(() => setIntro("off"), 1400);
    return () => window.clearTimeout(t);
  }, [intro]);
  const rowV = useVirtualizer({
    count: total, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12,
    initialRect: { width: 1200, height: 640 }, paddingStart: HEADER_H, getItemKey: (i) => rows.rowAt(i)?.row ?? `i${i}`,
  });
  const colV = useVirtualizer({
    horizontal: true, count: columns.length, getScrollElement: () => scrollRef.current, estimateSize: (i) => columns[i]?.width ?? 140,
    overscan: 4, initialRect: { width: 1200, height: 640 }, paddingStart: ROWNUM_W,
  });
  useEffect(() => { colV.measure(); }, [columns, colV]);

  const vRows = rowV.getVirtualItems();
  const vCols = colV.getVirtualItems();
  const first = vRows[0]?.index ?? 0;
  const last = vRows[vRows.length - 1]?.index ?? 0;
  useEffect(() => { if (total) rows.want(first, last); }, [first, last, total, rows]);

  // keep scroll position across view switches; reset on new filter/sort only if out of range
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop > (total + 4) * ROW_H) el.scrollTop = 0;
  }, [total]);

  const [active, setActive] = useState<Active>({ r: -1, c: 0 });
  const [focusWithin, setFocusWithin] = useState(false);
  useEffect(() => {
    if (!focusWithin) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-cell="${active.r}:${active.c}"]`);
    el?.focus({ preventScroll: true });
  }, [active, focusWithin, vRows.length, vCols.length]);

  const move = (r: number, c: number) => {
    const nr = Math.max(-1, Math.min(total - 1, r));
    const nc = Math.max(0, Math.min(columns.length - 1, c));
    setActive({ r: nr, c: nc });
    if (nr >= 0) rowV.scrollToIndex(nr, { align: "auto" });
    colV.scrollToIndex(nc, { align: "auto" });
  };

  const selectColumn = (col: GridColumn) => ctl.store.dispatch({ type: "select", selection: { kind: "column", table, column: col.sourceColumn ?? col.key, unitId: col.unitId } });
  const selectCell = (row: RowView, col: GridColumn, spanIndex?: number) => {
    const ch = row.changes?.[col.key];
    ctl.store.dispatch({ type: "select", selection: { kind: "cell", table, row: row.row, column: col.sourceColumn ?? col.key, unitId: ch?.unitId ?? col.unitId, spanIndex } });
  };
  const toggleSort = (col: GridColumn) => {
    const cur = s.sort?.column === col.key ? s.sort.dir : null;
    ctl.store.dispatch({ type: "setSort", sort: cur === null ? { column: col.key, dir: "asc" } : cur === "asc" ? { column: col.key, dir: "desc" } : null });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / ROW_H) - 2);
    switch (e.key) {
      case "ArrowDown": move(active.r + 1, active.c); break;
      case "ArrowUp": move(active.r - 1, active.c); break;
      case "ArrowRight": move(active.r, active.c + 1); break;
      case "ArrowLeft": move(active.r, active.c - 1); break;
      case "Home": move(e.ctrlKey || e.metaKey ? 0 : active.r, 0); break;
      case "End": move(e.ctrlKey || e.metaKey ? total - 1 : active.r, columns.length - 1); break;
      case "PageDown": move(active.r + page, active.c); break;
      case "PageUp": move(active.r - page, active.c); break;
      case "Enter": case " ": {
        const col = columns[active.c];
        if (!col) return;
        if (active.r < 0) { if (e.key === "Enter") selectColumn(col); else toggleSort(col); }
        else { const row = rows.rowAt(active.r); if (row) selectCell(row, col); }
        break;
      }
      case "s": { const col = columns[active.c]; if (col && active.r < 0) toggleSort(col); else return; break; }
      default: return;
    }
    e.preventDefault();
  };

  const width = ROWNUM_W + colV.getTotalSize() - ROWNUM_W;
  const height = rowV.getTotalSize();
  const protectedView = s.view === "protected" && !!s.executed;
  const sel = s.selection;
  const filtered = !!filter;

  return (
    <div className={`grid-wrap ${intro === "on" ? "is-intro" : ""}`}>
      <div
        ref={scrollRef}
        className={`grid-scroll ${rows.showingPrevious ? "is-loading" : ""}`}
        style={{ height: rows.total === null ? undefined : HEADER_H + Math.max(rows.total, 4) * ROW_H + 8 }}
        role="grid"
        aria-label={`${table}, ${protectedView ? "protected" : "original"} view`}
        aria-rowcount={total + 1}
        aria-colcount={columns.length + 1}
        aria-busy={rows.loading}
        onKeyDown={onKeyDown}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false); }}
      >
        <div className="grid-inner" key={protectedView ? "protected" : "original"} style={{ width, height }}>
          <div className="grid-header" role="row" aria-rowindex={1} style={{ width, height: HEADER_H }}>
            <div className="grid-corner" role="columnheader" aria-colindex={1} style={{ width: ROWNUM_W }}><span className="sr-only">Row</span>#</div>
            {vCols.map((vc) => {
              const col = columns[vc.index]!;
              const isActive = active.r === -1 && active.c === vc.index;
              const selected = sel?.kind === "column" && sel.table === table && (sel.column === col.sourceColumn || sel.column === col.key);
              return (
                <HeaderCell
                  key={col.key}
                  col={col}
                  left={vc.start}
                  width={vc.size}
                  index={vc.index}
                  tabbable={isActive}
                  selected={selected}
                  review={!!s.proposal}
                  protectedView={protectedView}
                  sortDir={s.sort?.column === col.key ? s.sort.dir : null}
                  onSelect={() => { setActive({ r: -1, c: vc.index }); selectColumn(col); }}
                  onSort={() => toggleSort(col)}
                />
              );
            })}
          </div>
          {vRows.map((vr) => {
            const row = rows.rowAt(vr.index);
            return (
              <div key={vr.key} className="grid-row" role="row" aria-rowindex={vr.index + 2} style={{ transform: `translateY(${vr.start}px)`, width, height: ROW_H, "--i": Math.min(vr.index, 12) } as React.CSSProperties}>
                <div className="grid-rownum num" role="rowheader" aria-colindex={1} style={{ width: ROWNUM_W }}>{row ? row.row + 1 : ""}</div>
                {vCols.map((vc) => {
                  const col = columns[vc.index]!;
                  const ci = rows.columns ? rows.columns.indexOf(col.key) : vc.index;
                  const value = row ? row.cells[ci] ?? null : undefined;
                  const change = row?.changes?.[col.key];
                  const isSel = !!row && sel?.kind === "cell" && sel.table === table && sel.row === row.row && (sel.column === col.sourceColumn || sel.column === col.key);
                  return (
                    <Cell
                      key={col.key}
                      col={col}
                      left={vc.start}
                      width={vc.size}
                      rowIndex={vr.index}
                      colIndex={vc.index}
                      value={value}
                      change={change}
                      protectedView={protectedView}
                      tabbable={active.r === vr.index && active.c === vc.index}
                      selected={isSel}
                      selectedSpan={isSel && sel?.kind === "cell" ? sel.spanIndex : undefined}
                      devOpen={s.devOpen}
                      onSelect={(spanIndex) => { if (!row) return; setActive({ r: vr.index, c: vc.index }); selectCell(row, col, spanIndex); }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
        {rows.total === 0 && !rows.loading && (
          <div className="grid-empty" style={{ top: HEADER_H + 24 }}>
            <p>No rows match these filters.</p>
            <button className="btn-link small" onClick={() => ctl.store.dispatch({ type: "clearFilters" })}>Clear filters</button>
          </div>
        )}
      </div>
      <GridFooter s={s} total={rows.total} tableRows={tm?.rowCount ?? 0} filtered={filtered} error={rows.error} />
    </div>
  );
}

function GridFooter({ s, total, tableRows, filtered, error }: { s: AppState; total: number | null; tableRows: number; filtered: boolean; error: string | null }) {
  return (
    <div className="grid-foot small">
      {error ? <span className="note-error" role="alert">Rows could not be loaded: {error}</span> : total === null ? <span className="muted">Loading rows…</span> : filtered ? (
        <span>
          Showing <span className="num">{fmtInt(total)}</span> of <span className="num">{fmtInt(tableRows)}</span> rows
          <span className="muted"> · filters change only what is shown; nothing is removed from the output</span>
        </span>
      ) : (
        <span><span className="num">{fmtInt(total)}</span> rows</span>
      )}
      <span className="grid-foot-keys muted xsmall">
        Arrow keys move · Enter opens details{s.proposal ? " · o / p switch view" : ""}
      </span>
    </div>
  );
}

const HeaderCell = memo(function HeaderCell({
  col, left, width, index, tabbable, selected, review, protectedView, sortDir, onSelect, onSort,
}: {
  col: GridColumn; left: number; width: number; index: number; tabbable: boolean; selected: boolean; review: boolean; protectedView: boolean;
  sortDir: "asc" | "desc" | null; onSelect: () => void; onSort: () => void;
}) {
  const d = col.detection;
  const dec = col.decision;
  const kind = col.status === "suppressed" ? "suppress" : col.status === "derived" ? "derive" : methodKind(dec);
  const recipe = dec?.selected ? getRecipe(dec.selected.recipeId) : null;
  const params = paramSummary(dec);
  const tip = [col.title, d ? `${ROLE_LABEL[d.role]} · ${subtypeLabel(d.subtype)} · detection confidence ${CONFIDENCE_LABEL[d.confidence]}` : "", recipe ? `${recipe.name}${params ? ` (${params})` : ""}: ${recipe.summary}` : ""].filter(Boolean).join("\n");
  const removed = col.status === "suppressed";
  const needsReview = !!(dec?.needsReview || (!dec && d?.needsReview));
  return (
    <div
      className={`grid-hcell ${selected ? "is-selected" : ""} ${col.isNumeric ? "is-num" : ""} ${removed ? "is-removed" : ""}`}
      role="columnheader"
      aria-colindex={index + 2}
      aria-sort={sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "none"}
      data-cell={`-1:${index}`}
      tabIndex={tabbable ? 0 : -1}
      style={{ transform: `translateX(${left}px)`, width, height: HEADER_H }}
      onClick={onSelect}
      title={tip}
    >
      <div className="h-line1">
        <span className="h-name">{col.title}</span>
        <button
          className={`h-sort ${sortDir ? "on" : ""}`}
          tabIndex={-1}
          aria-label={`Sort by ${col.title}${sortDir ? `, currently ${sortDir === "asc" ? "ascending" : "descending"}` : ""}`}
          onClick={(e) => { e.stopPropagation(); onSort(); }}
        >
          <IconSort size={12} dir={sortDir} />
        </button>
      </div>
      <div className="h-line2">
        {review && kind === "keep" ? (
          <span className="h-sub">kept</span>
        ) : review && kind ? (
          <span className={`h-method mk mk-${kind} ${protectedView ? "" : "quiet"}`}>{methodWord(dec, col.status) || HIGHLIGHT_LABEL[kind].toLowerCase()}</span>
        ) : d ? (
          <span className="h-sub">{subtypeLabel(d.subtype).toLowerCase()}</span>
        ) : col.status === "derived" ? <span className="h-sub">from {col.sourceColumn}</span> : <span className="h-sub">{review ? "" : "…"}</span>}
        {needsReview && <span className="h-review" title={(dec?.reviewReasons ?? d?.reviewReasons ?? []).join("; ") || "Needs review"}>review</span>}
      </div>
    </div>
  );
});

const Cell = memo(function Cell({
  col, left, width, rowIndex, colIndex, value, change, protectedView, tabbable, selected, selectedSpan, devOpen, onSelect,
}: {
  col: GridColumn; left: number; width: number; rowIndex: number; colIndex: number; value: string | null | undefined; change: CellChange | undefined;
  protectedView: boolean; tabbable: boolean; selected: boolean; selectedSpan: number | undefined; devOpen: boolean; onSelect: (spanIndex?: number) => void;
}) {
  const removed = protectedView && col.status === "suppressed";
  const review = protectedView && change?.kind === "review";
  // the wash colour is the method; "needs review" is an extra underline, not a different colour
  const kind: HighlightKind | null = protectedView && change && !change.spans && !col.isText ? (methodKind(col.decision) ?? (change.kind === "review" ? null : change.kind)) : null;
  let content: React.ReactNode;
  if (value === undefined) content = <span className="cell-loading" aria-hidden="true" />;
  else if (removed) content = <span className="mk-strike" aria-label="removed" />;
  else if (value === null) content = <span className="cell-null" aria-label="empty">—</span>;
  else if (protectedView && change?.spans?.length) content = <SpanText text={value} spans={change.spans} selected={selected ? selectedSpan : undefined} devOpen={devOpen} onSpan={(i) => onSelect(i)} />;
  else if (kind && kind !== "keep") content = <span className={`mk mk-${kind} ${review ? "mk-needs-review" : ""}`}>{value}</span>;
  else content = value;
  return (
    <div
      className={`grid-cell ${selected ? "is-selected" : ""} ${col.isText ? "is-text" : ""} ${col.isNumeric ? "is-num" : ""} ${removed ? "is-removed" : ""}`}
      role="gridcell"
      aria-colindex={colIndex + 2}
      aria-selected={selected}
      data-cell={`${rowIndex}:${colIndex}`}
      tabIndex={tabbable ? 0 : -1}
      style={{ transform: `translateX(${left}px)`, width }}
      onClick={() => onSelect()}
      title={typeof value === "string" && value.length > 40 && !change?.spans ? value : undefined}
    >
      <span className="cell-text">{content}</span>
    </div>
  );
});

export { highlightOf, paramSummary };
