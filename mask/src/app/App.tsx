import { useEffect, useRef } from "react";
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
      <h1 className="wordmark">mask</h1>
      <main className="canvas">
        <section className="left-float" aria-labelledby="purpose-title">
          <PurposePane />
        </section>
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
