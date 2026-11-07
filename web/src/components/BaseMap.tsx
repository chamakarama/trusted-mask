import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { fmt, type Corridor, type Point } from "../data/derive";
import { areaLabel } from "../data/release";

// Real basemap (OpenStreetMap data via OpenFreeMap, no key) with RELEASED values only: a demand heat layer from
// released journeys per area, curved route arcs (not road paths) and public area points. Tiles never see release data.
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const OURS = new Set(["heat", "arcs-casing", "arcs-muted", "arcs", "pts", "pt-labels", "rank-dots", "rank-text"]);
const BLUE = { 100: "#cde2fb", 200: "#9ec5f4", 250: "#86b6ef", 300: "#6da7ec", 450: "#2a78d6", 550: "#1c5cab", 650: "#104281", 700: "#0d366b" };

interface Props {
  pts: Point[];
  outgoing: Map<string, number>;
  corridors: Corridor[];
  highlight: number;
  selected: string | null;
  origin: string | null;
  onSelect: (id: string) => void;
  onOrigin: (area: string | null) => void;
  onFail: () => void;
  floor?: number | null; // routes at or below this noise floor are drawn grey and dashed, without a rank badge
  tripsMax?: number; // release-wide maxima keep widths and glow comparable across time bands
  outMax?: number;
}

function curve(a: [number, number], b: [number, number], n = 40): [number, number][] {
  // quadratic Bezier bending left of the travel direction (A->B and B->A stay apart); lon scaled for latitude
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dx = (b[0] - a[0]) * k, dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1e-9;
  const bend = Math.max(0.22 * len, 0.004);
  const cx = (a[0] + b[0]) / 2 + (-dy / len) * bend / k, cy = (a[1] + b[1]) / 2 + (dx / len) * bend;
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return out;
}

