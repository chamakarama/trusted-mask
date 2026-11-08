"""Policy masks and deterministic substitutions, shared by both tracks."""
import re
from .contracts import ALIASED, DIRECT, Span

POLICY_VERSION = "consumer-v1-pilot.3"  # .3: email addresses get numbered aliases like names
COMPATIBLE_TRAINING_POLICIES = ("consumer-v1-pilot.1", "consumer-v1-pilot.2", POLICY_VERSION)


def allowed_actions(span: Span, value: str) -> tuple[str, ...]:
    if span.label in ALIASED:
        return ("ALIAS", "PLACEHOLDER", "DROP")
    if span.label in DIRECT:
        return ("PLACEHOLDER", "DROP")
    actions = ["KEEP", "DROP", "PLACEHOLDER"]
    if span.label == "AGE" and re.fullmatch(r"\d{1,3}", value) and int(value) <= 120:
        actions.append("GENERALISE")
    # ROLE intentionally unavailable until an evidence-backed role resolver exists.
    return tuple(actions)


class Aliases:
    def __init__(self, reserved_text: str = ""):
        self._values = {}
        self._reserved = reserved_text
        self._counters = {}
        self._person_links = {}

    def register_people(self, values):
        """Link short forms only when exactly one detected full name supports them.

        No gold identity IDs or unsourced name guesses enter this resolver.
        Ambiguous shared first/surnames keep their own separate alias.
        """
        full = {v for v in values if len(v.split()) >= 2}
        candidates = {}
        for value in full:
            for short in (value.split()[0], value.split()[-1]):
                candidates.setdefault(short, set()).add(value)
        for value in full:
            self._person_links[value] = value
        for short, matches in candidates.items():
            self._person_links[short] = next(iter(matches)) if len(matches) == 1 else short
        return {short:next(iter(matches)) for short,matches in candidates.items() if len(matches)==1}

    def get(self, label: str, value: str, entity_id=None) -> str:
        # Exact matching avoids silently merging distinct case-sensitive account identities.
        if label == 'PERSON' and entity_id is None:
            value = self._person_links.get(value, value)
        # Email addresses are matched without case: Anna@Example.org and anna@example.org are one mailbox.
        if label == "EMAIL":
            value = value.casefold()
        key = (label, "id", entity_id) if entity_id is not None else (label, "value", value)
        if key not in self._values:
            while True:
                self._counters[label] = self._counters.get(label, 0) + 1
                alias = f"[{label}_{self._counters[label]}]"
                if alias not in self._reserved:
                    break
            self._values[key] = alias
        return self._values[key]


def replacement(span: Span, value: str, action: str, aliases: Aliases, entity_id=None) -> str:
    if action not in allowed_actions(span, value):
        raise ValueError("Action violates policy or transformation preconditions")
    if action == "KEEP":
        return value
    if action == "DROP":
        return ""
    if action == "ALIAS":
        return aliases.get(span.label, value, entity_id=entity_id)
    if action == "GENERALISE":
        lower = int(value) // 10 * 10
        return f"{lower}–{lower + 9}"
    return f"[{span.label}]"
