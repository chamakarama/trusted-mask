"""Policy masks and deterministic substitutions, shared by both tracks."""
import re
from .contracts import DIRECT, Span

POLICY_VERSION = "consumer-v1-pilot.2"
COMPATIBLE_TRAINING_POLICIES = ("consumer-v1-pilot.1", POLICY_VERSION)


def allowed_actions(span: Span, value: str) -> tuple[str, ...]:
    if span.label == "PERSON":
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

    def get(self, label: str, value: str, entity_id=None) -> str:
        # Exact matching avoids silently merging distinct case-sensitive account identities.
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
