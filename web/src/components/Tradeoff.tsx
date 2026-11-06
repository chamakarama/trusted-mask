// "The trade-off": Astra's predeclared E3 policy search (8 candidates, 20 noise draws each on half of the cards), curated
// into the reviewed summary as `policy_tradeoff`. Renders nothing until that block exists. Lower epsilon = more privacy.
const E1 = "var(--d650)", E2 = "var(--d250)";

interface Cand { id: string; epsilon: number; caps: { od: number }; geography: string; median_wape: { od: number }; decision_pass_count: number; draws: number }

export function Tradeoff({ t, released }: { t: any; released: { epsilon: number; cap: number; geography: string } }) {
  const runs: Cand[] = Array.isArray(t?.candidates) ? t.candidates : [];
  if (!runs.length) return null;
  const groups = [...new Set(runs.map((r) => `${r.geography}|${r.caps.od}`))]
    .map((g) => { const [geography, cap] = g.split("|"); return { geography, cap: Number(cap) }; })
    .sort((a, b) => (a.geography === b.geography ? a.cap - b.cap : a.geography === "area" ? -1 : 1));
  const eps = [...new Set(runs.map((r) => r.epsilon))].sort((a, b) => a - b);
  const W = 560, H = 210, L = 40, B = 40, T = 18, R = 8;
  const max = Math.max(0.1, ...runs.map((r) => r.median_wape.od));
  const top = Math.ceil(max * 10) / 10;
  const gw = (W - L - R) / groups.length, bw = Math.min(26, (gw - 18) / eps.length);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const pct = (v: number) => `${Math.round(100 * v)}%`;
  const allPass = runs.every((r) => r.decision_pass_count === r.draws);
  return (
    <section className="ba tradeoff">
      <h3>The trade-off: more privacy costs accuracy <span className="tiny muted">synthetic evaluation, predeclared policy search</span></h3>
      <p className="small ink2 ba-legend">
        <span className="swatch" style={{ background: E1 }} />ε = {eps[0]} (more private)
        {eps[1] !== undefined && <><span className="swatch" style={{ background: E2, marginLeft: 12 }} />ε = {eps[1]}</>}
        <span style={{ marginLeft: 12 }}>· bar = route error (volume-weighted, median of draws)</span>
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Route error for each candidate policy: per-card cap and epsilon">
        {[0, 0.5, 1].map((f) => (
          <g key={f}><line x1={L} x2={W - R} y1={y(top * f)} y2={y(top * f)} className={f === 0 ? "base" : "grid"} />
            <text x={L - 6} y={y(top * f) + 4} className="axis" textAnchor="end">{pct(top * f)}</text></g>
        ))}
        {groups.map((g, gi) => {
          const x0 = L + gi * gw + (gw - eps.length * bw - (eps.length - 1) * 4) / 2;
          return (
            <g key={`${g.geography}${g.cap}`}>
              {eps.map((e, ei) => {
                const r = runs.find((c) => c.geography === g.geography && c.caps.od === g.cap && c.epsilon === e);
                if (!r) return null;
                const x = x0 + ei * (bw + 4), h = y(0) - y(r.median_wape.od), rr = Math.min(4, h);
                const isReleased = r.geography === released.geography && r.caps.od === released.cap && r.epsilon === released.epsilon;
                const path = `M${x},${y(0)} V${y(0) - h + rr} Q${x},${y(0) - h} ${x + rr},${y(0) - h} H${x + bw - rr} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + rr} V${y(0)} Z`;
                return (
                  <g key={e}>
                    <path d={path} fill={ei === 0 ? E1 : E2} stroke={isReleased ? "var(--ink)" : "none"} strokeWidth={isReleased ? 2 : 0} />
                    <text x={x + bw / 2} y={y(0) - h - 4} className="axis" textAnchor="middle">{pct(r.median_wape.od)}</text>
                    {isReleased && <text x={x + bw / 2} y={y(0) - h - 16} className="axis" textAnchor="middle" fontWeight={700}>same policy</text>}
                  </g>
                );
              })}
              <text x={L + gi * gw + gw / 2} y={H - 22} className="axis" textAnchor="middle">{g.geography === "area" ? `areas, cap ${g.cap}` : `towns, cap ${g.cap}`}</text>
            </g>
          );
        })}
        <text x={L} y={H - 4} className="axis">per-card route cap (trips per card)</text>
      </svg>
      <p className="tiny muted">Higher ε permits more noise reduction and a weaker privacy guarantee. A small cap drops many trips; a big cap needs more noise; 32 was the best area cap tried. {allPass ? "Every candidate met the decision target (at least 2 of 3 routes overlap and at most 10% regret) in all its noise draws. " : ""}Run on {t.development_cards ? `${Math.round(t.development_cards / 1000)}k of ${Math.round((t.all_cards ?? 0) / 1000)}k` : "half of the"} cards; these subset results are not directly comparable with the full release. No candidate met every error target.</p>
    </section>
  );
}
