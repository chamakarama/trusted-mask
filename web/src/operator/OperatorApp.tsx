import { useEffect, useState } from "react";
import { IconCheck, IconLock, IconWarn, Logo } from "../components/Icons";

// PRIVATE operator workbench: scanner (petpilot) findings -> purpose -> approved handling (Astra's policy) -> release.
// The scanner explains; it never authorises export. The publisher's own allowlist decides what is released.

const ROLE: Record<string, string> = {
  direct_identifier: "Identifies a person", quasi_identifier: "Can identify in combination", sensitive_attribute: "Sensitive",
  technical_identifier: "Links records together", record_key: "Row number", free_text: "Free text", non_sensitive: "Not personal", unknown: "Unknown",
};

// What actually happens to each USED field (Astra's review, A-007). Wording is per field, not per handling label.
const USE: Record<string, string> = {
  "taps.card_id": "Groups one card's own taps so each card's influence can be capped. Never released.",
  "taps.ts": "Exact times stay inside: used to order taps, drop transfers within 60 minutes, find where the next journey starts and pick which taps count. Only hour bands, hours and dates are released.",
  "taps.stop_id": "Mapped to a public area using the stop list. Never released as a stop or tap.",
  "taps.line": "Released only as the line column of the line × hour table (fixed public line list).",
  "taps.fare_product": "Used only to drop double taps. Never released.",
};
const STOP_USE = "Public stop list: supplies the area names, towns, map points and line list that appear in the release.";

const KEY = "routesafe-operator-review-v1";
const loadReviews = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };

