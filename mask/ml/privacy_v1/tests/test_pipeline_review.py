"""Adversarial structural checks using controlled proposals, not accuracy claims."""
from mask.ml.privacy_v1.contracts import ACTIONS, RELEVANCE, Prediction, Span
from mask.ml.privacy_v1.engine import Protector, RulesModel


class ControlledModel(RulesModel):
    def __init__(self, source, *, learned=(), choices=None):
        self.source = source
        self.learned = list(learned)
        self.choices = choices or {}

    def detect(self, text):
        return self.learned if text == self.source else []

    def predict(self, text, span, task, context=""):
        action, relevance = self.choices.get(span.label, ("KEEP", "essential"))
        return Prediction({a: float(a == action) for a in ACTIONS},
                          {r: float(r == relevance) for r in RELEVANCE})


def test_competing_section_interpretation_vetoes_destruction():
    text = "My salary pays for the 5 mg dose."
    model = ControlledModel(text, learned=[Span(0, len(text) - 1, "HEALTH", "controlled-tagger")],
                            choices={"FINANCIAL": ("DROP", "unnecessary"), "HEALTH": ("KEEP", "essential")})
    result = Protector(model).protect_text(text, "Preserve the treatment details.")
    assert result.protected_text == text
    assert not any(edit.action == "DROP" for edit in result.edits)


def test_context_with_embedded_identifier_still_vetoes_destruction():
    text = "My salary pays for care from Dr. Imani Hart."
    model = ControlledModel(text, learned=[Span(0, len(text) - 1, "HEALTH", "controlled-tagger")],
                            choices={"FINANCIAL": ("DROP", "unnecessary"), "HEALTH": ("KEEP", "essential")})
    result = Protector(model).protect_text(text, "Preserve the treatment details.")
    assert result.protected_text == text.replace("Imani Hart", "[PERSON_1]")
    assert not any(edit.action == "DROP" for edit in result.edits)


def test_pending_context_fragment_vetoes_section_drop():
    text = "My salary pays for specialist care."
    start = text.index("specialist care")
    model = ControlledModel(text, learned=[Span(start, start + len("specialist care"), "HEALTH", "controlled-tagger")],
                            choices={"FINANCIAL": ("DROP", "unnecessary")})
    result = Protector(model).protect_text(text, "Preserve the treatment details.")
    assert result.protected_text == text
    assert result.pending_reviews
    assert not any(edit.action == "DROP" for edit in result.edits)


def test_placeholder_prediction_does_not_authorise_whole_section_drop():
    text = "My rent is 900 euros. Keep the original wording."
    model = ControlledModel(text, choices={"FINANCIAL": ("PLACEHOLDER", "unnecessary")})
    result = Protector(model).protect_text(text, "List the useful facts.")
    assert result.protected_text == text
    assert not any(edit.action == "DROP" for edit in result.edits)


def test_adjacent_explicit_drops_preserve_neighbouring_facts():
    text = "Keep the 5 mg dose; my rent is 900 euros; my salary is 3000 euros; keep the date 2026-01-01."
    model = ControlledModel(text, choices={"FINANCIAL": ("DROP", "unnecessary")})
    result = Protector(model).protect_text(text, "Preserve doses and dates.")
    assert result.protected_text == "Keep the 5 mg dose; keep the date 2026-01-01."
    assert all(edit.action == "DROP" for edit in result.edits)


def test_last_semicolon_section_drop_preserves_sentence_ending():
    text = "Dose is 5 mg; my rent is 900 euros."
    model = ControlledModel(text, choices={"FINANCIAL": ("DROP", "unnecessary")})
    result = Protector(model).protect_text(text, "Preserve the dosage.")
    assert result.protected_text == "Dose is 5 mg."


def test_adjacent_final_semicolon_sections_preserve_sentence_ending():
    text = "Dose is 5 mg; my rent is 900 euros; my salary is 3000 euros."
    model = ControlledModel(text, choices={"FINANCIAL": ("DROP", "unnecessary")})
    result = Protector(model).protect_text(text, "Preserve the dosage.")
    assert result.protected_text == "Dose is 5 mg."


def test_retained_nested_fact_vetoes_section_drop():
    text = "My salary supports a patient aged 52."
    model = ControlledModel(text, choices={"FINANCIAL": ("DROP", "unnecessary"), "AGE": ("KEEP", "essential")})
    result = Protector(model).protect_text(text, "Preserve the age.")
    assert result.protected_text == text
    assert "section_contains_retained_fact" in result.review_reasons


def test_quoted_multiword_secret_is_protected_as_one_value():
    text = 'The password is "copper river lantern"; keep 12.5 mg unchanged.'
    result = Protector().protect_text(text, "Keep the dosage.")
    assert result.protected_text == 'The password is "[SECRET]"; keep 12.5 mg unchanged.'
    assert len([e for e in result.edits if e.label == "SECRET"]) == 1


def test_stable_alias_preserves_role_and_skips_literal_label_collision():
    text = ("The code [PERSON_1] is already in this note. "
            "My partner, Imani Hart, recorded my blood pressure. "
            "My partner, Imani Hart, also wrote the time.")
    result = Protector().protect_text(text, "Keep the observations.")
    assert result.protected_text == text.replace("Imani Hart", "[PERSON_2]")
    assert result.protected_text.count("[PERSON_2]") == 2
    assert result.status == "needs_review"
