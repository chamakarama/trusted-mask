import { useState } from "react";
import type { GoalSpec, UnresolvedQuestion } from "@/contracts";
import { LOCATION_RESOLUTIONS, OUTPUT_FORMS, TASK_KINDS, TEXT_NEEDS, TIME_RESOLUTIONS, TRUST_LEVELS } from "@/contracts";
import { useAppState, useController } from "../store/store";
import {
  LINKAGE_LABEL, LOCATION_LABEL, OUTPUT_LABEL, TASK_LABEL, TEXT_NEED_LABEL, TIME_LABEL, TRUST_LABEL,
} from "../lib/labels";
import { FALLBACK_INTERPRETER } from "../controller";
import { IconChevron, IconClose } from "../lib/icons";

const WHY: Record<string, string> = {
  linkage: "Decides whether identifiers become consistent tokens or are removed.",
  "recipient.trustLevel": "Sets how much detail can leave your organisation.",
  recipient: "Sets how much detail can leave your organisation.",
  "resolution.time": "Sets how precisely times are kept.",
  "resolution.location": "Sets how precisely places are kept.",
  textNeed: "Decides how personal details inside text are replaced.",
  outputForm: "Decides whether rows or only totals are shared.",
  requiredFields: "Fields you need are kept in a usable form.",
  task: "Changes which protections are proposed.",
};
const whyFor = (q: UnresolvedQuestion) => WHY[q.affects[0] ?? ""] ?? WHY[(q.affects[0] ?? "").split(".")[0]!] ?? "Changes which protections are proposed.";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="gc-row">
      <label className="gc-label" htmlFor={htmlFor}>{label}</label>
      <div className="gc-value">{children}</div>
    </div>
  );
}

function Select<T extends string>({ id, value, options, labels, onChange, unset }: {
  id: string; value: T | undefined; options: readonly T[]; labels: Record<T, string>; onChange: (v: T | undefined) => void; unset?: string;
}) {
  return (
    <select id={id} className="select gc-select" value={value ?? ""} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}>
      {unset !== undefined && <option value="">{unset}</option>}
      {options.map((o) => <option key={o} value={o}>{labels[o]}</option>)}
    </select>
  );
}

function ChipList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="chips" role="group" aria-label={label}>
      {items.map((it) => (
        <span key={it} className="chip static">
          {it}
          <button className="chip-x" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))}><IconClose size={12} /></button>
        </span>
      ))}
      <input
        className="chip-input"
        aria-label={`Add to ${label.toLowerCase()}`}
        placeholder="Add…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}

/** One quiet line summarising Mask's reading of the goal. */
export function GoalReply() {
  const s = useAppState();
  const g = s.goal;
  if (!g) return null;
  const fallback = g.provenance.interpreter === FALLBACK_INTERPRETER;
  const who = g.recipient.description && g.recipient.description !== "Not stated" ? g.recipient.description : TRUST_LABEL[g.recipient.trustLevel].toLowerCase();
  return (
    <p className="reply">
      {fallback ? "Set by hand: " : "Understood: "}
      {(g.task.description || TASK_LABEL[g.task.kind]).replace(/\.$/, "")}, for {who.charAt(0).toLowerCase() + who.slice(1)}.
      {!s.manifest && <span className="muted"> Add data on the right to see the proposal.</span>}
    </p>
  );
}

/** Open questions as short inline rows with choices. */
export function GoalQuestions() {
  const s = useAppState();
  const c = useController();
  const g = s.goal;
  if (!g || !g.unresolved.length || s.goalAccepted) return null;
  return (
    <div className="questions">
      {g.unresolved.map((q) => (
        <div key={q.id} className="question" role="group" aria-labelledby={`q-${q.id}`}>
          <p id={`q-${q.id}`} className="q-text">{q.question} <span className="q-why">{whyFor(q)}</span></p>
          <div className="q-choices">
            {(q.options ?? []).map((o) => (
              <button key={o.value} className="choice" aria-pressed={s.answers[q.id] === o.value} onClick={() => void c.answer(q.id, o.value)}>{o.label}</button>
            ))}
          </div>
        </div>
      ))}
      <button className="btn-link small" onClick={() => void c.acceptGoal()} disabled={!s.detections}>
        Continue with these assumptions
      </button>
      {!s.detections && <span className="muted small"> once data is added</span>}
    </div>
  );
}

