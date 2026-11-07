import type { ColumnRef, DatasetManifest, DecisionUnit, FieldDetection, SpanLabel } from "@/contracts";
import { columnKey } from "@/contracts";

const ID_ROLES = new Set(["direct_identifier", "technical_identifier", "record_key"]);

/**
 * Build decision units: one per column, except linked identifier columns which form one field_group,
 * plus one span_class unit per (text column, span label present).
 * Unit ids are stable for a given manifest + detection set: f:table.column, g:a.b+c.d, s:table.column:LABEL
 */
export function buildDecisionUnits(manifest: DatasetManifest, detections: FieldDetection[]): DecisionUnit[] {
  const det = new Map(detections.map((d) => [columnKey(d.ref), d]));
  // union-find over strong relationships between identifier-like columns
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let p = parent.get(k) ?? k;
    while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
    parent.set(k, p);
    return p;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const relOf = new Map<string, string[]>();
  for (const rel of manifest.relationships) {
    const a = columnKey(rel.from), b = columnKey(rel.to);
    const da = det.get(a), db = det.get(b);
    if (!da || !db) continue;
    if (rel.matchRate < 0.8) continue;
    if (!ID_ROLES.has(da.role) && !ID_ROLES.has(db.role)) continue;
    union(a, b);
    relOf.set(a, [...(relOf.get(a) ?? []), rel.id]);
    relOf.set(b, [...(relOf.get(b) ?? []), rel.id]);
  }
  const groups = new Map<string, ColumnRef[]>();
  for (const t of manifest.tables) for (const c of t.columns) {
    const k = columnKey({ table: t.name, column: c.name });
    const root = find(k);
    groups.set(root, [...(groups.get(root) ?? []), { table: t.name, column: c.name }]);
  }
  const units: DecisionUnit[] = [];
  for (const refs of groups.values()) {
    refs.sort((x, y) => columnKey(x).localeCompare(columnKey(y)));
    const dets = refs.map((r) => det.get(columnKey(r))).filter((d): d is FieldDetection => !!d);
    const relIds = [...new Set(refs.flatMap((r) => relOf.get(columnKey(r)) ?? []))];
    if (refs.length === 1) {
      const ref = refs[0]!;
      const id = `f:${columnKey(ref)}`;
      units.push({ id, kind: "field", refs, detectionIds: dets.map((d) => d.id) });
      const d = dets[0];
      if (d?.spanSummary) {
        for (const [label, n] of Object.entries(d.spanSummary.byLabel)) {
          if (n > 0) units.push({ id: `s:${columnKey(ref)}:${label}`, kind: "span_class", refs, spanLabel: label as SpanLabel, detectionIds: [d.id], parentUnitId: id });
        }
      }
    } else {
      units.push({ id: `g:${refs.map(columnKey).join("+")}`, kind: "field_group", refs, relationshipIds: relIds, detectionIds: dets.map((d) => d.id) });
    }
  }
  units.sort((a, b) => a.id.localeCompare(b.id));
  return units;
}
