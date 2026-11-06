import { useState, type MouseEvent } from "react";
import { fmt } from "../data/derive";
import { areaLabel, niceDate } from "../data/release";

// Exact vs protected on the synthetic data (Astra's reviewed evidence summary, `utility_comparison`). Shown only because
// the data is synthetic; a real operator would keep these exact numbers private.
// Two series: exact = neutral grey, protected = released-demand blue. Legend always shown; values in tooltips.
const EXACT = "#8f8c84", PROT = "#2a78d6";

interface Day { date: string; exact: number; protected: number }
interface Route { origin_area: string; destination_area: string; exact: number; protected: number; exact_rank?: number }

function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  return {
    show: (e: MouseEvent, html: React.ReactNode) => setTip({ x: e.clientX, y: e.clientY, html }),
    hide: () => setTip(null),
    el: tip ? <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div> : null,
  };
}

const Legend = () => (
  <p className="small ink2 ba-legend">
    <span className="swatch" style={{ background: EXACT }} />exact (synthetic truth)
    <span className="swatch" style={{ background: PROT, marginLeft: 12 }} />protected (what was released)
  </p>
);

function DailyCompare({ days }: { days: Day[] }) {
  const W = 560, H = 200, L = 44, B = 24, T = 10, R = 8;
  const max = Math.max(1, ...days.flatMap((d) => [d.exact, d.protected]));
  const top = Math.ceil(max / 10000) * 10000;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, days.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const line = (k: "exact" | "protected") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const { show, hide, el } = useTip();
  return (
    <div onMouseLeave={hide}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Taps per day, exact versus protected">
        {[0, 0.5, 1].map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(top * t)} y2={y(top * t)} className={t === 0 ? "base" : "grid"} />
            <text x={L - 6} y={y(top * t) + 4} className="axis" textAnchor="end">{t === 0 ? "0" : `${Math.round((top * t) / 1000)}K`}</text></g>
        ))}
        <path d={line("exact")} fill="none" stroke={EXACT} strokeWidth={2} />
        <path d={line("protected")} fill="none" stroke={PROT} strokeWidth={2} strokeDasharray="5 3" />
        {days.map((d, i) => (
          <rect key={d.date} x={x(i) - (W - L - R) / days.length / 2} y={T} width={(W - L - R) / days.length} height={H - T - B} fill="transparent"
            onMouseMove={(e) => show(e, <><b>{niceDate(d.date, false)}</b><br />exact {fmt(d.exact)} · protected {fmt(d.protected)}</>)} />
        ))}
        {days.map((d, i) => (new Date(d.date + "T00:00:00Z").getUTCDay() === 1
          ? <text key={d.date} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{niceDate(d.date, false)}</text> : null))}
      </svg>
      {el}
    </div>
  );
}

function TopRoutesCompare({ routes }: { routes: Route[] }) {
  const max = Math.max(1, ...routes.flatMap((r) => [r.exact, r.protected]));
  const { show, hide, el } = useTip();
  return (
    <div className="ba-routes" onMouseLeave={hide}>
      {routes.map((r, i) => (
        <div key={r.origin_area + r.destination_area} className="ba-row"
          onMouseMove={(e) => show(e, <><b>{areaLabel(r.origin_area)} → {areaLabel(r.destination_area)}</b><br />exact {fmt(r.exact)} · protected {fmt(r.protected)}</>)}>
          <span className="ba-label">{i + 1}. {areaLabel(r.origin_area)} → {areaLabel(r.destination_area)}</span>
          <span className="ba-bars" aria-label={`exact ${fmt(r.exact)}, protected ${fmt(r.protected)}`}>
            <span style={{ width: `${(100 * r.exact) / max}%`, background: EXACT }} />
            <span style={{ width: `${(100 * r.protected) / max}%`, background: PROT }} />
          </span>
        </div>
      ))}
      {el}
    </div>
  );
}

/** Before/after on the synthetic data. Renders nothing until the reviewed summary carries `utility_comparison`. */
export function BeforeAfter({ uc }: { uc: any }) {
  if (!uc) return null;
  const days: Day[] = Array.isArray(uc.daily) ? uc.daily : [];
  const routes: Route[] = Array.isArray(uc.morning_top10) ? uc.morning_top10 : [];
  const src = uc.error_sources ?? null;
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  return (
    <section className="ba">
      <h3>Exact vs protected, side by side <span className="tiny muted">synthetic evaluation: the exact reference is not part of the protected release</span></h3>
      <Legend />
      <div className="ba-grid">
        {!!days.length && <div><h4>Taps per day</h4><DailyCompare days={days} /></div>}
        {!!routes.length && <div><h4>Busiest morning routes (by exact count)</h4><TopRoutesCompare routes={routes} /></div>}
      </div>
      {src && (
        <table className="table small ba-src">
          <thead><tr><th>Where the error comes from</th><th className="num">Per-card cap</th><th className="num">Random noise</th><th className="num">Total</th></tr></thead>
          <tbody>
            {[["od", "Routes"], ["line_hour", "Lines per hour"], ["daily", "Taps per day"]].filter(([k]) => src[k]).map(([k, label]) => (
              <tr key={k}><td>{label}</td><td className="num">{pct(src[k].cap)}</td><td className="num">{pct(src[k].noise)}</td><td className="num">{pct(src[k].total)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tiny muted">Volume-weighted errors, each on its own base: per-card cap = share of the exact count the cap removes; random noise = error of the released numbers against the capped counts; total = error of the released numbers against the exact counts. Different bases, and noise and clamping can partly cancel the cap, so they don't add up. Exact numbers exist only because the data is synthetic.</p>
    </section>
  );
}
