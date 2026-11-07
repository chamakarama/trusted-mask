import type { SpanChange } from "@/contracts";
import { subtypeLabel } from "../lib/labels";
import { getRecipe } from "@/core/registry";

export interface MappedSpan { span: SpanChange; index: number; start: number; end: number }

/**
 * Map span offsets (given on the ORIGINAL text) onto the protected text, where each span was replaced by
 * its replacement. Returns null if the protected text does not line up, so callers can fall back to plain text.
 */
export function mapSpans(protectedText: string, spans: SpanChange[]): MappedSpan[] | null {
  const sorted = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start);
  let shift = 0;
  const out: MappedSpan[] = [];
  for (const { span, index } of sorted) {
    const start = span.start + shift;
    const end = start + span.replacement.length;
    if (protectedText.slice(start, end) !== span.replacement) return null;
    out.push({ span, index, start, end });
    shift += span.replacement.length - (span.end - span.start);
  }
  return out;
}

/** Protected text with highlighter marks for each replaced span, the type label shown small after it. */
export function SpanText({ text, spans, selected, devOpen, onSpan }: {
  text: string; spans: SpanChange[]; selected?: number; devOpen: boolean; onSpan?: (i: number) => void;
}) {
  const mapped = mapSpans(text, spans);
  if (!mapped) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of mapped) {
    if (m.start > last) parts.push(text.slice(last, m.start));
    const rid = m.span.recipeId;
    const kind = rid === "keep" ? "keep" : getRecipe(rid).highlight;
    const label = subtypeLabel(m.span.label);
    const removed = m.span.replacement.length === 0;
    const shown = text.slice(m.start, m.end);
    // a typed placeholder already names its type; anything else gets the type written small after it
    const selfLabelled = /^\[[A-Z_]+\]$/.test(shown);
    parts.push(
      <mark
        key={m.index}
        className={`span mk mk-${kind} ${selected === m.index ? "is-selected" : ""} ${removed ? "is-empty" : ""}`}
        data-label={m.span.label}
        aria-label={`${label}, ${rid === "keep" ? "kept" : getRecipe(rid).name.toLowerCase()}${removed ? ", removed" : `: ${shown}`}`}
        title={`${label} · ${rid === "keep" ? "kept" : getRecipe(rid).name}${devOpen ? " · original in the developer panel" : ""}`}
        onClick={onSpan ? (e) => { e.stopPropagation(); onSpan(m.index); } : undefined}
      >
        {removed ? <span className="span-gone">{label.toLowerCase()}</span> : shown}
      </mark>,
    );
    if (!selfLabelled && !removed) parts.push(<small key={`l${m.index}`} className="mk-label" aria-hidden="true">{label.toLowerCase()}</small>);
    last = m.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