export function OperatorApp() {
  const [inv, setInv] = useState<any | null>(null);
  const [manifest, setManifest] = useState<any | null>(null);
  const [purpose, setPurpose] = useState<"public" | "rows">("public");
  const [reviews, setReviews] = useState<Record<string, boolean>>(loadReviews);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("./inventory.json").then((r) => (r.ok ? r.json() : Promise.reject())).then(setInv).catch(() => setErr("No private inventory found. Run Astra's adapter, then `npm run operator:data`."));
    fetch("./releases/index.json").then((r) => r.json()).then((ix) => {
      const real = ix.releases.find((r: any) => !r.fixture) ?? ix.releases[0];
      return fetch(`./releases/${real.release_id}/manifest.json`).then((r) => r.json());
    }).then(setManifest).catch(() => undefined);
  }, []);
  const toggle = (k: string) => setReviews((r) => { const n = { ...r, [k]: !r[k] }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });

  if (err) return <div className="app operator"><main className="page"><p className="state state-error">{err}</p></main></div>;
  if (!inv) return <div className="app operator"><main className="page"><div className="skeleton" /></main></div>;
  const fields: any[] = inv.fields;
  const key = (f: any) => `${f.table}.${f.column}`;
  const used = fields.filter((f) => f.policy && f.policy.handling !== "omit").sort((a, b) => (a.table === "taps" ? -1 : 1) - (b.table === "taps" ? -1 : 1));
  const dropped = fields.filter((f) => !f.policy || f.policy.handling === "omit");
  const usedFlagged = used.filter((f) => f.needs_review);
  const reviewed = usedFlagged.filter((f) => reviews[key(f)]).length;
  const people = fields.filter((f) => f.role === "direct_identifier").length;

  return (
    <div className="app operator">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="logo"><Logo /></span><div className="wordmark">RouteSafe operator<small>Private · runs inside the bus company · never published</small></div></div>
          <div />
          <div className="release-box"><div className="chips"><span className="chip-dark"><IconLock /> private workbench</span><span className="chip-dark"><span className="dot dot-warn" />policy pending review</span></div></div>
        </div>
      </header>
      <main className="page">
        <div className="headline"><div><h1>From raw taps to a safe release</h1><p>Four steps. The scanner explains each column; the policy decides; only protected counts leave.</p></div></div>
        <ol className="steps">
          <li className="panel">
            <h2><span className="step-num">1</span>What's in the bus data?</h2>
            <p className="small ink2">The scanner read every column (rule-based, no AI) and swept every row for things like e-mails and ID numbers.</p>
            <div className="kpis-op">
              <div><strong>{fields.length}</strong><span>columns scanned</span></div>
              <div><strong>{people}</strong><span>identify a person (names, e-mail, phone…)</span></div>
              <div><strong>{used.length}</strong><span>needed to make the counts</span></div>
              <div><strong>{dropped.length}</strong><span>thrown away, never read</span></div>
            </div>
          </li>

          <li className="panel">
            <h2><span className="step-num">2</span>Who gets the data?</h2>
            <div className="seg" role="radiogroup" aria-label="Who receives the data">
              <button role="radio" aria-checked={purpose === "public"} className={`seg-btn ${purpose === "public" ? "seg-on" : ""}`} onClick={() => setPurpose("public")}>Outside planners: demand statistics</button>
              <button role="radio" aria-checked={purpose === "rows"} className={`seg-btn ${purpose === "rows" ? "seg-on" : ""}`} onClick={() => setPurpose("rows")}>A consultancy: everyone's journeys</button>
            </div>
            {purpose === "public" ? (
              <p className="small" style={{ marginTop: 10 }}><IconCheck /> Supported: {manifest?.purpose ?? "public aggregate mobility planning"}</p>
            ) : (
              <div className="answer answer-refusal" role="alert">
                <h3><IconWarn /> Not supported <code className="tiny">UNSUPPORTED_SHARING_SCENARIO</code></h3>
                <p>Sharing journey rows isn't safe even with fake card numbers and rounded times: 4 known sightings still pick out about 97% of cards. Offer the demand statistics instead.</p>
                <button className="btn-ghost" onClick={() => setPurpose("public")}>Use demand statistics</button>
              </div>
            )}
          </li>

          {purpose === "public" && (
            <li className="panel">
              <h2><span className="step-num">3</span>What happens to each column</h2>
              <p className="small ink2">"Needs review" means the scanner wasn't sure. Columns that are thrown away can't leak, so only the ones that are used need a person's OK.
                {usedFlagged.length > 0 && <> <strong>{reviewed} of {usedFlagged.length}</strong> used columns signed off on this computer.</>}</p>
              <div className="table-wrap">
                <table className="table optable">
                  <thead><tr><th>Column</th><th>Scanner says</th><th>What happens</th><th>OK?</th></tr></thead>
                  <tbody>
                    {used.map((f) => (
                      <tr key={key(f)} className={f.needs_review && !reviews[key(f)] ? "row-review" : ""}>
                        <td><code>{f.table}.{f.column}</code></td>
                        <td><span className={`role role-${f.role}`}>{ROLE[f.role] ?? f.role}</span>{f.art9_hint && <span className="badge badge-warn"><IconWarn /> may reveal health</span>}
                          <div className="tiny muted">{f.reason}</div></td>
                        <td className="small">{USE[key(f)] ?? (f.table === "stops" ? STOP_USE : f.policy.handling)}</td>
                        <td>{f.needs_review
                          ? <label className="small" style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={!!reviews[key(f)]} onChange={() => toggle(key(f))} /> {reviews[key(f)] ? "reviewed" : "needs OK"}</label>
                          : <span className="badge badge-ok"><IconCheck /> clear</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="more">
                <summary>{dropped.length} columns thrown away (names, e-mails, phones, card registry, bikes…)</summary>
                <ul className="plain small">{dropped.map((f) => <li key={key(f)}><code>{f.table}.{f.column}</code> · {ROLE[f.role] ?? f.role}{f.needs_review ? " · scanner unsure, but not used" : ""}</li>)}</ul>
              </details>
              <p className="tiny muted">Sign-offs are stored only in this browser for the demo. Scanner findings never give a column permission to be released; the publisher only writes the fixed release tables.</p>
            </li>
          )}

          {purpose === "public" && manifest && (
            <li className="panel">
              <h2><span className="step-num">4</span>What gets published</h2>
              <ul className="plain">
                <li><strong>Routes</strong> (area → area, per time of day), <strong>lines per hour</strong> and <strong>taps per day</strong>, for {manifest.period.start_date} – {manifest.period.end_date_inclusive}.</li>
                <li>Each card counts at most {manifest.privacy.families.od.cap} route trips and {manifest.privacy.families.line_hour.cap} boardings or taps, then random noise is added: privacy budget ε = {manifest.privacy.epsilon_release}, recorded once in the publisher's ledger.</li>
                <li>No tap rows, card numbers, exact times or ticket types are ever written to the release.</li>
              </ul>
              <p className="small"><span className="badge badge-warn">pending review</span> Release <code>{manifest.release_id}</code> · {manifest.privacy.multiple_identifier_limitation}</p>
            </li>
          )}
        </ol>
      </main>
      <footer className="foot">Synthetic data (TrustED PETs Proving Ground 2026, Since AI ry, CC BY 4.0). Inventory {inv.inventory_schema_version} · scanner {inv.scanner_version}.</footer>
    </div>
  );
}
