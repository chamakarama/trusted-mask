import { useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { BaseMap } from "./components/BaseMap";
import { BAND_SHORT, CorridorPanel } from "./components/CorridorPanel";
import { WhenView } from "./components/DemandViews";
import { EvidenceView } from "./components/EvidenceView";
import { IconCheck, IconLock, IconShield, IconWarn, Logo } from "./components/Icons";
import { MapView } from "./components/MapView";
import { SharedPanel } from "./components/SharedPanel";
import { BANDS, fmt, outgoingAt, points, rankAt, type Level } from "./data/derive";
import { areaLabel, loadIndex, loadRelease, ReleaseRefused, type Release, type ReleaseIndexEntry } from "./data/release";

type View = "routes" | "when" | "safe" | "shared";
const VIEWS: { id: View; label: string }[] = [
  { id: "routes", label: "Routes" }, { id: "when", label: "When people travel" }, { id: "safe", label: "Is it safe?" }, { id: "shared", label: "What's shared" },
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
    setRel(null); setError(null);
    loadRelease(releaseId).then((r) => {
      if (origin && !r.areas.some((a) => a.id === origin || a.municipality === origin)) setOrigin(null);
      setRel(r);
    }).catch((e) => setError(e instanceof ReleaseRefused
      ? { title: "This release was refused", lines: e.validation.errors }
      : { title: "The release could not be loaded", lines: [String(e.message ?? e)] }));
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
  const selectCorridor = (id: string) => {
    const m = /^odm?:(.+)>(.+)@(.+)$/.exec(id);
    if (m && m[3] !== band) setBand(m[3]);
    if (id.startsWith("od:") && level !== "area") { setLevel("area"); setOrigin(null); }
    setView("routes");
    setSelected(id);
  };
  const cells = rel ? rel.od.length + rel.lineHour.length + rel.daily.length : 0;
  const best = ranked[0];

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
            <label>
              <span className="sr-only">Release</span>
              <select value={releaseId ?? ""} onChange={(e) => { setReleaseId(e.target.value); setSelected(null); }}>
                {index?.map((r) => <option key={r.release_id} value={r.release_id}>{r.fixture ? `${r.release_id} (test data)` : `Release ${r.release_id}`}</option>)}
              </select>
            </label>
            {entry && (
              <div className="chips" role="status">
                <span className="chip-dark"><span className="dot dot-info" />{entry.fixture ? "test fixture" : "synthetic data"}</span>
                <span className="chip-dark"><span className="dot dot-warn" />privacy check pending review</span>
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
                <h1>Where do people travel in the {BAND_SHORT[band][0].toLowerCase()}?</h1>
                <p>Weekday bus trips between areas, 6 Oct – 2 Nov 2025. Only protected counts were shared, never anyone's journeys.</p>
              </div>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="kpi-label">Busiest route ({BAND_SHORT[band][1]})</div>
                <div className="kpi-value">{best ? `${areaLabel(best.origin_area)} → ${areaLabel(best.destination_area)}` : "–"}</div>
                <div className="kpi-sub">{best ? `${fmt(best.trips)} trips over 4 weeks` : ""}</div></div>
              <div className="kpi"><div className="kpi-label"><IconLock /> Passenger records shared</div><div className="kpi-value">0</div><div className="kpi-sub">no card numbers, no exact times</div></div>
              <div className="kpi"><div className="kpi-label"><IconShield /> Privacy budget</div><div className="kpi-value">ε = {rel.manifest.privacy.epsilon_release}</div><div className="kpi-sub">per travel card, whole period</div></div>
              <div className="kpi"><div className="kpi-label">Protected numbers</div><div className="kpi-value">{fmt(cells)}</div><div className="kpi-sub">routes, lines per hour, days</div></div>
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
                      <strong>{BAND_SHORT[band][0]} trips {BAND_SHORT[band][1]}</strong>
                      <div className="legend-row"><span className="legend-arc" /> top {SHORTLIST} routes</div>
                      <div className="legend-row"><span className="legend-arc thin" /> next {ON_MAP - SHORTLIST}</div>
                      <div className="legend-row"><span className="legend-dot" /> {schematic ? "trips starting here" : "glow = trips starting here"}</div>
                    </div>
                  </div>
                  <div className="map-toggle"><button onClick={() => setSchematic(!schematic)}>{schematic ? "Show street map" : "Offline view"}</button></div>
                </div>
                <div className="mapcap">
                  Lines show where trips go, not the roads taken. Dots are area centres from the public stop list.{" "}
                  {schematic ? "Offline view: distances are not to scale." : "Street map © OpenStreetMap contributors via OpenFreeMap; it never receives any data from this release."}
                </div>
              </section>
              <aside className="side">
                <CorridorPanel rel={rel} level={level} originOptions={pts} onLevel={(l) => { setLevel(l); setOrigin(null); setSelected(null); }} band={band} origin={origin}
                  ranked={ranked} shortlist={SHORTLIST} selected={selected}
                  onBand={(b) => { setBand(b); setSelected(null); }} onOrigin={(a) => { setOrigin(a); setSelected(null); }} onSelect={setSelected} />
                <AssistantPanel rel={rel} onEvidence={selectCorridor} onApply={(b, o) => { setBand(b); setOrigin(o); setSelected(null); }} />
              </aside>
            </div>
          </>
        )}
        {rel && !error && view === "when" && <WhenView rel={rel} />}
        {rel && !error && view === "safe" && <EvidenceView releaseId={rel.id} />}
        {rel && !error && view === "shared" && <SharedPanel rel={rel} />}
      </main>

      <footer className="foot">
        Synthetic data: TrustED PETs Proving Ground 2026 by Since AI ry (CC BY 4.0). Not real Turku travel. This page can only show, sort and add up the published numbers; it has no access to the bus company's records.
      </footer>
    </div>
  );
}
