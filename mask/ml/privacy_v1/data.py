"""Versioned annotation loading, exact replay and cross-split leakage checks.

v1 is the historical engineering pilot. v2 separates entity supervision from
treatment decisions so a dropped paragraph never becomes an entity tag.
"""
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from .contracts import ACTIONS, DIRECT, RELEVANCE, Span
from .policy import Aliases, allowed_actions, replacement

SPLITS = ("train", "dev", "validation", "test")
SCHEMA = "privacy-v2-separated"
MAX_FILE_BYTES = 128 * 1024 * 1024


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def record_digest(record):
    """Review identifies immutable annotation content, excluding review metadata."""
    data = {k: v for k, v in record.items() if k != "review"}
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _require_string(record, key, maximum=32000):
    value = record.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or "\x00" in value:
        raise ValueError(f"Invalid {key}")
    return value


def _bounds(text, entry):
    if type(entry.get("start")) is not int or type(entry.get("end")) is not int:
        raise ValueError("Offsets must be integer Unicode code points")
    if not 0 <= entry["start"] < entry["end"] <= len(text):
        raise ValueError("Invalid annotation bounds")
    if "quote" in entry and text[entry["start"]:entry["end"]] != entry["quote"]:
        raise ValueError("Quote does not match exact source offsets")


def resolve_quote(text, entry):
    """Resolve an exact quote; repeated quotes require explicit 1-based occurrence."""
    result = dict(entry)
    quote = _require_string(result, "quote")
    # Lookahead includes overlapping occurrences, e.g. "aa" in "aaa".
    matches = [m.start() for m in re.finditer("(?=" + re.escape(quote) + ")", text)]
    occurrence = result.pop("occurrence", None)
    if not matches:
        raise ValueError("Annotation quote is not present in source")
    if occurrence is None:
        if len(matches) != 1:
            raise ValueError("Ambiguous quote: specify a 1-based occurrence")
        occurrence = 1
    if type(occurrence) is not int or not 1 <= occurrence <= len(matches):
        raise ValueError("Invalid quote occurrence")
    start = matches[occurrence - 1]
    if "start" in result and result["start"] != start or "end" in result and result["end"] != start + len(quote):
        raise ValueError("Supplied offsets disagree with resolved quote")
    result.update(start=start, end=start + len(quote))
    return result


def resolve_record(record):
    record = json.loads(json.dumps(record))
    if record.get("schema_version") != 2:
        raise ValueError("Quote authoring requires schema_version 2")
    text = _require_string(record, "text")
    for field in ("entities", "decisions", "required_facts"):
        record[field] = [resolve_quote(text, entry) for entry in record.get(field, [])]
    return record


def replay(record):
    """Exactly replay decisions using the runtime's deterministic action registry."""
    text = record["text"]
    aliases = Aliases(text + "\n" + record["task"])
    pieces, cursor = [], 0
    for decision in record["decisions"]:
        span = Span(decision["start"], decision["end"], decision["label"])
        pieces.append(text[cursor:span.start])
        value = text[span.start:span.end]
        pieces.append(replacement(span, value, decision["action"], aliases,
                                  entity_id=decision.get("entity_id")))
        cursor = span.end
    pieces.append(text[cursor:])
    return "".join(pieces)


def _validate_targets(text, targets):
    end = 0
    for entry in targets:
        _bounds(text, entry)
        span = Span(entry["start"], entry["end"], entry.get("label"))
        span.validate(text)
        if span.start < end:
            raise ValueError("Decision spans must be sorted and nonoverlapping; author minimal contextual spans or one covering section DROP")
        end = span.end
        if entry.get("action") not in ACTIONS or entry.get("relevance") not in RELEVANCE:
            raise ValueError("Invalid target")
        if entry["action"] not in allowed_actions(span, text[span.start:span.end]):
            raise ValueError("Annotation violates policy or action preconditions")


