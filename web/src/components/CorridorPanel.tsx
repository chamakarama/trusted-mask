import { BANDS, fmt, weekdaysInPeriod, type Corridor, type Level, type Point } from "../data/derive";
import { areaLabel, type Release } from "../data/release";
import { IconArrow, IconWarn } from "./Icons";

export const BAND_SHORT: Record<string, [string, string]> = {
  "00-06": ["Night", "00–06"], "06-09": ["Morning", "06–09"], "09-15": ["Midday", "09–15"], "15-18": ["Afternoon", "15–18"], "18-24": ["Evening", "18–24"],
};

interface Props {
  rel: Release;
  level: Level;
  originOptions: Point[];
  onLevel: (l: Level) => void;
  band: string;
  origin: string | null;
  ranked: Corridor[];
  shortlist: number;
  selected: string | null;
  onBand: (b: string) => void;
  onOrigin: (a: string | null) => void;
  onSelect: (id: string) => void;
}

export function CorridorPanel({ rel, level, originOptions, onLevel, band, origin, ranked, shortlist, selected, onBand, onOrigin, onSelect }: Props) {
  const days = weekdaysInPeriod(rel);
  const top = ranked.slice(0, shortlist);
  const max = Math.max(1, ...top.map((c) => c.trips));
  const sel = ranked.find((c) => c.id === selected) ?? null;
  return (
    <section className="panel" aria-labelledby="decision-title">
      <div className="eyebrow">Shortlist</div>
      <h2 id="decision-title">Top {shortlist} routes to look at</h2>
      <div className="bandbar" role="radiogroup" aria-label="Time of day">
        {BANDS.map((b) => (
          <button key={b} role="radio" aria-checked={b === band} className={`band ${b === band ? "band-on" : ""}`} onClick={() => onBand(b)} title={BAND_SHORT[b][1]}>
            {BAND_SHORT[b][0]}
          </button>
        ))}
      </div>
      <div className="controls">
        <div className="seg" role="radiogroup" aria-label="Detail level">
          <button role="radio" aria-checked={level === "area"} className={`seg-btn ${level === "area" ? "seg-on" : ""}`} onClick={() => onLevel("area")}>Areas</button>
          <button role="radio" aria-checked={level === "municipality"} className={`seg-btn ${level === "municipality" ? "seg-on" : ""}`} onClick={() => onLevel("municipality")}>Towns</button>
        </div>
        <label className="field">
          <span>Starting from</span>
          <select value={origin ?? ""} onChange={(e) => onOrigin(e.target.value || null)}>
            <option value="">{level === "area" ? "Anywhere" : "Any town"}</option>
            {[...originOptions].sort((a, b) => a.id.localeCompare(b.id)).map((a) => <option key={a.id} value={a.id}>{areaLabel(a.id)}</option>)}
          </select>
        </label>
      </div>

      <ol className="shortlist">
        {top.map((c) => (
          <li key={c.id}>
            <button className={`card ${selected === c.id ? "card-on" : ""}`} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id}>
              <span className="rank" aria-hidden="true">{c.rank}</span>
              <span className="card-body">
                <span className="route">{areaLabel(c.origin_area)} <IconArrow /> <span className="sr-only">to</span>{areaLabel(c.destination_area)}</span>
                <span className="value"><strong>{fmt(c.trips)}</strong> trips · about {fmt(c.trips / days)} per weekday</span>
                <span className="meter" aria-hidden="true"><span style={{ width: `${(100 * c.trips) / max}%` }} /></span>
              </span>
            </button>
          </li>
        ))}
        {!top.length && <li className="empty">Nothing here. <button className="link" onClick={() => onOrigin(null)}>Show all</button></li>}
      </ol>
      <p className="note"><IconWarn />
        <span>These are protected estimates with random noise added, so routes with similar numbers can swap places.{level === "municipality" && " Town numbers add up the areas' signed estimates and then clamp at zero, with no new noise."}</span>
      </p>

      {sel && (
        <details className="detail" open>
          <summary className="small"><strong>{areaLabel(sel.origin_area)} → {areaLabel(sel.destination_area)}</strong> · {BAND_SHORT[sel.hour_band][0]} {BAND_SHORT[sel.hour_band][1]}</summary>
          <dl>
            <dt>Trips (4 weeks)</dt><dd>{fmt(sel.trips)}</dd>
            <dt>Per weekday</dt><dd>about {fmt(sel.trips / days)} ({days} weekdays)</dd>
            <dt>Raw protected value</dt><dd>{fmt(sel.noisy_value)} <span className="muted">(shown as 0 if below 0)</span></dd>
            <dt>Margin of error</dt><dd>not published yet for this release</dd>
            <dt>Destination</dt><dd>estimated from where the same card next starts a journey (quick transfers removed), not observed</dd>
          </dl>
        </details>
      )}

      {ranked.length > shortlist && (
        <details className="more">
          <summary>More routes</summary>
          <table className="table">
            <thead><tr><th scope="col">#</th><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Trips</th></tr></thead>
            <tbody>
              {ranked.slice(shortlist, 10).map((c) => (
                <tr key={c.id} className={selected === c.id ? "row-on" : ""} onClick={() => onSelect(c.id)}>
                  <td>{c.rank}</td><td>{areaLabel(c.origin_area)}</td><td>{areaLabel(c.destination_area)}</td><td className="num">{fmt(c.trips)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
