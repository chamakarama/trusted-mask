/** Read-only lookups over manifest, detections, proposal and evaluation. */
import type { Decision, DecisionUnit, DetectionSet, Evaluation, FieldDetection, HighlightKind, MetricResult, OutputColumn, PrivacyRole, Proposal, RowFilter } from "@/contracts";
import { getRecipe } from "@/core/registry";
import type { AppState } from "../store/state";

export function detectionFor(d: DetectionSet | null, table: string, column: string): FieldDetection | undefined {
  return d?.fields.find((f) => f.ref.table === table && f.ref.column === column);
}
export function fieldUnitFor(p: Proposal | null, table: string, column: string): DecisionUnit | undefined {
  return p?.units.find((u) => u.kind !== "span_class" && u.refs.some((r) => r.table === table && r.column === column));
}
export function unitById(p: Proposal | null, id: string | null | undefined): DecisionUnit | undefined {
  return id ? p?.units.find((u) => u.id === id) : undefined;
}
export function decisionFor(p: Proposal | null, unitId: string | null | undefined): Decision | undefined {
  return unitId ? p?.decisions.find((d) => d.unitId === unitId) : undefined;
}
export function highlightOf(d: Decision | undefined): HighlightKind | null {
  if (!d) return null;
  if (d.needsReview) return "review";
  if (!d.selected) return "suppress";
  return getRecipe(d.selected.recipeId).highlight;
}
/** Kind without the review overlay, for the method label. */
export function methodKind(d: Decision | undefined): HighlightKind | null {
  if (!d) return null;
  if (!d.selected) return "suppress";
  return getRecipe(d.selected.recipeId).highlight;
}
export function metricsForUnit(e: Evaluation | null, unit: DecisionUnit | undefined): MetricResult[] {
  if (!e || !unit) return [];
  const ids = new Set([unit.id, unit.parentUnitId].filter(Boolean) as string[]);
  return e.metrics.filter((m) => m.unitIds?.some((u) => ids.has(u)));
}
export function spanUnitsFor(p: Proposal | null, parentId: string): DecisionUnit[] {
  return p?.units.filter((u) => u.parentUnitId === parentId) ?? [];
}

/** Grid column model: one entry per displayed column, in display order. */
export interface GridColumn {
  key: string;
  title: string;
  width: number;
  sourceColumn: string | null;
  unitId: string | null;
  status: OutputColumn["status"] | null;
  detection?: FieldDetection;
  decision?: Decision;
  isText: boolean;
}

export function columnWidth(meanLength: number, maxLength: number, isText: boolean): number {
  if (isText) return 440;
  const est = 20 + 7.4 * Math.min(maxLength, Math.max(meanLength * 1.25, 6));
  return Math.round(Math.max(96, Math.min(300, est)));
}

export function gridColumns(s: AppState, table: string, outputNames: string[] | null): GridColumn[] {
  const tm = s.manifest?.tables.find((t) => t.name === table);
  if (!tm) return [];
  const statsOf = (col: string | null) => tm.columns.find((c) => c.name === col);
  if (s.view === "protected" && s.executed) {
    const out = s.executed.tables.find((t) => t.name === table);
    if (out) {
      const order = outputNames ?? out.columns.map((c) => c.name);
      return order.map((name) => {
        const oc = out.columns.find((c) => c.name === name);
        const src = oc?.sourceColumn ?? null;
        const st = statsOf(src);
        const det = src ? detectionFor(s.detections, table, src) : undefined;
        const isText = det?.role === "free_text";
        return {
          key: name, title: name, sourceColumn: src, unitId: oc?.unitId ?? null, status: oc?.status ?? null, detection: det,
          decision: decisionFor(s.proposal, oc?.unitId), isText,
          width: oc?.status === "derived" ? 128 : st ? columnWidth(st.stats.meanLength, st.stats.maxLength, isText) : 140,
        };
      });
    }
  }
  return tm.columns.map((c) => {
    const det = detectionFor(s.detections, table, c.name);
    const unit = fieldUnitFor(s.proposal, table, c.name);
    const isText = det?.role === "free_text";
    return {
      key: c.name, title: c.name, sourceColumn: c.name, unitId: unit?.id ?? null, status: null, detection: det,
      decision: decisionFor(s.proposal, unit?.id), isText, width: columnWidth(c.stats.meanLength, c.stats.maxLength, isText),
    };
  });
}

/** Units in a table whose detected role is one of `roles` (field units and linked groups). */
export function unitsWithRoles(s: AppState, roles: PrivacyRole[]): string[] {
  if (!s.proposal || !s.detections || !roles.length) return [];
  const set = new Set(roles);
  return s.proposal.units
    .filter((u) => u.kind !== "span_class" && u.refs.some((r) => { const d = detectionFor(s.detections, r.table, r.column); return d && set.has(d.role); }))
    .map((u) => u.id);
}

/** The worker-side display filter for the current UI filters. Display only: never changes the output. */
export function rowFilterOf(s: AppState): RowFilter | undefined {
  const f = s.filters;
  const out: RowFilter = {};
  if (f.search.trim()) out.search = f.search.trim();
  if (s.view === "protected") {
    if (f.highlights.length) out.highlights = f.highlights;
    if (f.needsReview) out.needsReview = true;
    if (f.onlyChanged) out.onlyChanged = true;
    let units: string[] | null = null;
    if (f.roles.length) units = unitsWithRoles(s, f.roles);
    // metricFocus is a metric id; the same id appears once per scope, so take the union of their units
    const focusUnits = s.metricFocus ? (s.evaluation?.metrics ?? []).filter((x) => x.id === s.metricFocus).flatMap((x) => x.unitIds ?? []) : [];
    if (focusUnits.length) {
      // metric units may be span units: the worker tags text-cell changes with the parent field unit
      const expanded = new Set(focusUnits.flatMap((id) => [id, s.proposal?.units.find((u) => u.id === id)?.parentUnitId].filter(Boolean) as string[]));
      units = units ? units.filter((u) => expanded.has(u)) : [...expanded];
    }
    if (units) out.unitIds = units.length ? units : ["__none__"];
  }
  return Object.keys(out).length ? out : undefined;
}

export function filtersActive(s: AppState): boolean {
  const f = s.filters;
  return !!(f.search.trim() || f.highlights.length || f.roles.length || f.needsReview || f.onlyChanged || s.metricFocus);
}

export function paramSummary(d: Decision | undefined): string {
  if (!d?.selected) return "";
  const def = getRecipe(d.selected.recipeId);
  return def.params
    .filter((p) => p.key !== "referenceDate")
    .map((p) => {
      const v = d.selected!.params[p.key];
      if (v === undefined) return "";
      const o = p.options?.find((x) => x.value === String(v));
      if (p.key === "scope") return v === "dataset" ? "" : "per table";
      if (p.key === "format") return v === "prefix" ? "keep prefix" : "";
      return o ? o.label : `${p.label.toLowerCase()} ${String(v)}`;
    })
    .filter(Boolean)
    .join(", ");
}
