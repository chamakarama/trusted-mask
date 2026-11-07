"""Build coverage.json and SOURCE_MANIFEST.json for the placeholder-preservation campaign.

Run from the repository root after `assemble.py merge`:
  PY .../build_coverage.py
Reads train.authored.jsonl, the assembly reviewed/accepted/rejected files, writer author notes and claims.
"""
import collections
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from mask.ml.privacy_v1.data import record_digest  # noqa: E402

RUN = Path("mask/ml/privacy_v1/data/placeholder-preservation-20261107")
S = RUN / "shards"
COORD = S / "3e13d8432f5f4061b4895f69cf70e7a9"
sys.path.insert(0, str(COORD))
from assemble import pairs  # noqa: E402

TOKENIZER = Path("/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/artifacts/encoder-b-pilot/tokenizer.json")


def rows(path):
    return [json.loads(l) for l in Path(path).read_text(encoding="utf-8").splitlines() if l.strip()]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


records = rows(RUN / "train.authored.jsonl")
ids = {r["id"] for r in records}

notes = {}
for shard in sorted({r["shard_id"] for r in records}):
    for nf in sorted((S / shard).glob("author-notes-01*.jsonl")):
        for n in rows(nf):
            notes[n["record_id"]] = n
missing_notes = sorted(ids - set(notes))

claims = {p.parent.name: json.loads(p.read_text()) for p in S.glob("*/claim.json")}

# first-pass vs revision accounting from assembly files
first_pass, revisions = collections.Counter(), collections.Counter()
seen_first = set()
for label, writer, resolved, reviewer, reviews in pairs():
    for r in rows(COORD / "assembly" / f"reviewed-{label}.jsonl"):
        status = r["review"]["status"]
        if r["id"] in seen_first:
            revisions[status] += 1
        else:
            first_pass[status] += 1
            seen_first.add(r["id"])

cat = collections.Counter()
catseg = collections.Counter()
seg = collections.Counter()
features = collections.Counter()
domains = collections.Counter()
formats = collections.Counter()
missing_meta = []
for r in records:
    n = notes.get(r["id"], {})
    c, s = n.get("category"), n.get("segment")
    if not c or not s:
        missing_meta.append(r["id"])
    cat[c] += 1
    seg[s] += 1
    catseg[f"{c}/{s}"] += 1
    for f in n.get("features", []) or []:
        features[f] += 1
    domains[str(n.get("domain"))] += 1
    formats[str(n.get("format"))] += 1

words = [len(r["text"].split()) for r in records]
buckets = collections.Counter()
for w in words:
    buckets["100-119" if w < 120 else "120-139" if w < 140 else "140-159" if w < 160 else "160-180" if w <= 180 else "other"] += 1
    if w < 100:
        buckets["under_100"] += 1

token_status = "unverified"
tok_max = None
try:
    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(str(TOKENIZER))
    lengths = [len(tok.encode(r["text"], r["task"]).ids) for r in records]
    tok_max = max(lengths)
    token_status = f"verified with local encoder-b-pilot (MiniLM) tokenizer: max text+task {tok_max} tokens, limit 512; DeBERTa tokenizer not checked"
except Exception as exc:  # pragma: no cover
    token_status = f"unverified ({exc})"

actions = collections.Counter()
relevance = collections.Counter()
person_mentions = 0
multi_person = 0
repeated_name = 0
benign_ok = 0
section_drops = 0
for r in records:
    people = collections.Counter(e["entity_id"] for e in r["entities"] if e["label"] == "PERSON")
    person_mentions += sum(people.values())
    multi_person += len(people) >= 2
    repeated_name += any(v >= 2 for v in people.values())
    if not r["entities"] and not r["decisions"] and r["approved_output"] == r["text"]:
        benign_ok += 1
    for d in r["decisions"]:
        actions[f"{d['label']}:{d['action']}"] += 1
        relevance[f"{d['action']}:{d['relevance']}"] += 1
        section_drops += d["kind"] == "section"

generators = collections.Counter(r["provenance"]["generator_model"] for r in records)
reviewers = collections.Counter(r["review"]["reviewer_id"].split(":reviewer:")[-1] for r in records)
reviewer_ids = sorted({r["review"]["reviewer_id"] for r in records})

coverage = {
    "campaign": "placeholder-preservation-20261107",
    "accepted_records": len(records),
    "unique_families": len({r["family_id"] for r in records}),
    "unique_sources": len({r["source_id"] for r in records}),
    "targets": {"identity": 180, "preservation": 60, "benign": 30, "credential_confidential": 30,
                "consumer": 210, "corporate": 90},
    "categories": dict(cat), "segments": dict(seg), "category_segment": dict(sorted(catseg.items())),
    "first_pass_reviews": dict(first_pass), "revision_reviews": dict(revisions),
    "rejected_versions_preserved": first_pass["rejected"] + revisions["rejected"],
    "length_words": {"min": min(words), "max": max(words), "mean": round(sum(words) / len(words), 1), "buckets": dict(buckets)},
    "token_fit": token_status,
    "decisions_by_label_action": dict(sorted(actions.items())),
    "decisions_by_action_relevance": dict(sorted(relevance.items())),
    "section_drop_decisions": section_drops,
    "section_targets": "not exported: no section_audit module on main and this campaign has no section DROP quota; see REPORT.md",
    "person_mentions": person_mentions, "records_with_2plus_people": multi_person,
    "records_with_repeated_person_mentions": repeated_name, "benign_records_with_no_edits": benign_ok,
    "author_note_features": dict(features.most_common()),
    "domains_top": dict(domains.most_common(40)), "formats": dict(formats.most_common()),
    "generator_models": dict(generators), "reviewer_models": dict(reviewers),
    "records_missing_author_notes": missing_notes, "records_missing_category_or_segment": missing_meta,
    "human_audited": False, "review_type": "model",
}
(RUN / "coverage.json").write_text(json.dumps(coverage, indent=2, ensure_ascii=False) + "\n")

manifest = {
    "campaign": "placeholder-preservation-20261107",
    "train_authored": {"path": str(RUN / "train.authored.jsonl"), "sha256": sha(RUN / "train.authored.jsonl"), "records": len(records)},
    "train_compiled": {"path": str(RUN / "train.jsonl"), "sha256": sha(RUN / "train.jsonl")},
    "accepted_inputs": [], "writer_shards": {}, "reviewer_shards": {},
    "generator_models": dict(generators), "reviewer_ids": reviewer_ids,
}
for label, writer, resolved, reviewer, reviews in pairs():
    acc = COORD / "assembly" / f"accepted-{label}.jsonl"
    manifest["accepted_inputs"].append({
        "label": label, "accepted_path": str(acc), "accepted_sha256": sha(acc),
        "writer_resolved": str(S / writer / resolved), "writer_resolved_sha256": sha(S / writer / resolved),
        "review_file": str(S / reviewer / reviews), "review_sha256": sha(S / reviewer / reviews)})
    manifest["writer_shards"][writer] = claims.get(writer, {}).get("producer")
    manifest["reviewer_shards"][reviewer] = claims.get(reviewer, {}).get("producer")
(RUN / "SOURCE_MANIFEST.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({k: coverage[k] for k in ("accepted_records", "unique_families", "category_segment", "first_pass_reviews",
                                           "revision_reviews", "length_words", "token_fit", "section_drop_decisions",
                                           "records_missing_author_notes", "records_missing_category_or_segment",
                                           "generator_models", "reviewer_models")}, indent=1))
