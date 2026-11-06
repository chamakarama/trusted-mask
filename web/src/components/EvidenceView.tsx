import { useEffect, useState } from "react";
import { fmt } from "../data/derive";
import { areaLabel } from "../data/release";

const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;

/** Synthetic benchmark evidence (Astra's reviewed evidence-summary.json). Separate from the protected release. */
export function EvidenceView({ releaseId }: { releaseId: string }) {
  const [ev, setEv] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/evidence/evidence-summary.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject())).then(setEv).catch(() => setMissing(true));
  }, []);
  if (missing) return <section className="panel wide"><h2>Evidence</h2><p className="muted">No reviewed evidence summary is available in this build.</p></section>;
  if (!ev) return <section className="panel wide" aria-busy="true"><div className="skeleton" /></section>;
  if (ev.release_id !== releaseId) {
    return <section className="panel wide"><h2>Evidence</h2><p className="muted">The evidence summary describes release <code>{ev.release_id}</code>, not the selected release. Select it to compare.</p></section>;
  }
  const t = ev.trajectory_native_four_point, w = ev.actual_release_wape, rep = ev.initial_policy_100_draws, muni = ev.municipality_postprocessing;
  const dec = ev.actual_release_decision, cap = ev.cap_loss_fraction, mc = ev.multiple_cards;
  return (
    <section className="panel wide evidence" aria-labelledby="ev-title">
      <p className="banner" role="note"><strong>Synthetic benchmark evaluation.</strong> These numbers compare the release with the exact synthetic data; they are not part of the shared release and would not be published for real data.</p>
      <h2 id="ev-title">Does it protect, and is it still useful?</h2>
      <div className="ev-grid">
        <article className="ev-card">
          <h3>Why not share the rows?</h3>
          <p className="big">{pct(t.b0.unicity, 0)}</p>
          <p>of travel cards are singled out by just <strong>{t.b0.p} known sightings</strong> (stop and hour) in the rows with names removed.</p>
          <table className="table small">
            <tbody>
              <tr><td>Names removed (B0)</td><td className="num">{pct(t.b0.unicity)}</td></tr>
              <tr><td>Pseudonyms + coarser values (B2)</td><td className="num">{pct(t.b2.unicity)}</td></tr>
              <tr><td>Plus k ≥ 5 suppression (B2-k)</td><td className="num">{pct(t.b2k.unicity)}</td></tr>
            </tbody>
          </table>
          <p className="muted small">Organisers' trajectory test, {fmt(t.b0.n_users_tested)} cards, {t.b0.p} points, {t.b0.temporal} / {t.b0.spatial_m} m resolution.
            RouteSafe releases no rows, so this lookup cannot run: <em>{ev.route_safe_attack_applicability.status.replace("_", " ")}</em>, which is not the same as 0% risk.</p>
        </article>
        <article className="ev-card">
          <h3>Does the planning decision survive?</h3>
          <p className="big">{dec.top_k_overlap} / {dec.k}</p>
          <p>morning corridors in the protected shortlist are the same as with the exact data (regret {dec.regret}).</p>
          <ol className="plain small">{dec.selected.map((c: any) => <li key={c.origin_area + c.destination_area}>{areaLabel(c.origin_area)} → {areaLabel(c.destination_area)}</li>)}</ol>
          <p className="muted small">Repeated with {rep.draw_count} fresh noise draws of the same policy: the decision target passed {rep.decision_pass_count} / {rep.draw_count}.</p>
        </article>
        <article className="ev-card">
          <h3>How far off are the numbers?</h3>
          <table className="table small">
            <thead><tr><th>Table</th><th className="num">Error (WAPE)</th><th className="num">100 draws, median</th></tr></thead>
            <tbody>
              <tr><td>Corridors, 21 areas</td><td className="num">{pct(w.od)}</td><td className="num">{pct(rep.wape_quantiles.od["0.5"])}</td></tr>
              <tr><td>Corridors, 6 municipalities (derived)</td><td className="num">{pct(muni.wape)}</td><td className="num muted">n/a</td></tr>
              <tr><td>Line × hour</td><td className="num">{pct(w.line_hour)}</td><td className="num">{pct(rep.wape_quantiles.line_hour["0.5"])}</td></tr>
              <tr><td>Daily taps</td><td className="num">{pct(w.daily)}</td><td className="num">{pct(rep.wape_quantiles.daily["0.5"])}</td></tr>
            </tbody>
          </table>
          <p className="warn small">Area-level corridors miss the team's 20% target in {rep.draw_count - rep.od_wape_target_pass_count} of {rep.draw_count} draws, and no tested policy met every target, so this is not a final policy. The municipality figure is for the coarser table only; it does not make area cells more accurate.</p>
          <p className="muted small">Part of the error is the per-card cap: it removed {pct(cap.od)} of journeys, {pct(cap.line_hour)} of line-hour boardings and {pct(cap.daily)} of daily taps before noise.</p>
        </article>
        <article className="ev-card">
          <h3>Organisers' utility tasks (MOB-S1)</h3>
          <table className="table small">
            <tbody>
              <tr><td>MOB-U1 corridor matrix (native)</td><td className="num">{ev.native_MOB_U1.score.toFixed(2)}</td></tr>
              <tr><td>MOB-U2 line × hour (adapted)</td><td className="num">{ev.adapted_MOB_U2.score.toFixed(2)}</td></tr>
              <tr><td>MOB-U3 daily (adapted)</td><td className="num">{ev.adapted_MOB_U3.score.toFixed(2)}</td></tr>
            </tbody>
          </table>
          <p className="warn small">These strict cell-error scores are low: MOB-S1 utility is <strong>not</strong> passing for this release. Adapted tasks use team adapters for aggregate tables and are reported separately from native ones.</p>
        </article>
        <article className="ev-card">
          <h3>One person, several cards</h3>
          <p>{fmt(mc.people_with_multiple_cards)} of {fmt(mc.people_in_truth)} synthetic people hold {mc.observed_max_cards_per_person} cards. The guarantee protects each card; for someone with m cards it is m × ε.</p>
          <p className="muted small">{mc.interpretation}</p>
        </article>
        <article className="ev-card">
          <h3>Provenance</h3>
          <dl className="kv small">
            <dt>Release</dt><dd><code>{ev.release_id}</code></dd>
            <dt>Manifest SHA-256</dt><dd><code>{ev.release_manifest_sha256.slice(0, 16)}…</code></dd>
            <dt>Publisher commit</dt><dd><code>{ev.source_commit.slice(0, 10)}</code></dd>
            <dt>Inference parity</dt><dd>{ev.upstream_inference_exact_parity.exact_vector_equal ? `identical to the organisers' journey heuristic (${fmt(ev.upstream_inference_exact_parity.production_journeys)} journeys)` : "differs"}</dd>
            <dt>Policy search</dt><dd>{ev.policy_search_status}</dd>
          </dl>
          <ul className="plain small muted">{ev.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </article>
      </div>
    </section>
  );
}
