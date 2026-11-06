import { BANDS, fmt, weekdaysInPeriod, type Corridor, type Level, type Point, type Reliability } from "../data/derive";
import { areaLabel, type Release } from "../data/release";
import { IconArrow, IconCheck, IconInfo, IconWarn } from "./Icons";

export const BAND_SHORT: Record<string, [string, string]> = {
  "00-06": ["Night", "00–06"], "06-09": ["Morning", "06–09"], "09-15": ["Midday", "09–15"], "15-18": ["Afternoon", "15–18"], "18-24": ["Evening", "18–24"],
};

/** What the synthetic exact-data test says about THIS shortlist (only weekday mornings, all start areas, were tested). */
export interface ShortlistCheck { exact: number; draws: number; townOverlap: number | null; k: number }

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
  rely: Reliability | null;
  check: ShortlistCheck | null;
  capLoss: number | null;
  onBand: (b: string) => void;
  onOrigin: (a: string | null) => void;
  onSelect: (id: string) => void;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Ties as plain words: [[1,2],[2,3]] -> "#1, #2 and #3 could swap places". */
function tiePhrase(ties: [number, number][], k: number): string | null {
  if (!ties.length) return null;
  const groups: number[][] = [];
  for (const [a, b] of ties) {
    const g = groups[groups.length - 1];
    if (g && g[g.length - 1] === a) g.push(b); else groups.push([a, b]);
  }
  return groups.map((g) => (g[g.length - 1] > k
    ? `#${g.slice(0, -1).join(", #")} could swap with #${g[g.length - 1]}, just outside the list`
    : `${list(g.map((r) => `#${r}`))} could swap places`)).join("; ") + ".";
}

export function CorridorPanel({ rel, level, originOptions, onLevel, band, origin, ranked, shortlist, selected, rely, check, capLoss, onBand, onOrigin, onSelect }: Props) {
  const days = weekdaysInPeriod(rel);
  const top = ranked.slice(0, shortlist);
  const max = Math.max(1, ...top.map((c) => c.trips));
  const sel = ranked.find((c) => c.id === selected) ?? null;
  const cap = rel.manifest.privacy.families.od.cap;
  const noisy = new Set(rely?.noiseOnly ?? []);
  const ties = rely ? tiePhrase(rely.ties, shortlist) : null;

  let status: { tone: "ok" | "warn" | "info"; text: string };
  if (rely && rely.noiseOnly.length) {
    status = { tone: "warn", text: `Could be pure noise. With ${fmt(rely.candidates)} routes to pick from, noise alone can reach about ${fmt(rely.floor)} trips, and ${rely.noiseOnly.length === top.length ? "all of these are" : `#${rely.noiseOnly.join(", #")} ${rely.noiseOnly.length === 1 ? "is" : "are"}`} below that. Don't decide on ${rely.noiseOnly.length === 1 ? "it" : "these"}.` };
  } else if (check && level === "area") {
    status = { tone: "ok", text: `Checked: same top ${check.k} as the exact data in ${check.exact} of ${check.draws} noise re-runs (synthetic test).${ties ? ` ${ties}` : ""}` };
  } else if (check && level === "municipality" && check.townOverlap !== null) {
    status = { tone: "ok", text: `Checked once: ${check.townOverlap} of ${check.k} town pairs match the exact data (synthetic test). Town totals add up many areas' noise, so no ± range is shown.` };
  } else {
    status = { tone: "info", text: `Not tested against the exact data: only weekday mornings were.${ties ? ` ${ties}` : ""}${level === "municipality" ? " Town totals add up many areas' noise, so no ± range is shown." : ""}` };
  }

  return (
    <section className="panel" aria-labelledby="decision-title">
      <div className="eyebrow">Shortlist</div>
      <h2 id="decision-title">Top {shortlist} routes to look at</h2>
      <div className="bandbar" role="radiogroup" aria-label="Time of day">
        {BANDS.map((b) => (
          <button key={b} role="radio" aria-checked={b === band} className={`band ${b === band ? "band-on" : ""}`} onClick={() => onBand(b)}>
            {BAND_SHORT[b][0]}<small>{BAND_SHORT[b][1]}</small>
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

      <p className={`status status-${status.tone}`} role="status">
        {status.tone === "ok" ? <IconCheck /> : status.tone === "warn" ? <IconWarn /> : <IconInfo />}<span>{status.text}</span>
      </p>

      <ol className="shortlist">
        {top.map((c) => (
          <li key={c.id}>
            <button className={`card ${selected === c.id ? "card-on" : ""} ${noisy.has(c.rank) ? "card-noise" : ""}`} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id}>
              <span className="rank" aria-hidden="true">{c.rank}</span>
              <span className="card-body">
                <span className="route">{areaLabel(c.origin_area)} <IconArrow /> <span className="sr-only">to</span>{areaLabel(c.destination_area)}
                  {noisy.has(c.rank) && <span className="badge badge-warn"><IconWarn /> could be noise</span>}</span>
                <span className="value"><strong>{fmt(c.trips)}</strong> trips{rely && <span className="pm"> ±{fmt(rely.radius)}</span>} · about {fmt(c.trips / days)} per weekday</span>
                <span className="meter" aria-hidden="true"><span style={{ width: `${(100 * c.trips) / max}%` }} /></span>
              </span>
            </button>
          </li>
        ))}
        {!top.length && <li className="empty">Nothing here. <button className="link" onClick={() => onOrigin(null)}>Show all</button></li>}
      </ol>

      <details className="limits">
        <summary>What these numbers can't tell you</summary>
        <ul className="plain small">
          {rely && <li><strong>Noise:</strong> each route is ±{fmt(rely.radius)} trips (95% range) from the random noise, so close routes can swap places.</li>}
          <li><strong>Capped:</strong> each travel card counts at most {cap} trips, so busy commuter routes read low{capLoss !== null ? ` (about ${Math.round(capLoss * 100)}% of all trips are not counted)` : ""}.</li>
          <li><strong>Estimated destinations:</strong> where the same card next starts a journey (quick transfers removed), not observed.</li>
          <li><strong>Trips, not people:</strong> one person can make many trips.</li>
          {level === "municipality" && <li><strong>Towns:</strong> each town number adds up the areas' signed estimates and then clamps at zero, with no new noise.</li>}
        </ul>
      </details>

      {sel && (
        <details className="detail" open>
          <summary className="small"><strong>{areaLabel(sel.origin_area)} → {areaLabel(sel.destination_area)}</strong> · {BAND_SHORT[sel.hour_band][0]} {BAND_SHORT[sel.hour_band][1]}</summary>
          <dl>
            <dt>Trips (4 weeks)</dt><dd>{fmt(sel.trips)}{rely && ` ± ${fmt(rely.radius)}`}</dd>
            <dt>Per weekday</dt><dd>about {fmt(sel.trips / days)} ({days} weekdays)</dd>
            <dt>Raw protected value</dt><dd>{fmt(sel.noisy_value)} <span className="muted">(shown as 0 if below 0)</span></dd>
            <dt>Range</dt><dd>{rely ? `±${fmt(rely.radius)} (95%, from the noise only; the cap and estimated destinations add more)` : "not shown for town totals"}</dd>
            <dt>Destination</dt><dd>estimated, not observed</dd>
          </dl>
        </details>
      )}

      {ranked.length > shortlist && (
        <details className="more">
          <summary>More routes</summary>
          <table className="table">
            <thead><tr><th scope="col">#</th><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Trips{rely ? ` (±${fmt(rely.radius)})` : ""}</th></tr></thead>
            <tbody>
              {ranked.slice(shortlist, 10).map((c) => (
                <tr key={c.id} className={selected === c.id ? "row-on" : ""} onClick={() => onSelect(c.id)}>
                  <td>{c.rank}</td><td>{areaLabel(c.origin_area)}</td><td>{areaLabel(c.destination_area)}</td>
                  <td className={`num ${rely && c.noisy_value <= rely.floor ? "muted" : ""}`}>{fmt(c.trips)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rely && ranked.slice(shortlist, 10).some((c) => c.noisy_value <= rely.floor) && <p className="tiny muted">Grey numbers are below {fmt(rely.floor)}: noise alone could produce them.</p>}
        </details>
      )}
    </section>
  );
}
