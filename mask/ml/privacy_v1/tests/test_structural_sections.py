import json
import pytest
from mask.ml.privacy_v1.contracts import ACTIONS, RELEVANCE, Prediction, Span
from mask.ml.privacy_v1.engine import Protector, RulesModel
from mask.ml.privacy_v1.sections import SECTION_MODE, section_units, section_drop_bounds, section_targets


class Model(RulesModel):
    def __init__(self, text, *, fragments=(), keep_fragment=False, uncertain=False):
        self.text, self.fragments = text, fragments
        self.keep_fragment, self.uncertain = keep_fragment, uncertain
    def detect(self, text):
        return list(self.fragments) if text == self.text else []
    def predict(self, text, span, task, context=""):
        value = text[span.start:span.end]
        relevant = "keep both" in task.lower() or "current" in value.lower() or text != self.text
        relevant |= self.keep_fragment and any(span == f for f in self.fragments)
        action, rel = ("KEEP", "essential") if relevant else ("DROP", "unnecessary")
        if self.uncertain:
            rel = "uncertain"
        return Prediction({a: float(a == action) for a in ACTIONS},
                          {r: float(r == rel) for r in RELEVANCE})


def test_undetected_paragraph_is_considered_and_task_changes_decision():
    text = "Current note: preserve the exact dose.\n\nArchived visit: private detail. Follow-up resolved."
    model = Model(text)
    old = Protector(model).protect_text(text, "Explain current note only")
    assert old.protected_text == text
    new = Protector(model, section_mode=SECTION_MODE).protect_text(text, "Explain current note only")
    assert new.protected_text == "Current note: preserve the exact dose."
    assert new.section_diagnostics[-1]["outcome"] == "DROP"
    assert len(new.section_diagnostics[-1]["probes"]) == 4
    both = Protector(model, section_mode=SECTION_MODE).protect_text(text, "Keep both visits")
    assert both.protected_text == text


def test_partial_ner_boundary_can_be_resolved_by_section_and_evidence_agreement():
    text = "Current dose is unchanged.\n\nArchived visit: itching was reported. It later resolved."
    a = text.index("itching")
    fragment = Span(a, a+7, "HEALTH", "test")
    model = Model(text, fragments=[fragment])
    result = Protector(model, section_mode=SECTION_MODE).protect_text(text, "Explain current dose")
    assert result.protected_text == "Current dose is unchanged."
    assert result.section_diagnostics[-1]["evidence_probes"][0]["applied_action"] == "DROP"


def test_essential_fragment_vetoes_whole_paragraph_removal():
    text = "Current note stays.\n\nArchived visit: a measurement is still relevant."
    a = text.index("measurement")
    f = Span(a, a+11, "HEALTH", "test")
    result = Protector(Model(text, fragments=[f], keep_fragment=True), section_mode=SECTION_MODE).protect_text(text, "Explain current note")
    assert result.protected_text == text
    assert result.section_diagnostics[-1]["reason"] == "section_contains_retained_or_uncertain_evidence"


def test_uncertainty_does_not_authorise_deletion():
    text = "Archived detail."
    result = Protector(Model(text, uncertain=True), section_mode=SECTION_MODE).protect_text(text, "Summarise")
    assert result.protected_text == text
    assert result.section_diagnostics[0]["reason"] == "uncertain_treatment"


def test_identifiers_in_kept_section_still_protected_and_traces_have_no_raw_text():
    text = "Current patient name: Imani Hart. Email: imani@example.invalid."
    r = Protector(Model(text), section_mode=SECTION_MODE).protect_text(text, "Explain current note")
    assert "[PERSON_1]" in r.protected_text and "[EMAIL_1]" in r.protected_text
    trace = json.dumps(r.section_diagnostics)
    assert "Imani" not in trace and "imani@example" not in trace
    assert r.runtime_versions["section_mode"] == SECTION_MODE


def test_unicode_and_crlf_boundaries_and_drop_preserve_other_bytes():
    text = "Current café: 2.5 mg.\r\n\r\nOld 🩺 note.\r\nSecond line.\r\n"
    units = list(section_units(text)); assert len(units) == 2
    a, b = section_drop_bounds(text, *units[1])
    assert text[:a]+text[b:] == "Current café: 2.5 mg."
    with pytest.raises(ValueError):
        section_drop_bounds(text, units[1][0]+1, units[1][1])


def test_section_target_projection_does_not_invent_labels_or_drop_required_facts():
    text = "Needed fact. Unrelated phrase.\n\nOld note. Second old note.\n\nUnlabelled text."
    old = text.index("Old note")
    r = {"text": text, "decisions": [
        {"start": old, "end": text.index("\n\nUnlabelled"), "action": "DROP", "relevance": "unnecessary"}],
        "required_facts": [{"start": 0, "end": 12}]}
    targets = section_targets(r)
    assert [t["target"] for t in targets] == ["essential", "unnecessary", None]
    assert [(t["start"],t["end"]) for t in targets] == list(section_units(text))


def test_adjacent_drops_are_coherent_and_leave_retained_section_exact():
    text = "First old note.\n\nSecond old note.\n\nCurrent note stays."
    r = Protector(Model(text), section_mode=SECTION_MODE).protect_text(text, "Explain current note")
    assert r.protected_text == "Current note stays."
    assert len(r.edits) == 1


def test_section_limit_fails_without_partial_output():
    text = "\n\n".join("Old note" for _ in range(65))
    r = Protector(Model(text), section_mode=SECTION_MODE).protect_text(text, "Summarise")
    assert r.status == "unsupported" and r.protected_text is None


def test_legacy_mode_remains_default_and_unknown_mode_rejected():
    assert Protector().section_mode == "legacy"
    with pytest.raises(ValueError):
        Protector(section_mode="remove-everything")


def test_structural_deletion_does_not_remove_goal_or_conversation_history():
    class AlwaysDrop(Model):
        def predict(self, text, span, task, context=""):
            return Prediction({a:float(a=="DROP") for a in ACTIONS},
                              {r:float(r=="unnecessary") for r in RELEVANCE})
    model=AlwaysDrop("old detail")
    r=Protector(model,section_mode=SECTION_MODE).protect_text("old detail", "Preserve this goal", ["Earlier message"])
    assert r.protected_task=="Preserve this goal"
    assert r.protected_history==["Earlier message"]


def test_clause_mode_can_remove_unrelated_clause_inside_mixed_paragraph():
    from mask.ml.privacy_v1.sections import CLAUSE_MODE
    text="Current dose remains unchanged; old unrelated detail."
    r=Protector(Model(text),section_mode=CLAUSE_MODE).protect_text(text,"Explain current dose")
    assert r.protected_text=="Current dose remains unchanged."
    assert r.section_diagnostics[-1]["outcome"]=="DROP"


def test_clause_targets_match_inference_boundaries_and_preserve_mixed_paragraph():
    from mask.ml.privacy_v1.sections import CLAUSE_MODE
    text="Needed fact; old detail."
    r={"text":text,"decisions":[{"start":13,"end":len(text),"action":"DROP","relevance":"unnecessary"}],
       "required_facts":[{"start":0,"end":11}]}
    targets=section_targets(r,CLAUSE_MODE)
    assert [x["target"] for x in targets]==["essential","unnecessary"]
    assert [(x["start"],x["end"]) for x in targets]==list(section_units(text,CLAUSE_MODE))
