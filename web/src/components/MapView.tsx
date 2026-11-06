import { useMemo, useState } from "react";
import { fmt, outgoingByArea, type Corridor } from "../data/derive";
import { areaLabel, type Release } from "../data/release";

interface Props {
  rel: Release;
  band: string;
  corridors: Corridor[];       // already ranked and limited
  highlight: number;           // how many of them are the shortlist
  selected: string | null;
  origin: string | null;
  onSelect: (id: string) => void;
  onOrigin: (area: string | null) => void;
}

const W = 760, H = 500, PAD = 46;

/** Schematic map: public area points (unweighted stop centroids) and straight-line-free arcs. No basemap, no roads. */
export function MapView({ rel, band, corridors, highlight, selected, origin, onSelect, onOrigin }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const proj = useMemo(() => {
    // Equirectangular, then a radial "centre-enlarged" warp (r' = r^0.5) around the median point so the dense city
    // centre is readable. Directions are kept; distances are deliberately not to scale (stated in the caption).
    const lat0 = rel.areas.reduce((s, a) => s + a.lat, 0) / rel.areas.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const cx = med(rel.areas.map((a) => a.lon * kx)), cy = med(rel.areas.map((a) => -a.lat));
    const raw = rel.areas.map((a) => [a.lon * kx - cx, -a.lat - cy]);
    const rmax = Math.max(...raw.map(([x, y]) => Math.hypot(x, y))) || 1;
    const warped = raw.map(([x, y]) => {
      const r = Math.hypot(x, y);
      if (!r) return [0, 0];
      const k = (rmax * Math.pow(r / rmax, 0.5)) / r;
      return [x * k, y * k];
    });
    const xs = warped.map((p) => p[0]), ys = warped.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((W - 2 * PAD - 90) / (x1 - x0 || 1), (H - 2 * PAD) / (y1 - y0 || 1));
    const ox = (W - 90 - s * (x1 - x0)) / 2, oy = (H - s * (y1 - y0)) / 2;
    return new Map(rel.areas.map((a, i) => [a.id, { x: ox + (warped[i][0] - x0) * s, y: oy + (warped[i][1] - y0) * s }]));
  }, [rel]);
  const out = useMemo(() => outgoingByArea(rel, band), [rel, band]);
  const maxOut = Math.max(1, ...out.values());
  const maxTrips = Math.max(1, ...corridors.map((c) => c.trips));
  const involved = new Set(corridors.flatMap((c) => [c.origin_area, c.destination_area]));

  const arc = (c: Corridor) => {
    const a = proj.get(c.origin_area)!, b = proj.get(c.destination_area)!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const k = Math.max(0.22 * len, 14);                       // bend to the left of the travel direction: A→B and B→A stay apart
    const cx = (a.x + b.x) / 2 - (dy / len) * k, cy = (a.y + b.y) / 2 + (dx / len) * k;
    // stop short of the destination dot so the arrow head stays visible
    const ex = b.x - ((b.x - cx) / Math.hypot(b.x - cx, b.y - cy)) * 9, ey = b.y - ((b.y - cy) / Math.hypot(b.x - cx, b.y - cy)) * 9;
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  };

  // draw weak arcs first, shortlist last (on top)
  const ordered = [...corridors].sort((a, b) => b.rank - a.rank);
  return (
    <figure className="map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="map-title map-desc">
        <title id="map-title">Schematic corridor map</title>
        <desc id="map-desc">
          Public area points with arcs for the {corridors.length} strongest released corridors in this time band. Arc thickness is the released estimate. The same corridors are listed in the table.
        </desc>
        <defs>
          <marker id="arrow-strong" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-strong" />
          </marker>
          <marker id="arrow-weak" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="arrow-weak" />
          </marker>
        </defs>
        {ordered.map((c) => {
          const strong = c.rank <= highlight;
          const isSel = selected === c.id;
          return (
            <path
              key={c.id}
              d={arc(c)}
              className={`arc ${strong ? "arc-strong" : "arc-weak"} ${isSel ? "arc-selected" : ""} ${hover === c.id ? "arc-hover" : ""}`}
              strokeWidth={1.5 + 6.5 * (c.trips / maxTrips)}
              markerEnd={`url(#${strong ? "arrow-strong" : "arrow-weak"})`}
              tabIndex={0}
              role="button"
              aria-label={`Rank ${c.rank}: ${areaLabel(c.origin_area)} to ${areaLabel(c.destination_area)}, ${fmt(c.trips)} inferred journeys`}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(c.id))}
            >
              <title>{`#${c.rank} ${areaLabel(c.origin_area)} → ${areaLabel(c.destination_area)}: ${fmt(c.trips)} inferred journeys (uncertain)`}</title>
            </path>
          );
        })}
        {rel.areas.map((a) => {
          const p = proj.get(a.id)!;
          const r = 3 + 7 * Math.sqrt((out.get(a.id) ?? 0) / maxOut);
          const isOrigin = origin === a.id;
          return (
            <g key={a.id} className={`area ${involved.has(a.id) ? "area-involved" : ""} ${isOrigin ? "area-origin" : ""}`}
              onClick={() => onOrigin(isOrigin ? null : a.id)} role="button" tabIndex={0}
              aria-label={`${areaLabel(a.id)}: ${fmt(out.get(a.id) ?? 0)} released journeys start here in this band. Activate to filter by origin.`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOrigin(isOrigin ? null : a.id))}>
              <circle cx={p.x} cy={p.y} r={r} />
              <text x={p.x + r + 4} y={p.y + 4}>{areaLabel(a.id)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span className="legend-line" aria-hidden="true" /> arc thickness = released estimate&nbsp;&nbsp;
        <span className="legend-dot" aria-hidden="true" /> dot size = released journeys starting there&nbsp;&nbsp;·&nbsp;&nbsp;
        Schematic, centre enlarged: points are unweighted centroids of public stops, directions are kept but distances are not to scale, and arcs are not road paths. Click an area to filter by origin.
      </figcaption>
    </figure>
  );
}
