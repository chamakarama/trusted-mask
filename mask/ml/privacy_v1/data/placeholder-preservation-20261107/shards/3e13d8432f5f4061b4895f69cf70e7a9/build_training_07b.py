"""Build the versioned canonical folder data/training-2026-11-07b/.

train = training-2026-11-07/train.authored.jsonl (516) + placeholder-preservation-20261107/train.authored.jsonl (300)
dev   = training-2026-11-07/dev*.jsonl copied byte-for-byte (unchanged)
Runs the repository's own merge/compile tools and cross-split leakage checks. Run from the repo root.
"""
import collections
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

PY = "/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/.venv/bin/python"
DATA = Path("mask/ml/privacy_v1/data")
OLD = DATA / "training-2026-11-07"
NEW = DATA / "placeholder-preservation-20261107"
OUT = DATA / "training-2026-11-07b"
CHECKS = NEW / "shards/3e13d8432f5f4061b4895f69cf70e7a9/integration-checks"
TOKENIZER = Path("/Users/markp/Code/sinceai-trusted/mask/ml/privacy_v1/artifacts/encoder-b-pilot/tokenizer.json")


def tool(*args):
    r = subprocess.run([PY, "-m", "mask.ml.privacy_v1.annotation.tools", *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"FAILED tools {' '.join(map(str, args))}\n{r.stderr}")
    return r.stdout.strip()


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def rows(p):
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]


OUT.mkdir(exist_ok=False)
CHECKS.mkdir(exist_ok=True)

# 1. cross-split leakage checks (authored and compiled flavours), written outside the release folder
print("leakage authored:", tool("merge", "--inputs", OLD / "train.authored.jsonl", NEW / "train.authored.jsonl",
                                OLD / "dev.authored.jsonl", "--output", CHECKS / "train-plus-dev.authored.check.jsonl"))
print("leakage compiled:", tool("merge", "--inputs", OLD / "train.jsonl", NEW / "train.jsonl", OLD / "dev.jsonl",
                                "--output", CHECKS / "train-plus-dev.compiled.check.jsonl"))

# 2. train: merge authored sources, then compile
print("train.authored:", tool("merge", "--inputs", OLD / "train.authored.jsonl", NEW / "train.authored.jsonl",
                              "--output", OUT / "train.authored.jsonl"))
print("train compiled:", tool("compile", "--input", OUT / "train.authored.jsonl", "--output", OUT / "train.jsonl"))

# 3. dev: unchanged byte-for-byte copies
for name in ("dev.authored.jsonl", "dev.authored.manifest.json", "dev.jsonl", "dev.manifest.json"):
    shutil.copyfile(OLD / name, OUT / name)
    assert sha(OLD / name) == sha(OUT / name)

# 4. sources.json
train = rows(OUT / "train.jsonl")
dev = rows(OUT / "dev.jsonl")
actions = collections.Counter(s["action"] for r in train for s in r["spans"])
words = [len(r["text"].split()) for r in train]
tok_max = None
try:
    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(str(TOKENIZER))
    tok_max = max(len(tok.encode(r["text"], r["task"]).ids) for r in train)
except Exception as exc:  # pragma: no cover
    tok_max = f"unverified: {exc}"
old_sources = json.loads((OLD / "sources.json").read_text())
sources = {
    "base_commit": "c90f885",
    "derived_from": {
        "previous_release": {"path": str(OLD), "train_authored_sha256": sha(OLD / "train.authored.jsonl"),
                             "train_sha256": sha(OLD / "train.jsonl"), "train_records": 516},
        "added_campaign": {"path": str(NEW / "train.authored.jsonl"), "sha256": sha(NEW / "train.authored.jsonl"),
                           "records": 300, "report": str(NEW / "REPORT.md")},
    },
    "counts": {
        "train_records": len(train), "dev_records": len(dev),
        "train_families": len({r["family_id"] for r in train}), "dev_families": len({r["family_id"] for r in dev}),
        "train_word_range": [min(words), max(words)],
        "train_max_text_plus_task_tokens_minilm": tok_max,
        "train_action_counts": dict(sorted(actions.items())),
    },
    "train_sources": old_sources["train_sources"] + [
        {"path": str(NEW / "train.authored.jsonl"), "sha256": sha(NEW / "train.authored.jsonl"), "records": 300}],
    "dev_source": old_sources["dev_source"],
    "files": {name: sha(OUT / name) for name in ("train.authored.jsonl", "train.jsonl", "dev.authored.jsonl", "dev.jsonl")},
    "notes": old_sources["notes"] + [
        "training-2026-11-07b adds the 300-record placeholder-preservation campaign to the 516 records of training-2026-11-07; dev is unchanged.",
        "Weights and evidence published for training-2026-11-07 were trained on the 516-record file, not on this folder.",
        "Adapter fixtures stay in ../training-2026-11-07/adapter-fixtures/ and are not duplicated here.",
    ],
}
(OUT / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n")
print(json.dumps(sources["counts"], indent=1))
