"""Claim isolated shards, resolve exact quotes, review, merge and compile v2 data."""
import argparse
import json
import os
import tempfile
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from ..contracts import DIRECT, LABELS
from ..data import (MAX_FILE_BYTES, SCHEMA, digest, record_digest, resolve_record,
                    validate_record, validate_records)


def read(path):
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Dataset exceeds file limit")
    content = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        value = json.loads(content)
        records = value if isinstance(value, list) else [value]
    else:
        records = [json.loads(line) for line in content.splitlines() if line.strip()]
    if not records or not all(isinstance(row, dict) for row in records):
        raise ValueError("Expected nonempty collection of JSON records")
    return records


def write_exclusive(path, text):
    """Publish a complete file atomically without replacing another producer's file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=path.parent, encoding="utf-8", delete=False) as stream:
            temp = Path(stream.name)
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp, path)
    finally:
        if temp is not None:
            temp.unlink(missing_ok=True)


def write_records(path, records, purpose):
    path = Path(path)
    manifest_path = path.with_suffix(".manifest.json")
    if path.exists() or manifest_path.exists():
        raise FileExistsError("Use new versioned output paths; evidence is never overwritten")
    encoded = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records)
    write_exclusive(path, encoded)
    manifest = {"purpose": purpose, "records": len(records), "sha256": digest(path),
                "splits": dict(Counter(r["split"] for r in records)),
                "families": len({r["family_id"] for r in records}),
                "review_statuses": dict(Counter(r.get("review", {}).get("status", "pending") for r in records)),
                "human_audited": False, "release_evidence": False,
                "word_count_ranges": dict(Counter("under_50" if len(r["text"].split()) < 50 else "over_150" if len(r["text"].split()) > 150 else "50_to_150" for r in records)),
                "training_adapter": SCHEMA if purpose == "compiled_training_data" else None}
    write_exclusive(manifest_path, json.dumps(manifest, indent=2) + "\n")
    return manifest


def claim(root, producer, split="train"):
    if split not in ("train", "dev"):
        raise ValueError("Mass authoring may claim train/dev only; reserve release evaluation separately")
    namespace = uuid.uuid4().hex
    directory = Path(root) / namespace
    directory.mkdir(parents=True, exist_ok=False)
    info = {"shard_id": namespace, "producer": producer, "generator_id": namespace + ":generator",
            "split": split, "created_utc": datetime.now(timezone.utc).isoformat(),
            "directory": str(directory), "instructions": "Write only within this owned shard; preserve other shards."}
    write_exclusive(directory / "claim.json", json.dumps(info, indent=2) + "\n")
    return info


def detection_projection(entities, text):
    """Nested contextual spans yield to direct IDs; preserve originals in v2 source."""
    for i, entity in enumerate(entities):
        for other in entities[i+1:]:
            overlap = entity["start"] < other["end"] and other["start"] < entity["end"]
            if overlap and entity["label"] in DIRECT and other["label"] in DIRECT:
                same = all(entity.get(k) == other.get(k) for k in ("start", "end", "label", "entity_id"))
                if not same:
                    raise ValueError("Conflicting overlapping direct-identifier annotations")
    boundaries = sorted({point for e in entities for point in (e["start"], e["end"])})
    result = []
    for start, end in zip(boundaries, boundaries[1:]):
        active = [e for e in entities if e["start"] <= start and e["end"] >= end]
        if not active:
            continue
        winner = max(active, key=lambda e: (e["label"] in DIRECT, -(e["end"] - e["start"]),
                                            -LABELS.index(e["label"])))
        if result and result[-1]["end"] == start and result[-1]["label"] == winner["label"]:
            result[-1]["end"] = end
        else:
            result.append({"start": start, "end": end, "label": winner["label"]})
    # Ignore whitespace-only fragments; never teach whitespace as a private entity.
    trimmed = []
    for span in result:
        while span["start"] < span["end"] and text[span["start"]].isspace():
            span["start"] += 1
        while span["end"] > span["start"] and text[span["end"]-1].isspace():
            span["end"] -= 1
        if span["start"] < span["end"]:
            trimmed.append(span)
    return trimmed


def compile_records(records, allow_unreviewed=False):
    validate_records(records)
    compiled = []
    for record in records:
        if record.get("schema_version") != 2:
            raise ValueError("Compile accepts only v2 authoring records")
        status = record.get("review", {}).get("status", "pending")
        if status == "rejected" or status != "accepted" and not allow_unreviewed:
            raise ValueError("Compilation requires independent accepted model review; use explicit smoke-only override for pending records")
        target = {k: record[k] for k in ("id", "family_id", "persona_id", "source_id", "template_id",
                                        "split", "text", "task", "language", "input_kind", "provenance")}
        target.update(schema_version=1, training_schema=SCHEMA, context="", source_record_sha256=record_digest(record),
                      detection_spans=detection_projection(record["entities"], record["text"]),
                      spans=[{k: d[k] for k in ("start", "end", "label", "action", "relevance")} for d in record["decisions"]],
                      required_facts=[record["text"][f["start"]:f["end"]] for f in record["required_facts"]],
                      approved_output=record["approved_output"], review=record.get("review", {"status": "pending"}))
        compiled.append(target)
    validate_records(compiled)
    return compiled


def apply_reviews(records, reviews):
    validate_records(records)
    indexed = {r["record_id"]: r for r in reviews}
    if len(indexed) != len(reviews):
        raise ValueError("Duplicate review record")
    if set(indexed) - {r["id"] for r in records}:
        raise ValueError("Review refers to an unknown record")
    result = []
    for record in records:
        copy = dict(record)
        if record["id"] in indexed:
            review = dict(indexed[record["id"]])
            review.pop("record_id")
            copy["review"] = review
        validate_record(copy)
        result.append(copy)
    return result


def merge_records(groups):
    records = [record for group in groups for record in group]
    flavors = {(r.get("schema_version", 1), r.get("training_schema")) for r in records}
    if len(flavors) != 1:
        raise ValueError("Merge one schema at a time; do not mix authored, compiled or legacy records")
    return validate_records(records)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("claim")
    p.add_argument("--root", type=Path, default=Path("mask/ml/privacy_v1/annotation/shards"))
    p.add_argument("--producer", required=True)
    p.add_argument("--split", choices=("train", "dev"), default="train")
    for command in ("resolve", "validate", "compile", "attach-reviews"):
        p = commands.add_parser(command)
        p.add_argument("--input", type=Path, required=True)
        if command != "validate":
            p.add_argument("--output", type=Path, required=True)
        if command == "compile":
            p.add_argument("--allow-unreviewed", action="store_true")
        if command == "attach-reviews":
            p.add_argument("--reviews", type=Path, required=True)
    p = commands.add_parser("merge")
    p.add_argument("--inputs", type=Path, nargs="+", required=True)
    p.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "claim":
        print(json.dumps(claim(args.root, args.producer, args.split), indent=2))
        return
    if args.command == "merge":
        records = merge_records(read(path) for path in args.inputs)
        print(json.dumps(write_records(args.output, records, "merged_authored_data")))
        return
    records = read(args.input)
    if args.command == "resolve":
        records = [resolve_record(record) for record in records]
    elif args.command == "compile":
        records = compile_records(records, args.allow_unreviewed)
    elif args.command == "attach-reviews":
        records = apply_reviews(records, read(args.reviews))
    validate_records(records)
    if args.command == "validate":
        print(json.dumps({"valid": True, "records": len(records), "sha256": digest(args.input),
                          "record_hashes": {r["id"]: record_digest(r) for r in records}}))
    else:
        purpose = "compiled_training_data" if args.command == "compile" else "authored_data"
        print(json.dumps(write_records(args.output, records, purpose)))


if __name__ == "__main__":
    main()
