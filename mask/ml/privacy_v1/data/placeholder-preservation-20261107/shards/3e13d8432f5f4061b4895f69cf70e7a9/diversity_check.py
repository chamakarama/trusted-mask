"""Cross-record diversity audit: repeated identifier values, repeated person names, near-duplicate texts.

Usage (repo root): PY .../diversity_check.py FILE [FILE ...]
Reads authored v2 JSONL records; prints a JSON report. Read-only.
"""
import collections
import itertools
import json
import re
import sys
from pathlib import Path

DIRECT = {"EMAIL", "PHONE", "ADDRESS", "USERNAME", "ACCOUNT_ID", "NATIONAL_ID", "PAYMENT_CARD", "IBAN", "SECRET"}
records = []
for path in sys.argv[1:]:
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))

values = collections.defaultdict(set)
names = collections.defaultdict(set)
for r in records:
    for e in r["entities"]:
        if e["label"] in DIRECT:
            values[(e["label"], re.sub(r"\s+", " ", e["quote"].strip().lower()))].add(r["id"])
        elif e["label"] == "PERSON":
            for token in re.findall(r"[^\W\d_][\w'’-]{2,}", e["quote"]):
                names[token].add(r["id"])

repeated_values = {f"{k[0]}:{k[1]}": sorted(v) for k, v in values.items() if len(v) > 1}
repeated_names = {k: len(v) for k, v in sorted(names.items(), key=lambda kv: -len(kv[1])) if len(v) > 2}


def grams(text, n=5):
    words = re.findall(r"\w+", text.lower())
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


g = {r["id"]: grams(r["text"]) for r in records}
near = []
for a, b in itertools.combinations(records, 2):
    ga, gb = g[a["id"]], g[b["id"]]
    if ga and gb:
        jac = len(ga & gb) / len(ga | gb)
        if jac >= 0.15:
            near.append((round(jac, 3), a["id"], b["id"]))
near.sort(reverse=True)
print(json.dumps({"records": len(records), "distinct_texts": len({r["text"] for r in records}),
                  "repeated_identifier_values": repeated_values,
                  "person_name_tokens_in_3plus_records": repeated_names,
                  "near_duplicate_pairs_5gram_jaccard_ge_0.15": near[:40]}, indent=1, ensure_ascii=False))
