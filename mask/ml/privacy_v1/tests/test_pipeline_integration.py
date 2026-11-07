"""Public boundary checks for pipeline diagnostics, table review and fact fidelity."""
from mask.ml.privacy_v1.contracts import ACTIONS, RELEVANCE, Prediction, Span
from mask.ml.privacy_v1.engine import Protector, RulesModel
from mask.ml.privacy_v1.editing import drop_bounds
from mask.ml.privacy_v1.evaluate import evaluate
from mask.ml.privacy_v1.tables import protect_table


def test_repeated_known_full_name_overrides_partial_surname_detection():
    text = "My partner, Anika Rowe, recorded the reading; Anika Rowe did not have these symptoms."
    class PartialNameModel(RulesModel):
        def detect(self, value):
            start = text.rindex("Rowe")
            return [Span(start, start+4, "PERSON", "test")] if value == text else []
    result = Protector(PartialNameModel()).protect_text(text, "Keep who had the symptoms.")
    assert result.protected_text == text.replace("Anika Rowe", "[PERSON_1]")
    assert "did not have these symptoms" in result.protected_text


def test_final_paragraph_drop_removes_only_its_separator():
    text = "Keep the dosage.\n\nMy rent is 900 euros.\n"
    start, end = drop_bounds(text, text.index("My rent"), text.index("euros") + len("euros"))
    assert text[:start] + text[end:] == "Keep the dosage."


def test_essential_parent_preserves_contextual_fact_but_protects_name():
    class DisagreeingModel(RulesModel):
        def predict(self, text, span, task, context=""):
            action, relevance = ("KEEP", "essential") if span.label == "HEALTH" else ("PLACEHOLDER", "unnecessary")
            return Prediction({a: float(a == action) for a in ACTIONS},
                              {r: float(r == relevance) for r in RELEVANCE})
    text = "My mother, Imani Hart, had diabetes at age 52."
    result = Protector(DisagreeingModel()).protect_text(text, "Explain the family medical history.")
    assert result.protected_text == "My mother, [PERSON_1], had diabetes at age 52."
    assert any(s["label"] == "AGE" and s["reason"] == "essential_parent_context" for s in result.retained_sensitive)
    assert all(e.score is None for e in result.edits)


def test_detector_metrics_use_separate_targets_and_current_candidates():
    text = "email: demo@example.invalid. Salary is 900."
    email_start, email_end = text.index("demo"), text.index(". Salary")
    financial_start = text.index("Salary")
    class FragmentModel(RulesModel):
        def detect(self, value):
            return [Span(email_start, email_end - 3, "PERSON", "test")] if value == text else []
    record = {"text": text, "task": "Describe the contact details.", "spans": [
        {"start": financial_start, "end": len(text), "label": "FINANCIAL", "action": "DROP", "relevance": "unnecessary"}],
        "detection_spans": [
            {"start": email_start, "end": email_end, "label": "EMAIL"},
            {"start": financial_start, "end": len(text)-1, "label": "FINANCIAL"}],
        "required_facts": [{"start": text.index("900"), "end": text.index("900")+3}]}
    result = evaluate(FragmentModel(), [record])
    assert result["counts"]["gold_spans"] == 1
    assert result["counts"]["gold_detection_spans"] == 2
    assert result["exact_detector_recall"] == 1
    assert result["exact_detector_precision"] == 1
    assert result["draft_exact_fact_retention"] == 1
    assert result["automatic_coverage"] == 0


def test_unconfirmed_table_detection_retains_cell_and_reports_coordinates(tmp_path):
    class DoubtfulModel(RulesModel):
        def detect(self, text):
            return [Span(0, 2, "PERSON", "test")] if text == "52 samples" else []
    source, output = tmp_path / "source.csv", tmp_path / "protected.csv"
    source.write_text("note\n52 samples\n")
    report = protect_table(Protector(DoubtfulModel()), source, output, "Count the samples.")
    assert "52 samples" in output.read_text()
    assert report["pending_reviews"][0]["source_row"] == 2
    assert report["pending_reviews"][0]["source_column"] == 1
    assert report["pending_reviews"][0]["label"] == "PERSON"
    assert "52 samples" not in str(report)
