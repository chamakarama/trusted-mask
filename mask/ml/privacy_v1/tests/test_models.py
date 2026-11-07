import copy
import json
import socket
import numpy as np
import pytest
from mask.ml.privacy_v1.bundle import load_model, verify, write_manifest
from mask.ml.privacy_v1.custom import CustomModel, LinearHead
from mask.ml.privacy_v1.contracts import Span
from mask.ml.privacy_v1.data import load_records
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.features import decode_bio, tokens
from mask.ml.privacy_v1.make_pilot import build


@pytest.fixture(scope="module")
def trained():
    return CustomModel.train([r for r in build() if r["split"] == "train"])


def test_export_reload_parity_and_offline(trained, tmp_path, monkeypatch):
    directory = tmp_path / "bundle"
    trained.save(directory)
    write_manifest(directory, {"track": "custom-a"})
    monkeypatch.setattr(socket, "socket", lambda *a, **k: (_ for _ in ()).throw(AssertionError("Network forbidden")))
    loaded = load_model(directory)
    record = build()[0]
    span = Span(**{k: record["spans"][0][k] for k in ("start", "end", "label")})
    assert trained.predict(record["text"], span, record["task"]) == loaded.predict(record["text"], span, record["task"])
    assert trained.detect(record["text"]) == loaded.detect(record["text"])
    before = Protector(trained).protect_text(record["text"], record["task"]).as_dict()
    after = Protector(loaded).protect_text(record["text"], record["task"]).as_dict()
    before.pop("runtime_versions")
    after.pop("runtime_versions")
    assert before == after


def test_corruption_and_extra_assets_rejected(trained, tmp_path):
    directory = tmp_path / "bundle"
    trained.save(directory)
    write_manifest(directory, {"track": "custom-a"})
    (directory / "unexpected.json").write_text("{}")
    with pytest.raises(ValueError):
        verify(directory)
    (directory / "unexpected.json").unlink()
    (directory / "action.npz").write_bytes(b"corrupt")
    with pytest.raises(ValueError):
        load_model(directory)


def test_vocab_fitted_only_on_train(trained):
    assert "word=unseen_validation_canary" not in trained.detector.vocabulary
    before = dict(trained.detector.vocabulary)
    trained.detect("unseen_validation_canary")
    assert before == trained.detector.vocabulary


def test_binary_head_matches_sklearn():
    head = LinearHead().fit([{"x": 0}, {"x": 1}, {"x": 4}, {"x": 5}], ["a", "a", "b", "b"])
    result = head.predict({"x": 2})
    expected = 1 / (1 + np.exp(-(head.weights[0, 0] * 2 + head.bias[0])))
    assert result["b"] == pytest.approx(expected)


def test_bio_does_not_join_across_nonentity():
    sequence = tokens("Jane met Joe Smith")
    spans = decode_bio(sequence, ["B-PERSON", "O", "I-PERSON", "I-PERSON"], "test")
    assert [(s.start, s.end) for s in spans] == [(0, 4), (9, 18)]


def test_pilot_is_development_only(tmp_path):
    records = build()
    assert len(records) == 384
    assert {r["split"] for r in records} == {"train", "dev"}
    assert all(not r["provenance"]["human_audited"] for r in records)
    path = tmp_path / "pilot.jsonl"
    path.write_text("\n".join(map(json.dumps, records)))
    assert len(load_records(path)) == 384
    bad = copy.deepcopy(records[0])
    bad["id"] = "different-id"
    bad["split"] = "test"
    with path.open("a") as stream:
        stream.write("\n" + json.dumps(bad))
    with pytest.raises(ValueError, match="leakage"):
        load_records(path)
