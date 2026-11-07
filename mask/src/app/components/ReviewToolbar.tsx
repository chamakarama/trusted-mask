import type { HighlightKind, PrivacyRole } from "@/contracts";
import { useAppState, useController } from "../store/store";
import { HIGHLIGHT_HINT, HIGHLIGHT_LABEL, HIGHLIGHT_ORDER, ROLE_LABEL, ROLE_ORDER } from "../lib/labels";
import { HighlightIcon, IconSearch } from "../lib/icons";
import { filtersActive } from "../lib/model";

/** Legend that doubles as the method filter, plus data type, review, changed-only and search. Display only. */
export function ReviewToolbar() {
  const s = useAppState();
  const c = useController();
  const set = (f: Parameters<typeof c.store.dispatch>[0]) => c.store.dispatch(f);
  const review = !!s.proposal;
  const protectedView = s.view === "protected" && !!s.executed;
  const roles = ROLE_ORDER.filter((r) => s.detections?.fields.some((f) => f.role === r));
  const toggleHl = (k: HighlightKind) => {
    const on = s.filters.highlights.includes(k);
    set({ type: "setFilters", filters: { highlights: on ? s.filters.highlights.filter((x) => x !== k) : [...s.filters.highlights, k] } });
  };

  return (
    <div className="toolbar">
      {review && (
        <div className="legend" role="group" aria-label="Filter by method">
          {HIGHLIGHT_ORDER.filter((k) => k !== "keep" && k !== "review").map((k) => (
            <button
              key={k}
              className={`hl-tag hl-${k} legend-item`}
              aria-pressed={s.filters.highlights.includes(k)}
              disabled={!protectedView}
              title={`${HIGHLIGHT_HINT[k]}. Click to show only rows with this change.`}
              onClick={() => toggleHl(k)}
            >
              <HighlightIcon kind={k} size={12} />{HIGHLIGHT_LABEL[k]}
            </button>
          ))}
          <button
            className="hl-tag hl-review legend-item"
            aria-pressed={s.filters.needsReview}
            disabled={!protectedView}
            title={`${HIGHLIGHT_HINT.review}. Click to show only rows that need review.`}
            onClick={() => set({ type: "setFilters", filters: { needsReview: !s.filters.needsReview } })}
          >
            <HighlightIcon kind="review" size={12} />{HIGHLIGHT_LABEL.review}
          </button>
        </div>
      )}
      <div className="toolbar-right">
        {review && (
          <>
            <label className="sr-only" htmlFor="role-filter">Data type</label>
            <select
              id="role-filter"
              className="select select-small"
              disabled={!protectedView}
              value={s.filters.roles[0] ?? ""}
              onChange={(e) => set({ type: "setFilters", filters: { roles: e.target.value ? [e.target.value as PrivacyRole] : [] } })}
            >
              <option value="">All data types</option>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button className="chip" aria-pressed={s.filters.onlyChanged} disabled={!protectedView}
              onClick={() => set({ type: "setFilters", filters: { onlyChanged: !s.filters.onlyChanged } })}>
              Changed rows only
            </button>
          </>
        )}
        <div className="search">
          <IconSearch size={14} />
          <label htmlFor="grid-search" className="sr-only">Search rows</label>
          <input
            id="grid-search"
            className="input"
            type="search"
            placeholder="Search rows"
            value={s.filters.search}
            onChange={(e) => set({ type: "setFilters", filters: { search: e.target.value } })}
            onKeyDown={(e) => { if (e.key === "Escape") { set({ type: "setFilters", filters: { search: "" } }); (e.target as HTMLInputElement).blur(); } }}
          />
          <kbd aria-hidden="true">/</kbd>
        </div>
        {filtersActive(s) && <button className="btn-link small" onClick={() => set({ type: "clearFilters" })}>Clear</button>}
      </div>
      {review && !protectedView && s.executed && (s.filters.highlights.length > 0 || s.filters.needsReview || s.filters.onlyChanged || s.filters.roles.length > 0) && (
        <p className="toolbar-note muted small">Method filters apply in the Protected view. Press p to switch.</p>
      )}
    </div>
  );
}
