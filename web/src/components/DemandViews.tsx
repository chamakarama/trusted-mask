import { useState, type MouseEvent } from "react";
import { cellRadius, dailySeries, familyScale, fmt, hourTotals, lineTotals, noiseRadius } from "../data/derive";
import { niceDate, type Release } from "../data/release";
import { IconShield } from "./Icons";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// validated sequential blue ramp (dataviz reference palette), lightest = smallest clearly-real value
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const shade = (t: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))];
const hh = (h: number) => String(h).padStart(2, "0");

interface Tip { x: number; y: number; html: React.ReactNode }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: MouseEvent, html: React.ReactNode) => setTip({ x: e.clientX, y: e.clientY, html });
  const hide = () => setTip(null);
  const el = tip ? <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div> : null;
  return { show, hide, el };
}

const Noise = () => <span className="badge"><IconShield /> noise added</span>;

/** Line x hour heatmap of released weekday boardings (whole period). Cells inside the noise range are grey. */
export function LineHourView({ rel }: { rel: Release }) {
  const lines = lineTotals(rel);
  const r = cellRadius(rel, "line_hour");
  const reach = noiseRadius(familyScale(rel, "line_hour"), 0.05 / Math.max(1, rel.lineHour.length));
  const max = Math.max(1, ...rel.lineHour.map((c) => c.boardings));
  const { show, hide, el } = useTip();
  const label = (l: string) => (l === "unknown" ? "Other lines" : `Line ${l}`);
  const real = (v: number) => v > r;
  return (
    <section className="panel wide" aria-labelledby="lh-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Heatmap</div>
          <h2 id="lh-title">Busiest bus lines by hour</h2>
          <p className="small ink2">Weekday boardings over the 4 weeks. Darker = more boardings. <span className="swatch sw-noise" />Grey = under {fmt(r)}: too small to tell apart from noise.</p>
        </div>
        <Noise />
      </div>
      <div className="heat-wrap" onMouseLeave={hide}>
        <table className="heat">
          <caption className="sr-only">Released weekday boardings per line (rows) and hour of day (columns)</caption>
          <thead>
            <tr><th scope="col"><span className="sr-only">Line</span></th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="hour">{h % 3 === 0 ? hh(h) : ""}<span className="sr-only">{h}:00</span></th>)}<th scope="col" className="num">Total</th></tr>
          </thead>
          <tbody>
            {lines.map(({ line, cells, total }) => {
              const allNoise = cells.every((c) => !real(c.noisy_value));
              return (
                <tr key={line} className={allNoise ? "row-noise" : ""}>
                  <th scope="row">{label(line)}</th>
                  {cells.map((c) => (
                    <td key={c.hour} className={real(c.noisy_value) ? "" : "cell-noise"} style={real(c.noisy_value) ? { background: shade(Math.sqrt(c.boardings / max)) } : undefined}
                      onMouseMove={(e) => show(e, <><b>{label(line)}</b> · {hh(c.hour)}:00–{hh(c.hour + 1)}:00<br />{fmt(c.boardings)} boardings ±{fmt(r)}{real(c.noisy_value) ? "" : " · could be zero"}</>)}>
                      <span className="sr-only">{fmt(c.boardings)}{real(c.noisy_value) ? "" : " (within noise)"}</span>
                    </td>
                  ))}
                  <td className={`num ${allNoise ? "muted" : ""}`}>{fmt(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {el}
      </div>
      <div className="scale"><span className="swatch sw-noise" /><span>within noise</span><span className="scale-bar" aria-hidden="true" /><span>more boardings</span></div>
      <p className="tiny muted">Each cell is ±{fmt(r)} (95% range, noise only). With {fmt(rel.lineHour.length)} cells, a few empty ones can still show up to about {fmt(reach)}. Totals add the signed estimates, then clamp at zero. “Other lines” = lines missing from the public line list. Routes per line and dates per line are not part of this release.</p>
    </section>
  );
}

/** Recorded tap events per calendar date (bars <=24px, 4px rounded data end), with the 95% noise range as a whisker. */
export function DailyView({ rel }: { rel: Release }) {
  const days = dailySeries(rel);
  const r = cellRadius(rel, "daily");
  const max = Math.max(1, ...days.map((d) => d.tap_events + r));
  const top = Math.ceil(max / 10000) * 10000;
  const W = 960, H = 280, L = 52, B = 30, T = 14, R = 8;
  const slot = (W - L - R) / days.length, bw = Math.min(24, slot - 6);
  const y = (v: number) => T + (H - T - B) * (1 - Math.max(0, v) / top);
  const { show, hide, el } = useTip();
  return (
    <section className="panel wide" aria-labelledby="daily-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">Daily</div>
          <h2 id="daily-title">Taps per day</h2>
          <p className="small ink2"><span className="swatch sw-weekday" />weekdays <span className="swatch sw-weekend" style={{ marginLeft: 10 }} />weekends <span className="whisker-key" style={{ marginLeft: 10 }} />±{fmt(r)} noise range</p>
        </div>
        <Noise />
      </div>
      <div onMouseLeave={hide}>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-labelledby="daily-title">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}><line x1={L} x2={W - R} y1={y(top * t)} y2={y(top * t)} className={t === 0 ? "base" : "grid"} />
              <text x={L - 8} y={y(top * t) + 4} className="axis" textAnchor="end">{t === 0 ? "0" : `${Math.round((top * t) / 1000)}K`}</text></g>
          ))}
          {days.map((d, i) => {
            const x = L + i * slot + (slot - bw) / 2, h = y(0) - y(d.tap_events), weekend = d.weekday === 0 || d.weekday === 6, rr = Math.min(4, h);
            const path = `M${x},${y(0)} V${y(0) - h + rr} Q${x},${y(0) - h} ${x + rr},${y(0) - h} H${x + bw - rr} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + rr} V${y(0)} Z`;
            const cx = x + bw / 2;
            return (
              <g key={d.date} onMouseMove={(e) => show(e, <><b>{DOW[d.weekday]} {niceDate(d.date, false)}</b><br />{fmt(d.tap_events)} taps ±{fmt(r)}</>)}>
                <path d={path} className={weekend ? "bar bar-weekend" : "bar"} />
                <line x1={cx} x2={cx} y1={y(d.noisy_value + r)} y2={y(d.noisy_value - r)} className="whisker" />
                <line x1={cx - 3} x2={cx + 3} y1={y(d.noisy_value + r)} y2={y(d.noisy_value + r)} className="whisker" />
                <line x1={cx - 3} x2={cx + 3} y1={y(d.noisy_value - r)} y2={y(d.noisy_value - r)} className="whisker" />
                {d.weekday === 1 && <text x={cx} y={H - 10} className="axis" textAnchor="middle">Mon {niceDate(d.date, false)}</text>}
              </g>
            );
          })}
        </svg>
        {el}
      </div>
      <p className="tiny muted">All recorded taps, including weekends. Whiskers show the 95% noise range (noise only). The clock change on 26 Oct is not adjusted.</p>
    </section>
  );
}

export function WhenView({ rel }: { rel: Release }) {
  const hours = hourTotals(rel);
  const peak = (from: number, to: number) => { let best = from; for (let h = from; h < to; h++) if (hours[h] > hours[best]) best = h; return best; };
  const am = peak(5, 12), pm = peak(12, 21);
  const busiest = lineTotals(rel).find((l) => l.line !== "unknown");
  return (
    <div className="layout">
      <div className="headline">
        <div>
          <h1>Boardings peak at {hh(am)}–{hh(am + 1)} and {hh(pm)}–{hh(pm + 1)}{busiest ? `; Line ${busiest.line} is the busiest` : ""}</h1>
          <p>Weekday boardings per line and hour, and all taps per day, {niceDate(rel.manifest.period.start_date, false)} – {niceDate(rel.manifest.period.end_date_inclusive)}. Protected counts with random noise.</p>
        </div>
      </div>
      <LineHourView rel={rel} />
      <DailyView rel={rel} />
    </div>
  );
}
