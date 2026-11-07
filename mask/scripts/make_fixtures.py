"""Build small development fixtures from the supplied synthetic customer-service package.

Fixtures are synthetic (CC BY 4.0, Since AI ry) and development-only. They are a subset of the
public `train` split: gold spans are copied so detection can be measured locally. The organiser-held
eval split is never included.

Usage: python3 -I scripts/make_fixtures.py [--conversations 120]
"""
from __future__ import annotations
import argparse, csv, json, random, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PKG = ROOT / "TRUSTED_SinceAI2026_FINAL" / "TRUSTED_PETS_PROVING_GROUND_2026"
OUT = Path(__file__).resolve().parents[1] / "fixtures" / "customer_service_small"
csv.field_size_limit(10**8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--conversations", type=int, default=120)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    convs = list(csv.DictReader((PKG / "data/customer_service/conversations.csv").open(newline="", encoding="utf-8")))
    train = [c for c in convs if c["split"] == "train"]
    # stratify a little: make sure every channel and language is represented
    rnd.shuffle(train)
    chosen, seen = [], set()
    for c in train:
        key = (c["channel"], c["language"])
        if key not in seen:
            seen.add(key); chosen.append(c)
    for c in train:
        if len(chosen) >= a.conversations:
            break
        if c not in chosen:
            chosen.append(c)
    conv_ids = {c["conversation_id"] for c in chosen}
    cust_ids = {c["customer_id"] for c in chosen}
    OUT.mkdir(parents=True, exist_ok=True)
    fields = list(convs[0].keys())
    with (OUT / "conversations.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(sorted(chosen, key=lambda r: r["conversation_id"]))
    turn_ids = set()
    with (PKG / "data/customer_service/turns.csv").open(newline="", encoding="utf-8") as fin, \
         (OUT / "turns.csv").open("w", newline="", encoding="utf-8") as fout:
        r = csv.DictReader(fin); w = csv.DictWriter(fout, fieldnames=r.fieldnames); w.writeheader()
        n = 0
        for row in r:
            if row["conversation_id"] in conv_ids:
                w.writerow(row); turn_ids.add(row["turn_id"]); n += 1
    with (PKG / "data/customer_service/customers.csv").open(newline="", encoding="utf-8") as fin, \
         (OUT / "customers.csv").open("w", newline="", encoding="utf-8") as fout:
        r = csv.DictReader(fin); w = csv.DictWriter(fout, fieldnames=r.fieldnames); w.writeheader()
        m = sum(1 for row in r if row["customer_id"] in cust_ids and (w.writerow(row) or True))
    gold = OUT / "gold"; gold.mkdir(exist_ok=True)
    for src, keep, name in [("customer_service__turns__text.jsonl", turn_ids, "turns__text.jsonl"),
                            ("customer_service__conversations__agent_note.jsonl", conv_ids, "conversations__agent_note.jsonl")]:
        k = 0
        with (PKG / "metadata/pii_spans" / src).open(encoding="utf-8") as fin, (gold / name).open("w", encoding="utf-8") as fout:
            for line in fin:
                rec = json.loads(line)
                if rec["record_id"] in keep:
                    fout.write(line if line.endswith("\n") else line + "\n"); k += 1
        print(f"gold {name}: {k} records", file=sys.stderr)
    (OUT / "README.md").write_text(
        "# Development fixture: customer_service_small\n\n"
        f"{len(chosen)} train-split conversations ({n} turns, {m} customers) sampled with seed {a.seed} from the\n"
        "supplied synthetic TrustED package (CC BY 4.0, Since AI ry). `gold/` holds the public span labels for these\n"
        "records so detection can be measured locally. Development only: metrics on this fixture are not benchmark results.\n"
        "The organiser-held eval split is not included.\n")
    print(f"wrote {len(chosen)} conversations, {n} turns, {m} customers to {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
