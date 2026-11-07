import { useEffect, useRef, useState } from "react";
import { useAppState, useController } from "../store/store";
import { GoalCard } from "./GoalCard";
import { IconSend } from "../lib/icons";

const EXAMPLES = [
  "An external vendor will find the main contact reasons and handle time by intent.",
  "Our own team trains a chatbot on the conversation text.",
  "Publish monthly statistics of contacts by channel and region.",
];

export function PurposePane() {
  const s = useAppState();
  const c = useController();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const interpreting = s.pending.interpret !== undefined;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.thread.length]);

  const send = () => {
    const t = text.trim();
    if (!t || interpreting) return;
    setText("");
    void c.submitGoal(t);
  };

  return (
    <div className="purpose">
      <div className="pane-head">
        <h2 id="purpose-title">Purpose</h2>
        <span className="muted small">What the data is for and who receives it</span>
      </div>

      <ol className="thread" ref={listRef} aria-label="Conversation">
        {s.thread.length === 0 && (
          <li className="thread-intro">
            <p>Describe the analysis and who will receive the result. Mask uses this to choose how much detail each field keeps.</p>
            <div className="examples" aria-label="Examples">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="example" onClick={() => { setText(ex); inputRef.current?.focus(); }}>{ex}</button>
              ))}
            </div>
          </li>
        )}
        {s.thread.map((t) => {
          if (t.role === "user") return <li key={t.id} className="msg msg-user"><p>{t.text}</p></li>;
          if (t.kind === "note") return <li key={t.id} className={`msg msg-note tone-${t.tone}`}><p>{t.text}</p></li>;
          return <li key={t.id} className="msg msg-mask"><GoalCard /></li>;
        })}
        {interpreting && <li className="msg msg-pending" aria-live="polite"><span className="muted small">Reading your description…</span></li>}
      </ol>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="goal-input" className="sr-only">Describe the purpose</label>
        <textarea
          id="goal-input"
          ref={inputRef}
          rows={3}
          value={text}
          placeholder={s.goal ? "Add detail or correct the interpretation…" : "e.g. A vendor will analyse contact reasons and handle time by intent"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
          }}
        />
        <div className="composer-foot">
          <span className="muted xsmall">Enter to send · Shift+Enter for a new line</span>
          <button type="submit" className="btn btn-primary btn-small" disabled={!text.trim() || interpreting} aria-label="Send">
            <IconSend size={14} /> Send
          </button>
        </div>
      </form>
    </div>
  );
}
