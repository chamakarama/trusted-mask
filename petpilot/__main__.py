"""CLI.

  python -m petpilot inventory --data <dataset folder> --dataset customer_service --out private/customer_service_inventory.json
  python -m petpilot scan --data <folder of dataset folders> [--only customer_service] --out labels.csv
  python -m petpilot scan-file <table.csv> --out labels.csv
  python -m petpilot evaluate-catalog --package <package root> --out private/dev_catalog_eval.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .scan import read_csv, scan_folder, scan_table


def main() -> None:
    ap = argparse.ArgumentParser(prog="petpilot")
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("inventory", help="private field inventory (inventory_schema_version 1.0)")
    i.add_argument("--data", required=True, help="one dataset folder, e.g. .../data/customer_service")
    i.add_argument("--dataset", required=True, help="dataset identifier recorded in the envelope")
    i.add_argument("--tables", nargs="*", help="restrict to these table names")
    i.add_argument("--no-sweep", action="store_true", help="skip the full-column identifier sweep")
    i.add_argument("--out", required=True)
    a = sub.add_parser("scan", help="best-guess labels for every <dataset>/<table>.csv in a folder (catalog format)")
    a.add_argument("--data", required=True)
    a.add_argument("--only", nargs="*")
    a.add_argument("--out", required=True)
    b = sub.add_parser("scan-file", help="scan one CSV (e.g. an unseen export)")
    b.add_argument("path")
    b.add_argument("--out", required=True)
    e = sub.add_parser("evaluate-catalog", help="label-informed development metrics against field_catalog.csv")
    e.add_argument("--package", required=True, help="supplied package root (contains data/ and metadata/)")
    e.add_argument("--out", required=True)
    args = ap.parse_args()

    if args.cmd == "inventory":
        from .inventory import build_inventory, write_inventory
        inv = build_inventory(Path(args.data), args.dataset, args.tables, sweep=not args.no_sweep)
        write_inventory(inv, Path(args.out))
        s = inv["summary"]
        print(f"wrote {s['fields']} fields ({s['unknown']} unknown, {s['needs_review']} need review) -> {args.out}")
        return
    if args.cmd == "evaluate-catalog":
        from .evaluate import evaluate_catalog
        res = evaluate_catalog(Path(args.package))
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8")
        print(f"macro_f1={res['metrics']['macro_f1']} sensitive_recall={res['metrics']['sensitive_recall']} "
              f"unknown_rate={res['metrics']['unknown_rate']} -> {args.out}")
        return
    if args.cmd == "scan":
        out = scan_folder(Path(args.data), args.only)
    else:
        p = Path(args.path)
        df = read_csv(p)
        out = pd.DataFrame([dict(column=r.column, privacy_role=r.privacy_role, subtype=r.subtype, art9=r.art9,
                                 confidence=r.confidence, reason=r.reason,
                                 links=";".join(f"{x}:{y}" for x, y, _ in r.links), rule_ids="|".join(r.rule_ids),
                                 certainty=r.certainty, needs_review=r.needs_review, inventory_role=r.inventory_role)
                            for r in scan_table(df, p.stem)])
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False, encoding="utf-8")
    print(f"wrote {len(out)} column labels -> {args.out}")


if __name__ == "__main__":
    main()
