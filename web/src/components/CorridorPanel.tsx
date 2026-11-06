import { BANDS, BAND_LABEL, fmt, weekdaysInPeriod, type Corridor, type Level, type Point } from "../data/derive";
import { areaLabel, type Release } from "../data/release";

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

export function UncertainBadge() {
  return <span className="badge badge-warn" title="Noise intervals are not yet available for this release; the value is an estimate, not a count.">uncertain · interval n/a</span>;
}

export function CorridorPanel({ rel, level, originOptions, onLevel, band, origin, ranked, shortlist, selected, onBand, onOrigin, onSelect }: Props) {
  const days = weekdaysInPeriod(rel);
  const top = ranked.slice(0, shortlist);
  const sel = ranked.find((c) => c.id === selected) ?? null;
  return (
    <section className="panel" aria-labelledby="decision-title">
      <h2 id="decision-title">Which corridors deserve a closer look?</h2>
      <p className="muted small">
        Inferred weekday journeys between public areas, summed over {rel.manifest.period.start_date} – {rel.manifest.period.end_date_inclusive}. Not passengers, not seats.
      </p>
      <div className="chips" role="radiogroup" aria-label="Time band">
        {BANDS.map((b) => (
          <button key={b} role="radio" aria-checked={b === band} className={`chip ${b === band ? "chip-on" : ""}`} onClick={() => onBand(b)}>
            {BAND_LABEL[b]}
          </button>
        ))}
      </div>
      <div className="seg" role="radiogroup" aria-label="Geography">
        <button role="radio" aria-checked={level === "area"} className={`seg-btn ${level === "area" ? "seg-on" : ""}`} onClick={() => onLevel("area")}>{rel.areas.length} areas</button>
        <button role="radio" aria-checked={level === "municipality"} className={`seg-btn ${level === "municipality" ? "seg-on" : ""}`} onClick={() => onLevel("municipality")}>{new Set(rel.areas.map((a) => a.municipality)).size} municipalities <span className="muted">· derived</span></button>
      </div>
      {level === "municipality" && (
        <p className="note small" title="Whole-period inferred weekday journeys by ordered origin municipality, destination municipality and hour band. Sum signed released area-pair noisy_value across ALL matching public area pairs, then clamp the municipality sum once at zero. Includes same-area pairs when forming municipality totals; exclude same-municipality pairs only for the inter-municipality shortlist. This is postprocessing of the existing release, not a new measurement or observed destinations."><span className="badge">derived · od-municipality-postprocess-v1</span> Each municipality pair sums the released signed estimates of all its area pairs, then clamps once at zero. Computed in your browser from the same files: no new measurement, no new noise. Same-municipality pairs are left out of the shortlist.</p>
      )}
      <label className="field">
        <span>{level === "area" ? "Origin area" : "Origin municipality"}</span>
        <select value={origin ?? ""} onChange={(e) => onOrigin(e.target.value || null)}>
          <option value="">{level === "area" ? "All areas" : "All municipalities"}</option>
          {[...originOptions].sort((a, b) => a.id.localeCompare(b.id)).map((a) => <option key={a.id} value={a.id}>{areaLabel(a.id)}</option>)}
        </select>
      </label>

      <ol className="shortlist">
        {top.map((c) => (
          <li key={c.id}>
            <button className={`card ${selected === c.id ? "card-on" : ""}`} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id}>
              <span className="rank" aria-hidden="true">{c.rank}</span>
              <span className="card-body">
                <span className="route">{areaLabel(c.origin_area)} <span aria-hidden="true">→</span><span className="sr-only">to</span> {areaLabel(c.destination_area)}</span>
                <span className="value"><strong>{fmt(c.trips)}</strong> inferred journeys <span className="muted">≈ {fmt(c.trips / days)} per weekday</span></span>
              </span>
            </button>
          </li>
        ))}
        {!top.length && <li className="empty">No released corridor matches this filter. <button className="link" onClick={() => onOrigin(null)}>Show all areas</button></li>}
      </ol>
      <p className="note">
        <UncertainBadge /> Close values may swap places: ranking uncertainty is not evaluated for this release, so treat neighbours with similar numbers as similar evidence.
      </p>

      {sel && (
        <div className="detail" aria-live="polite">
          <h3>{areaLabel(sel.origin_area)} → {areaLabel(sel.destination_area)} · {BAND_LABEL[sel.hour_band]}</h3>
          <dl>
            <dt>Released estimate (display)</dt><dd>{fmt(sel.trips)} inferred journeys</dd>
            <dt>Per weekday</dt><dd>≈ {fmt(sel.trips / days)} (÷ {days} weekdays in the period)</dd>
            <dt>{level === "area" ? "Signed mechanism estimate" : "Sum of released signed estimates"}</dt><dd>{fmt(sel.noisy_value)} <span className="muted">(display value is this, clamped at zero)</span></dd>
            <dt>Interval</dt><dd>{sel.noise_lower === null ? "not available in this release (null, not zero)" : `${fmt(sel.noise_lower)} – ${fmt(sel.noise_upper!)}`}</dd>
            <dt>Destination</dt><dd><span className="badge">inferred</span> next boarding of the same card, not observed</dd>
            <dt>Rank</dt><dd>{sel.rank} of {ranked.length} corridors in this band</dd>
          </dl>
        </div>
      )}

      {ranked.length > shortlist && (
        <details className="more">
          <summary>More corridors in this band ({Math.min(ranked.length, 10) - shortlist} more shown on the map)</summary>
          <table className="table">
            <thead><tr><th scope="col">#</th><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Journeys</th></tr></thead>
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
