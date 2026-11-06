import { cellRadius, familyScale, fmt, noiseRadius } from "../data/derive";
import { oddsBound } from "../data/evidence";
import { areaLabel, type Release } from "../data/release";
import { IconCheck, IconInfo, IconShield, IconWarn } from "./Icons";

const pct = (x: number, d = 0) => `${(100 * x).toFixed(d)}%`;
const two = (x: number) => x.toFixed(2);

/** "Is it safe?" Astra's reviewed synthetic-benchmark evidence, in plain words: rows vs RouteSafe, then the limits. */
export function EvidenceView({ rel, ev }: { rel: Release; ev: any | null | undefined }) {
  if (ev === null) return <section className="panel wide"><h2>Is it safe?</h2><p className="muted">No reviewed test results are available in this build.</p></section>;
  if (ev === undefined) return <section className="panel wide" aria-busy="true"><div className="skeleton" /></section>;
  if (ev.release_id !== rel.id) return <section className="panel wide"><h2>Is it safe?</h2><p className="muted">The test results describe release <code>{ev.release_id}</code>. Select it above.</p></section>;

  const curve: any[] = ev.trajectory_fixed_cohort?.b0 ?? [];
  const four = curve.find((c) => c.known_points === 4) ?? { unicity: ev.trajectory_native_four_point.b0.unicity, tested: ev.trajectory_native_four_point.b0.n_users_tested };
  const t = ev.trajectory_native_four_point, w = ev.actual_release_wape, rep = ev.initial_policy_100_draws, muni = ev.municipality_postprocessing;
  const dec = ev.actual_release_decision, mc = ev.multiple_cards;
  const u1 = ev.native_MOB_U1, u2 = ev.adapted_MOB_U2, u3 = ev.adapted_MOB_U3;
  const eps = Number(rel.manifest.privacy.epsilon_release);
  const inOut = oddsBound(eps), history = oddsBound(2 * eps);
  const rb = ev.row_baseline_utility?.results ?? null;
  // E7 fixed-pair membership diagnostic, shown only once it is in Astra's reviewed summary
  const e7r: any[] | null = Array.isArray(ev.e7_membership?.results) && ev.e7_membership.results.length ? ev.e7_membership.results : null;
  const e7 = e7r && {
    n: e7r.length,
    tprLo: Math.min(...e7r.map((r) => r.true_positive.rate)), tprHi: Math.max(...e7r.map((r) => r.true_positive.rate)),
    fpr: e7r.reduce((s, r) => s + r.false_positive.rate, 0) / e7r.length,
  }; // Astra's reviewed native MOB-U scores for the row baselines
  const scores = (r: any) => (r ? `${two(r["MOB-U1"].score)} · ${two(r["MOB-U2"].score)} · ${two(r["MOB-U3"].score)}` : "–");
  const cap = rel.manifest.privacy.families.od.cap;
  const morningCells = rel.od.filter((c) => c.hour_band === "06-09" && c.origin_area !== c.destination_area).length;
  const W = 460, rowH = 34, LBL = 92, BAR = W - LBL - 150;
  return (
    <div className="layout">
      <div className="headline">
        <div>
          <h1>Sharing rows would expose {pct(four.unicity, 1)} of cards. RouteSafe shares none.</h1>
          <p>Test results on the synthetic data. They compare the release with the exact data, which only works because this data is synthetic: a real operator would run them privately before publishing.</p>
        </div>
      </div>

      <section className="panel wide">
        <div className="vs">
          <article className="vs-card vs-bad">
            <div className="vs-head"><IconWarn /> If the rows were shared</div>
            <div className="hero-num">{pct(four.unicity, 1)}</div>
            <p>of travel cards are <strong>picked out from just 4 sightings</strong> (a stop and an hour), even with names removed. A picked-out card reveals that card's recorded boardings in this dataset.</p>
            <svg viewBox={`0 0 ${W} ${curve.length * rowH + 22}`} className="curve" role="img" aria-label="Share of cards picked out by 2, 3 and 4 sightings">
              {curve.map((c, i) => {
                const y = 6 + i * rowH, bw = BAR * c.unicity;
                return (
                  <g key={c.known_points}>
                    <text x={0} y={y + 16} className="lbl">{c.known_points} sightings</text>
                    <rect x={LBL} y={y + 4} width={BAR} height={16} rx={4} fill="var(--d100)" />
                    <rect x={LBL} y={y + 4} width={bw} height={16} rx={4} className="hbar-bad" />
                    <text x={LBL + BAR + 8} y={y + 16} className="lbl" fontWeight={700}>{pct(c.unicity, 1)}</text>
                    {c.wilson_95 && <text x={LBL + BAR + 54} y={y + 16} className="lbl" fill="var(--muted)">{(100 * c.wilson_95[0]).toFixed(1)}–{(100 * c.wilson_95[1]).toFixed(1)}%</text>}
                  </g>
                );
              })}
              <text x={0} y={curve.length * rowH + 18} className="lbl" fill="var(--muted)">{fmt(curve[0]?.tested ?? 1000)} test cards, names removed · grey = 95% range</text>
            </svg>
          </article>
          <article className="vs-card vs-good">
            <div className="vs-head"><IconCheck /> RouteSafe</div>
            <div className="hero-num">0 rows</div>
            <p>shared: only three tables of protected counts. The lookup attack has nothing to search. That is not the same as zero risk (see below).</p>
            <div className="vs-stat"><strong>{dec.top_k_overlap} of {dec.k}</strong><span>top morning routes match the exact data</span></div>
            <div className="vs-stat"><strong>{rep.exact_top3_count ?? "–"} of {rep.draw_count}</strong><span>noise re-runs gave the exact same top {dec.k}</span></div>
            <ol className="plain small">{dec.selected.map((c: any) => <li key={c.origin_area + c.destination_area}>{areaLabel(c.origin_area)} → {areaLabel(c.destination_area)}</li>)}</ol>
          </article>
        </div>

        <h3>Before and after</h3>
        <div className="table-wrap">
          <table className="table small compare">
            <thead><tr><th scope="col">What is shared</th><th scope="col" className="num">Cards picked out by 4 sightings</th><th scope="col" className="num">Organisers' utility scores<br /><span className="tiny muted">routes · lines · days (1 = perfect)</span></th></tr></thead>
            <tbody>
              <tr><td>Journey rows, names removed</td><td className="num">{pct(t.b0.unicity, 1)}</td><td className="num">{scores(rb?.b0)}</td></tr>
              <tr><td>Journey rows, fixed fake card numbers</td><td className="num">{pct(t.b2.unicity, 1)}</td><td className="num">{scores(rb?.b2)}</td></tr>
              <tr><td>Journey rows, fake numbers, rare values suppressed (k ≥ 5)</td><td className="num">{pct(t.b2k.unicity, 1)}</td><td className="num">{scores(rb?.b2k)}</td></tr>
              <tr className="row-ours"><td><strong>RouteSafe: protected counts only</strong></td><td className="num">no rows to search</td><td className="num">{two(u1.score)} · {two(u2.score)} · {two(u3.score)}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="tiny muted">Organisers' tools: {fmt(t.b0.n_users_tested)} test cards, stops within {t.b0.spatial_m} m and times to the hour; the curve above uses a fixed group of {fmt(four.tested ?? 1000)} cards, so its 4-sighting figure differs slightly. Utility: routes = native MOB-U1; for RouteSafe, lines and days use aggregate adapters of MOB-U2/U3. Row scores use the organisers' field catalogue. A high row score does not mean low risk: read both columns together.</p>

        <div className="ev-grid">
          <article className="ev-card">
            <h3>How close are the numbers?</h3>
            <table className="table small">
              <thead><tr><th>Table</th><th className="num">Volume-weighted error</th></tr></thead>
              <tbody>
                <tr><td>Routes, by area</td><td className="num">{pct(w.od)}</td></tr>
                <tr><td>Routes, by town</td><td className="num">{pct(muni.wape)}</td></tr>
                <tr><td>Lines per hour</td><td className="num">{pct(w.line_hour)}</td></tr>
                <tr><td>Taps per day</td><td className="num">{pct(w.daily)}</td></tr>
              </tbody>
            </table>
            <p className="small">Big cells count more in this error. The <strong>organisers' scores</strong> average every cell instead: routes {two(u1.score)} (native MOB-U1), lines {two(u2.score)} and days {two(u3.score)} (adapted MOB-U2/U3), not passing. Averaged over all {fmt(u1.detail.cells)} route cells with 20+ trips, the error is {pct(u1.detail.mape)}: most of those cells are small, and noise dominates them.</p>
            <p className="small">Each card counts at most {cap} trips. That leaves out {pct(ev.cap_loss_fraction.od)} of all route trips (the trips of cards with more than {cap}), so route totals run low.</p>
            <p className="warnbox"><IconWarn /><span>Area-level routes miss our own 20% target, so this is not a final setting yet. Use the shortlist, not single numbers.</span></p>
          </article>
          <article className="ev-card">
            <h3><IconShield /> What ε = {eps} means</h3>
            <ul className="plain small">
              <li><strong>Card in or out?</strong> Take two versions of the data that differ only by one card, with everyone else's records the same. Any result the release could show is at most {inOut.factor.toFixed(1)}× more likely under one version than the other.</li>
              <li><strong>Example:</strong> someone who knew all the other records and was 50/50 on whether this card is in can get to at most {pct(inOut.posterior)}.</li>
              <li><strong>Two possible trip histories for the same card:</strong> at most {history.factor.toFixed(1)}× (50/50 can reach {pct(history.posterior)}).</li>
              <li><strong>One person, 2 cards:</strong> counts as 2 cards, so ε doubles for them. That's {fmt(mc.people_with_multiple_cards)} of {fmt(mc.people_in_truth)} people in this data.</li>
            </ul>
            <p className="tiny muted">This compares two fixed versions of the data. It does not cover what data about related people (family, colleagues) might reveal. Assumes one card's records for the whole 4-week period, this one release, total budget ε = {eps}.</p>
          </article>
          <article className="ev-card">
            <h3><IconInfo /> What's still risky</h3>
            <ul className="plain small">
              {e7 ? (
                <li><strong>Membership test (simulated):</strong> for {e7.n} preselected synthetic cards, an attacker who knew every other card's records and the card's whole history detected {pct(e7.tprLo, 1)}–{pct(e7.tprHi, 1)} of membership cases at about {pct(e7.fpr)} false alarms (random guessing: {pct(e7.fpr)}). One specific attack, not proof of zero risk.</li>
              ) : (
                <li>Attacks on the counts themselves are limited by ε, but we haven't tested one by experiment yet.</li>
              )}
              <li>Every new release spends more budget: 12 monthly releases add up to ε = {12 * eps} for a card in all of them.</li>
              <li>The budget ledger is a local file: it stops accidental re-runs, not a dishonest publisher.</li>
              <li>Pending review: not yet independently audited.</li>
            </ul>
          </article>
        </div>
        <details className="more">
          <summary>Technical details</summary>
          <table className="table small">
            <tbody>
              <tr><td>4-sighting test, names removed / pseudonyms / k≥5 (organisers' tool)</td><td className="num">{pct(t.b0.unicity, 1)} / {pct(t.b2.unicity, 1)} / {pct(t.b2k.unicity, 1)}</td></tr>
              <tr><td>95% noise range for one cell chosen in advance, routes / lines / days</td><td className="num">±{cellRadius(rel, "od")} / ±{cellRadius(rel, "line_hour")} / ±{fmt(cellRadius(rel, "daily"))}</td></tr>
              <tr><td>95% for all {morningCells} morning routes at once (the prechosen morning test)</td><td className="num">±{noiseRadius(familyScale(rel, "od"), 0.05 / morningCells)}</td></tr>
              <tr><td>95% for all {fmt(rel.od.length)} released route cells at once (the range the planner shows)</td><td className="num">±{noiseRadius(familyScale(rel, "od"), 0.05 / rel.od.length)}</td></tr>
              <tr><td>Route error over {rep.draw_count} noise draws (median)</td><td className="num">{pct(rep.wape_quantiles.od["0.5"], 1)}</td></tr>
              <tr><td>Organisers' utility scores MOB-U1 / U2 / U3 (not passing)</td><td className="num">{two(u1.score)} / {two(u2.score)} / {two(u3.score)}</td></tr>
              <tr><td>Trips removed by the per-card limit (routes / lines / days)</td><td className="num">{pct(ev.cap_loss_fraction.od, 1)} / {pct(ev.cap_loss_fraction.line_hour, 1)} / {pct(ev.cap_loss_fraction.daily, 1)}</td></tr>
              <tr><td>Release fingerprint (manifest SHA-256)</td><td className="num"><code>{ev.release_manifest_sha256.slice(0, 16)}…</code></td></tr>
              <tr><td>Publisher commit that made the release / evidence revision</td><td className="num"><code>{String(ev.publisher_source_commit ?? "n/a").slice(0, 10)}</code> / <code>{String(ev.source_commit).slice(0, 10)}</code></td></tr>
              <tr><td>Decision target passed ({rep.decision_target ?? "overlap + regret"}) / exact same top 3</td><td className="num">{rep.decision_pass_count} / {rep.exact_top3_count ?? "n/a"} of {rep.draw_count}</td></tr>
            </tbody>
          </table>
          <p className="tiny muted">{ev.trajectory_curve_context?.known_point_sampling} Each shared version is tested on its own surviving records.</p>
          <ul className="plain tiny muted">{ev.limitations.map((l: string) => <li key={l}>{l}</li>)}</ul>
        </details>
      </section>
    </div>
  );
}
