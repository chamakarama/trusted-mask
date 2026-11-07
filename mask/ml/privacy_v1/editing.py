"""Exact-source rendering and sentence/clause boundaries, independent of ML weights."""
import re
from .contracts import Edit, Span

ABBREVIATIONS = {"dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "vs", "e.g", "i.e"}


def text_units(text):
    """Return nonempty source clauses, excluding boundary whitespace/delimiters.

    Decimal points, common title abbreviations, initials and email/domain dots
    are not sentence breaks. Semicolons/newlines are explicit clause boundaries.
    """
    start = 0
    for match in re.finditer(r"[;\r\n]+|[.!?]+(?=\s|$)", text):
        a, b = match.span()
        if text[a] == ".":
            previous = re.search(r"([\w.]+)$", text[:a])
            word = previous[1] if previous else ""
            if word.lower() in ABBREVIATIONS or len(word) == 1 and word.isalpha():
                continue
        end = a
        while start < end and text[start].isspace():
            start += 1
        while end > start and text[end-1].isspace():
            end -= 1
        if end > start:
            yield start, end
        start = b
    end = len(text)
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end-1].isspace():
        end -= 1
    if end > start:
        yield start, end


def overlaps(a, b):
    return a.start < b.end and b.start < a.end


def expand_word(text, span):
    """Expand a subword candidate to intact lexical boundaries, never across space."""
    start, end = span.start, span.end
    def inside(c):
        return c.isalnum() or c in "_'’-@"
    while start > 0 and inside(text[start-1]) and inside(text[start]):
        start -= 1
    while end < len(text) and inside(text[end-1]) and inside(text[end]):
        end += 1
    while start < end and text[start].isspace():
        start += 1
    while end > start and text[end-1].isspace():
        end -= 1
    return Span(start, end, span.label, span.source)


def drop_bounds(text, start, end):
    """Remove a complete clause plus one delimiter, preserving neighbouring prose."""
    if (start, end) not in set(text_units(text)):
        raise ValueError("DROP requires a complete supported clause/section")
    left = start
    while left > 0 and text[left-1] in " \t":
        left -= 1
    # Last clause of a semicolon sentence: retain its final terminal punctuation.
    if left > 0 and text[left-1] == ";" and (end == len(text) or text[end:end+1] in ".!?"):
        return left-1, end
    right = end
    while right < len(text) and text[right] in ".!?;":
        right += 1
    while right < len(text) and text[right].isspace():
        right += 1
    if right == len(text):
        # Deleting the final sentence/paragraph should not leave its blank separator.
        while left > 0 and text[left-1].isspace():
            left -= 1
        return left, right
    if right > end:
        return start, right
    # Last semicolon-delimited clause: remove its preceding delimiter too.
    if left > 0 and text[left-1] == ";":
        return left-1, end
    return start, end


def apply_edits(text, edits):
    """No global whitespace rewrite: unchanged source regions remain exact."""
    cursor, pieces = 0, []
    for edit in sorted(edits, key=lambda e: (e.start, e.end)):
        if not 0 <= edit.start < edit.end <= len(text) or edit.start < cursor:
            raise ValueError("Invalid or overlapping edits")
        if edit.action == "KEEP":
            raise ValueError("KEEP is retention metadata, not an edit")
        pieces.extend((text[cursor:edit.start], edit.replacement))
        cursor = edit.end
    pieces.append(text[cursor:])
    return "".join(pieces)
