"""Private field inventory (planning/INTERFACES.md, "Scanner and policy handoff", inventory_schema_version 1.0).

The inventory is a private operator-workbench artifact. It contains column names, roles, reasons and rule ids,
never raw values, recovered identifiers or row-level matches.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .scan import SAMPLE_ROWS, read_csv, scan_table

INVENTORY_SCHEMA_VERSION = "1.0"
ROLES = ["direct_identifier", "quasi_identifier", "sensitive_attribute", "technical_identifier", "record_key",
         "free_text", "non_sensitive", "unknown"]


def source_commit() -> str:
    here = Path(__file__).resolve().parent
    try:
        sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=here, capture_output=True, text=True,
                             check=True).stdout.strip()
        dirty = subprocess.run(["git", "status", "--porcelain", "--", str(here)], cwd=here, capture_output=True,
                               text=True, check=True).stdout.strip()
        return sha + ("+dirty" if dirty else "")
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def field_records(results) -> list[dict]:
    out = []
    for r in results:
        out.append({
            "table": r.table,
            "column": r.column,
            "role": r.inventory_role,
            "subtype": r.subtype,
            "reason": r.reason,
            "rule_ids": list(r.rule_ids),
            "certainty": r.certainty,
            "needs_review": bool(r.needs_review),
            "art9_hint": bool(r.art9),
            "links": [{"type": a, "column": b} for a, b, _ in r.links],
        })
    return out


def build_inventory(data_dir: Path, dataset: str, tables: list[str] | None = None) -> dict:
    """Scan <data_dir>/*.csv (one dataset folder) into the private inventory envelope."""
    data_dir = Path(data_dir)
    files = sorted(data_dir.glob("*.csv"))
    if tables:
        files = [f for f in files if f.stem in tables]
    if not files:
        raise SystemExit(f"no CSV tables found in {data_dir}")
    fields, table_ids = [], []
    for f in files:
        df = read_csv(f)
        table_ids.append({"table": f.stem, "columns": len(df.columns)})
        fields.extend(field_records(scan_table(df, f.stem)))
    keys = [(x["table"], x["column"]) for x in fields]
    assert len(keys) == len(set(keys)), "every (table, column) must appear exactly once"
    return {
        "inventory_schema_version": INVENTORY_SCHEMA_VERSION,
        "scanner": "petpilot",
        "scanner_version": __version__,
        "source_commit": source_commit(),
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "analysis_mode": "rules",
        "dataset": dataset,
        "tables": table_ids,
        "sampling": {
            "rule": "first_n_rows",
            "rows_per_table": SAMPLE_ROWS,
            "note": "Values outside the first rows are not inspected; absence of a match is not evidence of absence.",
        },
        "certainty_meaning": "heuristic rule strength (high/medium/low); unknown = no rule matched. Not a probability.",
        "roles": ROLES,
        "fields": fields,
        "summary": {
            "fields": len(fields),
            "unknown": sum(1 for x in fields if x["role"] == "unknown"),
            "needs_review": sum(1 for x in fields if x["needs_review"]),
            "by_role": {r: sum(1 for x in fields if x["role"] == r) for r in ROLES},
        },
    }


def write_inventory(inv: dict, out: Path) -> None:
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(inv, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
