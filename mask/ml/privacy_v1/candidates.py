"""Reconcile whole entities and contextual units without fragmenting identifiers.

These are structural guardrails, not a replacement for detector evaluation.
Rejected learned candidates are returned for review, never silently called safe.
"""
import re
from .contracts import DIRECT, Span
from .editing import expand_word, overlaps, text_units
from .rules import detect_rules, iban, luhn

CONTEXT_TYPES = {"HEALTH", "FINANCIAL", "EMPLOYMENT", "FAMILY"}
NON_NAMES = set("i me my mine you your yours he she her his we us our they their them this that these those it its "
                "the a an and but or for to from of at by with without please explain help write my "
                "monday tuesday wednesday thursday friday saturday sunday january february march april may june "
                "july august september october november december today yesterday tomorrow last next three "
                "dr mr mrs ms professor since then before after what why how where when".split())


def plausible_person(value):
    words = value.split()
    return (1 <= len(words) <= 5 and all(w.lower() not in NON_NAMES for w in words)
            and all(any(c.isalpha() for c in w) and not any(c.isdigit() for c in w) for w in words)
            and all(w[:1].isupper() or w in {"de", "van", "von", "al"} for w in words)
            and all(re.fullmatch(r"[^\W\d_]+(?:['’-][^\W\d_]+)*", w) for w in words))


def plausible(span, value):
    digits = sum(c.isdigit() for c in value)
    if span.label == "PERSON":
        return plausible_person(value)
    if span.label == "EMAIL":
        return bool(re.fullmatch(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", value))
    if span.label == "PHONE":
        return digits >= 8 and bool(re.fullmatch(r"[+\d ().-]+", value))
    if span.label == "PAYMENT_CARD":
        return luhn(value)
    if span.label == "IBAN":
        return iban(value)
    if span.label == "ADDRESS":
        return digits > 0 and len(value.split()) >= 2
    if span.label == "USERNAME":
        return len(value) >= 4 and bool(re.fullmatch(r"[\w.@+-]+", value)) and any(c in value for c in "_@.")
    if span.label in {"ACCOUNT_ID", "NATIONAL_ID", "SECRET"}:
        return digits >= 1 and len(value) >= 6 and not re.fullmatch(r"\d+(?:[./:-]\d+)*", value)
    if span.label == "DATE":
        return bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", value))
    if span.label == "AGE":
        return value.isascii() and value.isdigit() and 0 <= int(value) <= 120
    if span.label in {"ORG", "LOCATION"}:
        return plausible_person(value)
    return False


def build_candidates(text, learned, header=""):
    rules = detect_rules(text, header)
    # A repeated, exactly spelled full name already identified in this source
    # must not depend on whether the tagger finds only its surname next time.
    known_names = {text[s.start:s.end] for s in rules if s.label == "PERSON"
                   and len(text[s.start:s.end].split()) >= 2 and plausible_person(text[s.start:s.end])}
    for value in sorted(known_names):
        for match in re.finditer(r"(?<!\w)" + re.escape(value) + r"(?!\w)", text):
            rules.append(Span(*match.span(), "PERSON", "repeat-rule"))
    entities, sections, pending = [], [], []
    for span in rules:
        if span.label in CONTEXT_TYPES:
            sections.append(span)
        else:
            entities.append(span)
    units = list(text_units(text))
    placeholder_ranges = [m.span() for m in re.finditer(r"\[(?:MASK_)?[A-Z]+(?:_\d+)?\]", text)]
    for span in learned:
        span.validate(text)
        if any(a <= span.start and span.end <= b for a, b in placeholder_ranges):
            continue
        normalized = expand_word(text, span)
        if normalized.start >= normalized.end:
            continue
        if span.label in CONTEXT_TYPES:
            matching = [(a, b) for a, b in units if a <= span.start < b]
            if matching:
                a, b = matching[0]
                if any(s.start == a and s.end == b and s.label == span.label for s in sections):
                    continue
                # Tiny word-level guesses cannot authorise deleting a sentence.
                if span.start <= a and span.end >= b:
                    sections.append(Span(a, b, span.label, "model-section"))
                    continue
            pending.append({"start": normalized.start, "end": normalized.end, "label": span.label,
                            "reason": "unconfirmed_context_boundary"})
            continue
        if any(overlaps(span, rule) for rule in entities if rule.source.endswith("rule")):
            continue  # Entity rules own values, but cannot suppress contextual vetoes.
        if plausible(normalized, text[normalized.start:normalized.end]):
            entities.append(normalized)
        else:
            pending.append({"start": normalized.start, "end": normalized.end, "label": span.label,
                            "reason": "unconfirmed_entity_shape"})
    # Rules win over learned fragments; never splice competing labels through one value.
    chosen = []
    for span in sorted(entities, key=lambda s: (not s.source.endswith("rule"), s.label != "SECRET",
                                                -(s.end-s.start), s.start)):
        if not any(overlaps(span, old) for old in chosen):
            chosen.append(span)
    # Deduplicate contextual boundaries, while retaining competing interpretations for review.
    sections = list({(s.start, s.end, s.label): s for s in sections}.values())
    return sorted(chosen, key=lambda s: s.start), sorted(sections, key=lambda s: (s.start, s.end)), pending
