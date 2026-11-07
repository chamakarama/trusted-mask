import { useEffect, useRef, useState } from "react";
import type { Candidate, Decision, DecisionUnit, GoalSpec, ParamDef, RecipeParams } from "@/contracts";
import { getRecipe } from "@/core/registry";
import { useAppState, useController } from "../store/store";
import type { AppState } from "../store/state";
import { decisionFor, detectionFor, fieldUnitFor, highlightOf, methodKind, metricsForUnit, spanUnitsFor, unitById } from "../lib/model";
import {
  BASIS_LABEL, CONFIDENCE_LABEL, HIGHLIGHT_LABEL, METRIC_STATUS_LABEL, ROLE_LABEL, fmtMetricValue, fmtPct, subtypeLabel, unitTitle, unitWhere,
} from "../lib/labels";
import { HighlightIcon, IconAlert, IconClose, IconUndo } from "../lib/icons";
import { isSuperseded, type CellResult } from "../backend/types";
import { SpanText } from "./SpanText";
import { StatusIcon } from "./EvaluationBar";

function goalRelevance(goal: GoalSpec | null, unit: DecisionUnit | undefined): string {
  if (!goal || !unit) return "";
  const cols = unit.refs.map((r) => r.column.toLowerCase());
  const keys = unit.refs.map((r) => `${r.table}.${r.column}`.toLowerCase());
  const hit = (list: string[]) => list.find((x) => { const v = x.toLowerCase(); return keys.includes(v) || cols.some((c) => v === c || v.includes(c) || c.includes(v.replace(/\s+/g, "_"))); });
  const req = hit(goal.requiredFields);
  if (req) return `The goal needs this field (“${req}”), so it is kept in a usable form.`;
  const grp = hit(goal.groupings);
  if (grp) return `The analysis groups by “${grp}”.`;
  const mea = hit(goal.measures);
  if (mea) return `Used for the measure “${mea}”.`;
  if (unit.kind === "field_group") return goal.linkage === "none" ? "The goal does not need to link records." : "The goal needs records to stay linkable.";
  if (unit.kind === "span_class") return goal.textNeed === "none" ? "The goal does not need the text." : `The goal needs text for: ${goal.textNeed.replace(/_/g, " ")}.`;
  return "Not named in the goal; kept only as far as needed.";
}

