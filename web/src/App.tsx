import { useEffect, useMemo, useRef, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { BaseMap } from "./components/BaseMap";
import { BAND_SHORT, CorridorPanel, RouteFilters } from "./components/CorridorPanel";
import { WhenView } from "./components/DemandViews";
import { EvidenceView } from "./components/EvidenceView";
import { IconCheck, IconInfo, IconWarn, Logo } from "./components/Icons";
import { MapView } from "./components/MapView";
import { SharedPanel } from "./components/SharedPanel";
import { BAND_PHRASE, BANDS, commonEnd, fmt, outgoingAt, points, rankAt, shortlistReliability, type Level } from "./data/derive";
import { useEvidence } from "./data/evidence";
import { areaLabel, loadIndex, loadRelease, niceDate, ReleaseRefused, type Release, type ReleaseIndexEntry } from "./data/release";

type View = "routes" | "when" | "safe" | "shared";
const VIEWS: { id: View; label: string }[] = [
  { id: "routes", label: "Where people go" }, { id: "when", label: "When people travel" }, { id: "safe", label: "Is it safe?" }, { id: "shared", label: "What's shared" },
];
const LEGACY: Record<string, View> = { corridors: "routes", lines: "when", daily: "when", evidence: "safe" };
const SHORTLIST = 3, ON_MAP = 10;
const ATTRIBUTION = "Synthetic data: TrustED PETs Proving Ground 2026 by Since AI ry (CC BY 4.0); stop locations derive from GeoNames postcode centroids (CC BY 4.0). Not real Turku travel. This page can only show, sort and add up the published numbers; it has no access to the bus company's records.";

function readUrl() {
  const u = new URLSearchParams(location.search);
  const raw = u.get("view") ?? "routes";
  const view = (VIEWS.some((v) => v.id === raw) ? raw : LEGACY[raw] ?? "routes") as View;
  const band = BANDS.includes(u.get("band") as any) ? (u.get("band") as string) : "06-09";
  const level = (u.get("geo") === "municipality" ? "municipality" : "area") as Level;
  return { release: u.get("release"), view, band, level, origin: u.get("origin"), corridor: u.get("corridor"), schematic: u.get("map") === "schematic" };
}

export function App() {
  const init = useMemo(readUrl, []);
  const [index, setIndex] = useState<ReleaseIndexEntry[] | null>(null);
  const [releaseId, setReleaseId] = useState<string | null>(init.release);
  const [rel, setRel] = useState<Release | null>(null);
  const [error, setError] = useState<{ title: string; lines: string[] } | null>(null);
  const [view, setView] = useState<View>(init.view);
  const [band, setBand] = useState(init.band);
  const [level, setLevel] = useState<Level>(init.level);
  const [origin, setOrigin] = useState<string | null>(init.origin);
  const [selected, setSelected] = useState<string | null>(init.corridor);
  const [schematic, setSchematic] = useState(init.schematic);
  const sideBody = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadIndex().then((ix) => {
      setIndex(ix);
      if (!releaseId || !ix.some((r) => r.release_id === releaseId)) setReleaseId(ix[0]?.release_id ?? null);
    }).catch(() => setError({ title: "No release is available", lines: ["The release index could not be loaded. Run `npm run sync`."] }));
  }, []);

  useEffect(() => {
    if (!releaseId) return;
    let current = true;           // a slower response for a previously selected release must never win (A-014)
    setRel(null); setError(null);
    loadRelease(releaseId).then((r) => {
      if (!current || r.id !== releaseId) return;
      if (origin && !r.areas.some((a) => a.id === origin || a.municipality === origin)) setOrigin(null);
      setRel(r);
    }).catch((e) => current && setError(e instanceof ReleaseRefused
      ? { title: "This release was refused", lines: e.validation.errors }
      : { title: "The release could not be loaded", lines: [String(e.message ?? e)] }));
    return () => { current = false; };
  }, [releaseId]);

  useEffect(() => {
    const u = new URLSearchParams();
    if (releaseId) u.set("release", releaseId);
    u.set("view", view); u.set("band", band);
    if (level !== "area") u.set("geo", level);
    if (origin) u.set("origin", origin);
    if (selected) u.set("corridor", selected);
    if (schematic) u.set("map", "schematic");
    history.replaceState(null, "", `?${u}`);
  }, [releaseId, view, band, level, origin, selected, schematic]);

  const ranked = useMemo(() => (rel ? rankAt(rel, level, band, origin) : []), [rel, level, band, origin]);
  const pts = useMemo(() => (rel ? points(rel, level) : []), [rel, level]);
  const outgoing = useMemo(() => (rel ? outgoingAt(rel, level, band) : new Map<string, number>()), [rel, level, band]);
  useEffect(() => { if (rel && selected && !ranked.some((c) => c.id === selected)) setSelected(null); }, [ranked]);

  const entry = index?.find((r) => r.release_id === releaseId);
  const ev = useEvidence();
  const evFor = ev && rel && ev.release_id === rel.id ? ev : null;
  // noise claims only for a real release at area level (a fixture's illustrative parameters carry no claims)
  const rely = useMemo(() => (rel && level === "area" && !rel.manifest.fixture ? shortlistReliability(rel, ranked, SHORTLIST) : null), [rel, level, ranked]);
  // the exact-data test covered weekday mornings with any start area (area level: 100 re-runs; towns: one run)
  const check = evFor && band === "06-09" && !origin
    ? { exact: evFor.initial_policy_100_draws.exact_top3_count, draws: evFor.initial_policy_100_draws.draw_count, townOverlap: evFor.municipality_postprocessing?.top3_overlap ?? null, k: evFor.actual_release_decision.k }
    : null;
  // topNoise: even the busiest route is within the noise floor (then the whole shortlist is); someNoise: at least one is
  // how far the busiest morning routes came out below their exact counts on the synthetic test (cap + noise), if curated
  const uc = evFor?.utility_comparison?.morning_top10;
  const capGap: [number, number] | null = Array.isArray(uc) && uc.length
    ? [Math.min(...uc.map((r: any) => 1 - r.protected / r.exact)), Math.max(...uc.map((r: any) => 1 - r.protected / r.exact))] : null;
  // one-draw exact-data check of this band's area shortlist, if Astra's summary carries it (all start areas only)
  const bandCheck = evFor && level === "area" && !origin && band !== "06-09" ? evFor.band_checks?.[band] ?? null : null;
  const topNoise = !!rely && !!ranked[0] && ranked[0].noisy_value <= rely.radius;
  const someNoise = !!rely && rely.noiseOnly.length > 0;
  const floor = rely ? rely.radius : null;
  const shown = ranked.slice(0, ON_MAP);
  const takeaway = someNoise ? null : commonEnd(shown);
  // one scale for the whole release, so a 341-trip night arc never looks like a 5,491-trip morning one
  const tripsMax = useMemo(() => (rel ? Math.max(1, ...BANDS.map((b) => rankAt(rel, level, b, null)[0]?.trips ?? 0)) : 1), [rel, level]);
  const outMax = useMemo(() => (rel ? Math.max(1, ...BANDS.flatMap((b) => [...outgoingAt(rel, level, b).values()])) : 1), [rel, level]);
  const selectCorridor = (id: string) => {
    const m = /^odm?:(.+)>(.+)@(.+)$/.exec(id);
    if (m && m[3] !== band) setBand(m[3]);
    if (m && origin && m[1] !== origin) setOrigin(null); // the answer's routes must be the ones the shortlist shows
    if (id.startsWith("od:") && level !== "area") { setLevel("area"); setOrigin(null); }
    setView("routes");
    setSelected(id);
  };
  const pickRoute = (id: string) => {
    setSelected(id);
    window.setTimeout(() => sideBody.current?.querySelector(".detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  };
  const best = ranked[0];
  const isMuted = (c: { noisy_value: number }) => floor !== null && c.noisy_value <= floor;
  const legend = { strong: shown.slice(0, SHORTLIST).some((c) => !isMuted(c)), weak: shown.slice(SHORTLIST).some((c) => !isMuted(c)), muted: shown.some(isMuted), glow: [...outgoing.values()].some((v) => v > 0) };
  const period = rel ? `${niceDate(rel.manifest.period.start_date, false)} – ${niceDate(rel.manifest.period.end_date_inclusive)}` : "";
  const onRoutes = !!rel && !error && view === "routes";

  return (
    <div className={`app ${onRoutes ? "is-routes" : ""}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="logo"><Logo /></span>
            <div className="wordmark">
              <b>RouteSafe</b>
              <label className="release-pick">
                <span className="sr-only">Release</span>
                <select value={releaseId ?? ""} onChange={(e) => { setReleaseId(e.target.value); setSelected(null); }}>
                  {index?.map((r) => <option key={r.release_id} value={r.release_id}>{r.fixture ? `${r.release_id} (test data)` : `Release ${r.release_id}`}</option>)}
                </select>
              </label>
            </div>
          </div>
          <nav className="tabs" aria-label="Views">
            {VIEWS.map((v) => (
              <button key={v.id} className={`tab ${view === v.id ? "tab-on" : ""}`} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </nav>
          <div className="release-box">
            {entry && (
              <div className="chips" role="status">
                <span className="chip">{entry.fixture ? "test fixture" : "synthetic data"}</span>
                <span className="chip chip-warn">not yet independently audited</span>
                {rel && <span className="chip chip-ok"><IconCheck /> files verified</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <main className="page">
          <section className="state state-error" role="alert">
            <h2><IconWarn /> {error.title}</h2>
            <ul>{error.lines.slice(0, 8).map((l) => <li key={l}><code>{l}</code></li>)}</ul>
            <p>Nothing from this release is shown. Pick another release above.</p>
          </section>
        </main>
      )}
      {!error && !rel && <main className="page"><section className="state" aria-busy="true"><div className="skeleton" /><p className="muted">Checking the release files…</p></section></main>}

      {onRoutes && rel && (
        <main className="routes">
          <section className="side-head" aria-labelledby="routes-title">
            <div className="eyebrow">Weekday bus trips · {period}</div>
            <h1 id="routes-title">Where do people travel {BAND_PHRASE[band]}?</h1>
            <div className="bandbar" role="radiogroup" aria-label="Time of day">
              {BANDS.map((b) => (
                <button key={b} role="radio" aria-checked={b === band} className={`band ${b === band ? "band-on" : ""}`} onClick={() => { setBand(b); setSelected(null); sideBody.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>
                  {BAND_SHORT[b][0]}<small>{BAND_SHORT[b][1]}</small>
                </button>
              ))}
            </div>
            <RouteFilters level={level} origin={origin} originOptions={pts}
              onLevel={(l) => { setLevel(l); setOrigin(null); setSelected(null); }} onOrigin={(a) => { setOrigin(a); setSelected(null); }} />
          </section>

          <section className="mapcol" aria-label="Map">
            <div className="kpis">
              <div className="kpi"><div className="kpi-label">Busiest route ({BAND_SHORT[band][1]})</div>
                <div className="kpi-value">{!best ? "–" : topNoise ? "No clear busiest route" : <><span className="nw">{areaLabel(best.origin_area)}</span> → <span className="nw">{areaLabel(best.destination_area)}</span></>}</div>
                <div className="kpi-sub">{!best ? "" : topNoise && rely ? `top is ${fmt(best.trips)} trips, below the ${fmt(rely.radius)} noise level` : `${fmt(best.trips)} trips over 4 weeks`}</div></div>
              <div className="kpi"><div className="kpi-label">Passenger records shared</div><div className="kpi-value">0</div><div className="kpi-sub">no card numbers, no exact times</div></div>
              <div className="kpi"><div className="kpi-label">Privacy budget</div><div className="kpi-value">ε = {rel.manifest.privacy.epsilon_release}</div><div className="kpi-sub">per travel card<br />lower = more private</div></div>
              <div className={`kpi ${someNoise ? "kpi-warn" : check ? "kpi-ok" : ""}`}>
                <div className="kpi-label">{someNoise && <IconWarn />} Top {SHORTLIST} check</div>
                <div className="kpi-value">{rel.manifest.fixture ? "–" : topNoise ? "Could be noise" : someNoise ? "Some could be noise" : check && level === "area" ? `${check.exact} of ${check.draws}` : check ? `${check.townOverlap} of ${check.k}` : "Not tested"}</div>
                <div className="kpi-sub">{rel.manifest.fixture ? "test fixture: no claims" : topNoise ? "too small to tell from noise" : someNoise ? "some shortlisted routes are within the noise range" : check && level === "area" ? "re-runs gave the same top 3 (synthetic test)" : check ? "town pairs match exact data (synthetic test)" : band === "06-09" && origin ? "only the unfiltered morning top 3 was tested" : "only weekday mornings were tested"}</div>
              </div>
            </div>
            <div className="mapwrap">
              {schematic
                ? <div className="map" style={{ position: "absolute", inset: 0 }}>
                    <MapView pts={pts} outgoing={outgoing} derived={level === "municipality"} corridors={ranked.slice(0, ON_MAP)} highlight={SHORTLIST}
                      selected={selected} origin={origin} onSelect={pickRoute} onOrigin={(a) => { setOrigin(a); setSelected(null); }} floor={floor} tripsMax={tripsMax} outMax={outMax} />
                  </div>
                : <BaseMap key={level} pts={pts} outgoing={outgoing} corridors={ranked.slice(0, ON_MAP)} highlight={SHORTLIST} selected={selected} origin={origin}
                    onSelect={pickRoute} onOrigin={(a) => { setOrigin((o) => (o === a ? null : a)); setSelected(null); }} onFail={() => setSchematic(true)} floor={floor} tripsMax={tripsMax} outMax={outMax} />}
              <div className="map-overlay">
                <div className="glass">
                  <strong>{topNoise ? `${BAND_SHORT[band][0]}: too few trips to read` : someNoise ? `${BAND_SHORT[band][0]}: some top routes could be noise` : takeaway
                    ? `${takeaway.count} of the ${shown.length} busiest ${BAND_SHORT[band][0].toLowerCase()} routes ${takeaway.side === "end" ? "end" : "start"} in ${areaLabel(takeaway.place)}`
                    : `${BAND_SHORT[band][0]} trips ${BAND_SHORT[band][1]}`}</strong>
                  <div className="map-legend">
                    {legend.strong && <div className="legend-row"><span className="legend-arc" /> top {SHORTLIST} routes</div>}
                    {legend.weak && <div className="legend-row"><span className="legend-arc thin" /> next {ON_MAP - SHORTLIST}</div>}
                    {floor !== null && legend.muted && <div className="legend-row"><span className="legend-arc muted" /> could be noise (under {fmt(floor)})</div>}
                    {legend.glow && <div className="legend-row"><span className={`legend-dot ${schematic ? "" : "legend-glow"}`} /> {schematic ? "bigger dot = more trips start here" : "ring size = trips starting here"}</div>}
                  </div>
                  <details className="mapcap">
                    <summary><span>Protected counts with random noise, never anyone's journeys · destinations estimated, not observed.</span> <span className="mapcap-more"><IconInfo /> About this map</span></summary>
                    <p>Curves join start and end areas; they are not bus lines or roads. Dots are area centres averaged from the public stop list; areas are postcode zones, so numbers repeat across towns.{" "}
                      {schematic ? "Simple diagram: distances are not to scale." : "Street map © OpenStreetMap contributors via OpenFreeMap; it never receives any data from this release."}</p>
                  </details>
                </div>
              </div>
              <div className="map-toggle"><button onClick={() => setSchematic(!schematic)}>{schematic ? "Street map" : "Simple diagram"}</button></div>
            </div>
          </section>

          <div className="side-body" ref={sideBody}>
            <CorridorPanel rel={rel} level={level} band={band} origin={origin}
              ranked={ranked} shortlist={SHORTLIST} selected={selected} rely={rely} check={check} capLoss={evFor?.cap_loss_fraction?.od ?? null}
              capGap={capGap} bandCheck={bandCheck}
              onOrigin={(a) => { setOrigin(a); setSelected(null); }} onSelect={pickRoute} />
            <AssistantPanel rel={rel} onEvidence={selectCorridor} onApply={(b, o) => { setBand(b); setOrigin(o); setSelected(null); }}
              onIntent={(b, o, id) => { setLevel("area"); setBand(b); setOrigin(o); setSelected(id); }} />
            <p className="side-foot">{ATTRIBUTION}</p>
          </div>
        </main>
      )}

      {rel && !error && view !== "routes" && (
        <main className="page">
          {view === "when" && <WhenView rel={rel} />}
          {view === "safe" && <EvidenceView rel={rel} ev={ev} />}
          {view === "shared" && <SharedPanel rel={rel} />}
        </main>
      )}

      {!onRoutes && <footer className="foot">{ATTRIBUTION}</footer>}
    </div>
  );
}
