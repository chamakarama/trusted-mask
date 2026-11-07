"""Integration checks use the pinned local checkpoint only when installed."""
from pathlib import Path
import socket
import pytest

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "artifacts" / "encoder-b-pilot"


@pytest.fixture(scope="module")
def encoder():
    if not BUNDLE.exists():
        pytest.skip("Run the documented encoder pilot training first")
    from mask.ml.privacy_v1.bundle import load_model
    return load_model(BUNDLE)


def test_encoder_runs_without_network(encoder, monkeypatch):
    from mask.ml.privacy_v1.contracts import Span
    from mask.ml.privacy_v1.engine import Protector
    monkeypatch.setattr(socket, "socket", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Network forbidden")))
    text = "My name is Alina Birch; I have asthma; email: demo@example.invalid."
    prediction = encoder.predict(text, Span(11, 22, "PERSON"), "Explain the health information")
    prediction.validate()
    result = Protector(encoder).protect_text(text, "Explain the health information")
    assert result.status == "needs_review"
    assert "demo@example.invalid" not in result.protected_text
    assert result.coverage["complete"]


def test_encoder_save_reload_prediction_parity(encoder, tmp_path, monkeypatch):
    from mask.ml.privacy_v1.encoder import EncoderModel
    from mask.ml.privacy_v1.contracts import Span
    directory = tmp_path / "bundle"
    encoder.save(directory)
    monkeypatch.setattr(socket, "socket", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Network forbidden")))
    loaded = EncoderModel.load(directory)
    text, span = "My name is Alina Birch", Span(11, 22, "PERSON")
    original, reloaded = encoder.predict(text, span, "Summarise"), loaded.predict(text, span, "Summarise")
    assert original.actions == pytest.approx(reloaded.actions, abs=1e-7)
    assert original.relevance == pytest.approx(reloaded.relevance, abs=1e-7)
    assert encoder.detect(text) == loaded.detect(text)


def test_encoder_long_context_fails_explicitly(encoder):
    from mask.ml.privacy_v1.engine import Protector
    result = Protector(encoder).protect_text("email: demo@example.invalid", "explain " * 600)
    assert result.status == "unsupported"
    assert result.protected_text is None


def test_encoder_table_context_limit_does_not_depend_on_action_head(encoder, tmp_path):
    from mask.ml.privacy_v1.engine import Protector
    from mask.ml.privacy_v1.tables import protect_table, UnsupportedFile
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("email\ndemo@example.invalid\n")
    with pytest.raises(UnsupportedFile, match="cell_inference_failed"):
        protect_table(Protector(encoder), source, output, "word " * 600)
    assert not output.exists()


def test_detection_windows_preserve_tail_offsets(encoder):
    text = "Ordinary words. " * 350 + "My name is Alina Birch; email: demo@example.invalid."
    spans = encoder.detect(text)
    assert spans
    assert all(0 <= s.start < s.end <= len(text) for s in spans)
    assert any(s.start > len(text) - 70 for s in spans)


def test_encoder_serves_csv_with_no_partial_output(encoder, tmp_path):
    from mask.ml.privacy_v1.engine import Protector
    from mask.ml.privacy_v1.tables import protect_table
    source, output = tmp_path / "input.csv", tmp_path / "protected.csv"
    source.write_text("email,note\ndemo@example.invalid,I have asthma\n")
    result = protect_table(Protector(encoder), source, output, "Explain the health information")
    assert result["coverage"]["scanned_nonempty_cells"] == 4
    assert "demo@example.invalid" not in output.read_text()
    assert result["status"] == "needs_review"
