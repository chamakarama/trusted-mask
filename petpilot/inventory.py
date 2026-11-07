"""Private field inventory (inventory_schema_version 1.0; see petpilot/README.md).

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


# Full-column sweep: cheap patterns for direct identifiers, run over EVERY row (the rules only see a sample).
SWEEP_PATTERNS = {
    "email": r"[\w.+-]+@[\w-]+\.[\w.-]+",
    "national_id": r"\b\d{6}[-+A-FU-Y]?\d{3}[0-9A-Y]\b",
    "iban": r"\b[A-Z]{2}\d{2}(?: ?[0-9A-Z]{4}){3,7}\b",
    "phone": r"(?:\+358|\b0)\d{1,2}[ -]?\d{3}[ -]?\d{3,4}\b",
    "plate": r"\b[A-ZÅÄÖ]{2,3}-\d{1,3}\b",
}
SWEEP_SKIP_ROLES = {"direct_identifier"}
# E-mail shapes are precise enough that even one hit makes the column a direct-identifier risk (one address can name a
# person). The other shapes (10-digit ID codes, phones, plates) also match ordinary numbers, so they only raise review.
SWEEP_UPGRADE = {"email": "EMAIL"}
SWEEP_UPGRADE_FROM = {"unknown", "non_sensitive", "record_key"}


def sweep_table(path: Path, records: list[dict], chunksize: int = 200_000) -> int:
    """Count identifier-shaped values in every row of every non-direct-identifier column.
    Raises needs_review (with counts only, never values) where any are found. Returns rows scanned."""
    import pandas as pd
    todo = [r for r in records if r["role"] not in SWEEP_SKIP_ROLES]
    counts = {r["column"]: {k: 0 for k in SWEEP_PATTERNS} for r in todo}
    rows = 0
    for chunk in pd.read_csv(path, dtype=str, keep_default_na=False, chunksize=chunksize, encoding="utf-8"):
        rows += len(chunk)
        for r in todo:
            s = chunk[r["column"]]
            s = s[s.str.len() > 5]
            if s.empty:
                continue
            for kind, rx in SWEEP_PATTERNS.items():
                counts[r["column"]][kind] += int(s.str.contains(rx, regex=True).sum())
    for r in todo:
        found = {k: v for k, v in counts[r["column"]].items() if v}
        r["sweep"] = {"rows_scanned": rows, "identifier_shaped_values": found}
        if found:
            r["needs_review"] = True
            r["rule_ids"].append("sweep.identifier_shaped_values")
            r["reason"] += "; full-column sweep found " + ", ".join(f"{v} {k}-shaped value(s)" for k, v in found.items())
            upgrade = next((SWEEP_UPGRADE[k] for k in SWEEP_UPGRADE if k in found), None)
            if upgrade and r["role"] in SWEEP_UPGRADE_FROM:
                r["role"], r["subtype"], r["certainty"] = "direct_identifier", upgrade, "low"
                r["rule_ids"].append("sweep.direct_identifier")
                r["reason"] += ": treated as a direct identifier (one address can name a person)"
    return rows


def build_inventory(data_dir: Path, dataset: str, tables: list[str] | None = None, sweep: bool = True,
                    sample_rows: int = SAMPLE_ROWS) -> dict:
    """Scan <data_dir>/*.csv (one dataset folder) into the private inventory envelope."""
    data_dir = Path(data_dir)
    files = sorted(data_dir.glob("*.csv"))
    if tables:
        files = [f for f in files if f.stem in tables]
    if not files:
        raise SystemExit(f"no CSV tables found in {data_dir}")
    fields, table_ids = [], []
    for f in files:
        df = read_csv(f, nrows=sample_rows)
        recs = field_records(scan_table(df, f.stem))
        rows = sweep_table(f, recs) if sweep else None
        table_ids.append({"table": f.stem, "columns": len(df.columns), "rows_swept": rows})
        fields.extend(recs)
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
            "rows_per_table": sample_rows,
            "full_column_sweep": "every row of every non-direct-identifier column is checked for e-mail, ID-code, "
                                 "IBAN, phone and plate shapes; hits only raise needs_review (counts, no values)"
                                 if sweep else "disabled",
            "note": "Rules inspect only the first rows; absence of a match is not evidence of absence.",
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
