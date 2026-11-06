import { useEffect, useState } from "react";
import { execute, PRESETS, refuse, validateIntent, type Answer } from "../assistant/intent";
import type { Release } from "../data/release";
import { IconSpark, IconWarn } from "./Icons";

interface Props { rel: Release; onEvidence: (resultId: string) => void; onApply: (band: string, origin: string | null) => void; onIntent?: (band: string, origin: string | null, firstId: string | null) => void }

const ASSIST = (import.meta.env.VITE_ASSISTANT_URL as string | undefined) ?? "http://127.0.0.1:8787";
const TITLE: Record<string, string> = {
  individual_history_unavailable: "Can't show one person's trips",
  unsupported_breakdown: "That detail isn't in this release",
  ai_unavailable: "AI is offline",
  invalid_intent: "Didn't understand that",
  out_of_scope: "Not something this data can answer",
};

/** Ask the release: a model may only propose a typed request; every number comes from the published tables. */
export function AssistantPanel({ rel, onEvidence, onApply, onIntent }: Props) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [q, setQ] = useState("");
  const [live, setLive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 1500);
    fetch(`${ASSIST}/health`, { signal: ctl.signal }).then((r) => r.json()).then((h) => setLive(!!h.ok)).catch(() => setLive(false)).finally(() => window.clearTimeout(t));
    return () => ctl.abort();
  }, []);

  const show = (a: Answer) => { setAnswer(a); if (a.kind === "answer" && a.evidence[0]) onEvidence(a.evidence[0].result_id); };

  const ask = async () => {
    const question = q.trim();
    if (!question) return;
    if (!live) { setAnswer(refuse("ai_unavailable", rel, "The AI helper isn't running on this computer, so typed questions can't be read. Try one of the suggested questions: those are answered straight from the published numbers.")); return; }
    setBusy(true);
    try {
      const r = await fetch(`${ASSIST}/intent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) });
      const out = await r.json();
      if (out.kind === "intent") {
        const v = validateIntent(out.intent, rel);
        if (!v.ok) { setAnswer(refuse("invalid_intent", rel, `The AI's request was rejected by the checker (${v.reason}).`)); return; }
        // the model's own text is discarded: only the validated, typed request is used, and the wording below is ours
        const a = execute(v.intent, rel, "model");
        setAnswer(a);
        onIntent?.(v.intent.hour_band, v.intent.origin_area, a.evidence[0]?.result_id ?? null);
      } else {
        const kind = (["individual_history_unavailable", "unsupported_breakdown", "out_of_scope", "invalid_intent"].includes(out.kind) ? out.kind : "ai_unavailable") as Answer["kind"];
        const why: Record<string, string> = {
          individual_history_unavailable: "This release has no travel cards or journeys in it, only protected totals, so nobody's trips can be shown.",
          unsupported_breakdown: "Routes are only published for the whole 4 weeks and per time of day. Combining tables would make up numbers that were never protected.",
          out_of_scope: "This data only covers bus trips between areas, lines per hour and taps per day.",
        };
        setAnswer({ ...refuse(kind as any, rel, why[kind] ?? "The AI helper is unavailable right now. Try a suggested question."), source: "model" });
      }
    } catch {
      setLive(false);
      setAnswer(refuse("ai_unavailable", rel, "The AI helper stopped responding. Try a suggested question instead."));
    } finally { setBusy(false); }
  };

  return (
    <section className="panel" aria-labelledby="assist-title">
      <div className="panel-head">
        <div><div className="eyebrow">Ask the data</div><h2 id="assist-title">Ask a question</h2></div>
        <span className={`badge ${live ? "badge-ok" : ""}`}><IconSpark /> {live === null ? "checking AI…" : live ? "AI on" : "AI offline"}</span>
      </div>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <label className="sr-only" htmlFor="ask-input">Question</label>
        <input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which evening routes from Raisio are busiest?" maxLength={400} />
        <button type="submit" disabled={!q.trim() || busy}>{busy ? "…" : "Ask"}</button>
      </form>
      <div className="presets">
        {PRESETS.map((p) => <button key={p.id} className="preset" onClick={() => show(p.run(rel))}>{p.question}</button>)}
      </div>
      {answer && (
        <div className={`answer ${answer.kind === "answer" ? "" : "answer-refusal"}`} aria-live="polite">
          {answer.kind !== "answer" && <h3><IconWarn /> {TITLE[answer.kind]}</h3>}
          <p>{answer.summary}</p>
          {!!answer.evidence.length && (
            <ol className="evidence">
              {answer.evidence.map((e) => <li key={e.result_id}><button className="evref" onClick={() => onEvidence(e.result_id)} aria-label={`Show route ${e.n} on the map`}>{e.n}</button>{e.text}</li>)}
            </ol>
          )}
          {answer.alternative && (
            <button className="btn-ghost" onClick={() => { onApply(answer.alternative!.hour_band, answer.alternative!.origin_area); show(PRESETS[0].run(rel)); }}>
              Show the morning top 3 instead
            </button>
          )}
          <p className="source tiny">
            {answer.source === "preset" ? "Suggested question · answered directly from the published numbers" : "AI read the question; the numbers come from the published release"} · {answer.release_id}
          </p>
        </div>
      )}
    </section>
  );
}
