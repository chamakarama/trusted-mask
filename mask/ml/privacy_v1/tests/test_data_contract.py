import copy
import json
from pathlib import Path
import pytest
from mask.ml.privacy_v1.annotation.tools import (apply_reviews, claim, compile_records,
                                               detection_projection, merge_records, write_records)
from mask.ml.privacy_v1.data import (SCHEMA, load_records, record_digest, replay,
                                     resolve_quote, resolve_record, validate_record, validate_records)
from mask.ml.privacy_v1.make_pilot import build


EXAMPLE = Path(__file__).resolve().parents[1] / "annotation" / "example.authoring.json"


def example():
    return resolve_record(json.loads(EXAMPLE.read_text()))


def accepted(record):
    copy = dict(record)
    copy["review"] = {"status": "accepted", "review_type": "model", "reviewer_id": "independent-reviewer-session",
                      "record_sha256": record_digest(record), "notes": "Fixture review for test only"}
    return copy


def test_resolve_unicode_and_ambiguous_quotes():
    assert resolve_quote("😀 Zoe arrived.", {"quote": "Zoe"})["start"] == 2
    with pytest.raises(ValueError, match="Ambiguous"):
        resolve_quote("Zoe met Zoe", {"quote": "Zoe"})
    assert resolve_quote("Zoe met Zoe", {"quote": "Zoe", "occurrence": 2})["start"] == 8
    with pytest.raises(ValueError, match="disagree"):
        resolve_quote("Zoe", {"quote": "Zoe", "start": 1})
    with pytest.raises(ValueError, match="Ambiguous"):
        resolve_quote("aaa", {"quote": "aa"})
    assert resolve_quote("aaa", {"quote": "aa", "occurrence": 2})["start"] == 1


def test_exact_alias_and_section_drop_replay():
    record = example()
    validate_record(record)
    assert "My partner, [PERSON_1]," in replay(record)
    assert "rent" not in replay(record)
    assert "135/85" in replay(record)


def test_approved_output_and_required_facts_are_not_self_scored():
    record = example()
    record["approved_output"] += " invented content"
    with pytest.raises(ValueError, match="approved_output"):
        validate_record(record)
    record = example()
    record["required_facts"].append(resolve_quote(record["text"], {"quote": "900 euros"}))
    with pytest.raises(ValueError, match="required source fact"):
        validate_record(record)


def test_alias_priority_and_missing_entity_decision():
    record = example()
    record["decisions"][0]["action"] = "DROP"
    with pytest.raises(ValueError):
        validate_record(record)
    record = example()
    record["decisions"] = record["decisions"][1:]
    with pytest.raises(ValueError, match="Every sensitive entity"):
        validate_record(record)


def test_review_is_independent_and_content_bound():
    record = accepted(example())
    validate_record(record)
    record["task"] += " Changed task."
    with pytest.raises(ValueError, match="stale"):
        validate_record(record)
    record = accepted(example())
    record["review"]["reviewer_id"] = record["provenance"]["generator_id"]
    with pytest.raises(ValueError, match="separate model reviewer"):
        validate_record(record)


def test_compiler_keeps_section_labels_out_of_detector(tmp_path):
    record = accepted(example())
    compiled = compile_records([record])
    out = compiled[0]
    assert out["training_schema"] == SCHEMA
    assert out["spans"][-1]["action"] == "DROP"
    section = out["spans"][-1]
    assert not any((s["start"], s["end"]) == (section["start"], section["end"]) for s in out["detection_spans"])
    path = tmp_path / "compiled.jsonl"
    manifest = write_records(path, compiled, "compiled_training_data")
    assert load_records(path) == compiled
    assert manifest["training_adapter"] == SCHEMA
    assert manifest["human_audited"] is False


def test_pending_and_rejected_compilation_fail_explicitly():
    with pytest.raises(ValueError, match="accepted model review"):
        compile_records([example()])
    assert compile_records([example()], allow_unreviewed=True)
    record = accepted(example())
    record["review"]["status"] = "rejected"
    with pytest.raises(ValueError):
        compile_records([record], allow_unreviewed=True)


def test_shards_are_unique_and_publication_never_overwrites(tmp_path):
    first, second = claim(tmp_path, "opus"), claim(tmp_path, "astra")
    assert first["shard_id"] != second["shard_id"]
    assert (Path(first["directory"]) / "claim.json").is_file()
    path = tmp_path / "records.jsonl"
    write_records(path, [example()], "test")
    before = path.read_bytes()
    with pytest.raises(FileExistsError):
        write_records(path, [example()], "test")
    assert before == path.read_bytes()


