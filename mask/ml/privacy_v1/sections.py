"""Shared structural units for experimental task-conditioned section editing.

Units are paragraphs (blank-line separated), not NER spans. A whole visit block
therefore reaches the action head even when its learned entities are fragments.
Existing category-conditioned heads are probed conservatively; this is not a
newly trained generic relevance head and its scores are not calibrated.
"""
import re
from .contracts import Span
from .editing import text_units, drop_bounds

SECTION_MODE = "paragraph-probe-v1"
CLAUSE_MODE = "clause-probe-v1"
SECTION_MODES = (SECTION_MODE, CLAUSE_MODE)
SECTION_LABELS = ("HEALTH", "FINANCIAL", "EMPLOYMENT", "FAMILY")
MAX_SECTIONS = 64


def section_units(text, mode=SECTION_MODE):
    if mode == CLAUSE_MODE:
        yield from text_units(text)
        return
    if mode != SECTION_MODE:
        raise ValueError("Unknown structural mode")
    start = 0
    for match in re.finditer(r"(?:\r?\n)[ \t]*(?:\r?\n)(?:[ \t]*\r?\n)*", text):
        a, b = start, match.start()
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b-1].isspace():
            b -= 1
        if a < b:
            yield a, b
        start = match.end()
    end = len(text)
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end-1].isspace():
        end -= 1
    if start < end:
        yield start, end


def section_drop_bounds(text, start, end, mode=SECTION_MODE):
    if mode == CLAUSE_MODE:
        return drop_bounds(text, start, end)
    if (start, end) not in set(section_units(text)):
        raise ValueError("DROP requires a complete structural paragraph")
    right = end
    while right < len(text) and text[right].isspace():
        right += 1
    if right == len(text):
        while start > 0 and text[start-1].isspace():
            start -= 1
    return start, right


def structural_candidates(text, contextual, mode=SECTION_MODE):
    units = list(section_units(text, mode))
    if len(units) > MAX_SECTIONS:
        raise ValueError("Too many structural sections")
    result = []
    for a, b in units:
        # Hints choose a category, never permission to remove the whole block.
        labels = {s.label for s in contextual
                  if s.label in SECTION_LABELS and s.start < b and a < s.end}
        # No detection is needed: unidentified paragraphs still get scored.
        for label in SECTION_LABELS:
            if not labels or label in labels:
                result.append(Span(a, b, label, mode if labels else mode + ":untyped"))
    return result


def section_targets(record, mode=SECTION_MODE):
    """Project explicit reviewed labels onto the same runtime paragraphs.

    Never invent DROP for unannotated text or infer permission from a task.
    Mixed paragraphs with required/KEEP facts remain KEEP; partially labelled
    paragraphs without a decisive target remain unlabelled and aren't fitted.
    This returns a separate section-head dataset, not BIO detector targets.
    """
    text = record["text"]
    decisions = record.get("decisions", record.get("spans", []))
    facts = record.get("required_facts", [])
    fact_ranges = []
    for f in facts:
        if isinstance(f, dict):
            fact_ranges.append((f["start"], f["end"]))
        else:
            fact_ranges.extend((m.start(), m.end()) for m in re.finditer(re.escape(f), text))
    result = []
    for a, b in section_units(text, mode):
        overlaps = [d for d in decisions if d["start"] < b and a < d["end"]]
        keep = any(x < b and a < y for x, y in fact_ranges) or any(
            d["action"] == "KEEP" and d["relevance"] == "essential" for d in overlaps)
        drops = [d for d in overlaps if d["action"] == "DROP" and d["relevance"] == "unnecessary"]
        fully_dropped = all(c.isspace() or any(d["start"] <= i < d["end"] for d in drops)
                            for i, c in enumerate(text[a:b], a))
        if keep:
            target, reason = "essential", "explicit_required_or_keep_fact"
        elif fully_dropped:
            target, reason = "unnecessary", "fully_covered_by_reviewed_drop"
        elif any(d["relevance"] == "uncertain" for d in overlaps):
            target, reason = "uncertain", "explicit_uncertain_annotation"
        else:
            target, reason = None, "insufficient_section_supervision"
        result.append({"start": a, "end": b, "target": target, "reason": reason})
    return result