export function BaseMap({ pts, outgoing, corridors, highlight, selected, origin, onSelect, onOrigin, onFail, floor = null, tripsMax, outMax }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef({ onSelect, onOrigin });
  const framed = useRef("");
  cb.current = { onSelect, onOrigin };

  useEffect(() => {
    if (!box.current) return;
    let failed = false;
    const fail = () => { if (!failed) { failed = true; onFail(); } };
    let m: MLMap;
    try {
      m = new maplibregl.Map({ container: box.current, style: STYLE, center: [22.27, 60.45], zoom: 10.3, attributionControl: { compact: true }, cooperativeGestures: false });
    } catch { fail(); return; }
    map.current = m;
    // Slow tiles are not a failure (a hidden tab may not render for a while): fall back only when the style itself
    // cannot load, e.g. offline or blocked. Tile errors after load just leave the released layers on a blank base.
    let loaded = false;
    const timer = 0;
    m.on("error", (e) => { if (!loaded && /style|fetch|network|Failed/i.test(String(e?.error?.message ?? ""))) fail(); });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      loaded = true;
      const empty = { type: "FeatureCollection" as const, features: [] };
      m.addSource("heat", { type: "geojson", data: empty });
      m.addSource("arcs", { type: "geojson", data: empty });
      m.addSource("pts", { type: "geojson", data: empty });
      m.addSource("ranks", { type: "geojson", data: empty });
      // one ring per drawn area, ring area ~ released journeys starting there (rings never merge into a blob, unlike a heatmap)
      m.addLayer({ id: "heat", type: "circle", source: "heat", paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["+", 3, ["*", 20, ["sqrt", ["get", "w"]]]], 13, ["+", 8, ["*", 52, ["sqrt", ["get", "w"]]]]],
        "circle-color": BLUE[450],
        "circle-opacity": ["case", ["get", "involved"], 0.12, 0],
        "circle-stroke-width": 1, "circle-stroke-color": BLUE[450],
        "circle-stroke-opacity": ["case", ["get", "involved"], 0.45, 0],
      } });
      m.addLayer({ id: "arcs-casing", type: "line", source: "arcs", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#fcfcfb", "line-width": ["+", ["get", "w"], 3], "line-opacity": ["case", ["get", "sel"], 0.9, ["get", "strong"], 0.9, 0] } });
      m.addLayer({ id: "arcs-muted", type: "line", source: "arcs", filter: ["==", ["get", "muted"], true], layout: { "line-cap": "butt", "line-join": "round" },
        paint: { "line-color": ["case", ["get", "sel"], "#12171f", "#8d8981"], "line-width": ["max", ["get", "w"], 3], "line-dasharray": [2, 1.6],
          "line-opacity": ["case", ["get", "sel"], 1, ["get", "dim"], 0.15, 0.9] } });
      m.addLayer({ id: "arcs", type: "line", source: "arcs", filter: ["!=", ["get", "muted"], true], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["case", ["get", "sel"], "#12171f", ["get", "strong"], BLUE[650], BLUE[300]], "line-width": ["get", "w"],
          "line-opacity": ["case", ["get", "sel"], 1, ["get", "dim"], 0.15, ["get", "strong"], 0.95, 0.5] } });
      m.addLayer({ id: "pts", type: "circle", source: "pts", paint: {
        "circle-radius": ["case", ["any", ["get", "involved"], ["get", "origin"]], ["get", "r"], 2.5], "circle-color": ["case", ["get", "origin"], BLUE[650], ["get", "involved"], "#3b4250", "#8f8c84"],
        "circle-opacity": ["case", ["any", ["get", "involved"], ["get", "origin"]], 1, 0.45], "circle-stroke-color": "#fcfcfb", "circle-stroke-width": ["case", ["any", ["get", "involved"], ["get", "origin"]], 2, 0] } });
      m.addLayer({ id: "pt-labels", type: "symbol", source: "pts", layout: {
        "text-field": ["case", ["any", ["get", "involved"], ["get", "origin"]], ["get", "label"], ""], "text-font": ["Noto Sans Bold"], "text-size": 12.5, "text-offset": [0, 1.05], "text-anchor": "top", "text-optional": true },
        paint: { "text-color": "#12171f", "text-halo-color": "#ffffff", "text-halo-width": 3, "text-halo-blur": 0 } });
      m.addLayer({ id: "rank-dots", type: "circle", source: "ranks", paint: { "circle-radius": 10, "circle-color": BLUE[700], "circle-stroke-color": "#fcfcfb", "circle-stroke-width": 2,
        "circle-opacity": ["case", ["get", "dim"], 0, 1], "circle-stroke-opacity": ["case", ["get", "dim"], 0, 1] } });
      m.addLayer({ id: "rank-text", type: "symbol", source: "ranks", layout: { "text-field": ["get", "rank"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": "#ffffff", "text-opacity": ["case", ["get", "dim"], 0, 1] } });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
      m.on("mousemove", "arcs", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const p = e.features?.[0]?.properties as any;
        if (p) {
          // text nodes only: public labels come from a bundle and must never be parsed as HTML
          const box = document.createElement("div");
          const head = document.createElement("b");
          head.textContent = `#${p.rank} ${p.from} → ${p.to}`;
          const line = document.createElement("div");
          line.textContent = `${p.trips} trips · protected estimate`;
          box.append(head, line);
          popup.setLngLat(e.lngLat).setDOMContent(box).addTo(m);
        }
      });
      m.on("mouseleave", "arcs", () => { m.getCanvas().style.cursor = ""; popup.remove(); });
      m.on("click", "arcs", (e) => { const id = e.features?.[0]?.properties?.id; if (id) cb.current.onSelect(String(id)); });
      m.on("mouseenter", "arcs-muted", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "arcs-muted", () => (m.getCanvas().style.cursor = ""));
      m.on("click", "arcs-muted", (e) => { const id = e.features?.[0]?.properties?.id; if (id) cb.current.onSelect(String(id)); });
      m.on("mouseenter", "pts", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pts", () => (m.getCanvas().style.cursor = ""));
      m.on("click", "pts", (e) => { const id = e.features?.[0]?.properties?.id; if (id) cb.current.onOrigin(String(id)); });
      // basemap place/road names compete with the data labels, and dashed rail lines look like the grey "could be noise"
      // routes: hide both (our own layers stay)
      for (const l of m.getStyle().layers ?? []) if (!OURS.has(l.id) && (l.type === "symbol" || /rail/i.test(l.id))) m.setLayoutProperty(l.id, "visibility", "none");
      setReady(true);
    });
    void timer;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const byId = new Map(pts.map((p) => [p.id, p]));
    // frame the places the top routes connect (the busy part), not every outlying area; refit only when they change
    const keep = [...new Set(corridors.filter((c) => c.rank <= highlight).flatMap((c) => [c.origin_area, c.destination_area]))].sort();
    if (keep.join("|") !== framed.current) {
      const first = framed.current === "";
      framed.current = keep.join("|");
      const b = new maplibregl.LngLatBounds();
      for (const p of pts) if (!keep.length || keep.includes(p.id)) b.extend([p.lon, p.lat]);
      if (!b.isEmpty()) m.fitBounds(b, { padding: { top: 110, bottom: 70, left: 90, right: 90 }, duration: first ? 0 : 600, maxZoom: 12.6 });
    }
    const maxOut = outMax ?? Math.max(1, ...outgoing.values());
    const maxTrips = tripsMax ?? Math.max(1, ...corridors.map((c) => c.trips));
    const involved = new Set(corridors.flatMap((c) => [c.origin_area, c.destination_area]));
    (m.getSource("heat") as GeoJSONSource).setData({ type: "FeatureCollection", features: pts.map((p) => ({
      type: "Feature", properties: { w: (outgoing.get(p.id) ?? 0) / maxOut, involved: involved.has(p.id) || origin === p.id }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
    const ordered = [...corridors].sort((a, b) => b.rank - a.rank);
    (m.getSource("arcs") as GeoJSONSource).setData({ type: "FeatureCollection", features: ordered.flatMap((c) => {
      const a = byId.get(c.origin_area), d = byId.get(c.destination_area);
      if (!a || !d) return [];
      return [{ type: "Feature" as const, properties: { id: c.id, rank: c.rank, trips: fmt(c.trips), from: areaLabel(c.origin_area), to: areaLabel(c.destination_area),
        strong: c.rank <= highlight, sel: selected === c.id, dim: !!selected && selected !== c.id, muted: floor !== null && c.noisy_value <= floor,
        w: (c.rank <= highlight ? 4 + 4 * (c.trips / maxTrips) : 1.5 + 1.5 * (c.trips / maxTrips)) + (selected === c.id ? 3 : 0) },
        geometry: { type: "LineString" as const, coordinates: curve([a.lon, a.lat], [d.lon, d.lat]) } }];
    }) });
    (m.getSource("ranks") as GeoJSONSource).setData({ type: "FeatureCollection", features: corridors.filter((c) => c.rank <= highlight && !(floor !== null && c.noisy_value <= floor)).flatMap((c) => {
      const a = byId.get(c.origin_area), d = byId.get(c.destination_area);
      if (!a || !d) return [];
      const line = curve([a.lon, a.lat], [d.lon, d.lat]);
      return [{ type: "Feature" as const, properties: { rank: String(c.rank), dim: !!selected && selected !== c.id }, geometry: { type: "Point" as const, coordinates: line[Math.floor(line.length * 0.3)] } }];
    }) });
    (m.getSource("pts") as GeoJSONSource).setData({ type: "FeatureCollection", features: pts.map((p) => ({
      type: "Feature", properties: { id: p.id, label: areaLabel(p.label), r: 3.5 + 6 * Math.sqrt((outgoing.get(p.id) ?? 0) / maxOut), involved: involved.has(p.id), origin: origin === p.id },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) });
  }, [ready, pts, outgoing, corridors, highlight, selected, origin, floor, tripsMax, outMax]);

  return <div ref={box} className="maplibre" role="img" aria-label="Map of the strongest released bus routes for the selected time band. The same routes are listed next to the map." />;
}
