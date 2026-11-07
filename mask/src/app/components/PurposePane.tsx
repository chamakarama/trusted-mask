import { useEffect, useRef, useState } from "react";
import { useAppState, useController } from "../store/store";
import { GoalQuestions, GoalReply, SpecFields } from "./GoalCard";
import { IconChevronV, IconSend } from "../lib/icons";

const EXAMPLES = [
  "An external vendor will find the main contact reasons and handle time by intent.",
  "Our own team trains a chatbot on the conversation text.",
  "Publish monthly statistics of contacts by channel and region.",
];

/**
 * The question box is the main object of the left side. It keeps the purpose as written; editing it and
 * pressing Enter refines the specification. A thin bar under it opens the specification and any questions.
 */
export function PurposePane() {
  const s = useAppState();
  const c = useController();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const interpreting = s.pending.interpret !== undefined;
  const questions = s.goal && !s.goalAccepted ? s.goal.unresolved.length : 0;
  const notes = s.thread.filter((t) => t.role === "mask" && t.kind === "note");
  const lastNote = notes[notes.length - 1];
  const seenQuestions = useRef(0);

  // show the purpose that produced the current goal (e.g. after a programmatic or example send)
  useEffect(() => { if (s.goal && !text) setText(s.goal.rawText); }, [s.goal?.rawText]); // eslint-disable-line react-hooks/exhaustive-deps
  // a new question opens the section once, so it is not missed
  useEffect(() => { if (questions > seenQuestions.current) setOpen(true); seenQuestions.current = questions; }, [questions]);

  const send = (t = text) => {
    const v = t.trim();
    if (!v || interpreting) return;
    setText(v);
    void c.submitGoal(v);
  };
  const unchanged = !!s.goal && text.trim() === s.goal.rawText.trim();

  return (
    <div className="purpose">
      <form className="ask" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="goal-input" className="sr-only" id="purpose-title">What is this data for, and who receives it?</label>
        <textarea
          id="goal-input"
          rows={5}
          value={text}
          placeholder="What is this data for, and who receives it?"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          aria-describedby="ask-hint"
        />
        <span id="ask-hint" className="sr-only">Enter to send, Shift+Enter for a new line.</span>
        <button type="submit" className="ask-send" disabled={!text.trim() || interpreting || unchanged} aria-label="Send" title="Send (Enter)">
          {interpreting ? <span className="spinner" aria-hidden="true" /> : <IconSend size={15} />}
        </button>
      </form>
      <button
        className={`spec-bar ${open ? "is-open" : ""}`}
        aria-expanded={open}
        aria-controls="spec-section"
        aria-label={`Specification${questions ? `, ${questions} open question${questions > 1 ? "s" : ""}` : ""}`}
        onClick={() => setOpen((x) => !x)}
      >
        {questions > 0 && !open && <span className="spec-dot" aria-hidden="true" />}
        <IconChevronV size={14} up={open} />
      </button>
      {open && (
        <div className="spec-section" id="spec-section">
          {interpreting && <p className="reply muted">Reading…</p>}
          {s.goal ? (
            <>
              <GoalReply />
              {lastNote && lastNote.role === "mask" && lastNote.kind === "note" && <p className={`spec-note tone-${lastNote.tone}`}>{lastNote.text}</p>}
              <GoalQuestions />
              <h3 className="spec-heading">Specification</h3>
              <SpecFields />
            </>
          ) : (
            <>
              {lastNote && lastNote.role === "mask" && lastNote.kind === "note" && <p className={`spec-note tone-${lastNote.tone}`}>{lastNote.text}</p>}
              <p className="muted small">Describe the analysis and who receives the result. For example:</p>
              <div className="examples" aria-label="Examples">
                {EXAMPLES.map((ex) => <button key={ex} className="example" onClick={() => send(ex)}>{ex}</button>)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
