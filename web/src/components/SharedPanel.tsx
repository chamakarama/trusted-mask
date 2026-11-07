import { fmt } from "../data/derive";
import { niceDate, releaseUrl, type Release } from "../data/release";
import { IconCheck, IconDownload, IconWarn } from "./Icons";

const NICE: Record<string, string> = {
  "od_matrix.csv": "Routes between areas (CSV)", "line_hour.csv": "Boardings per line and hour (CSV)", "daily.csv": "Taps per day (CSV)",
  "statistics.json": "All three tables (JSON)", "public_areas.geojson": "Area centre points (GeoJSON)", "manifest.json": "How it was made (manifest)",
  "definitions.json": "Definitions", "README.txt": "Read me", "checksums.sha256": "Checksums",
};

/** What exactly left the bus company, who it is for, what it is fit for, plus downloads of the identical files. */
export function SharedPanel({ rel }: { rel: Release }) {
  const m = rel.manifest, p = m.privacy;
  const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const files = ["od_matrix.csv", "line_hour.csv", "daily.csv", "statistics.json", "public_areas.geojson", "manifest.json", "definitions.json", "README.txt", "checksums.sha256"];
  const period = `${niceDate(m.period.start_date)} – ${niceDate(m.period.end_date_inclusive)}`;
  return (
    <div className="layout">
      <header className="hero">
        <div className="eyebrow">Release {rel.id}</div>
        <h1>Three tables of protected counts. Nothing else left the bus company.</h1>
        <p className="lede">Published openly for anyone, mainly transport planners. Period: {period}.</p>
      </header>

      <h2 className="section-label" id="shared-title">What the bus company shared</h2>
      <div className="shared-grid" aria-labelledby="shared-title">
        <div className="shared-card">
          <h3>What's inside</h3>
          <ul className="plain">
            <li><strong>Routes:</strong> trips from area to area, per time of day, added up over the 4 weeks (weekdays)</li>
            <li><strong>Lines:</strong> boardings on each line, per hour of the day</li>
            <li><strong>Days:</strong> total taps on each date</li>
          </ul>
          <p className="small muted">Every number has random noise added. Area names and points come from the public stop list.</p>
        </div>
        <div className="shared-card">
          <h3>What's not inside</h3>
          <ul className="plain not-list">
            <li>no rows of taps, no travel-card numbers</li>
            <li>no exact times (only time-of-day bands, clock hours and dates)</li>
            <li>no names, contact details or ticket types</li>
            <li>no single person's journeys</li>
            <li>no routes per day or per line, no capacity or crowding</li>
          </ul>
        </div>
        <div className="shared-card">
          <h3>How it was protected</h3>
          <ul className="plain">
            <li>Each travel card counts at most {p.families.od.cap} trips for routes and {p.families.line_hour.cap} for lines and days.</li>
            <li>Then random noise is added (OpenDP {p.families.od.library_version}), with a total privacy budget of ε = {p.epsilon_release} per card.</li>
            <li>The spend is written to the publisher's budget ledger: a local guard against accidental re-runs, not tamper-proof.</li>
          </ul>
          <p className="small"><span className="badge badge-warn"><IconWarn /> pending review</span> <span className="muted">Not yet independently audited. Protects each card; one person with 2 cards counts as 2.</span></p>
        </div>
      </div>

      <section className="block" aria-labelledby="fit-title">
        <div className="block-head"><div><h2 id="fit-title">Who it's for and what it's fit for</h2></div></div>
        <div className="fit-grid">
          <div className="fit-card fit-good">
            <h4>Good for</h4>
            <ul className="plain small">
              <li>The morning shortlist of busiest routes (checked against the exact data on this synthetic test)</li>
              <li>When the busy lines peak, and taps per day</li>
              <li>Comparing big flows between towns</li>
            </ul>
          </div>
          <div className="fit-card fit-bad">
            <h4>Not good for</h4>
            <ul className="plain small">
              <li>Small or night routes: many are small enough to be pure noise</li>
              <li>Exact counts: the per-card cap can undercount frequent riders' trips</li>
              <li>Weekly or daily route counts: only the 4-week total is published. The scenario asks for weekly flows, but weekly cells would hold a quarter of the trips with the same noise.</li>
              <li>Crowding, capacity or the roads people take</li>
            </ul>
          </div>
          <div className="fit-card fit-info">
            <h4>What we assume</h4>
            <ul className="plain small">
              <li><strong>Attacker:</strong> any outsider, who may have public directories, social check-ins or a leaked fitness app, or saw a neighbour at a stop. They try to learn whether a card is in the data or what else it did.</li>
              <li><strong>Repeat releases add up:</strong> each one spends another ε, so a yearly budget must be planned.</li>
              <li><strong>Law:</strong> the aim is anonymous data under GDPR Recital 26 (no one identifiable by means reasonably likely to be used). That is our argument, not a legal opinion: it needs review.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="dl-title">
        <div className="block-head"><div><h2 id="dl-title">Download exactly what was shared</h2><p className="sub">The three tables, the area points, and the files that say how the release was made.</p></div></div>
        <ul className="downloads">
          {files.map((f) => {
            const r = m.resources.find((x: any) => x.path === f);
            return (
              <li key={f}>
                <a href={releaseUrl(rel.id, f)} download>
                  <IconDownload />
                  <span><b>{NICE[f] ?? f}</b><small><code>{f}</code> · {kb(rel.bytes[f] ?? 0)}{r ? ` · sha256 ${r.sha256.slice(0, 10)}…` : ""}</small></span>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="note"><IconCheck /><span>Your browser checked that every file matches this manifest before showing anything. Checksums do not authenticate the manifest itself: without a signature they can't prove who published it.</span></p>
      </section>

      <details className="block disclose">
        <summary>Full technical details</summary>
        <dl className="kv small">
          <dt>Protected unit</dt><dd>one travel card's records for the whole period (add or remove one card)</dd>
          {Object.entries(p.families).map(([k, f]: [string, any]) => (
            <div key={k} className="kv-row"><dt>{k}</dt><dd>cap {f.cap} · ε {f.epsilon} · noise scale {fmt(f.scale)} · {f.mechanism}</dd></div>
          ))}
          <dt>Purpose</dt><dd>{m.purpose}</dd>
          <dt>Policy</dt><dd><code>{m.policy_version}</code> · publisher commit <code>{String(m.source_commit).slice(0, 10)}</code></dd>
          <dt>Journey rule</dt><dd>{m.inference}</dd>
          <dt>Limitations</dt><dd><ul className="plain">{m.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul></dd>
          <dt>Licences</dt><dd><ul className="plain">{m.licenses.map((l: string) => <li key={l}>{l}</li>)}</ul></dd>
        </dl>
      </details>
    </div>
  );
}