def validate_record(record):
    for key in ("id", "family_id", "persona_id", "text", "task"):
        _require_string(record, key, 32000 if key == "text" else 4000)
    if record.get("split") not in SPLITS:
        raise ValueError("Invalid split")
    version = record.get("schema_version", 1)
    if version == 1:
        _validate_targets(record["text"], record["spans"])
        if "detection_spans" in record:
            end = 0
            for entry in record["detection_spans"]:
                _bounds(record["text"], entry)
                Span(entry["start"], entry["end"], entry.get("label")).validate(record["text"])
                if entry["start"] < end:
                    raise ValueError("Compiled detection spans overlap")
                end = entry["end"]
        return
    if version != 2:
        raise ValueError("Unsupported annotation schema")
    if record.get("language") != "en" or record.get("input_kind") != "message":
        raise ValueError("v2 authoring currently supports English messages only")
    if record.get("history") or record.get("context"):
        raise ValueError("History/context authoring needs separate coverage; v2 message scope excludes them")
    namespace = _require_string(record, "shard_id", 32)
    if not re.fullmatch(r"[0-9a-f]{32}", namespace):
        raise ValueError("Invalid shard UUID namespace")
    for key in ("id", "family_id", "persona_id", "source_id", "template_id"):
        if not _require_string(record, key).startswith(namespace + ":"):
            raise ValueError(f"{key} must be namespaced by its shard")
    provenance = record.get("provenance", {})
    if provenance.get("synthetic") is not True or provenance.get("human_audited") is not False:
        raise ValueError("This workflow requires synthetic, non-human-audited provenance")
    generator = _require_string(provenance, "generator_id", 200)
    _require_string(provenance, "generator_model", 200)
    for field in ("entities", "decisions", "required_facts"):
        if not isinstance(record.get(field), list) or len(record[field]) > 1000:
            raise ValueError(f"Invalid {field} collection")
    text, mentions = record["text"], {}
    entity_labels = {}
    for entry in record["entities"]:
        _bounds(text, entry)
        span = Span(entry["start"], entry["end"], entry.get("label"))
        span.validate(text)
        identifier = _require_string(entry, "id", 200)
        identity = _require_string(entry, "entity_id", 200)
        if identifier in mentions:
            raise ValueError("Duplicate mention id")
        if identity in entity_labels and entity_labels[identity] != span.label:
            raise ValueError("One entity identity cannot have conflicting labels")
        entity_labels[identity] = span.label
        mentions[identifier] = entry
    _validate_targets(text, record["decisions"])
    for entry in record["decisions"]:
        kind = entry.get("kind")
        if kind not in ("entity", "section"):
            raise ValueError("Decision kind must be entity or section")
        if entry["action"] == "ROLE":
            raise ValueError("ROLE is not supported for this data campaign")
        if kind == "section":
            if entry["action"] != "DROP" or entry["relevance"] != "unnecessary":
                raise ValueError("Section decisions must be unnecessary DROP")
            if entry["label"] in DIRECT or entry.get("entity_id"):
                raise ValueError("Section DROP needs a contextual category, not an identity")
            _require_string(entry, "reason", 1000)
        else:
            target = mentions.get(entry.get("target_id"))
            if not target or any(entry.get(k) != target.get(k) for k in ("start", "end", "label", "entity_id")):
                raise ValueError("Entity decision must exactly reference a known mention")
            if entry["action"] == "DROP":
                raise ValueError("Drop unnecessary sections, not individual identity mentions")
            if entry["label"] == "PERSON" and entry["action"] != "ALIAS":
                raise ValueError("Private PERSON mentions require stable ALIAS")
    for entity in record["entities"]:
        covering = [d for d in record["decisions"] if d["start"] <= entity["start"] and d["end"] >= entity["end"]]
        if not any(d.get("target_id") == entity["id"] or d["kind"] == "section" for d in covering):
            raise ValueError("Every sensitive entity needs a decision or covering section DROP")
    output = replay(record)
    if record.get("approved_output") != output:
        raise ValueError("approved_output differs from exact deterministic replay")
    for fact in record["required_facts"]:
        _bounds(text, fact)
        for decision in record["decisions"]:
            if decision["action"] != "KEEP" and decision["start"] < fact["end"] and fact["start"] < decision["end"]:
                raise ValueError("An edit changes a required source fact")
        if text[fact["start"]:fact["end"]] not in output:
            raise ValueError("Required fact missing from replay")
    review = record.get("review", {"status": "pending"})
    if review.get("status") not in ("pending", "accepted", "rejected"):
        raise ValueError("Invalid review status")
    if review["status"] != "pending":
        reviewer = _require_string(review, "reviewer_id", 200)
        if reviewer == generator or review.get("review_type") != "model":
            raise ValueError("Requires separate model reviewer; do not self-certify or invent human review")
        if review.get("record_sha256") != record_digest(record):
            raise ValueError("Review is stale or applies to different source/annotations")


