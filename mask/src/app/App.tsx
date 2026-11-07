import { useEffect, useMemo, useRef, useState } from "react";
import { ControllerContext, useAppState, useController } from "./store/store";
import type { Controller } from "./controller";
import { PurposePane } from "./components/PurposePane";
import { DataPane } from "./components/DataPane";
import { Splitter } from "./components/Splitter";
import { TopBar } from "./components/TopBar";

export function App({ controller }: { controller: Controller }) {
  return (
    <ControllerContext.Provider value={controller}>
      <Shell />
    </ControllerContext.Provider>
  );
}

const LEFT_DEFAULT = 384;
const LEFT_MIN = 300;
const LEFT_MAX = 600;

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function Shell() {
  const s = useAppState();
  const c = useController();
  const [left, setLeft] = useState(() => {
    try { const v = Number(localStorage.getItem("mask.leftWidth")); return v >= LEFT_MIN && v <= LEFT_MAX ? v : LEFT_DEFAULT; } catch { return LEFT_DEFAULT; }
  });
  useEffect(() => { try { localStorage.setItem("mask.leftWidth", String(left)); } catch { /* storage unavailable */ } }, [left]);

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

  const style = useMemo(() => ({ "--left": `${left}px` }) as React.CSSProperties, [left]);

  return (
    <div className="app">
      <a className="skip-link" href="#data-pane">Skip to data</a>
      {s.source === "fixture" && (
        <div className="fixture-banner" role="note">
          <strong>Development fixture: nothing here is measured.</strong>
          <span> Hand-written data and placeholder numbers for building the interface. </span>
          <a href="./">Leave fixture</a>
        </div>
      )}
      <TopBar />
      <main className="workspace" style={style}>
        <section className="pane pane-purpose" aria-labelledby="purpose-title">
          <PurposePane />
        </section>
        <Splitter value={left} min={LEFT_MIN} max={LEFT_MAX} onChange={setLeft} />
        <section className="pane pane-data" id="data-pane" aria-labelledby="data-title" tabIndex={-1}>
          <DataPane />
        </section>
      </main>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{s.announce}</div>
    </div>
  );
}
