import { useState } from "react";
import type { HighlightKind, PrivacyRole } from "@/contracts";
import { useAppState, useController } from "../store/store";
import { HIGHLIGHT_HINT, HIGHLIGHT_LABEL, ROLE_LABEL, ROLE_ORDER } from "../lib/labels";
import { IconAlert, IconSearch, IconChevron } from "../lib/icons";
import { filtersActive } from "../lib/model";
import { groupMetrics } from "../lib/metrics";
import { ChecksPanel, checkSummary } from "./EvaluationBar";

const LEGEND: HighlightKind[] = ["tokenize", "generalize", "redact", "suppress", "derive", "review"];

/** One quiet line: checks summary on the left, search and filters on the right. Both expand in place. */
export function ReviewToolbar() {
  const s = useAppState();
  const c = useController();
  const [open, setOpen] = useState<"checks" | "filters" | null>(null);
  const set = (f: Parameters<typeof c.store.dispatch>[0]) => c.store.dispatch(f);
  const e = s.evaluation;
  const groups = e ? groupMetrics(e.metrics) : [];
  const sum = checkSummary(groups);
  const cov = e?.coverage ?? [];
  const covered = cov.filter((x) => x.status === "evaluated").length;
  const stale = s.phase === "updating" || (e && e.planHash !== s.proposal?.planHash);
  const protectedView = s.view === "protected" && !!s.executed;
  const roles = ROLE_ORDER.filter((r) => s.detections?.fields.some((f) => f.role === r));
  const methodFilters = s.filters.highlights.length + (s.filters.needsReview ? 1 : 0) + s.filters.roles.length + (s.filters.onlyChanged ? 1 : 0);
  const toggleHl = (k: HighlightKind) => {
    if (k === "review") { set({ type: "setFilters", filters: { needsReview: !s.filters.needsReview } }); return; }
    const on = s.filters.highlights.includes(k);
    set({ type: "setFilters", filters: { highlights: on ? s.filters.highlights.filter((x) => x !== k) : [...s.filters.highlights, k] } });
  };
  const hard = e && !stale ? e.hardFailures : [];

  return (
    <div className={`review-bar ${stale ? "is-stale" : ""}`}>
      {hard.length > 0 && (
        <p className="hard-line small" role="alert">
          <IconAlert size={12} /> Export blocked: {hard.slice(0, 2).join(" · ")}{hard.length > 2 ? ` · and ${hard.length - 2} more` : ""}
        </p>
      )}
      <div className="review-line small">
        {e ? (
          <button className="checks-sum" aria-expanded={open === "checks"} aria-controls="checks-panel" onClick={() => setOpen(open === "checks" ? null : "checks")}>
            <IconChevron size={12} open={open === "checks"} />
            <span>Checks:</span>
            <span className="num">{sum.ok} ok</span>
            {sum.review > 0 && <span className="sum-review"> · <span className="num">{sum.review}</span> to review</span>}
            {sum.blocking > 0 && <span className="sum-block"> · <span className="num">{sum.blocking}</span> blocking</span>}
            {sum.unmeasurable > 0 && <span className="sum-unm"> · <span className="num">{sum.unmeasurable}</span> not measurable</span>}
            <span className="muted"> · Coverage {covered}/{cov.length}</span>
          </button>
        ) : <span className="muted">{s.proposal ? "Measuring…" : s.detections ? "Describe the purpose on the left to get a proposal." : ""}</span>}
        <span className="review-tools">
          <span className="search">
            <IconSearch size={13} />
            <label htmlFor="grid-search" className="sr-only">Search rows</label>
            <input
              id="grid-search" type="search" placeholder="Search" value={s.filters.search}
              onChange={(ev) => set({ type: "setFilters", filters: { search: ev.target.value } })}
              onKeyDown={(ev) => { if (ev.key === "Escape") { set({ type: "setFilters", filters: { search: "" } }); (ev.target as HTMLInputElement).blur(); } }}
            />
          </span>
          {s.proposal && (
            <button className="btn-link quiet" aria-expanded={open === "filters"} aria-controls="filters-panel" onClick={() => setOpen(open === "filters" ? null : "filters")}>
              Filter{methodFilters ? ` (${methodFilters})` : ""}
            </button>
          )}
          {filtersActive(s) && <button className="btn-link quiet" onClick={() => set({ type: "clearFilters" })}>Clear</button>}
        </span>
      </div>
      {open === "checks" && e && <ChecksPanel />}
      {open === "filters" && s.proposal && (
        <div className="filters-panel small" id="filters-panel">
          <div className="legend" role="group" aria-label="Show only rows changed by">
            {LEGEND.map((k) => (
              <button
                key={k}
                className="legend-item"
                aria-pressed={k === "review" ? s.filters.needsReview : s.filters.highlights.includes(k)}
                disabled={!protectedView}
                title={`${HIGHLIGHT_HINT[k]}. Show only rows with this change.`}
                onClick={() => toggleHl(k)}
              >
                <span className={`mk mk-${k}`}>{HIGHLIGHT_LABEL[k].toLowerCase()}</span>
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="role-filter">Data type</label>
          <select id="role-filter" className="select select-small" disabled={!protectedView} value={s.filters.roles[0] ?? ""}
            onChange={(ev) => set({ type: "setFilters", filters: { roles: ev.target.value ? [ev.target.value as PrivacyRole] : [] } })}>
            <option value="">All data types</option>
            {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <label className="check-toggle">
            <input type="checkbox" checked={s.filters.onlyChanged} disabled={!protectedView} onChange={() => set({ type: "setFilters", filters: { onlyChanged: !s.filters.onlyChanged } })} />
            Changed rows only
          </label>
          {!protectedView && <span className="muted">Filters by change apply in the Protected view (press p).</span>}
        </div>
      )}
    </div>
  );
}
