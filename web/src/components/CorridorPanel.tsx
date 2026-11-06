import { fmt, rangeOf, weekdaysInPeriod, type Corridor, type Level, type Point, type Reliability } from "../data/derive";
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
  capGap?: [number, number] | null;                              // busiest morning routes vs exact (synthetic test)
  bandCheck?: { top3_overlap: number; k?: number } | null;       // one-draw exact check of this band's shortlist
  onOrigin: (a: string | null) => void;
  onSelect: (id: string) => void;
}

export function CorridorPanel({ rel, level, originOptions, onLevel, band, origin, ranked, shortlist, selected, rely, check, capLoss, capGap = null, bandCheck = null, onOrigin, onSelect }: Props) {
  const days = weekdaysInPeriod(rel);
  const top = ranked.slice(0, shortlist);
  const max = Math.max(1, ...top.map((c) => c.trips));
  const sel = ranked.find((c) => c.id === selected) ?? null;
  const cap = rel.manifest.privacy.families.od.cap;
  const fixture = !!rel.manifest.fixture;
  const noisy = new Set(rely?.noiseOnly ?? []);
  const range = (c: Corridor) => (rely ? rangeOf(c.noisy_value, rely.radius) : null);

  let status: { tone: "ok" | "warn" | "info"; text: string };
  if (fixture) {
    status = { tone: "info", text: "Test fixture: illustrative numbers. No noise or privacy claims are made for it." };
  } else if (rely && rely.noiseOnly.length) {
    status = { tone: "warn", text: `Could be pure noise: noise alone can reach about ${fmt(rely.radius)} trips here, and ${rely.noiseOnly.length === top.length ? `all ${top.length} are` : `#${rely.noiseOnly.join(", #")} ${rely.noiseOnly.length === 1 ? "is" : "are"}`} below that. Don't decide on ${rely.noiseOnly.length === 1 ? "it" : "these"}.` };
  } else if (check && level === "area") {
    status = { tone: "ok", text: "Checked against the exact data (synthetic test, weekday mornings)." };
  } else if (check && level === "municipality" && check.townOverlap !== null) {
    status = { tone: "ok", text: `Checked once: ${check.townOverlap} of ${check.k} town pairs match the exact data (synthetic test). Town totals add up many areas' noise, so no range is shown.` };
  } else if (bandCheck && level === "area") {
    const k = bandCheck.k ?? 3;
    status = { tone: bandCheck.top3_overlap === k ? "ok" : "info", text: `Checked once against the exact data: ${bandCheck.top3_overlap} of ${k} top routes match (synthetic test, this release only). Noise and the per-card cap can reorder routes.` };
  } else {
    const scope = band === "06-09" && origin ? "only the unfiltered morning top 3 was" : "only weekday mornings were";
    status = { tone: "info", text: level === "municipality"
      ? `Not tested against the exact data: ${scope}. Town totals add up the noise of many area cells, so small totals can be mostly noise; no range is shown.`
      : `Not tested against the exact data: ${scope}. Noise and the per-card cap can reorder routes.` };
  }

  return (
    <section className="panel" aria-labelledby="decision-title">
      <div className="eyebrow">Shortlist</div>
      <h2 id="decision-title">Top {shortlist} routes to look at</h2>
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
        {top.map((c) => {
          const r = range(c);
          return (
            <li key={c.id}>
              <button className={`card ${selected === c.id ? "card-on" : ""} ${noisy.has(c.rank) ? "card-noise" : ""}`} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id}>
                <span className="rank" aria-hidden="true">{c.rank}</span>
                <span className="card-body">
                  <span className="route">{areaLabel(c.origin_area)} <IconArrow /> <span className="sr-only">to</span>{areaLabel(c.destination_area)}
                    {noisy.has(c.rank) && <span className="badge badge-warn"><IconWarn /> could be noise</span>}</span>
                  <span className="value"><strong>{fmt(c.trips)}</strong> trips · about {fmt(c.trips / days)} per weekday</span>
                  {r && <span className="pm">noise range {fmt(r[0])}–{fmt(r[1])}</span>}
                  <span className="meter" aria-hidden="true"><span style={{ width: `${(100 * c.trips) / max}%` }} /></span>
                </span>
              </button>
            </li>
          );
        })}
        {!top.length && <li className="empty">Nothing here. <button className="link" onClick={() => onOrigin(null)}>Show all</button></li>}
      </ol>

      {rely && <p className="tiny muted capnote">Noise ranges cover the random noise only. The per-card cap also pulls busy routes down{capGap
        ? `: the 10 busiest morning routes came out ${Math.round(capGap[0] * 100)}–${Math.round(capGap[1] * 100)}% below their exact counts (synthetic test).`
        : "."}</p>}

      <details className="limits">
        <summary>What these numbers can't tell you</summary>
        <ul className="plain small">
          {rely && <li><strong>Noise:</strong> each range holds for all {fmt(rely.candidates)} released route numbers at once (95%), so it stays valid however you filter or pick. It covers only the random noise on the capped counts.</li>}
          <li><strong>Capped:</strong> each travel card counts at most {cap} trips, so frequent riders' trips can be undercounted{capLoss !== null ? ` (the cap leaves out about ${Math.round(capLoss * 100)}% of all route trips)` : ""}.</li>
          <li><strong>Estimated destinations:</strong> where the same card next starts a journey (quick transfers removed), not observed.</li>
          <li><strong>Trips, not people:</strong> one person can make many trips.</li>
          {level === "municipality" && <li><strong>Towns:</strong> each town number adds up the areas' signed estimates and then clamps at zero, with no new noise.</li>}
        </ul>
      </details>

      {sel && (
        <details className="detail" open>
          <summary className="small"><strong>{areaLabel(sel.origin_area)} → {areaLabel(sel.destination_area)}</strong> · {BAND_SHORT[sel.hour_band][0]} {BAND_SHORT[sel.hour_band][1]}</summary>
          <dl>
            <dt>Trips (4 weeks)</dt><dd>{fmt(sel.trips)}</dd>
            <dt>Per weekday</dt><dd>about {fmt(sel.trips / days)} ({days} weekdays)</dd>
            <dt>Raw protected value</dt><dd>{fmt(sel.noisy_value)} <span className="muted">(shown as 0 if below 0)</span></dd>
            <dt>Noise range</dt><dd>{rely ? `${fmt(rangeOf(sel.noisy_value, rely.radius)[0])}–${fmt(rangeOf(sel.noisy_value, rely.radius)[1])} (95% for all ${fmt(rely.candidates)} released route numbers at once; noise only, on capped counts)` : fixture ? "not claimed for a test fixture" : "not shown for town totals"}</dd>
            <dt>Destination</dt><dd>estimated, not observed</dd>
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
                  <td>{c.rank}</td><td>{areaLabel(c.origin_area)}</td><td>{areaLabel(c.destination_area)}</td>
                  <td className={`num ${rely && c.noisy_value <= rely.radius ? "muted" : ""}`}>{fmt(c.trips)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rely && ranked.slice(shortlist, 10).some((c) => c.noisy_value <= rely.radius) && <p className="tiny muted">Grey numbers are below {fmt(rely.radius)}: noise alone could lift an empty route that high.</p>}
        </details>
      )}
    </section>
  );
}
