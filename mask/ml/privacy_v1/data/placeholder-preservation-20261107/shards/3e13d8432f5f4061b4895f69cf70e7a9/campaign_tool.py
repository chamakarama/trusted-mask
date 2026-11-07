"""Coordinator helper for the placeholder-preservation campaign (read-only on inputs).

Run from the repository root with the privacy_v1 Python:
  PY .../campaign_tool.py stats  --input resolved-01.jsonl [--notes author-notes-01.jsonl]
  PY .../campaign_tool.py blind  --input resolved-01.jsonl --output blind-01.jsonl
  PY .../campaign_tool.py split  --input reviewed-01.jsonl --accepted accepted-01.jsonl --rejected rejected-01.jsonl
Outputs are exclusive-create; this tool never edits annotations.
"""
import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))
from mask.ml.privacy_v1.data import record_digest  # noqa: E402

BANNED = [
    (r"AKIA[0-9A-Z]{12,}", "aws-access-key"), (r"\bgh[pousr]_[A-Za-z0-9]{10,}", "github-token"),
    (r"github_pat_", "github-pat"), (r"xox[abprs]-", "slack-token"), (r"\b[sr]k_(live|test)_", "stripe-key"),
    (r"\bsk-[A-Za-z0-9-]{16,}", "openai/anthropic-style key"), (r"AIza[0-9A-Za-z_-]{20,}", "google-api-key"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----", "pem-private-key"), (r"\beyJ[A-Za-z0-9_-]{10,}\.", "jwt"),
]
TOKENIZER_PATH = Path("/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/artifacts/encoder-b-pilot/tokenizer.json")


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def write_exclusive(path, lines):
    with open(path, "x", encoding="utf-8") as handle:
        for line in lines:
            handle.write(json.dumps(line, ensure_ascii=False) + "\n")


def tokenizer():
    try:
        from tokenizers import Tokenizer
        return Tokenizer.from_file(str(TOKENIZER_PATH))
    except Exception:  # pragma: no cover - reported as unverified
        return None


def stats(args):
    records = read_jsonl(args.input)
    notes = {n["record_id"]: n for n in read_jsonl(args.notes)} if args.notes else {}
    tok = tokenizer()
    cats, segs, problems = collections.Counter(), collections.Counter(), []
    words, tokens, actions = [], [], collections.Counter()
    for r in records:
        w = len(r["text"].split())
        words.append(w)
        if tok:
            tokens.append(len(tok.encode(r["text"], r["task"]).ids))
        for d in r["decisions"]:
            actions[(d["label"], d["action"])] += 1
        n = notes.get(r["id"])
        if notes and not n:
            problems.append(f"{r['id']}: missing author note")
        if n:
            cats[n.get("category")] += 1
            segs[(n.get("category"), n.get("segment"))] += 1
            if n.get("category") == "benign" and (r["entities"] or r["decisions"] or r["approved_output"] != r["text"]):
                problems.append(f"{r['id']}: benign record has entities/decisions/edits")
            if n.get("category") != "benign" and not r["decisions"]:
                problems.append(f"{r['id']}: non-benign record has no decisions")
        if not 100 <= w <= 180:
            problems.append(f"{r['id']}: {w} words (target 100-180)")
        for pattern, name in BANNED:
            if re.search(pattern, r["text"]) or re.search(pattern, r["task"]):
                problems.append(f"{r['id']}: banned credential format ({name})")
    for key in ("family_id", "persona_id", "source_id", "template_id"):
        seen = collections.Counter(r[key] for r in records)
        for value, count in seen.items():
            if count > 1:
                problems.append(f"{key} {value} reused by {count} records (campaign wants one family per record)")
    texts = collections.Counter(r["text"] for r in records)
    problems += [f"duplicate text x{c}" for t, c in texts.items() if c > 1]
    out = {
        "records": len(records), "words_min": min(words), "words_max": max(words),
        "words_mean": round(sum(words) / len(words), 1),
        "tokens_max_text_plus_task": max(tokens) if tokens else "unverified",
        "categories": dict(cats), "category_segment": {f"{c}/{s}": v for (c, s), v in sorted(segs.items())},
        "actions": {f"{l}:{a}": v for (l, a), v in sorted(actions.items())},
        "record_hashes": {r["id"]: record_digest(r) for r in records} if args.hashes else "use validate for hashes",
        "problems": problems,
    }
    print(json.dumps(out, indent=2, ensure_ascii=False))


def blind(args):
    write_exclusive(args.output, [{"record_id": r["id"], "text": r["text"], "task": r["task"]} for r in read_jsonl(args.input)])
    print(f"wrote {args.output}")


def split(args):
    records = read_jsonl(args.input)
    accepted = [r for r in records if r.get("review", {}).get("status") == "accepted"]
    rejected = [r for r in records if r.get("review", {}).get("status") == "rejected"]
    pending = len(records) - len(accepted) - len(rejected)
    write_exclusive(args.accepted, accepted)
    write_exclusive(args.rejected, rejected)
    print(json.dumps({"accepted": len(accepted), "rejected": len(rejected), "pending": pending}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("stats"); p.add_argument("--input", required=True); p.add_argument("--notes"); p.add_argument("--hashes", action="store_true")
    p = sub.add_parser("blind"); p.add_argument("--input", required=True); p.add_argument("--output", required=True)
    p = sub.add_parser("split"); p.add_argument("--input", required=True); p.add_argument("--accepted", required=True); p.add_argument("--rejected", required=True)
    args = parser.parse_args()
    {"stats": stats, "blind": blind, "split": split}[args.command](args)


if __name__ == "__main__":
    main()
