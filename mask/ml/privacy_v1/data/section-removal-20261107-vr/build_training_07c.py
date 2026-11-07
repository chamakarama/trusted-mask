"""Build the versioned canonical folder data/training-2026-11-07c/ (same procedure as build_training_07b.py).

train = training-2026-11-07b/train.authored.jsonl (816) + section-removal-20261107-vr/train.authored.jsonl (500)
dev   = training-2026-11-07b/dev*.jsonl copied byte-for-byte (unchanged)
Runs the repository's own merge/compile tools and cross-split leakage checks. Run from the repo root:
    PYTHONUTF8=1 python mask/ml/privacy_v1/data/section-removal-20261107-vr/build_training_07c.py <python>
"""
import collections
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

PY = sys.argv[1] if len(sys.argv) > 1 else sys.executable
DATA = Path("mask/ml/privacy_v1/data")
OLD = DATA / "training-2026-11-07b"
NEW = DATA / "section-removal-20261107-vr"
OUT = DATA / "training-2026-11-07c"
CHECKS = NEW / "integration-checks"
TOKENIZERS = {"minilm": Path("mask/ml/privacy_v1/artifacts/encoder-b-pilot/tokenizer.json"),
              "deberta": Path("mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/deberta-v3-base")}


def tool(*args):
    r = subprocess.run([PY, "-m", "mask.ml.privacy_v1.annotation.tools", *map(str, args)], capture_output=True, text=True,
                       encoding="utf-8")
    if r.returncode:
        sys.exit(f"FAILED tools {' '.join(map(str, args))}\n{r.stdout[-2000:]}\n{r.stderr[-3000:]}")
    return r.stdout.strip().splitlines()[-1]


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
tok_max = {}
for name, path in TOKENIZERS.items():
    try:
        if name == "minilm":
            from tokenizers import Tokenizer
            tok = Tokenizer.from_file(str(path))
            tok_max[name] = max(len(tok.encode(r["text"], r["task"]).ids) for r in train)
        else:
            from transformers import AutoTokenizer
            tok = AutoTokenizer.from_pretrained(str(path), local_files_only=True)
            tok_max[name] = max(len(tok(r["task"], r["text"])["input_ids"]) for r in train)
    except Exception as exc:  # pragma: no cover
        tok_max[name] = f"unverified: {type(exc).__name__}"
old_sources = json.loads((OLD / "sources.json").read_text(encoding="utf-8"))
sources = {
    "base_commit": "4249f99",
    "derived_from": {
        "previous_release": {"path": str(OLD).replace("\\", "/"), "train_authored_sha256": sha(OLD / "train.authored.jsonl"),
                             "train_sha256": sha(OLD / "train.jsonl"), "train_records": 816},
        "added_campaign": {"path": str(NEW / "train.authored.jsonl").replace("\\", "/"), "sha256": sha(NEW / "train.authored.jsonl"),
                           "records": 500, "report": str(NEW / "REPORT.md").replace("\\", "/")},
    },
    "counts": {
        "train_records": len(train), "dev_records": len(dev),
        "train_families": len({r["family_id"] for r in train}), "dev_families": len({r["family_id"] for r in dev}),
        "train_word_range": [min(words), max(words)],
        "train_max_text_plus_task_tokens": tok_max,
        "train_action_counts": dict(sorted(actions.items())),
    },
    "train_sources": old_sources["train_sources"] + [
        {"path": str(NEW / "train.authored.jsonl").replace("\\", "/"), "sha256": sha(NEW / "train.authored.jsonl"), "records": 500}],
    "dev_source": old_sources["dev_source"],
    "files": {name: sha(OUT / name) for name in ("train.authored.jsonl", "train.jsonl", "dev.authored.jsonl", "dev.jsonl")},
    "notes": old_sources["notes"] + [
        "training-2026-11-07c adds the 500-record section-removal campaign (200 same-source task pairs + 100 controls) to the 816 records of training-2026-11-07b; dev is unchanged.",
        "Section-target exports for the campaign are in ../section-removal-20261107-vr/section-targets.*.json; the present trainer does not consume them automatically.",
    ],
}
(OUT / "sources.json").write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(sources["counts"], indent=1))
