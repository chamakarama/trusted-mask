"""Coordinator assembly: attach hash-bound reviews, split accepted/rejected, then merge and compile.

Run from the repository root with the privacy_v1 Python:
  PY .../assemble.py attach      # writes reviewed/accepted/rejected files into this coordinator shard
  PY .../assemble.py merge       # merges explicit accepted paths and compiles the campaign train set
Every entry in PAIRS is explicit (no globs). Writer shards are read-only here.
"""
import json
import subprocess
import sys
from pathlib import Path

PY = "/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/.venv/bin/python"
RUN = Path("mask/ml/privacy_v1/data/placeholder-preservation-20261107")
S = RUN / "shards"
COORD = S / "3e13d8432f5f4061b4895f69cf70e7a9"
OUT = COORD / "assembly"

# (label, writer shard, resolved file, reviewer shard, review file)
PAIRS = [
    ("W1-01b", "4bb67ed080b844c9a99a4061abf1790c", "resolved-01b.jsonl", "f537c6bec1134ead912427dfa88ded8f", "reviews-W1-01.jsonl"),
    ("W1-01c", "4bb67ed080b844c9a99a4061abf1790c", "resolved-01c.jsonl", "f537c6bec1134ead912427dfa88ded8f", "reviews-W1-01c.jsonl"),
    ("W2-01b", "cefd48a24b2e4bbaa98e9a5bfa8f09e5", "resolved-01b.jsonl", "0a29b907ca9c4120a3840830897137e0", "reviews-W2-01.jsonl"),
    ("W2-01c", "cefd48a24b2e4bbaa98e9a5bfa8f09e5", "resolved-01c.jsonl", "0a29b907ca9c4120a3840830897137e0", "reviews-W2-01c.jsonl"),
    ("W3-01", "4f82c80c5e1d45e0ad885e2c8484ba72", "resolved-01.jsonl", "594441f227dd45f0b3b91868b7ef9a64", "reviews-W3-01.jsonl"),
    ("W3-01b", "4f82c80c5e1d45e0ad885e2c8484ba72", "resolved-01b.jsonl", "594441f227dd45f0b3b91868b7ef9a64", "reviews-W3-01b.jsonl"),
    ("W4-01", "ae64d1a237104214801e0267d24e9b70", "resolved-01.jsonl", "276fb5027a044ef7be50ec6cbf8f8f0f", "reviews-W4-01.jsonl"),
    ("W4-01b", "ae64d1a237104214801e0267d24e9b70", "resolved-01b.jsonl", "276fb5027a044ef7be50ec6cbf8f8f0f", "reviews-W4-01b.jsonl"),
    ("W5-01", "a67467e3f7a34acb83f361524acffbe3", "resolved-01.jsonl", "e386c6f5107c4b4a9f359c9194050abd", "reviews-W5-01.jsonl"),
    ("W5-01b", "a67467e3f7a34acb83f361524acffbe3", "resolved-01b.jsonl", "e386c6f5107c4b4a9f359c9194050abd", "reviews-W5-01b.jsonl"),
    ("W6-01", "1ac4217be1cb4ce1baaa910e177cda02", "resolved-01.jsonl", "7daa83e7e75c461da544deb57ca002f1", "reviews-W6-01.jsonl"),
    ("W6-01b", "1ac4217be1cb4ce1baaa910e177cda02", "resolved-01b.jsonl", "7daa83e7e75c461da544deb57ca002f1", "reviews-W6-01b.jsonl"),
]
EXTRA = COORD / "assembly-pairs-extra.json"  # batch-2 entries appended as JSON list of 5-item lists


def pairs():
    extra = json.loads(EXTRA.read_text()) if EXTRA.exists() else []
    return PAIRS + [tuple(p) for p in extra]


def tool(*args):
    result = subprocess.run([PY, "-m", "mask.ml.privacy_v1.annotation.tools", *map(str, args)],
                            capture_output=True, text=True)
    if result.returncode:
        sys.exit(f"tools {' '.join(map(str, args))} failed:\n{result.stderr}")
    return result.stdout


def rows(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


def attach():
    OUT.mkdir(exist_ok=True)
    summary = {}
    for label, writer, resolved, reviewer, reviews in pairs():
        reviewed = OUT / f"reviewed-{label}.jsonl"
        if not reviewed.exists():
            tool("attach-reviews", "--input", S / writer / resolved, "--reviews", S / reviewer / reviews, "--output", reviewed)
        records = rows(reviewed)
        for status in ("accepted", "rejected"):
            path = OUT / f"{status}-{label}.jsonl"
            if not path.exists():
                with open(path, "x", encoding="utf-8") as handle:
                    for r in records:
                        if r.get("review", {}).get("status") == status:
                            handle.write(json.dumps(r, ensure_ascii=False) + "\n")
        counts = {s: sum(r.get("review", {}).get("status") == s for r in records) for s in ("accepted", "rejected", "pending")}
        summary[label] = counts
    print(json.dumps(summary, indent=1))


def merge():
    accepted = [OUT / f"accepted-{label}.jsonl" for label, *_ in pairs()]
    accepted = [p for p in accepted if p.exists() and p.stat().st_size]
    ids = [r["id"] for p in accepted for r in rows(p)]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        sys.exit(f"duplicate accepted ids across files: {sorted(dupes)}")
    print(tool("merge", "--inputs", *accepted, "--output", RUN / "train.authored.jsonl"))
    print(tool("compile", "--input", RUN / "train.authored.jsonl", "--output", RUN / "train.jsonl"))


if __name__ == "__main__":
    {"attach": attach, "merge": merge}[sys.argv[1]]()
