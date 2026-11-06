"""Development evaluation of the scanner against the supplied field catalog.

These are LABEL-INFORMED development results: the rules were written with metadata/field_catalog.csv visible.
They are not a blind or held-out test. Uses the organisers' scorer (pets_eval.detect) when installed.
"""
from __future__ import annotations

import platform
import sys
from pathlib import Path

import pandas as pd

from . import __version__
from .inventory import source_commit
from .scan import SAMPLE_ROWS, scan_folder


def evaluate_catalog(package: Path) -> dict:
    package = Path(package)
    catalog = pd.read_csv(package / "metadata" / "field_catalog.csv", dtype=str)
    pred = scan_folder(package / "data")
    labelled = pred.merge(catalog[["dataset", "table", "column"]], on=["dataset", "table", "column"])
    unknown_rate = round(float((labelled["inventory_role"] == "unknown").mean()), 4)
    review_rate = round(float(labelled["needs_review"].astype(bool).mean()), 4)
    try:
        from pets_eval.detect import score_detection
        scored = score_detection(pred[["dataset", "table", "column", "privacy_role", "subtype"]], catalog)
        scorer = "pets_eval.detect.score_detection (supplied toolkit)"
    except ImportError:  # pragma: no cover - toolkit not installed
        raise SystemExit("install the supplied toolkit first: pip install -e <package>/toolkit")
    # sensitive false negatives: catalog says the column needs protection, best guess says non_sensitive
    m = catalog.merge(pred, on=["dataset", "table", "column"], how="left", suffixes=("", "_pred"))
    protect = ["direct_identifier", "quasi_identifier", "sensitive_attribute", "technical_identifier", "free_text"]
    fn = m[m["privacy_role"].isin(protect) & (m["privacy_role_pred"] == "non_sensitive")]
    fn_flagged = int(fn["needs_review"].astype(bool).sum()) if len(fn) else 0
    return {
        "experiment": "E1S-dev-catalog",
        "status": "label_informed_development_result",
        "caveat": "Rules were developed with field_catalog.csv visible; not a blind or held-out evaluation. "
                  "The unseen HR file was also inspected during development, so it is not a blind test either.",
        "command": "python -m petpilot evaluate-catalog --package <package root> --out <path>",
        "scanner_version": __version__,
        "source_commit": source_commit(),
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "scorer": scorer,
        "taxonomy": "metadata/taxonomy.md privacy_role (7 roles); predictions use best-guess roles, "
                    "the inventory additionally reports fallbacks as 'unknown'",
        "labelled_columns": int(len(catalog)),
        "predicted_columns_total": int(len(pred)),
        "sampling": f"first {SAMPLE_ROWS} rows per table",
        "metrics": {
            "macro_f1": scored["macro_f1"],
            "accuracy": scored["accuracy"],
            "sensitive_recall": scored["sensitive_recall"],
            "subtype_accuracy": scored.get("subtype_accuracy"),
            "unknown_rate": unknown_rate,
            "needs_review_rate": review_rate,
            "sensitive_false_negatives": int(len(fn)),
            "sensitive_false_negatives_flagged_for_review": fn_flagged,
        },
        "per_role": scored["per_role"],
        "sensitive_false_negative_columns": fn[["dataset", "table", "column", "privacy_role"]].to_dict("records"),
        "errors_first_200": scored["errors"],
        "platform": f"{platform.system()} {platform.release()}; {sys.version.split()[0]}",
    }
