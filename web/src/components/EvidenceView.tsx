import { useEffect, useState } from "react";
import { fmt } from "../data/derive";
import { areaLabel } from "../data/release";
import { IconCheck, IconInfo, IconShield, IconWarn } from "./Icons";

const pct = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`;

/** "Is it safe?" Synthetic benchmark evidence (Astra's reviewed evidence-summary.json), in plain words. */
export function EvidenceView({ releaseId }: { releaseId: string }) {
  const [ev, setEv] = useState<any | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/evidence/evidence-summary.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject())).then(setEv).catch(() => setMissing(true));
  }, []);
  if (missing) return <section className="panel wide"><h2>Is it safe?</h2><p className="muted">No reviewed test results are available in this build.</p></section>;
  if (!ev) return <section className="panel wide" aria-busy="true"><div className="skeleton" /></section>;
  if (ev.release_id !== releaseId) return <section className="panel wide"><h2>Is it safe?</h2><p className="muted">The test results describe release <code>{ev.release_id}</code>. Select it above.</p></section>;

  const curve: any[] = ev.trajectory_fixed_cohort?.b0 ?? [];
  const four = curve.find((c) => c.known_points === 4) ?? { unicity: ev.trajectory_native_four_point.b0.unicity, tested: ev.trajectory_native_four_point.b0.n_users_tested };
  const t = ev.trajectory_native_four_point, w = ev.actual_release_wape, rep = ev.initial_policy_100_draws, muni = ev.municipality_postprocessing;
  const dec = ev.actual_release_decision, mc = ev.multiple_cards;
  const W = 420, rowH = 34;
  return (
    <div className="layout">
      <p className="banner" role="note"><IconInfo /> <span><strong>Test results on the synthetic data.</strong> We compared the protected release with the exact data to check it. These checks are not part of what gets shared.</span></p>

      <section className="panel wide">
        <div className="ev-hero">
          <div>
            <div className="eyebrow">Why not just share the rows?</div>
            <div className="hero-num">{pct(four.unicity, 1)}</div>
            <p>of travel cards can be <strong>picked out from just 4 sightings</strong> (a stop and an hour), even with names removed. A picked-out card reveals all of that card's recorded bus boardings for the month.</p>
            <p className="small ink2">RouteSafe shares no rows at all, only protected counts, so this attack has nothing to search. (That is not the same as zero risk.)</p>
          </div>
          <div>
            <svg viewBox={`0 0 ${W} ${curve.length * rowH + 22}`} className="curve" role="img" aria-label="Share of cards picked out by 2, 3 and 4 sightings">
              {curve.map((c, i) => {
                const y = 6 + i * rowH, bw = (W - 140) * c.unicity;
                return (
                  <g key={c.known_points}>
                    <text x={0} y={y + 16} className="lbl">{c.known_points} sightings</text>
                    <rect x={92} y={y + 4} width={W - 140} height={16} rx={4} fill="var(--d100)" />
                    <rect x={92} y={y + 4} width={bw} height={16} rx={4} className="hbar" />
                    <text x={92 + bw + 6} y={y + 16} className="lbl" fontWeight={700}>{pct(c.unicity, 1)}</text>
                    {c.wilson_95 && <text x={92 + bw + 50} y={y + 16} className="lbl" fill="var(--muted)">({pct(c.wilson_95[0], 1)}–{pct(c.wilson_95[1], 1)})</text>}
                  </g>
                );
              })}
              <text x={0} y={curve.length * rowH + 18} className="lbl" fill="var(--muted)">{fmt(curve[0]?.tested ?? 1000)} test cards, names removed · 95% range in brackets</text>
            </svg>
          </div>
        </div>
        <div className="ev-grid">
          <article className="ev-card">
            <h3><IconCheck /> Do planners still get the right answer?</h3>
            <p className="big">{dec.top_k_overlap} of {dec.k}</p>
            <p className="small">top morning routes are the same as with the exact data. Re-run {rep.draw_count} times with fresh random noise on this synthetic data: exactly the same top {dec.k} in {rep.exact_top3_count ?? "–"} of {rep.draw_count} runs.</p>
            <ol className="plain small">{dec.selected.map((c: any) => <li key={c.origin_area + c.destination_area}>{areaLabel(c.origin_area)} → {areaLabel(c.destination_area)}</li>)}</ol>
          </article>
          <article className="ev-card">
            <h3>How exact are the numbers?</h3>
            <table className="table small">
              <thead><tr><th>Table</th><th className="num">Typical error</th></tr></thead>
              <tbody>
                <tr><td>Routes, by area</td><td className="num">{pct(w.od)}</td></tr>
                <tr><td>Routes, by town</td><td className="num">{pct(muni.wape)}</td></tr>
                <tr><td>Lines per hour</td><td className="num">{pct(w.line_hour)}</td></tr>
                <tr><td>Taps per day</td><td className="num">{pct(w.daily)}</td></tr>
              </tbody>
            </table>
            <p className="warnbox"><IconWarn /><span>Area-level routes miss our own 20% target, so this is not a final setting yet. Use the shortlist, not single numbers.</span></p>
          </article>
          <article className="ev-card">
            <h3><IconShield /> What the protection means</h3>
            <p className="small">Each travel card can only add a limited number of trips, then random noise is added. That limits how much any one card can shift the odds of what gets published (privacy budget ε = 1 per card for the whole month). It is a mathematical limit on influence, not a promise that no number moves.</p>
            <p className="small ink2">Limit: one person with 2 cards counts as 2 cards. That's {fmt(mc.people_with_multiple_cards)} of {fmt(mc.people_in_truth)} people in this data.</p>
          </article>
        </div>
        <details className="more">
          <summary>Technical details</summary>
          <table className="table small">
            <tbody>
              <tr><td>4-sighting test, names removed / pseudonyms / k≥5 (organisers' tool)</td><td className="num">{pct(t.b0.unicity, 1)} / {pct(t.b2.unicity, 1)} / {pct(t.b2k.unicity, 1)}</td></tr>
              <tr><td>Route error over {rep.draw_count} noise draws (median)</td><td className="num">{pct(rep.wape_quantiles.od["0.5"], 1)}</td></tr>
              <tr><td>Organisers' utility scores MOB-U1 / U2 / U3 (not passing)</td><td className="num">{ev.native_MOB_U1.score.toFixed(2)} / {ev.adapted_MOB_U2.score.toFixed(2)} / {ev.adapted_MOB_U3.score.toFixed(2)}</td></tr>
              <tr><td>Trips removed by the per-card limit (routes / lines / days)</td><td className="num">{pct(ev.cap_loss_fraction.od, 1)} / {pct(ev.cap_loss_fraction.line_hour, 1)} / {pct(ev.cap_loss_fraction.daily, 1)}</td></tr>
              <tr><td>Release fingerprint (manifest SHA-256)</td><td className="num"><code>{ev.release_manifest_sha256.slice(0, 16)}…</code></td></tr>
              <tr><td>Publisher commit that made the release / evidence revision</td><td className="num"><code>{String(ev.publisher_source_commit ?? "n/a").slice(0, 10)}</code> / <code>{String(ev.source_commit).slice(0, 10)}</code></td></tr>
              <tr><td>Decision target passed (overlap + regret) / exact same top 3</td><td className="num">{rep.decision_pass_count} / {rep.exact_top3_count ?? "n/a"} of {rep.draw_count}</td></tr>
            </tbody>
          </table>
          <p className="tiny muted">{ev.trajectory_curve_context?.known_point_sampling} Each shared version is tested on its own surviving records.</p>
          <ul className="plain tiny muted">{ev.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </details>
      </section>
    </div>
  );
}
