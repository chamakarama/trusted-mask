import { useEffect, useState } from "react";
import { CONTRACTS_VERSION, MASK_VERSION } from "@/contracts";
import { REGISTRY_VERSION } from "@/core/registry";
import { useAppState, useController } from "../store/store";
import type { DevTab } from "../store/state";
import { TEST_STATUS_LABEL, fmtMs, fmtPct, shortHash, unitTitle } from "../lib/labels";
import { decisionFor, fieldUnitFor } from "../lib/model";
import { isSuperseded, type CellResult } from "../backend/types";
import { IconLock } from "../lib/icons";
import { StatusIcon } from "./EvaluationBar";

const TABS: { id: DevTab; label: string }[] = [
  { id: "decisions", label: "Decisions" }, { id: "coverage", label: "Coverage" }, { id: "benchmark", label: "Benchmark" },
  { id: "evaluation", label: "Evaluation JSON" }, { id: "originals", label: "Originals" }, { id: "versions", label: "Versions" }, { id: "timing", label: "Timing" },
];

function Decisions() {
  const s = useAppState();
  const p = s.proposal;
  if (!p) return <p className="muted">No proposal yet.</p>;
  return (
    <div className="dev-decisions">
      {p.warnings.length > 0 && <ul className="dev-warn">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <table className="dev-table">
        <thead><tr><th>Unit</th><th>Selected</th><th>Candidates (logit · preference · policy rank)</th><th>Review</th></tr></thead>
        <tbody>
          {p.decisions.map((d) => {
            const u = p.units.find((x) => x.id === d.unitId);
            return (
              <tr key={d.unitId}>
                <td><span className="mono">{d.unitId}</span><br /><span className="muted">{unitTitle(u)} · {u?.kind}</span></td>
                <td className="mono">{d.selected ? `${d.selected.recipeId} ${JSON.stringify(d.selected.params)}` : "—"}{d.source === "user" ? " (user)" : ""}</td>
                <td>
                  <ul>
                    {d.candidates.map((c, i) => (
                      <li key={i} className={c.valid ? "" : "muted"}>
                        <span className="mono">{c.recipeId}</span> {c.label}
                        <span className="num"> · {c.logit?.toFixed(2) ?? "–"} · {c.preference !== undefined ? fmtPct(c.preference) : "–"} · {c.policyRank ?? "–"}</span>
                        {!c.valid && <span> · invalid: {c.invalidReasons.join("; ")}</span>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>{d.needsReview ? d.reviewReasons.join("; ") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h4>Token scopes</h4>
      <ul className="mono">{p.tokenScopes.map((t) => <li key={t.id}>{t.id} · key {t.keyId} · {t.columns.map((c) => `${c.table}.${c.column}`).join(", ")}</li>)}</ul>
    </div>
  );
}

function Coverage() {
  const e = useAppState().evaluation;
  if (!e) return <p className="muted">No evaluation yet.</p>;
  return (
    <table className="dev-table">
      <thead><tr><th>Threat</th><th>Status</th><th>Attacker knowledge</th><th>Evaluated by</th><th>Reason</th></tr></thead>
      <tbody>
        {e.coverage.map((c) => (
          <tr key={c.threatId}>
            <td>{c.description}<br /><span className="mono muted">{c.threatId}</span></td>
            <td className="nowrap"><StatusIcon status={c.status} /> {TEST_STATUS_LABEL[c.status]}</td>
            <td>{c.attackerKnowledge}</td>
            <td className="mono">{c.evaluatedBy.join(", ") || "—"}</td>
            <td>{c.statusReason ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Benchmark() {
  const b = useAppState().evaluation?.benchmark;
  if (!b) return <p className="muted">Benchmark not available for this upload: no ground truth or attacker data.</p>;
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(3));
  return (
    <div>
      <p className="mono">{b.toolkit.name} {b.toolkit.version} · adapter {b.adapterVersion} · {b.dataset} / {b.scenarioId} / {b.split} · plan {shortHash(b.planHash)} · {fmtMs(b.durationMs)}</p>
      <h4>Representation</h4>
      <ul>{Object.entries(b.representation).map(([t, r]) => <li key={t}><span className="mono">{t}</span>: {r.replace("_", " ")}</li>)}</ul>
      <h4>Tests</h4>
      <table className="dev-table">
        <thead><tr><th>Test</th><th>Status</th><th>Metrics: original → protected</th><th>Denominators</th><th>Sampling and assumptions</th></tr></thead>
        <tbody>
          {b.tests.map((t) => (
            <tr key={t.id}>
              <td>{t.name}<br /><span className="muted">{t.kind} · {t.source} · {t.scope}</span></td>
              <td className="nowrap"><StatusIcon status={t.status} /> {TEST_STATUS_LABEL[t.status]}{t.statusReason ? <><br /><span className="muted">{t.statusReason}</span></> : null}</td>
              <td className="num">{Object.entries(t.metrics).map(([k, v]) => <div key={k}><span className="mono">{k}</span> {t.original ? `${fmt(t.original[k])} → ` : ""}{fmt(v)}</div>)}</td>
              <td className="num">{Object.entries(t.denominators).map(([k, v]) => <div key={k}><span className="mono">{k}</span> {v}</div>)}</td>
              <td>{t.sampling && <div>{t.sampling}</div>}{t.assumptions.map((a) => <div key={a} className="muted">{a}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {b.notes.length > 0 && <ul className="muted">{b.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}

function Originals() {
  const s = useAppState();
  const c = useController();
  const sel = s.selection;
  const [cell, setCell] = useState<CellResult | null>(null);
  const key = sel?.kind === "cell" ? `${sel.table}|${sel.row}|${sel.column}|${s.executed?.outputHash}` : "";
  useEffect(() => {
    setCell(null);
    if (sel?.kind !== "cell") return;
    let live = true;
    c.backend.cell(sel.table, sel.row, sel.column).then((r) => live && setCell(r)).catch((e) => { if (!isSuperseded(e)) console.warn(e); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (sel?.kind !== "cell") return <p className="muted">Select a cell in the grid to see its original content and every replaced span.</p>;
  if (!cell) return <p className="muted">Loading…</p>;
  const orig = cell.original ?? "";
  return (
    <div>
      <p className="mono muted">{sel.table}.{sel.column} · row {sel.row + 1}</p>
      <p className="dev-original">{orig || "—"}</p>
      {cell.change?.spans?.length ? (
        <table className="dev-table">
          <thead><tr><th>Label</th><th>Original</th><th>Replacement</th><th>Recipe</th><th>Unit</th></tr></thead>
          <tbody>
            {cell.change.spans.map((sp, i) => (
              <tr key={i}><td>{sp.label}</td><td className="mono">{orig.slice(sp.start, sp.end)}</td><td className="mono">{sp.replacement || "∅"}</td><td className="mono">{sp.recipeId}</td><td className="mono">{sp.unitId}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">Protected: <span className="mono">{cell.protected ?? "—"}</span></p>}
    </div>
  );
}

function Versions() {
  const s = useAppState();
  const c = useController();
  const [url, setUrl] = useState("/models/selector.json");
  const p = s.proposal;
  const col = s.selection && s.selection.kind !== "unit" ? fieldUnitFor(p, s.selection.table, s.selection.column) : undefined;
  void decisionFor;
  return (
    <div>
      <dl className="dev-kv">
        <dt>Mask</dt><dd className="mono">{MASK_VERSION}</dd>
        <dt>Contracts</dt><dd className="mono">{CONTRACTS_VERSION}</dd>
        <dt>Registry</dt><dd className="mono">{REGISTRY_VERSION}</dd>
        <dt>Backend</dt><dd className="mono">{c.backend.kind}</dd>
        <dt>Selector</dt><dd className="mono">{p ? `${p.selector.id} ${p.selector.version}${p.selector.modelArtifact ? ` · ${p.selector.modelArtifact}` : ""}` : "—"}</dd>
        <dt>Embedding</dt><dd className="mono">{p?.selector.embeddingModel ?? "none"}</dd>
        <dt>Goal interpreter</dt><dd className="mono">{s.goal ? `${s.goal.provenance.interpreter} ${s.goal.provenance.version}${s.goal.provenance.scenarioMatch ? ` · ${s.goal.provenance.scenarioMatch}` : ""}` : "—"}</dd>
        <dt>Hashes</dt><dd className="mono">input {shortHash(s.manifest?.inputHash)} · goal {shortHash(s.goal?.goalId)} · plan {shortHash(p?.planHash)} · output {shortHash(s.executed?.outputHash)}</dd>
        {col && <><dt>Selected unit</dt><dd className="mono">{col.id}</dd></>}
      </dl>
      <form className="dev-model" onSubmit={(e) => { e.preventDefault(); void c.loadModel(url); }}>
        <label htmlFor="model-url">Learned model artifact</label>
        <input id="model-url" className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn btn-small" disabled={s.pending.model !== undefined}>Load</button>
        {s.model && <span className="muted"> Loaded {s.model.modelId} (registry {s.model.registryVersion})</span>}
      </form>
    </div>
  );
}

const STEP_ORDER = ["import", "profile", "interpret", "propose", "execute", "evaluate", "export", "model"] as const;

function Timing() {
  const s = useAppState();
  const steps = STEP_ORDER.filter((k) => s.timings[k] !== undefined);
  const stages = Object.entries(s.stageTimings).sort((a, b) => STEP_ORDER.indexOf(a[1].step) - STEP_ORDER.indexOf(b[1].step));
  if (!steps.length) return <p className="muted">Nothing has run yet.</p>;
  return (
    <div>
      <h4>Per step (wall time in this tab, latest run)</h4>
      <table className="dev-table timing">
        <thead><tr><th>Step</th><th className="num">Time</th><th>Progress stages reported by the worker</th></tr></thead>
        <tbody>
          {steps.map((k) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="num">{fmtMs(s.timings[k] ?? 0)}</td>
              <td>
                {stages.filter(([, v]) => v.step === k).map(([name, v]) => (
                  <span key={name} className="stage"><span className="mono">{name}</span> <span className="num">{fmtMs(v.ms)}</span> <span className="muted num">({v.events} events)</span></span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted xsmall">Stage times run from a stage's first progress event to the next stage (or the end of the step). Steps without progress events show only the total.</p>
      {s.executed && <p className="num">Executor reported {fmtMs(s.executed.durationMs)}{s.evaluation ? ` · evaluator reported ${fmtMs(s.evaluation.durationMs)}` : ""}</p>}
    </div>
  );
}

/** Private developer panel: full traces, versions and original content. Never part of the export. */
export function DevPanel() {
  const s = useAppState();
  const c = useController();
  return (
    <section id="dev-panel" className="devpanel" aria-label="Developer panel">
      <header className="dev-head">
        <span className="dev-private"><IconLock size={12} /> Private developer view: shows original values; never exported</span>
        <div className="dev-tabs" role="tablist" aria-label="Developer sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={s.devTab === t.id} className={`dev-tab ${s.devTab === t.id ? "on" : ""}`} onClick={() => c.store.dispatch({ type: "toggleDev", open: true, tab: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => c.store.dispatch({ type: "toggleDev", open: false })} aria-label="Close developer panel">Close</button>
      </header>
      <div className="dev-body small" role="tabpanel">
        {s.devTab === "decisions" && <Decisions />}
        {s.devTab === "coverage" && <Coverage />}
        {s.devTab === "benchmark" && <Benchmark />}
        {s.devTab === "evaluation" && (s.evaluation ? <pre className="mono">{JSON.stringify(s.evaluation, null, 2)}</pre> : <p className="muted">No evaluation yet.</p>)}
        {s.devTab === "originals" && <Originals />}
        {s.devTab === "versions" && <Versions />}
        {s.devTab === "timing" && <Timing />}
      </div>
    </section>
  );
}
