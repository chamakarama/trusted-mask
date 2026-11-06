import { useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { BaseMap } from "./components/BaseMap";
import { BAND_SHORT, CorridorPanel } from "./components/CorridorPanel";
import { WhenView } from "./components/DemandViews";
import { EvidenceView } from "./components/EvidenceView";
import { IconCheck, IconInfo, IconLock, IconShield, IconWarn, Logo } from "./components/Icons";
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
  const unreliable = !!rely && rely.noiseOnly.length > 0;
  const shown = ranked.slice(0, ON_MAP);
  const takeaway = unreliable ? null : commonEnd(shown);
  const selectCorridor = (id: string) => {
    const m = /^odm?:(.+)>(.+)@(.+)$/.exec(id);
    if (m && m[3] !== band) setBand(m[3]);
    if (id.startsWith("od:") && level !== "area") { setLevel("area"); setOrigin(null); }
    setView("routes");
    setSelected(id);
  };
  const best = ranked[0];
  const period = rel ? `${niceDate(rel.manifest.period.start_date, false)} – ${niceDate(rel.manifest.period.end_date_inclusive)}` : "";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="logo"><Logo /></span>
            <div className="wordmark">RouteSafe<small>Bus demand without passenger histories</small></div>
          </div>
          <nav className="tabs" aria-label="Views">
            {VIEWS.map((v) => (
              <button key={v.id} className={`tab ${view === v.id ? "tab-on" : ""}`} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>{v.label}</button>
            ))}
          </nav>
          <div className="release-box">
            <label className="release-pick">
              <span className="sr-only">Release</span>
              <select value={releaseId ?? ""} onChange={(e) => { setReleaseId(e.target.value); setSelected(null); }}>
                {index?.map((r) => <option key={r.release_id} value={r.release_id}>{r.fixture ? `${r.release_id} (test data)` : `Release ${r.release_id}`}</option>)}
              </select>
            </label>
            {entry && (
              <div className="chips" role="status">
                <span className="chip-dark"><span className="dot dot-info" />{entry.fixture ? "test fixture" : "synthetic data"}</span>
                <span className="chip-dark"><span className="dot dot-warn" />not yet independently audited</span>
                {rel && <span className="chip-dark"><IconCheck /> files verified</span>}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        {error && (
          <section className="state state-error" role="alert">
            <h2><IconWarn /> {error.title}</h2>
            <ul>{error.lines.slice(0, 8).map((l) => <li key={l}><code>{l}</code></li>)}</ul>
            <p>Nothing from this release is shown. Pick another release above.</p>
          </section>
        )}
        {!error && !rel && <section className="state" aria-busy="true"><div className="skeleton" /><p className="muted">Checking the release files…</p></section>}

        {rel && !error && view === "routes" && (
          <>
            <div className="headline">
              <div>
                <h1>Where do people travel {BAND_PHRASE[band]}?</h1>
                <p>Weekday bus trips between areas, {period} · protected counts with random noise, never anyone's journeys · destinations estimated, not observed.</p>
              </div>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="kpi-label">Busiest route ({BAND_SHORT[band][1]})</div>
                <div className="kpi-value">{best ? `${areaLabel(best.origin_area)} → ${areaLabel(best.destination_area)}` : "–"}</div>
                <div className="kpi-sub">{best ? `${fmt(best.trips)} trips${unreliable ? " · could be noise" : " over 4 weeks"}` : ""}</div></div>
              <div className="kpi"><div className="kpi-label"><IconLock /> Passenger records shared</div><div className="kpi-value">0</div><div className="kpi-sub">no card numbers, no exact times</div></div>
              <div className="kpi"><div className="kpi-label"><IconShield /> Privacy budget</div><div className="kpi-value">ε = {rel.manifest.privacy.epsilon_release}</div><div className="kpi-sub">per travel card · lower = more private</div></div>
              <div className={`kpi ${unreliable ? "kpi-warn" : ""}`}>
                <div className="kpi-label">{unreliable ? <IconWarn /> : check ? <IconCheck /> : <IconInfo />} Top {SHORTLIST} check</div>
                <div className="kpi-value">{rel.manifest.fixture ? "–" : unreliable ? "Could be noise" : check && level === "area" ? `${check.exact} of ${check.draws}` : check ? `${check.townOverlap} of ${check.k}` : "Not tested"}</div>
                <div className="kpi-sub">{rel.manifest.fixture ? "test fixture: no claims" : unreliable ? "too small to tell from noise" : check && level === "area" ? "re-runs gave the same top 3 (synthetic test)" : check ? "town pairs match exact data (synthetic test)" : "only weekday mornings were tested"}</div>
              </div>
            </div>
            <div className="layout layout-corridors">
              <section className="mapcard" aria-label="Map">
                <div className="mapwrap">
                  {schematic
                    ? <div className="map" style={{ position: "absolute", inset: 0 }}>
                        <MapView pts={pts} outgoing={outgoing} derived={level === "municipality"} corridors={ranked.slice(0, ON_MAP)} highlight={SHORTLIST}
                          selected={selected} origin={origin} onSelect={setSelected} onOrigin={(a) => { setOrigin(a); setSelected(null); }} />
                      </div>
                    : <BaseMap key={level} pts={pts} outgoing={outgoing} corridors={ranked.slice(0, ON_MAP)} highlight={SHORTLIST} selected={selected} origin={origin}
                        onSelect={setSelected} onOrigin={(a) => { setOrigin((o) => (o === a ? null : a)); setSelected(null); }} onFail={() => setSchematic(true)} />}
                  <div className="map-overlay">
                    <div className="glass">
                      <strong>{unreliable ? `${BAND_SHORT[band][0]}: too few trips to read` : takeaway
                        ? `${takeaway.count} of the ${shown.length} busiest ${BAND_SHORT[band][0].toLowerCase()} routes ${takeaway.side === "end" ? "end" : "start"} in ${areaLabel(takeaway.place)}`
                        : `${BAND_SHORT[band][0]} trips ${BAND_SHORT[band][1]}`}</strong>
                      <div className="legend-row"><span className="legend-arc" /> top {SHORTLIST} routes</div>
                      <div className="legend-row"><span className="legend-arc thin" /> next {ON_MAP - SHORTLIST}</div>
                      <div className="legend-row"><span className="legend-dot" /> {schematic ? "bigger dot = more trips start here" : "glow = trips starting here"}</div>
                    </div>
                  </div>
                  <div className="map-toggle"><button onClick={() => setSchematic(!schematic)}>{schematic ? "Street map" : "Simple diagram"}</button></div>
                </div>
                <div className="mapcap">
                  Curves join start and end areas; they are not bus lines or roads. Dots are area centres from the public stop list.{" "}
                  {schematic ? "Simple diagram: distances are not to scale." : "Street map © OpenStreetMap contributors via OpenFreeMap; it never receives any data from this release."}
                </div>
              </section>
              <aside className="side">
                <CorridorPanel rel={rel} level={level} originOptions={pts} onLevel={(l) => { setLevel(l); setOrigin(null); setSelected(null); }} band={band} origin={origin}
                  ranked={ranked} shortlist={SHORTLIST} selected={selected} rely={rely} check={check} capLoss={evFor?.cap_loss_fraction?.od ?? null}
                  onBand={(b) => { setBand(b); setSelected(null); }} onOrigin={(a) => { setOrigin(a); setSelected(null); }} onSelect={setSelected} />
                <AssistantPanel rel={rel} onEvidence={selectCorridor} onApply={(b, o) => { setBand(b); setOrigin(o); setSelected(null); }}
                  onIntent={(b, o, id) => { setLevel("area"); setBand(b); setOrigin(o); setSelected(id); }} />
              </aside>
            </div>
          </>
        )}
        {rel && !error && view === "when" && <WhenView rel={rel} />}
        {rel && !error && view === "safe" && <EvidenceView rel={rel} ev={ev} />}
        {rel && !error && view === "shared" && <SharedPanel rel={rel} />}
      </main>

      <footer className="foot">
        Synthetic data: TrustED PETs Proving Ground 2026 by Since AI ry (CC BY 4.0); area points derive from GeoNames postcode centroids (CC BY 4.0). Not real Turku travel. This page can only show, sort and add up the published numbers; it has no access to the bus company's records.
      </footer>
    </div>
  );
}
