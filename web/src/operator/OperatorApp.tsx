import { useEffect, useMemo, useState } from "react";
import { fmt } from "../data/derive";

// PRIVATE operator workbench: scanner inventory (Opus/petpilot) -> purpose -> approved handling (Astra's policy) -> release.
// The scanner explains; it never authorises export. The publisher's own allowlist decides what is released.

const HANDLING: Record<string, { label: string; meaning: string; leaves: boolean }> = {
  omit: { label: "Omit", meaning: "Not needed to count journeys. Never read by the publisher, never released.", leaves: false },
  internal_grouping_only: { label: "Internal grouping only", meaning: "Used inside the operator to group one card's own taps (and cap its influence). Never released.", leaves: false },
  time_bin: { label: "Time bands", meaning: "Exact times only place each journey in an hour band (00–06, 06–09, …) or an hour before counting.", leaves: false },
  public_reference_lookup: { label: "Public lookup", meaning: "Stops are mapped to public areas using the published stop list.", leaves: false },
  aggregate_input: { label: "Counted into totals", meaning: "Only the noisy totals per line and hour leave the operator.", leaves: true },
};
const ROLE_LABEL: Record<string, string> = {
  direct_identifier: "Direct identifier", quasi_identifier: "Quasi-identifier", sensitive_attribute: "Sensitive", technical_identifier: "Persistent key",
  record_key: "Row key", free_text: "Free text", non_sensitive: "Non-sensitive", unknown: "Unknown",
};
const PURPOSES = [
  { id: "public_aggregate_mobility", label: "External planners: public demand statistics", supported: true },
  { id: "consultancy_rows", label: "Consultancy: row-level journey histories", supported: false },
];

