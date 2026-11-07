import { useEffect, useRef, useState } from "react";
import { ControllerContext, useAppState, useController } from "./store/store";
import type { Controller } from "./controller";
import { PurposePane } from "./components/PurposePane";
import { DataPane } from "./components/DataPane";
import { DevPanel } from "./components/DevPanel";

export function App({ controller }: { controller: Controller }) {
  return (
    <ControllerContext.Provider value={controller}>
      <Shell />
    </ControllerContext.Provider>
  );
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function Shell() {
  const s = useAppState();
  const c = useController();
  // global shortcuts: o / p switch view, d toggles developer panel, / focuses search, Escape closes the drawer
  const stateRef = useRef(s);
  stateRef.current = s;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !isTyping(e.target) && stateRef.current.history.length) {
          e.preventDefault(); void c.undo();
        }
        return;
      }
      if (e.key === "Escape") {
        if (stateRef.current.selection) { c.store.dispatch({ type: "select", selection: null }); e.preventDefault(); }
        return;
      }
      if (isTyping(e.target)) return;
      const st = stateRef.current;
      if (e.key === "o" && st.executed) c.store.dispatch({ type: "setView", view: "original" });
      else if (e.key === "p" && st.executed) c.store.dispatch({ type: "setView", view: "protected" });
      else if (e.key === "d") c.store.dispatch({ type: "toggleDev" });
      else if (e.key === "/") {
        const el = document.getElementById("grid-search");
        if (el) { e.preventDefault(); el.focus(); }
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c]);

  const [purposeW, setPurposeW] = useState(readPurposeWidth);
  useEffect(() => { try { localStorage.setItem(WIDTH_KEY, String(purposeW)); } catch { /* storage unavailable */ } }, [purposeW]);

  return (
    <div className="app">
      <a className="skip-link" href="#data-pane">Skip to data</a>
      {s.source === "fixture" && (
        <div className="fixture-banner" role="note">
          <strong>Development fixture: nothing here is measured.</strong>
          <span> Hand-written data and placeholder numbers. </span>
          <a href="./">Leave fixture</a>
        </div>
      )}
      <h1 className="wordmark"><span className="wordmark-mark" aria-hidden="true" />mask</h1>
      <main className="canvas" style={{ "--purpose-w": `${purposeW}px` } as React.CSSProperties}>
        <section className="left-float" aria-labelledby="purpose-title">
          <PurposePane />
        </section>
        <Divider width={purposeW} onChange={setPurposeW} />
        <section className="right-float" id="data-pane" aria-labelledby="data-title" tabIndex={-1}>
          <DataPane />
        </section>
      </main>
      <CornerLinks />
      {s.devOpen && <DevPanel />}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{s.announce}</div>
    </div>
  );
}

const WIDTH_KEY = "mask.purposeWidth";
const MIN_W = 240;
const MAX_W = 560;
const DEFAULT_W = 300;
const clampW = (w: number) => Math.round(Math.max(MIN_W, Math.min(MAX_W, w)));
function readPurposeWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? clampW(v) : DEFAULT_W;
  } catch { return DEFAULT_W; }
}

/** The divider between the purpose column and the data panel: drag or arrow keys resize the purpose column. */
function Divider({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; w: number } | null>(null);
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add("is-resizing");
    const move = (e: PointerEvent) => { if (start.current) onChange(clampW(start.current.w + e.clientX - start.current.x)); };
    const up = () => { start.current = null; setDragging(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, onChange]);
  return (
    <div
      className={`divider ${dragging ? "is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the purpose column"
      aria-valuemin={MIN_W}
      aria-valuemax={MAX_W}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); start.current = { x: e.clientX, w: width }; setDragging(true); }}
      onDoubleClick={() => onChange(DEFAULT_W)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowLeft") onChange(clampW(width - step));
        else if (e.key === "ArrowRight") onChange(clampW(width + step));
        else if (e.key === "Home") onChange(MIN_W);
        else if (e.key === "End") onChange(MAX_W);
        else return;
        e.preventDefault();
      }}
    />
  );
}

/** Tiny text links bottom-left: the only chrome. */
function CornerLinks() {
  const s = useAppState();
  const c = useController();
  return (
    <nav className="corner-links xsmall" aria-label="Session">
      {s.manifest && (
        <button className="btn-link quiet" onClick={() => { if (confirm("Start over? The imported data and your edits are cleared from this tab.")) c.startOver(); }}>
          Start over
        </button>
      )}
      <button className="btn-link quiet" aria-pressed={s.devOpen} aria-controls="dev-panel" onClick={() => c.store.dispatch({ type: "toggleDev" })} title="Developer panel (d)">
        Developer
      </button>
    </nav>
  );
}
