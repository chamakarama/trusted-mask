import { dailySeries, fmt, lineTotals } from "../data/derive";
import type { Release } from "../data/release";
import { UncertainBadge } from "./CorridorPanel";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Line × hour heatmap of released weekday boardings (whole period). */
export function LineHourView({ rel }: { rel: Release }) {
  const lines = lineTotals(rel);
  const max = Math.max(1, ...rel.lineHour.map((c) => c.boardings));
  const shade = (v: number) => {
    const t = Math.sqrt(v / max);
    return `color-mix(in oklab, var(--demand) ${Math.round(8 + 92 * t)}%, var(--surface))`;
  };
  return (
    <section className="panel wide" aria-labelledby="lh-title">
      <h2 id="lh-title">Weekday boardings by line and hour</h2>
      <p className="muted small">{rel.definitions.line_hour} One cell = one line in one clock hour, summed over the whole period. <UncertainBadge /></p>
      <div className="heat-wrap">
        <table className="heat">
          <caption className="sr-only">Released weekday boardings per line (rows) and hour (columns)</caption>
          <thead>
            <tr><th scope="col">Line</th>{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="hour">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}<span className="sr-only">{h}:00</span></th>)}<th scope="col" className="num">Total</th></tr>
          </thead>
          <tbody>
            {lines.map(({ line, cells, total }) => (
              <tr key={line}>
                <th scope="row">{line === "unknown" ? "Unknown line" : `Line ${line}`}</th>
                {cells.map((c) => (
                  <td key={c.hour} style={{ background: shade(c.boardings) }} title={`Line ${line}, ${String(c.hour).padStart(2, "0")}:00–${String(c.hour + 1).padStart(2, "0")}:00: ${fmt(c.boardings)} boardings (uncertain)`}>
                    <span className="sr-only">{fmt(c.boardings)}</span>
                  </td>
                ))}
                <td className="num">{fmt(total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        “Unknown line” collects boardings on lines missing from the public line roster; it is a fixed public bucket, not hidden detail.
        This table cannot show origins, destinations or dates per line: those breakdowns were not released.
      </p>
    </section>
  );
}

/** Recorded tap events per calendar date. */
export function DailyView({ rel }: { rel: Release }) {
  const days = dailySeries(rel);
  const max = Math.max(1, ...days.map((d) => d.tap_events));
  const W = 760, H = 260, L = 56, B = 34, T = 12;
  const bw = (W - L - 8) / days.length;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round((max * t) / 1000) * 1000);
  return (
    <section className="panel wide" aria-labelledby="daily-title">
      <h2 id="daily-title">Recorded tap events per day</h2>
      <p className="muted small">{rel.definitions.daily} Includes weekends. <UncertainBadge /></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-labelledby="daily-title">
        {ticks.map((t) => {
          const y = T + (H - T - B) * (1 - t / max);
          return <g key={t}><line x1={L} x2={W - 4} y1={y} y2={y} className="grid" /><text x={L - 8} y={y + 4} className="axis" textAnchor="end">{fmt(t)}</text></g>;
        })}
        {days.map((d, i) => {
          const h = (H - T - B) * (d.tap_events / max);
          const x = L + i * bw;
          const weekend = d.weekday === 0 || d.weekday === 6;
          return (
            <g key={d.date}>
              <rect x={x + 1.5} y={H - B - h} width={bw - 3} height={h} className={weekend ? "bar bar-weekend" : "bar"}>
                <title>{`${DOW[d.weekday]} ${d.date}: ${fmt(d.tap_events)} tap events (uncertain)`}</title>
              </rect>
              {d.weekday === 1 && <text x={x + bw / 2} y={H - B + 16} className="axis" textAnchor="middle">Mon {d.date.slice(8)}.{d.date.slice(5, 7)}</text>}
            </g>
          );
        })}
      </svg>
      <p className="muted small"><span className="swatch swatch-weekday" /> weekday&nbsp;&nbsp;<span className="swatch swatch-weekend" /> weekend · {rel.manifest.period.timestamp_ambiguity_policy}</p>
    </section>
  );
}