export function OperatorApp() {
  const [inv, setInv] = useState<any | null>(null);
  const [manifest, setManifest] = useState<any | null>(null);
  const [purpose, setPurpose] = useState("public_aggregate_mobility");
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("./inventory.json").then((r) => (r.ok ? r.json() : Promise.reject(new Error("no inventory")))).then(setInv)
      .catch(() => setErr("No private inventory found. Run Astra's adapter, then `npm run operator:data`."));
    fetch("./releases/index.json").then((r) => r.json()).then((ix) => {
      const real = ix.releases.find((r: any) => !r.fixture) ?? ix.releases[0];
      return fetch(`./releases/${real.release_id}/manifest.json`).then((r) => r.json());
    }).then(setManifest).catch(() => undefined);
  }, []);
  const used = useMemo(() => new Set(["taps", "stops"]), []);
  if (err) return <div className="app"><p className="state state-error">{err}</p></div>;
  if (!inv) return <div className="app"><div className="skeleton" /></div>;
  const fields: any[] = inv.fields;
  const order = (t: string) => ["taps", "stops", "cards", "bike_trips", "bike_stations"].indexOf(t);
  const shown = fields.filter((f) => showAll || used.has(f.table)).sort((a, b) => order(a.table) - order(b.table));
  const review = fields.filter((f) => f.needs_review).length;
  const unknown = fields.filter((f) => f.role === "unknown").length;
  const P = PURPOSES.find((p) => p.id === purpose)!;
  return (
    <div className="app operator">
      <header className="top">
        <div className="brand">
          <span className="logo logo-private" aria-hidden="true">OP</span>
          <div>
            <h1>Operator workbench</h1>
            <p className="tagline">Private · runs inside the operator's environment · never part of the public planner build</p>
          </div>
        </div>
        <div className="strip"><span className="badge badge-private">private workbench</span><span className="badge badge-warn">policy {manifest?.privacy?.guarantee_status?.replaceAll("_", " ") ?? "pending review"}</span></div>
      </header>

      <ol className="steps">
        <li className="panel">
          <h2>1 · Scan: what is in the bus data?</h2>
          <p className="muted small">Rule-based scanner <code>{inv.scanner} {inv.scanner_version}</code> (no AI). It read {inv.sampling?.rows_per_table ? `the first ${fmt(inv.sampling.rows_per_table)} rows of each table` : "a sample"} and swept every row for identifier shapes. Findings explain; they never grant export permission.</p>
          <div className="kpis">
            <div><strong>{fields.length}</strong><span>columns</span></div>
            <div><strong>{fields.filter((f) => f.role === "direct_identifier").length}</strong><span>direct identifiers</span></div>
            <div><strong>{fields.filter((f) => ["quasi_identifier", "technical_identifier"].includes(f.role)).length}</strong><span>linking fields</span></div>
            <div className="kpi-warn"><strong>{review}</strong><span>need review</span></div>
            <div className="kpi-warn"><strong>{unknown}</strong><span>unknown (not called safe)</span></div>
          </div>
        </li>

        <li className="panel">
          <h2>2 · Purpose: who receives the data?</h2>
          <div className="seg" role="radiogroup" aria-label="Sharing purpose">
            {PURPOSES.map((p) => (
              <button key={p.id} role="radio" aria-checked={purpose === p.id} className={`seg-btn ${purpose === p.id ? "seg-on" : ""}`} onClick={() => setPurpose(p.id)}>{p.label}</button>
            ))}
          </div>
          {P.supported ? (
            <p className="small">Approved purpose <code>{P.id}</code>: {manifest?.purpose ?? "public aggregate mobility planning"}</p>
          ) : (
            <div className="answer answer-refusal" role="alert">
              <h3><code>UNSUPPORTED_SHARING_SCENARIO</code></h3>
              <p>Row-level sharing is not supported in this prototype. Rotating pseudonyms and rounded times do not make travel histories safe: four known sightings still single out most cards. Offer the aggregate statistics instead.</p>
              <button className="secondary" onClick={() => setPurpose("public_aggregate_mobility")}>Use public demand statistics</button>
            </div>
          )}
        </li>

        {P.supported && (
          <li className="panel">
            <h2>3 · Handling: what happens to each field</h2>
            <p className="muted small">The scanner's reason and the policy's handling are separate facts. The handling comes from the approved policy (owned by the privacy engineer), not from the scanner.</p>
            <div className="table-wrap">
              <table className="table optable">
                <thead><tr><th>Field</th><th>Scanner: detected</th><th>Scanner: why</th><th>Policy: handling</th><th>Leaves the operator?</th></tr></thead>
                <tbody>
                  {shown.map((f) => {
                    const h = HANDLING[f.policy?.handling] ?? { label: f.policy?.handling ?? "—", meaning: "", leaves: false };
                    return (
                      <tr key={f.table + f.column} className={f.needs_review ? "row-review" : ""}>
                        <td><code>{f.table}.{f.column}</code></td>
                        <td>
                          <span className={`role role-${f.role}`}>{ROLE_LABEL[f.role] ?? f.role}</span>
                          {f.art9_hint && <span className="badge badge-warn" title="possible special-category data (GDPR Art. 9); needs review">Art. 9?</span>}
                          {f.needs_review && <span className="badge badge-warn">review</span>}
                          <div className="muted tiny">{f.subtype} · {f.certainty}</div>
                        </td>
                        <td className="small">{f.reason}<div className="muted tiny">{(f.rule_ids ?? []).join(" · ")}</div></td>
                        <td className="small"><strong>{h.label}</strong>{f.policy?.required_for_analysis ? <span className="badge">required</span> : null}<div className="muted">{h.meaning}</div></td>
                        <td className="small">{h.leaves ? "only as noisy totals" : "no"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="link" onClick={() => setShowAll(!showAll)}>{showAll ? "Show only the tables this release uses (taps, stops)" : `Show all ${fields.length} columns, incl. card registry and bikes (all omitted)`}</button>
          </li>
        )}

        {P.supported && manifest && (
          <li className="panel">
            <h2>4 · Release: what is published</h2>
            <dl className="kv">
              <dt>Release</dt><dd><code>{manifest.release_id}</code> · {manifest.data_class.replace("_", " ")} · policy <code>{manifest.policy_version}</code></dd>
              <dt>Protected unit</dt><dd>one card's records over {manifest.period.start_date} – {manifest.period.end_date_inclusive} (add/remove one card)</dd>
              {Object.entries(manifest.privacy.families).map(([k, f]: [string, any]) => (
                <div key={k} className="kv-row"><dt>{k}</dt><dd>cap {f.cap} per card · ε {f.epsilon} · {f.mechanism} {f.library_version}</dd></div>
              ))}
              <dt>Total budget</dt><dd>ε = {manifest.privacy.epsilon_release}, δ = {manifest.privacy.delta_release}, recorded once in the publisher's ledger</dd>
              <dt>Status</dt><dd><span className="badge badge-warn">{manifest.privacy.guarantee_status.replaceAll("_", " ")}</span> {manifest.privacy.multiple_identifier_limitation}</dd>
            </dl>
            <p className="muted small">Only these released tables reach the planner: corridors (area × area × time band), boardings (line × hour), tap events (date). No field from step 3 is exported as a column.</p>
          </li>
        )}
      </ol>
      <footer className="foot muted small">Synthetic benchmark data (TrustED PETs Proving Ground 2026, Since AI ry, CC BY 4.0). Inventory {inv.inventory_schema_version} · scanner commit {String(inv.source_commit).slice(0, 10)}.</footer>
    </div>
  );
}
