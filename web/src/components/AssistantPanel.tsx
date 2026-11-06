import { useState } from "react";
import { PRESETS, refuse, type Answer } from "../assistant/intent";
import type { Release } from "../data/release";

interface Props { rel: Release; onEvidence: (resultId: string) => void; onApply: (band: string, origin: string | null) => void }

const REFUSAL_TITLE: Record<string, string> = {
  individual_history_unavailable: "Not available in this release",
  unsupported_breakdown: "That breakdown was not released",
  ai_unavailable: "Live AI is not connected",
  invalid_intent: "Request not understood",
};

/** Bounded planning assistant: answers only from released values, with numbered evidence. */
export function AssistantPanel({ rel, onEvidence, onApply }: Props) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [q, setQ] = useState("");
  const ask = () => {
    // No model is configured in this build: say so plainly and offer the deterministic presets (never canned "AI" text).
    setAnswer(refuse("ai_unavailable", rel, "No language model is connected in this build, so free-text questions are not interpreted. Pick a preset question below: those answers are computed directly from the released tables."));
  };
  return (
    <section className="panel" aria-labelledby="assist-title">
      <h2 id="assist-title">Ask the release</h2>
      <p className="muted small">Answers come only from the published tables. The assistant cannot see private data or run new computations.</p>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label className="sr-only" htmlFor="ask-input">Question</label>
        <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which morning corridors are busiest?" />
        <button type="submit" disabled={!q.trim()}>Ask</button>
      </form>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className="preset" onClick={() => {
            const a = p.run(rel);
            setAnswer(a);
            if (a.kind === "answer" && a.evidence[0]) onEvidence(a.evidence[0].result_id);
          }}>{p.question}</button>
        ))}
      </div>
      {answer && (
        <div className={`answer ${answer.kind === "answer" ? "" : "answer-refusal"}`} aria-live="polite">
          {answer.kind !== "answer" && <h3>{REFUSAL_TITLE[answer.kind]}</h3>}
          <p>{answer.summary}</p>
          {!!answer.evidence.length && (
            <ol className="evidence">
              {answer.evidence.map((e) => (
                <li key={e.result_id}><button className="link" onClick={() => onEvidence(e.result_id)}>[{e.n}]</button> {e.text}</li>
              ))}
            </ol>
          )}
          {answer.alternative && (
            <button className="secondary" onClick={() => { onApply(answer.alternative!.hour_band, answer.alternative!.origin_area); setAnswer(PRESETS[0].run(rel)); }}>
              Show the weekday morning corridor shortlist instead
            </button>
          )}
          {!!answer.warnings.length && <ul className="plain small muted">{answer.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <p className="source small">
            {answer.source === "preset" ? "Preset question · deterministic answer computed from the release, not live AI" : "Model-proposed request, validated and computed deterministically"}
            {answer.definition_id ? ` · ${answer.release_id} · ${answer.definition_id}` : ` · ${answer.release_id}`}
          </p>
        </div>
      )}
    </section>
  );
}
