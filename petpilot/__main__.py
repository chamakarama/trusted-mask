"""CLI: python -m petpilot scan --data <folder of dataset folders> --out labels.csv
         python -m petpilot scan-file <table.csv> --out labels.csv
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .scan import read_csv, scan_folder, scan_table


def main() -> None:
    ap = argparse.ArgumentParser(prog="petpilot")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("scan", help="scan every <dataset>/<table>.csv in a folder")
    a.add_argument("--data", required=True)
    a.add_argument("--only", nargs="*")
    a.add_argument("--out", required=True)
    b = sub.add_parser("scan-file", help="scan one CSV (e.g. an unseen export)")
    b.add_argument("path")
    b.add_argument("--out", required=True)
    args = ap.parse_args()

    if args.cmd == "scan":
        out = scan_folder(Path(args.data), args.only)
    else:
        p = Path(args.path)
        df = read_csv(p)
        out = pd.DataFrame([dict(column=r.column, privacy_role=r.privacy_role, subtype=r.subtype, art9=r.art9,
                                 confidence=r.confidence, reason=r.reason,
                                 links=";".join(f"{x}:{y}" for x, y, _ in r.links))
                            for r in scan_table(df, p.stem)])
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.out, index=False, encoding="utf-8")
    print(f"wrote {len(out)} column labels -> {args.out}")


if __name__ == "__main__":
    main()
