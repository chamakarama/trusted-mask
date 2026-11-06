import { useState, type MouseEvent } from "react";
import { dailySeries, fmt, lineTotals } from "../data/derive";
import type { Release } from "../data/release";
import { Uncertain } from "./Icons";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// validated sequential blue ramp (dataviz reference palette), lightest = near zero
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const shade = (t: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))];

interface Tip { x: number; y: number; html: React.ReactNode }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: MouseEvent, html: React.ReactNode) => setTip({ x: e.clientX, y: e.clientY, html });
  const hide = () => setTip(null);
  const el = tip ? <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div> : null;
  return { show, hide, el };
}

/** Line x hour heatmap of released weekday boardings (whole period). */
export function LineHourView({ rel }: { rel: Release }) {
  const lines = lineTotals(rel);
  const max = Math.max(1, ...rel.lineHour.map((c) => c.boardings));
  const { show, hide, el } = useTip();
  const label = (l: string) => (l === "unknown" ? "Other lines" : `Line ${l}`);
  return (
    <section className="panel wide" aria-labelledby="lh-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Heatmap</div>
          <h2 id="lh-title">Busiest bus lines by hour</h2>
          <p className="small ink2">Weekday boardings over the 4 weeks. Darker = more people getting on.</p>
        </div>
        <Uncertain label="protected estimates" />
      </div>
      <div className="heat-wrap" onMouseLeave={hide}>
        <table className="heat">
          <caption className="sr-only">Released weekday boardings per line (rows) and hour of day (columns)</caption>
          <thead>
            <tr><th scope="col"><span className="sr-only">Line</span></th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="hour">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}<span className="sr-only">{h}:00</span></th>)}<th scope="col" className="num">Total</th></tr>
          </thead>
          <tbody>
            {lines.map(({ line, cells, total }) => (
              <tr key={line}>
                <th scope="row">{label(line)}</th>
                {cells.map((c) => (
                  <td key={c.hour} style={{ background: shade(Math.sqrt(c.boardings / max)) }}
                    onMouseMove={(e) => show(e, <><b>{label(line)}</b> · {String(c.hour).padStart(2, "0")}:00–{String(c.hour + 1).padStart(2, "0")}:00<br />{fmt(c.boardings)} boardings</>)}>
                    <span className="sr-only">{fmt(c.boardings)}</span>
                  </td>
                ))}
                <td className="num">{fmt(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {el}
      </div>
      <div className="scale"><span>fewer</span><span className="scale-bar" aria-hidden="true" /><span>more boardings</span></div>
      <p className="tiny muted">“Other lines” = lines missing from the public line list. Origins, destinations and dates per line are not part of this release.</p>
    </section>
  );
}

/** Recorded tap events per calendar date (bars: <=24px, 4px rounded data end, square at the baseline). */
export function DailyView({ rel }: { rel: Release }) {
  const days = dailySeries(rel);
  const max = Math.max(1, ...days.map((d) => d.tap_events));
  const top = Math.ceil(max / 10000) * 10000;
  const W = 960, H = 280, L = 52, B = 30, T = 14, R = 8;
  const slot = (W - L - R) / days.length, bw = Math.min(24, slot - 6);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const { show, hide, el } = useTip();
  return (
    <section className="panel wide" aria-labelledby="daily-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Daily</div>
          <h2 id="daily-title">Taps per day</h2>
          <p className="small ink2"><span className="swatch sw-weekday" />weekdays <span className="swatch sw-weekend" style={{ marginLeft: 10 }} />weekends</p>
        </div>
        <Uncertain label="protected estimates" />
      </div>
      <div onMouseLeave={hide}>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-labelledby="daily-title">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}><line x1={L} x2={W - R} y1={y(top * t)} y2={y(top * t)} className={t === 0 ? "base" : "grid"} />
              <text x={L - 8} y={y(top * t) + 4} className="axis" textAnchor="end">{t === 0 ? "0" : `${Math.round((top * t) / 1000)}K`}</text></g>
          ))}
          {days.map((d, i) => {
            const x = L + i * slot + (slot - bw) / 2, h = y(0) - y(d.tap_events), weekend = d.weekday === 0 || d.weekday === 6, r = Math.min(4, h);
            const path = `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z`;
            return (
              <g key={d.date}>
                <path d={path} className={weekend ? "bar bar-weekend" : "bar"} onMouseMove={(e) => show(e, <><b>{DOW[d.weekday]} {d.date.slice(8)}.{d.date.slice(5, 7)}.</b><br />{fmt(d.tap_events)} taps</>)} />
                {d.weekday === 1 && <text x={x + bw / 2} y={H - 10} className="axis" textAnchor="middle">Mon {Number(d.date.slice(8))}.{Number(d.date.slice(5, 7))}.</text>}
              </g>
            );
          })}
        </svg>
        {el}
      </div>
      <p className="tiny muted">All recorded taps, including weekends. The clock change on 26 Oct is not adjusted.</p>
    </section>
  );
}

export function WhenView({ rel }: { rel: Release }) {
  return <div className="layout"><LineHourView rel={rel} /><DailyView rel={rel} /></div>;
}