function ParamEditor({ def, value, onCommit, disabled }: { def: ParamDef; value: unknown; onCommit: (v: string | number | boolean) => void; disabled: boolean }) {
  const [draft, setDraft] = useState(String(value ?? def.default));
  useEffect(() => setDraft(String(value ?? def.default)), [value, def.default]);
  const id = `param-${def.key}`;
  const commit = () => {
    if (def.type === "number") {
      const n = Number(draft);
      if (!Number.isFinite(n) || (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) { setDraft(String(value)); return; }
      if (n !== value) onCommit(n);
    } else if (draft !== String(value)) onCommit(draft);
  };
  return (
    <div className="param">
      <label htmlFor={id}>{def.label}</label>
      {def.type === "enum" ? (
        <select id={id} className="select" value={String(value ?? def.default)} disabled={disabled} onChange={(e) => onCommit(e.target.value)}>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : def.type === "boolean" ? (
        <input id={id} type="checkbox" checked={!!value} disabled={disabled} onChange={(e) => onCommit(e.target.checked)} />
      ) : (
        <input
          id={id} className="input num" type={def.type === "number" ? "number" : "text"} min={def.min} max={def.max} value={draft} disabled={disabled}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
        />
      )}
      <p className="param-help muted xsmall">{def.description}</p>
    </div>
  );
}

function sameParams(a: RecipeParams, b: RecipeParams) {
  const k = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...k].every((x) => String(a[x]) === String(b[x]));
}

function Alternatives({ d, onPick, disabled }: { d: Decision; onPick: (c: Candidate) => void; disabled: boolean }) {
  const valid = d.candidates.filter((c) => c.valid);
  const invalid = d.candidates.filter((c) => !c.valid);
  const hasPref = valid.some((c) => c.preference !== undefined);
  return (
    <ul className="alts">
      {valid.map((c, i) => {
        const chosen = !!d.selected && d.selected.recipeId === c.recipeId && sameParams(d.selected.params, c.params);
        const def = getRecipe(c.recipeId);
        return (
          <li key={`${c.recipeId}-${i}`} className={`alt ${chosen ? "is-chosen" : ""}`}>
            <button className="alt-btn" disabled={chosen || disabled} onClick={() => onPick(c)} aria-label={chosen ? `${c.label}, current choice` : `Use ${c.label}`}>
              <span className={`hl-tag hl-${def.highlight}`}><HighlightIcon kind={def.highlight} size={12} /></span>
              <span className="alt-text">
                <span className="alt-label">{c.label}{chosen && <span className="muted"> · current</span>}</span>
                <span className="alt-sum muted xsmall">{def.summary}</span>
              </span>
              {hasPref && c.preference !== undefined && (
                <span className="pref" title="Model preference among valid options. Not a safety score.">
                  <span className="pref-bar"><span style={{ width: `${Math.round(c.preference * 100)}%` }} /></span>
                  <span className="num xsmall">{fmtPct(c.preference)}</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
      {invalid.map((c, i) => (
        <li key={`inv-${c.recipeId}-${i}`} className="alt is-invalid" aria-disabled="true">
          <span className="alt-text">
            <span className="alt-label">{c.label} <span className="muted">· not allowed</span></span>
            <span className="alt-sum xsmall">{c.invalidReasons.join("; ")}</span>
          </span>
        </li>
      ))}
      {hasPref && <li className="muted xsmall pref-note">Bars show the learned model’s preference among allowed options. They are not a measure of risk.</li>}
    </ul>
  );
}

function resolveUnit(s: AppState): DecisionUnit | undefined {
  const sel = s.selection;
  if (!sel) return undefined;
  if (sel.kind === "unit") return unitById(s.proposal, sel.unitId);
  return unitById(s.proposal, sel.unitId) ?? fieldUnitFor(s.proposal, sel.table, sel.column);
}

/** Side sheet over the grid: concise reason first, then what changed, method, alternatives and evidence. */
export function DetailDrawer() {
  const s = useAppState();
  const c = useController();
  const ref = useRef<HTMLElement>(null);
  const sel = s.selection;
  const [cell, setCell] = useState<CellResult | null>(null);
  const [cellErr, setCellErr] = useState<string | null>(null);
  const [spanUnitId, setSpanUnitId] = useState<string | null>(null);

  const fieldUnit = resolveUnit(s);
  const table = sel && sel.kind !== "unit" ? sel.table : fieldUnit?.refs[0]?.table;
  const column = sel && sel.kind !== "unit" ? sel.column : fieldUnit?.refs[0]?.column;
  const row = sel?.kind === "cell" ? sel.row : 0;
  const spanIdx = sel?.kind === "cell" ? sel.spanIndex : undefined;
  const outputHash = s.executed?.outputHash;

  useEffect(() => {
    setCell(null); setCellErr(null); setSpanUnitId(null);
    if (!table || !column || !s.manifest) return;
    let live = true;
    c.backend.cell(table, row, column).then((r) => { if (live) setCell(r); }).catch((e) => { if (live && !isSuperseded(e)) setCellErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [table, column, row, outputHash, c.backend, s.manifest]);

  useEffect(() => {
    if (spanIdx !== undefined && cell?.change?.spans?.[spanIdx]) setSpanUnitId(cell.change.spans[spanIdx]!.unitId);
  }, [spanIdx, cell]);

  useEffect(() => { if (sel) ref.current?.focus({ preventScroll: true }); }, [sel?.kind, table, column, row]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = !!sel && !!table && !!column;
  useEffect(() => { const el = ref.current; if (!el) return; if (open) el.removeAttribute("inert"); else el.setAttribute("inert", ""); }, [open]);
  const unit = unitById(s.proposal, spanUnitId) ?? fieldUnit;
  const d = decisionFor(s.proposal, unit?.id);
  const det = table && column ? detectionFor(s.detections, table, column) : undefined;
  const busy = s.phase === "updating" || !!s.pending.propose;
  const kind = highlightOf(d);
  const mk = methodKind(d);
  const recipe = d?.selected ? getRecipe(d.selected.recipeId) : null;
  const metrics = metricsForUnit(s.evaluation, unit);
  const spanUnits = unit && unit.kind !== "span_class" ? spanUnitsFor(s.proposal, unit.id) : [];
  const userEdited = !!unit && s.overrides.some((o) => o.unitId === unit.id);

  const setParams = (key: string, v: string | number | boolean) => {
    if (!unit || !d?.selected) return;
    void c.setOverride({ unitId: unit.id, recipeId: d.selected.recipeId, params: { ...d.selected.params, [key]: v } });
  };
  const close = () => c.store.dispatch({ type: "select", selection: null });

  return (
    <aside
      ref={ref}
      className={`drawer ${open ? "is-open" : ""}`}
      aria-label="Details"
      aria-hidden={!open}
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
    >
      {open && (
        <>
          <header className="drawer-head">
            <div>
              <h3 className="drawer-title">{unit ? unitTitle(unit) : column}</h3>
              <p className="muted xsmall mono">{unit ? unitWhere(unit) : `${table}.${column}`}{sel?.kind === "cell" ? ` · row ${sel.row + 1}` : ""}</p>
            </div>
            <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close details (Escape)"><IconClose /></button>
          </header>

          <div className="drawer-body">
            {spanUnitId && fieldUnit && fieldUnit.id !== spanUnitId && (
              <button className="btn-link xsmall back-link" onClick={() => setSpanUnitId(null)}>← Whole column: {unitTitle(fieldUnit)}</button>
            )}

            {d ? (
              <section className="d-reason">
                <div className="d-tags">
                  {mk && <span className={`hl-tag hl-${mk}`}><HighlightIcon kind={mk} size={12} />{recipe?.name ?? HIGHLIGHT_LABEL[mk]}</span>}
                  {kind === "review" && <span className="hl-tag hl-review"><HighlightIcon kind="review" size={12} />Needs review</span>}
                  {d.source === "user" && <span className="pill accent">Edited by you</span>}
                  {d.abstained && <span className="pill warn">No transformation chosen</span>}
                </div>
                <p className="reason">{d.reason}</p>
                {d.needsReview && d.reviewReasons.length > 0 && (
                  <ul className="review-reasons small">{d.reviewReasons.map((r) => <li key={r}><IconAlert size={12} /> {r}</li>)}</ul>
                )}
              </section>
            ) : (
              <section className="d-reason">
                <p className="reason muted">{s.proposal ? "This column has no decision of its own." : "No protection has been proposed yet. Describe the purpose on the left to get a proposal."}</p>
              </section>
            )}

            <section>
              <h4>What changed</h4>
              {cellErr ? <p className="note-error small">{cellErr}</p> : !cell ? <p className="muted small">Loading example…</p> : (
                <div className="diff">
                  {sel?.kind !== "cell" && <p className="muted xsmall">Example from row 1</p>}
                  {cell.change?.spans?.length ? (
                    <>
                      <div className="diff-row"><span className="diff-k">Protected</span><p className="diff-v text">
                        {cell.protected !== null ? <SpanText text={cell.protected} spans={cell.change.spans} selected={spanIdx} devOpen={s.devOpen} onSpan={(i) => setSpanUnitId(cell.change!.spans![i]!.unitId)} /> : "—"}
                      </p></div>
                      <p className="muted xsmall">The original text is shown only in the developer panel.</p>
                    </>
                  ) : (
                    <>
                      <div className="diff-row"><span className="diff-k">Original</span><p className="diff-v mono">{cell.original ?? "—"}</p></div>
                      <div className="diff-row"><span className="diff-k">Protected</span><p className={`diff-v mono ${kind ? `hl hl-${kind}` : ""}`}>
                        {s.executed ? (cell.protected ?? (mk === "suppress" ? <em className="muted">removed</em> : "—")) : <em className="muted">not applied yet</em>}
                      </p></div>
                    </>
                  )}
                </div>
              )}
            </section>

            {unit && s.goal && (
              <section>
                <h4>Why this level of detail</h4>
                <p className="small">{goalRelevance(s.goal, unit)}</p>
              </section>
            )}

            {d && recipe && (
              <section>
                <h4>Method</h4>
                <p className="small">{recipe.summary}</p>
                {recipe.params.filter((p) => p.editable !== false).length > 0 && (
                  <div className="params">
                    {recipe.params.filter((p) => p.editable !== false).map((p) => (
                      <ParamEditor key={p.key} def={p} value={d.selected?.params[p.key]} disabled={busy} onCommit={(v) => setParams(p.key, v)} />
                    ))}
                  </div>
                )}
                <p className="limitations xsmall muted"><strong>Limits:</strong> {recipe.limitations}</p>
              </section>
            )}

            {spanUnits.length > 0 && (
              <section>
                <h4>Inside the text</h4>
                <ul className="span-units">
                  {spanUnits.map((u) => {
                    const sd = decisionFor(s.proposal, u.id);
                    const k = methodKind(sd);
                    return (
                      <li key={u.id}>
                        <button className="span-unit" onClick={() => setSpanUnitId(u.id)}>
                          <span>{subtypeLabel(u.spanLabel ?? "")}</span>
                          {k && <span className={`hl-tag hl-${k}`}><HighlightIcon kind={k} size={12} />{sd?.selected ? getRecipe(sd.selected.recipeId).name : HIGHLIGHT_LABEL[k]}</span>}
                          {sd?.needsReview && <IconAlert size={12} label="Needs review" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {d && (
              <section>
                <h4>Alternatives</h4>
                <Alternatives d={d} disabled={busy} onPick={(cand) => unit && void c.setOverride({ unitId: unit.id, recipeId: cand.recipeId, params: cand.params })} />
              </section>
            )}

            {metrics.length > 0 && (
              <section>
                <h4>Related checks</h4>
                <ul className="rel-metrics small">
                  {metrics.map((m) => (
                    <li key={m.id}>
                      <StatusIcon status={m.status} passed={m.passed} />
                      <span>{m.name}</span>
                      <span className="num muted">{m.status === "evaluated" ? fmtMetricValue(m) : METRIC_STATUS_LABEL[m.status].toLowerCase()}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {det && (
              <section>
                <h4>Evidence</h4>
                <p className="small">
                  {ROLE_LABEL[det.role]} · {subtypeLabel(det.subtype)} · detection confidence {CONFIDENCE_LABEL[det.confidence]}
                  {det.art9 && <span className="pill warn">special category</span>}
                </p>
                <ul className="evidence xsmall">
                  {det.evidence.map((ev) => <li key={ev.ruleId + ev.description}>{ev.description}{ev.matchRate !== undefined ? <span className="muted num"> · {fmtPct(ev.matchRate)} of sampled values</span> : null}</li>)}
                </ul>
                {det.needsReview && det.reviewReasons.length > 0 && <ul className="review-reasons xsmall">{det.reviewReasons.map((r) => <li key={r}><IconAlert size={12} /> {r}</li>)}</ul>}
              </section>
            )}

            {d && d.detail.length > 0 && (
              <details className="tech">
                <summary className="small">Technical detail</summary>
                <ul className="mono xsmall">{d.detail.map((x) => <li key={x}>{x}</li>)}</ul>
                <p className="mono xsmall muted">unit {unit?.id} · {BASIS_LABEL.structural}</p>
              </details>
            )}
          </div>

          <footer className="drawer-foot">
            <button className="btn btn-small" disabled={!s.history.length || busy} onClick={() => void c.undo()} title="Undo last edit (Ctrl/Cmd+Z)">
              <IconUndo size={14} /> Undo
            </button>
            <button className="btn btn-ghost btn-small" disabled={!s.overrides.length || busy} onClick={() => void c.resetOverrides()}>
              Reset to proposal
            </button>
            {userEdited && <span className="muted xsmall">You changed this field.</span>}
          </footer>
        </>
      )}
    </aside>
  );
}