def test_namespaced_cross_split_near_duplicates_rejected():
    first, second = example(), example()
    new = "abcdef0123456789abcdef0123456789"
    second["shard_id"] = new
    for key in ("id", "family_id", "persona_id", "source_id", "template_id"):
        second[key] = new + ":other-" + key
    second["split"] = "dev"
    with pytest.raises(ValueError, match="leakage"):
        validate_records([first, second])


def test_nested_projection_and_conflicting_direct_spans():
    text = "Jane has asthma"
    entities = [{"start": 0, "end": len(text), "label": "HEALTH", "entity_id": "health"},
                {"start": 0, "end": 4, "label": "PERSON", "entity_id": "person"}]
    projected = detection_projection(entities, text)
    assert projected == [{"start": 0, "end": 4, "label": "PERSON"},
                         {"start": 5, "end": len(text), "label": "HEALTH"}]
    entities.append({"start": 1, "end": 4, "label": "PERSON", "entity_id": "other"})
    with pytest.raises(ValueError, match="Conflicting"):
        detection_projection(entities, text)


def test_raw_v2_cannot_accidentally_enter_legacy_trainer(tmp_path):
    path = tmp_path / "authored.jsonl"
    write_records(path, [example()], "test")
    with pytest.raises(ValueError, match="compiled before training"):
        load_records(path)


def test_review_attachment_and_legacy_pilot():
    record = example()
    review = {"record_id": record["id"], "record_sha256": record_digest(record), "status": "accepted",
              "reviewer_id": "second-agent", "review_type": "model", "notes": "Reviewed fixture only"}
    reviewed = apply_reviews([record], [review])[0]
    assert reviewed["review"]["status"] == "accepted"
    assert record["review"]["status"] == "pending"
    validate_records(build())


def test_history_and_fabricated_human_review_rejected():
    record = example()
    record["history"] = ["unannotated context"]
    with pytest.raises(ValueError, match="History/context"):
        validate_record(record)
    record = example()
    record["provenance"]["human_audited"] = True
    with pytest.raises(ValueError, match="non-human-audited"):
        validate_record(record)


def test_task_swap_cannot_change_detection_annotations():
    first, second = example(), example()
    second["id"] += ":other-task"
    second["task"] += " Use concise bullets."
    second["entities"].pop(1)
    second["decisions"].pop(1)
    validate_record(second)
    with pytest.raises(ValueError, match="must not change"):
        validate_records([first, second])


def test_merge_rejects_mixed_schemas():
    raw = example()
    compiled = compile_records([raw], allow_unreviewed=True)
    with pytest.raises(ValueError, match="one schema"):
        merge_records([[raw], compiled])


def test_source_id_cannot_cover_different_texts_in_one_split():
    first, second = example(), example()
    second["id"] += ":different-source"
    second["text"] += " Please use concise bullets."
    second["approved_output"] += " Please use concise bullets."
    with pytest.raises(ValueError, match="One source_id"):
        validate_records([first, second])


@pytest.mark.parametrize("key", ["source_id", "family_id", "persona_id", "template_id"])
def test_identical_text_requires_consistent_group_ids(key):
    first, second = example(), example()
    second["id"] += ":other-task"
    second["task"] += " Use concise bullets."
    second[key] += ":different"
    with pytest.raises(ValueError, match="Identical text"):
        validate_records([first, second])


def test_task_swaps_share_groups_but_paraphrases_can_share_family():
    first, second = example(), example()
    second["id"] += ":other-task"
    second["task"] += " Use concise bullets."
    third = copy.deepcopy(first)
    third["id"] += ":related-source"
    third["source_id"] += ":related-source"
    third["text"] += " Please use concise bullets."
    third["approved_output"] += " Please use concise bullets."
    assert validate_records([first, second, third]) == [first, second, third]


def test_compiled_data_retains_group_consistency_checks():
    first = compile_records([accepted(example())])[0]
    second = copy.deepcopy(first)
    second["id"] += ":other-task"
    second["task"] += " Use concise bullets."
    second["source_id"] += ":different"
    with pytest.raises(ValueError, match="Identical text"):
        validate_records([first, second])
    second["source_id"] = first["source_id"]
    second["text"] += " Please use concise bullets."
    second["approved_output"] += " Please use concise bullets."
    with pytest.raises(ValueError, match="One source_id"):
        validate_records([first, second])
