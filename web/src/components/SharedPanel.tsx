import { fmt } from "../data/derive";
import { releaseUrl, type Release } from "../data/release";

const FAMILY_NAME: Record<string, string> = { od: "Corridors (area → area × time band)", line_hour: "Boardings by line × hour", daily: "Tap events per day" };

/** What exactly left the operator, under which protection, with downloads of the identical files. */
export function SharedPanel({ rel }: { rel: Release }) {
  const m = rel.manifest, p = m.privacy;
  const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <section className="panel wide shared" aria-labelledby="shared-title">
      <h2 id="shared-title">What was shared?</h2>
      <div className="shared-grid">
        <div>
          <h3>Recipient and purpose</h3>
          <p>{m.purpose}</p>
          <p className="muted small">Publisher: {m.publisher}. Period {m.period.start_date} – {m.period.end_date_inclusive} ({m.period.timezone}).</p>
          <h3>Released tables</h3>
          <ul className="plain">
            {Object.entries(m.families).map(([k, f]: [string, any]) => (
              <li key={k}><strong>{FAMILY_NAME[k] ?? k}</strong> — {rel.definitions[k]} <span className="muted">({f.availability}, {f.definition_id})</span></li>
            ))}
          </ul>
          <h3>Not in this release</h3>
          <ul className="plain">
            <li>No rows, travel-card numbers, timestamps, names, contact details or fare types.</li>
            <li>No individual journeys or journey chains; destinations are inferred only inside the counts.</li>
            <li>No daily corridors, corridors by line, capacity, crowding or optimal routes.</li>
          </ul>
        </div>
        <div>
          <h3>How it was protected</h3>
          <dl className="kv">
            <dt>Protected unit</dt><dd>one travel card's records over the whole period ({p.adjacency.replaceAll("_", " ")})</dd>
            <dt>Mechanism</dt><dd>{p.families.od.mechanism} (OpenDP {p.families.od.library_version})</dd>
            <dt>Privacy budget</dt><dd>ε = {p.epsilon_release} in total, δ = {p.delta_release}</dd>
            {Object.entries(p.families).map(([k, f]: [string, any]) => (
              <div key={k} className="kv-row"><dt>{FAMILY_NAME[k] ?? k}</dt><dd>each card counts at most {f.cap} times · ε {f.epsilon} · noise scale {fmt(f.scale)}</dd></div>
            ))}
            <dt>Status</dt><dd><span className="badge badge-warn">{p.guarantee_status.replaceAll("_", " ")}</span> not independently certified</dd>
            <dt>Limitation</dt><dd>{p.multiple_identifier_limitation}</dd>
          </dl>
          <h3>Known limitations</h3>
          <ul className="plain">{m.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </div>
        <div>
          <h3>Download the shared files</h3>
          <p className="muted small">These are the exact files this page reads. Filtering here never adds new noise or queries private data.</p>
          <ul className="downloads">
            {["manifest.json", ...m.resources.map((r: any) => r.path), "checksums.sha256"].map((f: string) => {
              const r = m.resources.find((x: any) => x.path === f);
              return (
                <li key={f}>
                  <a href={releaseUrl(rel.id, f)} download>{f}</a>
                  <span className="muted small"> {kb(rel.bytes[f] ?? 0)}{r ? ` · sha256 ${r.sha256.slice(0, 12)}…` : ""}</span>
                </li>
              );
            })}
          </ul>
          <p className="note small">
            <span className="badge badge-ok">integrity verified</span> Every file's SHA-256 matches the accompanying manifest and the CSVs match the JSON, checked in your browser. Without a trusted signature this does not prove who published the files or how they were computed.
          </p>
          <h3>Licences</h3>
          <ul className="plain small">{m.licenses.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