/** The editable interpretation. Every edit re-proposes. */
export function SpecFields() {
  const s = useAppState();
  const c = useController();
  const g = s.goal;
  if (!g) return null;
  const edit = (patch: Partial<GoalSpec>) => void c.editGoal({ ...g, ...patch });
  const sel = s.proposal?.selector;
  const selLabel = sel ? (sel.id === "learned" ? `Learned model ${sel.modelArtifact ?? sel.version}` : `Policy baseline ${/^\d/.test(sel.version) ? "v" : ""}${sel.version}`) : null;

  return (
    <div className="spec-fields">
          <div className="gc-grid">
            <Field label="Task" htmlFor="gc-task">
              <Select id="gc-task" value={g.task.kind} options={TASK_KINDS} labels={TASK_LABEL} onChange={(v) => v && edit({ task: { ...g.task, kind: v } })} />
            </Field>
            <Field label="Recipient" htmlFor="gc-trust">
              <Select id="gc-trust" value={g.recipient.trustLevel} options={TRUST_LEVELS} labels={TRUST_LABEL} onChange={(v) => v && edit({ recipient: { ...g.recipient, trustLevel: v } })} />
            </Field>
            <Field label="Output" htmlFor="gc-output">
              <Select id="gc-output" value={g.outputForm} options={OUTPUT_FORMS} labels={OUTPUT_LABEL} onChange={(v) => v && edit({ outputForm: v })} />
            </Field>
            <Field label="Text" htmlFor="gc-text">
              <Select id="gc-text" value={g.textNeed} options={TEXT_NEEDS} labels={TEXT_NEED_LABEL} onChange={(v) => v && edit({ textNeed: v })} />
            </Field>
            <Field label="Linking" htmlFor="gc-link">
              <Select id="gc-link" value={g.linkage} options={["none", "within_table", "across_tables"] as const} labels={LINKAGE_LABEL} onChange={(v) => v && edit({ linkage: v })} />
            </Field>
            <Field label="Time" htmlFor="gc-time">
              <Select id="gc-time" value={g.resolution.time} options={TIME_RESOLUTIONS} labels={TIME_LABEL} unset="Not stated" onChange={(v) => edit({ resolution: { ...g.resolution, time: v } })} />
            </Field>
            <Field label="Location" htmlFor="gc-loc">
              <Select id="gc-loc" value={g.resolution.location} options={LOCATION_RESOLUTIONS} labels={LOCATION_LABEL} unset="Not stated" onChange={(v) => edit({ resolution: { ...g.resolution, location: v } })} />
            </Field>
            <Field label="Measures"><ChipList label="Measures" items={g.measures} onChange={(measures) => edit({ measures })} /></Field>
            <Field label="Group by"><ChipList label="Group by" items={g.groupings} onChange={(groupings) => edit({ groupings })} /></Field>
            <Field label="Needs fields"><ChipList label="Needs fields" items={g.requiredFields} onChange={(requiredFields) => edit({ requiredFields })} /></Field>
          </div>
          <div className="spec-foot small muted">
            {selLabel && <span>Proposed by {selLabel}</span>}
            {s.model && (
              <span className="selector-switch" role="radiogroup" aria-label="Selector">
                {(["policy", "learned"] as const).map((id) => (
                  <button key={id} role="radio" aria-checked={s.selectorId === id} className="btn-link" onClick={() => void c.setSelector(id)}>
                    {id === "policy" ? "Policy" : "Learned"}
                  </button>
                ))}
              </span>
            )}
          </div>
    </div>
  );
}