def _source_signature(record):
    text = record["text"]
    entities = record.get("entities", record.get("detection_spans", record.get("spans", [])))
    for entity in sorted(entities, key=lambda s: s["start"], reverse=True):
        if entity["label"] in DIRECT:
            text = text[:entity["start"]] + " IDENTIFIER " + text[entity["end"]:]
    text = re.sub(r"\d+(?:[.,:/-]\d+)*", " NUMBER ", unicodedata.normalize("NFKC", text).casefold())
    return tuple(re.findall(r"\w+", text))


def validate_records(records):
    """Fail on reused groups, exact texts or near-identical templates across splits."""
    ids, registries, signatures, source_annotations = set(), {}, {}, {}
    shingle_index, prior_shingles, prior_splits = {}, [], []
    for record in records:
        validate_record(record)
        if record["id"] in ids:
            raise ValueError("Duplicate record id")
        ids.add(record["id"])
        split = record["split"]
        for key in ("family_id", "persona_id", "source_id", "template_id", "text"):
            value = record.get(key)
            if value is None:
                continue
            registry = registries.setdefault(key, {})
            if value in registry and registry[value] != split:
                raise ValueError("Source/persona leakage across splits")
            registry[value] = split
        # Preserve historical pilot evidence; stronger template checks apply to v2.
        if record.get("schema_version") != 2 and record.get("training_schema") != SCHEMA:
            continue
        detection = record.get("entities", record.get("detection_spans", []))
        annotation_key = tuple(sorted((e["start"], e["end"], e["label"]) for e in detection))
        if record["text"] in source_annotations and source_annotations[record["text"]] != annotation_key:
            raise ValueError("Detection annotations must not change when only the task changes")
        source_annotations[record["text"]] = annotation_key
        words = _source_signature(record)
        if words in signatures and signatures[words] != split:
            raise ValueError("Normalised source/template leakage across splits")
        signatures[words] = split
        shingles = {words[i:i+5] for i in range(max(0, len(words) - 4))}
        candidates = {i for shingle in shingles for i in shingle_index.get(shingle, [])}
        for i in candidates:
            old = prior_shingles[i]
            union = shingles | old
            if prior_splits[i] != split and len(shingles & old) >= 10 and len(shingles & old) / max(1, len(union)) >= 0.9:
                raise ValueError("Near-duplicate source leakage across splits; group the family together")
        i = len(prior_shingles)
        prior_shingles.append(shingles)
        prior_splits.append(split)
        for shingle in shingles:
            shingle_index.setdefault(shingle, []).append(i)
    return records


def load_records(path):
    path = Path(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("Annotation file exceeds bounded loader limit")
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not records:
        raise ValueError("Empty annotation file")
    validate_records(records)
    if any(r.get("schema_version") == 2 for r in records):
        raise ValueError("v2 authoring records must be compiled before training; use annotation.tools compile")
    return records
