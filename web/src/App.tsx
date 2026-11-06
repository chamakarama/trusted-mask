import { useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "./components/AssistantPanel";
import { CorridorPanel } from "./components/CorridorPanel";
import { DailyView, LineHourView } from "./components/DemandViews";
import { EvidenceView } from "./components/EvidenceView";
import { MapView } from "./components/MapView";
import { SharedPanel } from "./components/SharedPanel";
import { BANDS, outgoingAt, points, rankAt, type Level } from "./data/derive";
import { loadIndex, loadRelease, ReleaseRefused, type Release, type ReleaseIndexEntry } from "./data/release";

type View = "corridors" | "lines" | "daily" | "shared" | "evidence";
const VIEWS: { id: View; label: string }[] = [
  { id: "corridors", label: "Corridors" }, { id: "lines", label: "Lines by hour" }, { id: "daily", label: "Daily taps" }, { id: "shared", label: "What was shared?" }, { id: "evidence", label: "Evidence" },
];
const SHORTLIST = 3, ON_MAP = 10;

function readUrl() {
  const u = new URLSearchParams(location.search);
  const view = (VIEWS.some((v) => v.id === u.get("view")) ? u.get("view") : "corridors") as View;
  const band = BANDS.includes(u.get("band") as any) ? (u.get("band") as string) : "06-09";
  const level = (u.get("geo") === "municipality" ? "municipality" : "area") as Level;
  return { release: u.get("release"), view, band, level, origin: u.get("origin"), corridor: u.get("corridor") };
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

  useEffect(() => {
    loadIndex().then((ix) => {
      setIndex(ix);
      if (!releaseId || !ix.some((r) => r.release_id === releaseId)) setReleaseId(ix[0]?.release_id ?? null);
    }).catch(() => setError({ title: "No release is available", lines: ["The release index could not be loaded. Run `npm run sync` to copy a reviewed release into web/public."] }));
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
    history.replaceState(null, "", `?${u}`);
  }, [releaseId, view, band, level, origin, selected]);

  const ranked = useMemo(() => (rel ? rankAt(rel, level, band, origin) : []), [rel, level, band, origin]);
  const pts = useMemo(() => (rel ? points(rel, level) : []), [rel, level]);
  const outgoing = useMemo(() => (rel ? outgoingAt(rel, level, band) : new Map<string, number>()), [rel, level, band]);
  useEffect(() => {
    if (rel && selected && !ranked.some((c) => c.id === selected)) setSelected(null);
  }, [ranked]);

  const entry = index?.find((r) => r.release_id === releaseId);
  const selectCorridor = (id: string) => {
    if (!rel) return;
    const m = /^odm?:(.+)>(.+)@(.+)$/.exec(id);
    if (m && m[3] !== band) setBand(m[3]);
    if (id.startsWith("od:") && level !== "area") { setLevel("area"); setOrigin(null); }
    setView("corridors");
    setSelected(id);
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">RS</span>
          <div>
            <h1>Share demand. Keep journeys private.</h1>
            <p className="tagline">RouteSafe planner view · fictional Aura Transit · synthetic travel-card data, 6 Oct – 2 Nov 2025</p>
          </div>
        </div>
        <div className="release">
          <label>
            <span className="sr-only">Release</span>
            <select value={releaseId ?? ""} onChange={(e) => { setReleaseId(e.target.value); setSelected(null); }}>
              {index?.map((r) => <option key={r.release_id} value={r.release_id}>{r.release_id}{r.fixture ? " (fixture)" : ""}</option>)}
            </select>
          </label>
          {entry && (
            <div className="strip" role="status">
              {entry.fixture ? <span className="badge badge-warn">fixture · illustrative values</span> : <span className="badge">{entry.data_class.replace("_", " ")}</span>}
              <span className="badge badge-warn">privacy claim: {entry.guarantee_status.replaceAll("_", " ")}</span>
              {rel && <span className="badge badge-ok" title={rel.validation.warnings.join(" ")}>integrity verified</span>}
            </div>
          )}
        </div>
      </header>

      <nav className="tabs" aria-label="Views">
        {VIEWS.map((v) => (
          <button key={v.id} className={`tab ${view === v.id ? "tab-on" : ""}`} aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </nav>

      {error && (
        <main className="state state-error" role="alert">
          <h2>{error.title}</h2>
          <ul>{error.lines.slice(0, 8).map((l) => <li key={l}><code>{l}</code></li>)}</ul>
          <p>Nothing from this release is shown. Choose another release above.</p>
        </main>
      )}
      {!error && !rel && <main className="state" aria-busy="true"><div className="skeleton" /><p className="muted">Loading and verifying {releaseId ?? "release"}…</p></main>}

      {rel && !error && (
        <main className={`layout layout-${view}`}>
          {view === "corridors" && (
            <>
              <section className="mapcol" aria-label="Corridor map">
                <MapView pts={pts} outgoing={outgoing} derived={level === "municipality"} corridors={ranked.slice(0, ON_MAP)} highlight={SHORTLIST} selected={selected} origin={origin}
                  onSelect={setSelected} onOrigin={(a) => { setOrigin(a); setSelected(null); }} />
              </section>
              <aside className="side">
                <CorridorPanel rel={rel} level={level} originOptions={pts} onLevel={(l) => { setLevel(l); setOrigin(null); setSelected(null); }} band={band} origin={origin} ranked={ranked} shortlist={SHORTLIST} selected={selected}
                  onBand={(b) => { setBand(b); setSelected(null); }} onOrigin={(a) => { setOrigin(a); setSelected(null); }} onSelect={setSelected} />
                <AssistantPanel rel={rel} onEvidence={selectCorridor} onApply={(b, o) => { setBand(b); setOrigin(o); setSelected(null); }} />
              </aside>
            </>
          )}
          {view === "lines" && <LineHourView rel={rel} />}
          {view === "daily" && <DailyView rel={rel} />}
          {view === "shared" && <SharedPanel rel={rel} />}
          {view === "evidence" && <EvidenceView releaseId={rel.id} />}
        </main>
      )}

      <footer className="foot muted small">
        TrustED PETs Proving Ground 2026, synthetic data by Since AI ry (CC BY 4.0). Synthetic benchmark: not findings about real transport.
        The planner can only filter, sort and sum the published tables; it has no access to the operator's records.
      </footer>
    </div>
  );
}
