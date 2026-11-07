"""Mask benchmark adapter: run the supplied pets-eval toolkit on one executed plan and write a BenchmarkReport.

    python3 -I bench/run_bench.py --run <run dir> [--scenario CS-S1] [--pkg <package root>] [--max-adversary 3000]

<run dir> is written by scripts/bench/run_plan.ts (executed.json, staging/, export/, optional original/).
The toolkit runs as a subprocess from the package root with PYTHONPATH=<pkg>/toolkit, always with --root.
Outputs (all PRIVATE, never exported): <run>/out/scorecard.json|html, <run>/out/text_<table>__<column>.json (raw leaked
examples), <run>/out/check.json, <run>/out/commands.log, and <run>/report.json (contracts/benchmark.ts BenchmarkReport).

Status vocabulary (bench/README.md): evaluated / not_applicable / unsupported / failed. A missing, skipped, failed or
misclassified test never becomes a zero-risk observation. Toolkit scores are development self-assessment evidence,
not the official judging rubric and not a probability of anonymity.

Only the standard library is used here; pandas/numpy/scipy/scikit-learn are needed by the toolkit subprocess.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

csv.field_size_limit(1 << 30)

ADAPTER_VERSION = "mask-bench-1.0.0"
HERE = Path(__file__).resolve().parent
MASK_DIR = HERE.parent
DEFAULT_PKG = MASK_DIR.parent / "TRUSTED_SinceAI2026_FINAL" / "TRUSTED_PETS_PROVING_GROUND_2026"

# Fixed sampling limits and seeds of pets-eval 1.0.0 (bench/TOOLKIT_MAP.md "Sampling limits"); the JSON does not state them.
SAMPLING = {
    "hash_dictionary_candidates": 300000,      # scorecard.py:96
    "hash_dictionary_variants": 2000000,       # attacks.py:517
    "hash_detection_values": 2000,             # attacks.py:494 (first non-null values per column)
    "regex_residual_rows": 20000,              # scorecard.py:234 prot.head(20000)
    "dcr_rows": 20000,                         # privacy.py:199
    "mia_rows_per_side": 5000,                 # privacy.py:234
    "mia_synthetic_rows": 50000,               # privacy.py:245
    "trajectory_users": 1000,                  # scorecard.py:120
    "cs_u5_sample_turns": 20000,               # utility/customer_service.py:192 (random_state=7)
    "linkage_seed": 0,
    "synthetic_seed": 0,
    "cs_u5_random_state": 7,
}

# Mask's HARD_SPAN_LABELS (src/contracts/taxonomy.ts): never allowed to survive verbatim.
HARD_LABELS = ["NATIONAL_ID", "EMAIL", "PHONE", "IBAN", "PAYMENT_CARD", "SECRET", "ACCOUNT_NUMBER", "DEVICE_ID", "IP_ADDRESS",
               "USERNAME", "LICENSE_PLATE", "PROPERTY_ID", "URL"]
# pets_eval.text.IDENTIFYING (text.py:19-21)
IDENTIFYING = {"PERSON", "NATIONAL_ID", "EMAIL", "PHONE", "ADDRESS", "IBAN", "PAYMENT_CARD", "ACCOUNT_NUMBER", "IP_ADDRESS",
               "LICENSE_PLATE", "USERNAME", "SECRET", "DEVICE_ID", "PROPERTY_ID", "URL"}

# Threat ids from src/core/evaluate/evaluator.ts threatCoverage
T_DIRECT = "direct_reidentification"
T_QI = "quasi_identifier_linkage"
T_TEXT = "free_text_identifier_leakage"
T_CROSS = "cross_table_key_linkage"
T_MIA = "membership_inference"
T_ATTR = "attribute_inference_external"
T_SPOKEN = "undetected_spoken_identifiers"
T_TOKEN = "token_reversal"

UNSUPPORTED_REASONS = {
    "no gold spans in package", "needs a row map to align texts", "row map or adversary truth missing",
    "no overlapping quasi-identifiers between adversary and protected table", "no shared columns",
    "no shared columns or no non-members", "user or time column missing", "no location column", "no usable points",
}

TEST_KINDS = ["attack", "residual_check", "text_leakage", "utility", "representation", "aggregate_score"]
STATUSES = ["evaluated", "not_applicable", "unsupported", "failed"]
REPRESENTATIONS = ["row_level", "synthetic", "withheld", "aggregate"]


# ------------------------------------------------------------------ hashing / io helpers
def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_dir(d: Path, pattern: str = "*.py") -> str:
    """Hash of every matching file under d (sorted relative paths), excluding __pycache__."""
    h = hashlib.sha256()
    for p in sorted(x for x in d.rglob(pattern) if "__pycache__" not in x.parts):
        h.update(str(p.relative_to(d)).encode())
        h.update(b"\0")
        h.update(sha256_file(p).encode())
        h.update(b"\n")
    return h.hexdigest()


def read_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def read_csv_column(p: Path, column: str) -> list:
    with open(p, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        return [row.get(column) for row in r]


def read_rowmap(p: Path) -> list:
    with open(p, newline="", encoding="utf-8") as f:
        r = csv.reader(f)
        header = next(r, None)
        if header != ["protected_row", "original_record_id"]:
            raise ValueError(f"{p.name}: header must be protected_row,original_record_id, got {header}")
        return [(int(a), b) for a, b in r]


def toolkit_version(pkg: Path) -> str:
    src = (pkg / "toolkit" / "pets_eval" / "__init__.py").read_text(encoding="utf-8")
    m = re.search(r"__version__\s*=\s*['\"]([^'\"]+)['\"]", src)
    return m.group(1) if m else "unknown"


def rnd(x):
    return None if x is None else round(float(x), 6)


def num(x):
    """Numeric metric value or None (the contract allows null metrics)."""
    if isinstance(x, bool):
        return 1.0 if x else 0.0
    if isinstance(x, (int, float)):
        if x != x:  # NaN
            return None
        return float(x)
    return None


# ------------------------------------------------------------------ toolkit invocation
class Toolkit:
    def __init__(self, pkg: Path, out: Path, python: str):
        self.pkg = pkg
        self.out = out
        self.python = python
        self.log: list[str] = []

    def run(self, args: list[str]) -> subprocess.CompletedProcess:
        env = dict(os.environ)
        env["PYTHONPATH"] = str(self.pkg / "toolkit")
        cmd = [self.python, "-m", "pets_eval", *args]
        self.log.append(f"cd {shlex.quote(str(self.pkg))} && PYTHONPATH={shlex.quote(env['PYTHONPATH'])} "
                        + " ".join(shlex.quote(c) for c in cmd))
        t0 = time.time()
        res = subprocess.run(cmd, cwd=self.pkg, env=env, capture_output=True, text=True)
        self.log[-1] += f"    # exit {res.returncode}, {time.time() - t0:.1f}s"
        # stdout of `text` and `check` prints (masked / raw) examples: keep only in the private out dir
        with open(self.out / "commands.log", "a", encoding="utf-8") as f:
            f.write(self.log[-1] + "\n")
            f.write(res.stdout[-20000:] + "\n" + res.stderr[-20000:] + "\n")
        return res


# ------------------------------------------------------------------ test builder
def test(id, kind, name, source, status, scope, metrics=None, denominators=None, assumptions=None, covers=None,
         reason=None, sampling=None, original=None):
    assert kind in TEST_KINDS and status in STATUSES, (kind, status)
    t = {"id": id, "kind": kind, "name": name, "source": source, "status": status, "scope": scope,
         "metrics": {k: num(v) for k, v in (metrics or {}).items()},
         "denominators": {k: float(v) for k, v in (denominators or {}).items() if num(v) is not None},
         "assumptions": list(assumptions or []), "covers": list(covers or [])}
    if reason:
        t["statusReason"] = reason
    if sampling:
        t["sampling"] = sampling
    if original is not None:
        t["original"] = {k: num(v) for k, v in original.items()}
    return t


def catalog_rows(pkg: Path, dataset: str) -> list[dict]:
    with open(pkg / "metadata" / "field_catalog.csv", newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r["dataset"] == dataset]


def cat_cols(cat, table, role):
    return [r["column"] for r in cat if r["table"] == table and r["privacy_role"] == role]


def build_tests(sc: dict, ctx: dict) -> tuple[list, dict, list]:
    """Map scorecard.json (+ standalone text/check outputs) onto BenchmarkReport tests.
    ctx: dataset, cat, specs, staged (executed.json tables), text_outputs, check, eval_split, scenario_required.
    Returns (tests, representation, notes)."""
    tests: list = []
    representation: dict = {}
    notes: list = []
    dataset = ctx["dataset"]
    cat = ctx["cat"]
    specs = ctx["specs"]
    staged = {t["name"]: t for t in ctx.get("staged", [])}
    tables = sc.get("tables", {})
    rep_failed: dict = {}

    # ---------------- representation
    for t, tr in tables.items():
        st = tr.get("status")
        rk = next(iter(cat_cols(cat, t, "record_key")), None)
        if st == "withheld":
            representation[t] = "withheld"
            tests.append(test(f"representation.{t}", "representation", f"Representation of {t}", "pets_eval.scorecard row_alignment",
                              "not_applicable", t, reason="table withheld: no protected file staged",
                              assumptions=["a withheld table removes every row-level attack on it from the scorecard"]))
            continue
        if st == "error":
            representation[t] = "row_level" if (staged.get(t, {}).get("rowmap") or {}).get("rows") else "synthetic"
            rep_failed[t] = f"toolkit error evaluating the table: {tr.get('error', '')}"
            tests.append(test(f"representation.{t}", "representation", f"Representation of {t}", "pets_eval.scorecard row_alignment",
                              "failed", t, reason=rep_failed[t]))
            continue
        align = tr.get("row_alignment", "none")
        rows_p = tr.get("rows_protected")
        rm = (staged.get(t) or {}).get("rowmap") or {}
        den = {"rows_original": tr.get("rows_original"), "rows_protected": rows_p, "rowmap_rows": rm.get("rows", 0)}
        problems = []
        if align != "row map":
            problems.append(f"row_alignment is '{align}', expected 'row map'"
                            + (" (no rowmap staged: the toolkit fell back to "
                               + ("released original record ids" if align.startswith("original record ids") else "the synthetic-data branch") + ")"
                               if not rm.get("rows") else ""))
        if rm.get("rows") and rows_p is not None and rm.get("rows") + rm.get("unmappedRows", 0) != rows_p:
            problems.append(f"rowmap has {rm.get('rows')} rows (+{rm.get('unmappedRows', 0)} unmapped) for {rows_p} protected rows")
        if align == "row map" or align.startswith("original record ids"):
            representation[t] = "row_level"
        else:
            representation[t] = "synthetic"
        if problems:
            rep_failed[t] = "; ".join(problems)
            tests.append(test(f"representation.{t}", "representation", f"Representation of {t}", "pets_eval.scorecard row_alignment",
                              "failed", t, metrics={"row_map": 0}, denominators=den, reason=rep_failed[t],
                              assumptions=["a released row-level table must be scored through its private rowmap; "
                                           "otherwise linkage, k<5 and free-text leakage are skipped or mis-scored"]))
        else:
            tests.append(test(f"representation.{t}", "representation", f"Representation of {t}", "pets_eval.scorecard row_alignment",
                              "evaluated", t, metrics={"row_map": 1, "rows_mapped": rm.get("rows", 0)}, denominators=den,
                              assumptions=[f"rowmap keyed by the catalogued record key {rk}; protected_row is the 0-based row of the staged CSV"]))
        if rm.get("unmappedRows"):
            notes.append(f"{t}: {rm['unmappedRows']} protected rows have no original record id and are unmapped (person '' in the toolkit)")

    def downgraded(t):
        return f"representation failed for {t}: {rep_failed[t]}" if t in rep_failed else None

    # ---------------- per-table risks
    for t, tr in tables.items():
        st = tr.get("status")
        risks = tr.get("risks", {}) or {}
        di_cols = cat_cols(cat, t, "direct_identifier")
        released = st == "released"
        # direct identifiers retained (value matching against the original; does not depend on row alignment)
        tid = f"direct_identifiers_retained.{t}"
        name = f"Direct identifiers retained in {t}"
        src = "pets_eval.scorecard risk 'direct identifiers retained'"
        cov = [T_DIRECT]
        if st == "withheld":
            tests.append(test(tid, "residual_check", name, src, "not_applicable", t, reason="table withheld", covers=cov))
        elif st == "error":
            tests.append(test(tid, "residual_check", name, src, "failed", t, reason=f"toolkit error: {tr.get('error', '')}", covers=cov))
        elif not di_cols:
            tests.append(test(tid, "residual_check", name, src, "not_applicable", t, covers=cov,
                              reason="no catalogued direct-identifier column in this table (the toolkit still records 0.0; identifiers inside text are covered by text_leakage and residual_check)",
                              denominators={"n_catalogued_direct_identifier_columns": 0}))
        else:
            retained = tr.get("direct_identifiers_retained", {}) or {}
            released_cols = [c for c in di_cols if c not in (tr.get("columns_dropped") or [])]
            m = {"direct_identifiers_retained": risks.get("direct identifiers retained", 0.0),
                 "n_columns_with_retained_values": len(retained)}
            for c, v in retained.items():
                m[f"column.{c}"] = v
            tests.append(test(tid, "residual_check", name, src, "evaluated", t, metrics=m, covers=cov,
                              denominators={"n_catalogued_direct_identifier_columns": len(di_cols),
                                            "n_released_direct_identifier_columns": len(released_cols),
                                            "rows_protected": tr.get("rows_protected")},
                              assumptions=["share of non-null protected values (normalised: case, whitespace, '-', '.') that equal an original value of the same catalogued direct-identifier column; max over columns",
                                           "a column renamed or moved into another column is not matched here"]))
        # hashed identifiers
        tid = f"hashed_ids_reversible.{t}"
        name = f"Hashed identifiers in {t} reversed by dictionary attack"
        src = "pets_eval.attacks.hash_dictionary_attack"
        cov = [T_TOKEN, T_DIRECT]
        samp = f"hex-digest detection on the first {SAMPLING['hash_detection_values']} non-null values per column; up to {SAMPLING['hash_dictionary_candidates']} candidates / {SAMPLING['hash_dictionary_variants']} variants (MD5, SHA-1, SHA-256)"
        if not released:
            tests.append(test(tid, "attack", name, src, "not_applicable" if st == "withheld" else "failed", t, covers=cov,
                              reason="table withheld" if st == "withheld" else f"toolkit error: {tr.get('error', '')}"))
        elif "hash_attack" in tr:
            ha = tr["hash_attack"]
            m = {"share_values_reversed": risks.get("hashed ids reversible", 0.0)}
            d = {}
            for c, v in ha.items():
                m[f"column.{c}"] = v.get("share_values_reversed")
                d[f"n_hashes.{c}"] = v.get("n_hashes")
                d[f"candidates_tried.{c}"] = v.get("candidates_tried")
            tests.append(test(tid, "attack", name, src, "evaluated", t, metrics=m, denominators=d, sampling=samp, covers=cov,
                              assumptions=["unkeyed hex digests of catalogued direct/technical identifier values; keyed HMAC tokens resist by construction"]))
        else:
            tests.append(test(tid, "attack", name, src, "not_applicable", t, sampling=samp, covers=cov,
                              reason="no released column looks like an MD5/SHA-1/SHA-256 hex digest (Mask tokens are 'tok_' + 12 hex of a keyed HMAC)"))
        # k-anonymity
        tid = f"k_anonymity.{t}"
        name = f"Records in {t} with k<5 on catalogued quasi-identifiers"
        src = "pets_eval.privacy.k_anonymity"
        cov = [T_QI]
        ka = tr.get("k_anonymity") or {}
        if not released:
            tests.append(test(tid, "residual_check", name, src, "not_applicable" if st == "withheld" else "failed", t, covers=cov,
                              reason="table withheld" if st == "withheld" else f"toolkit error: {tr.get('error', '')}"))
        elif downgraded(t):
            m = {"share_below_k5": (ka.get("share_below") or {}).get("k<5")} if ka.get("share_below") else {}
            tests.append(test(tid, "residual_check", name, src, "unsupported", t, metrics=m, covers=cov, reason=downgraded(t)))
        elif "records with k<5" in risks:
            sb = ka.get("share_below", {})
            ko = tr.get("k_anonymity_original", {}) or {}
            m = {"share_below_k5": risks["records with k<5"], "share_below_k2": sb.get("k<2"), "share_below_k10": sb.get("k<10"),
                 "min_k": ka.get("min_k"), "median_k": ka.get("median_k"), "n_classes": ka.get("n_classes"),
                 "sample_uniqueness": ka.get("sample_uniqueness")}
            ld = tr.get("l_diversity") or {}
            for k_, v_ in ld.items():
                if num(v_) is not None:
                    m[f"l_diversity.{k_}"] = v_
            tests.append(test(tid, "residual_check", name, src, "evaluated", t, metrics=m, covers=cov,
                              denominators={"n": ka.get("n"), "n_quasi_identifiers": len(ka.get("qis", []))},
                              original={"share_below_k5": (ko.get("share_below") or {}).get("k<5"), "min_k": ko.get("min_k")},
                              assumptions=[f"equivalence classes over the released catalogued quasi-identifiers {ka.get('qis', [])} as written (generalised values count as their label)",
                                           "attacker who knows these attributes; k counts rows, not people"]))
        else:
            note = ka.get("note", "")
            tests.append(test(tid, "residual_check", name, src, "not_applicable", t, covers=cov,
                              reason=note or "no catalogued quasi-identifier released"))

        # linkage (per attack spec targeting this table, or a single 'no_spec' entry)
        tspecs = [s for s in specs if s["dataset"] == dataset and s["table"] == t]
        lk = tr.get("linkage") or {}
        cov = [T_QI, T_ATTR]
        if not tspecs:
            tests.append(test(f"linkage.{t}.no_spec", "attack", f"Linkage attack on {t}", "metadata/attack_specs.json", "not_applicable", t,
                              covers=cov, reason="no attack spec targets this table (metadata/attack_specs.json); background-knowledge linkage on it is NOT covered"))
        for sp in tspecs:
            adv = sp["adversary"]
            tid = f"linkage.{t}.{adv}"
            name = f"Linkage attack '{adv}' on {t}"
            src = f"metadata/attack_specs.json adversary={adv} (pets_eval.attacks.linkage_attack)"
            spec_cols = sorted({c for q in sp["qis"] for c in q["protected"]})
            samp = f"--max-adversary {ctx['max_adversary']} rows of adversary/{adv}.csv (uniform sample with seed 0 only when the file is larger)"
            assume = [f"attacker knows {', '.join(sorted({c for q in sp['qis'] for c in q['adversary']}))} for people on the list; spec columns {spec_cols}",
                      f"sensitive attribute: {sp.get('sensitive')}; attribute-inference success is reported with its majority-guess base rate",
                      "re-identification = unique candidate is the right person, over list members present in the release (n_targets_in_data)"]
            if st == "withheld":
                tests.append(test(tid, "attack", name, src, "not_applicable", t, covers=cov, reason="table withheld: no rows to link", sampling=samp))
                continue
            if st == "error":
                tests.append(test(tid, "attack", name, src, "failed", t, covers=cov, reason=f"toolkit error: {tr.get('error', '')}"))
                continue
            if downgraded(t):
                tests.append(test(tid, "attack", name, src, "unsupported", t, covers=cov, reason=downgraded(t), assumptions=assume))
                continue
            res = lk.get(adv)
            if res is None:
                reason = lk.get("note") or "the scorecard did not run this adversary for the scenario"
                tests.append(test(tid, "attack", name, src, "unsupported", t, covers=cov, reason=reason, assumptions=assume))
                continue
            if not res.get("evaluated"):
                r = str(res.get("reason", ""))
                status = "failed" if r.startswith("error") else "unsupported"
                tests.append(test(tid, "attack", name, src, status, t, covers=cov, reason=r or "not evaluated", assumptions=assume))
                continue
            qis_used = res.get("qis_used") or []
            if not qis_used:
                tests.append(test(tid, "attack", name, src, "unsupported", t, covers=cov,
                                  metrics={"reidentification_rate": None},
                                  original={"reidentification_rate": res.get("baseline_reidentification_rate_original")},
                                  reason="every attacker column of this spec was removed, so no attack ran; the toolkit records reidentification 0.0 "
                                         "but that is reduced coverage, not a measured 0", assumptions=assume))
                continue
            ai = res.get("attribute_inference") or {}
            used_cols = sorted({c for q in qis_used for c in q.get("protected", [])})
            m = {"reidentification_rate": res.get("reidentification_rate"),
                 "attribute_inference_success": ai.get("success_rate"),
                 "base_rate": ai.get("base_rate_majority_guess"),
                 "advantage_over_base_rate": ai.get("advantage_over_base_rate"),
                 "baseline_original": res.get("baseline_reidentification_rate_original"),
                 "risk_reduction": res.get("risk_reduction"),
                 "claim_precision": res.get("claim_precision"),
                 "share_targets_in_candidate_set_le5": res.get("share_targets_in_candidate_set_le5"),
                 "median_candidate_set": res.get("median_candidate_set"),
                 "linkage_component": max(res.get("reidentification_rate") or 0.0, ai.get("advantage_over_base_rate") or 0.0),
                 "n_qis_used": len(qis_used)}
            a2 = list(assume)
            if len(used_cols) < len(spec_cols):
                a2.append(f"reduced attacker overlap: only {used_cols} of the spec columns {spec_cols} are in the release")
            tests.append(test(tid, "attack", name, src, "evaluated", t, metrics=m, covers=cov, sampling=samp,
                              denominators={"n_targets_in_data": res.get("n_targets_in_data"),
                                            "n_adversary_rows_tested": res.get("n_adversary_rows_tested"),
                                            "n_unique_claims": res.get("n_unique_claims"),
                                            "n_attribute_inferences": ai.get("inferred")},
                              original={"reidentification_rate": res.get("baseline_reidentification_rate_original")},
                              assumptions=a2))

        # synthetic-branch measurements (only when the toolkit did not align rows)
        syn = tr.get("synthetic") or {}
        if syn:
            mia = syn.get("membership_inference") or {}
            dcr = syn.get("dcr") or {}
            m = {"membership_inference_advantage": mia.get("advantage"), "membership_inference_auc": mia.get("auc"),
                 "share_exact_copies": dcr.get("share_exact_copies")}
            reason = downgraded(t) or "row-level release scored as synthetic"
            tests.append(test(f"membership_inference.{t}", "attack", f"Synthetic-data branch (DCR / membership inference) on {t}",
                              "pets_eval.privacy.dcr_report / membership_inference_auc", "unsupported", t, metrics=m, covers=[T_MIA],
                              reason=f"{reason}; these numbers assume a synthetic release and do not apply to a transformed row-level table",
                              denominators={"n_each": mia.get("n_each"), "dcr_n_synthetic": dcr.get("n_synthetic")},
                              sampling=f"DCR {SAMPLING['dcr_rows']} rows, MIA {SAMPLING['mia_rows_per_side']}/side, seed 0 (row-order dependent)"))

        # residual regex scan (informational)
        if released:
            hits = tr.get("regex_residuals") or {}
            m = {"total_hits": sum(sum(v.values()) for v in hits.values())}
            agg: dict = {}
            for c, v in hits.items():
                for k_, n_ in v.items():
                    agg[k_] = agg.get(k_, 0) + n_
            for k_, n_ in sorted(agg.items()):
                m[f"regex.{k_}"] = n_
            tests.append(test(f"residual_check.{t}", "residual_check", f"Regex residual scan of {t} (informational)",
                              "pets_eval.check.scan_text via scorecard regex_residuals", "evaluated", t, metrics=m, covers=[T_DIRECT, T_TEXT],
                              denominators={"rows_scanned": min(SAMPLING["regex_residual_rows"], tr.get("rows_protected") or 0)},
                              sampling=f"first {SAMPLING['regex_residual_rows']} protected rows (prot.head)",
                              assumptions=["counts only; never enters the toolkit score; PHONE and LICENSE_PLATE are pattern-only (false positives possible)"]))
        else:
            tests.append(test(f"residual_check.{t}", "residual_check", f"Regex residual scan of {t} (informational)",
                              "pets_eval.check.scan_text via scorecard regex_residuals", "not_applicable" if st == "withheld" else "failed", t,
                              covers=[T_DIRECT, T_TEXT], reason="table withheld" if st == "withheld" else f"toolkit error: {tr.get('error', '')}"))

        # free text
        for c in cat_cols(cat, t, "free_text"):
            text_tests(tests, t, c, tr, ctx, downgraded(t))

    # ---------------- export check (informational)
    chk = ctx.get("check")
    if chk is not None:
        m = {"total_hits": sum(chk.get("totals", {}).values())}
        for k_, n_ in sorted(chk.get("totals", {}).items()):
            m[f"regex.{k_}"] = n_
        tests.append(test("residual_check.export", "residual_check", "Regex residual scan of the shareable export folder (informational)",
                          "pets_eval check <run>/export/<dataset>", "evaluated", "export", metrics=m, covers=[T_DIRECT, T_TEXT],
                          denominators={"n_files_scanned": chk.get("n_files_scanned", 0)},
                          assumptions=["every line of every exported file; counts only, examples stay in the private out folder"]))

    # ---------------- utility
    for u in sc.get("utility", []):
        utility_test(tests, u, ctx)

    # ---------------- aggregate score
    s = sc.get("summary") or {}
    comps = sc.get("risk_components") or {}
    m = {"privacy": s.get("privacy"), "utility": s.get("utility"), "composite": s.get("composite"), "n_risk_components": len(comps)}
    for k_, v_ in comps.items():
        m[f"component.{k_}"] = v_
    agg_assume = ["toolkit self-assessment (pets_eval scorecard summary), NOT the official judging score and NOT a probability of anonymity",
                  "privacy = 1 - (0.5*worst + 0.5*mean) over the risk components present; withholding a table removes its components and extra zero-valued components raise the mean",
                  "utility = mean over the scenario's tasks; a required task that is not answerable scores 0 in this mean"]
    if rep_failed:
        tests.append(test("aggregate_score", "aggregate_score", "pets-eval composite self-assessment", "pets_eval.scorecard summary", "unsupported",
                          "dataset", metrics=m, assumptions=agg_assume,
                          reason="representation failed for " + ", ".join(sorted(rep_failed)) + ": the composite mixes components scored under the wrong representation"))
    elif s.get("composite") is None:
        tests.append(test("aggregate_score", "aggregate_score", "pets-eval composite self-assessment", "pets_eval.scorecard summary", "unsupported",
                          "dataset", metrics=m, assumptions=agg_assume, reason="the toolkit produced no composite (no risk components or no utility tasks)"))
    else:
        tests.append(test("aggregate_score", "aggregate_score", "pets-eval composite self-assessment", "pets_eval.scorecard summary", "evaluated",
                          "dataset", metrics=m, assumptions=agg_assume))
    return tests, representation, notes


def text_tests(tests, t, c, tr, ctx, down):
    st = tr.get("status")
    tid = f"text_leakage.{t}.{c}"
    name = f"Free-text identifier leakage in {t}.{c} (public-gold rows)"
    src = f"metadata/pii_spans/{ctx['dataset']}__{t}__{c}.jsonl (pets_eval.text.redaction_leakage)"
    cov = [T_TEXT, T_SPOKEN]
    ft = (tr.get("free_text") or {}).get(c)
    ev = ctx.get("eval_split", {}).get((t, c))
    assume = ["gold spans are the organiser's annotations (independent of Mask's detector); a span leaks when its normalised value (case, whitespace, digit separators) survives in the protected text of the same record",
              "spans whose normalised value is shorter than 3 characters are not testable and are excluded from n (e.g. 2-digit AGE values)",
              "identifying_leakage_rate excludes HEALTH, DATE, LOCATION, ORG and AGE (pets_eval.text.IDENTIFYING)",
              "hard_label_leaks counts leaked spans of Mask's hard labels: " + ", ".join(HARD_LABELS)]
    eval_id = f"text_leakage.{t}.{c}.eval_split"
    eval_name = f"Free-text identifier leakage in {t}.{c} (eval-split rows)"
    eval_reason = "eval-split gold spans are organiser-held: leakage on these released rows is not measured locally (unsupported, never 0)"
    if st == "withheld" or (ft and ft.get("status") == "withheld"):
        tests.append(test(tid, "text_leakage", name, src, "not_applicable", f"{t}.{c}", covers=cov, reason="text column not released"))
        tests.append(test(eval_id, "text_leakage", eval_name, src, "not_applicable", f"{t}.{c}", covers=cov, reason="text column not released"))
        return
    if st == "error":
        tests.append(test(tid, "text_leakage", name, src, "failed", f"{t}.{c}", covers=cov, reason=f"toolkit error: {tr.get('error', '')}"))
        return
    # eval split
    if ev is not None:
        if ev["released"] > 0:
            tests.append(test(eval_id, "text_leakage", eval_name, src, "unsupported", f"{t}.{c}", covers=cov, reason=eval_reason,
                              denominators={"n_records_eval_split_released": ev["released"], "n_records_eval_split_original": ev["original"]},
                              assumptions=["organiser-held hidden labels are a future independent check, not a result we possess"]))
        else:
            tests.append(test(eval_id, "text_leakage", eval_name, src, "not_applicable", f"{t}.{c}", covers=cov,
                              reason="no eval-split record of this column is in the release",
                              denominators={"n_records_eval_split_original": ev["original"]}))
    if down:
        tests.append(test(tid, "text_leakage", name, src, "unsupported", f"{t}.{c}", covers=cov, reason=down, assumptions=assume))
        return
    if not ft:
        tests.append(test(tid, "text_leakage", name, src, "unsupported", f"{t}.{c}", covers=cov, reason="the scorecard produced no free-text result"))
        return
    if not ft.get("evaluated"):
        r = str(ft.get("reason", ""))
        tests.append(test(tid, "text_leakage", name, src, "failed" if r.startswith("error") else "unsupported", f"{t}.{c}", covers=cov,
                          reason=r or "not evaluated", assumptions=assume))
        return
    per = ft.get("per_label") or {}
    hard_n = sum(v["n"] for k, v in per.items() if k in HARD_LABELS)
    hard_leaked = sum(v["leaked"] for k, v in per.items() if k in HARD_LABELS)
    m = {"leakage_rate": ft.get("leakage_rate"), "leakage_rate_chars": ft.get("leakage_rate_chars"),
         "identifying_leakage_rate": ft.get("identifying_leakage_rate"),
         "hard_label_leaks": hard_leaked, "hard_label_leak_rate": round(hard_leaked / hard_n, 6) if hard_n else 0.0}
    d = {"n_values": ft.get("n_values"), "n_hard_label_values": hard_n}
    for k, v in sorted(per.items()):
        m[f"per_label.{k}"] = v.get("rate")
        m[f"per_label_leaked.{k}"] = v.get("leaked")
        d[f"per_label.{k}"] = v.get("n")
    a2 = list(assume)
    so = ctx.get("text_outputs", {}).get((t, c))
    if so is not None:
        same = so.get("n_values") == ft.get("n_values") and so.get("leakage_rate") == ft.get("leakage_rate")
        a2.append("standalone `pets_eval text --rowmap` run " + ("agrees with the scorecard" if same else
                  f"DIFFERS from the scorecard (n_values {so.get('n_values')} vs {ft.get('n_values')}, leakage {so.get('leakage_rate')} vs {ft.get('leakage_rate')})"))
    if not ft.get("n_values"):
        tests.append(test(tid, "text_leakage", name, src, "unsupported", f"{t}.{c}", metrics=m, denominators=d, covers=cov, assumptions=a2,
                          reason="no gold span value of a released record was testable (n_values = 0)"))
        return
    tests.append(test(tid, "text_leakage", name, src, "evaluated", f"{t}.{c}", metrics=m, denominators=d, covers=cov, assumptions=a2))


def utility_test(tests, u, ctx):
    tid = f"utility.{u['id']}"
    name = f"{u['id']}: {u.get('description', '')}"
    detail = u.get("detail") or {}
    req = bool(u.get("required"))
    assume = [f"required by the scenario: {'yes' if req else 'no'}",
              "a required task that is not answerable scores 0 in the toolkit's utility mean; here it is reported as unsupported, not 0",
              f"metric: {u.get('metric')}"]
    if u["id"] == "CS-U5":
        assume.append(f"20,000 original turns sampled with random_state=7 from ALL turns (eval split included); withheld turns lower the score")
    if u.get("score") is not None:
        m = {"score": u["score"]}
        orig = {}
        for k, v in detail.items():
            if num(v) is None:
                continue
            if k.endswith("_original"):
                orig[k[: -len("_original")]] = v
                m[k] = v
            else:
                m[k] = v
        tests.append(test(tid, "utility", name, u["id"], "evaluated", u.get("table", ""), metrics=m, assumptions=assume,
                          original=orig or None,
                          denominators={"sample_turns": SAMPLING["cs_u5_sample_turns"]} if u["id"] == "CS-U5" else None))
    elif u.get("metric") == "not answerable":
        miss = detail.get("missing", [])
        tests.append(test(tid, "utility", name, u["id"], "unsupported", u.get("table", ""), metrics={"score": None}, assumptions=assume,
                          reason=f"not answerable on the protected release: missing {', '.join(map(str, miss)) or 'inputs'}"))
    else:
        err = detail.get("error", u.get("metric"))
        tests.append(test(tid, "utility", name, u["id"], "failed", u.get("table", ""), metrics={"score": None}, assumptions=assume,
                          reason=f"toolkit error: {err}"))


# ------------------------------------------------------------------ structural validation (mirror of the zod schema)
def validate_report(r: dict) -> list[str]:
    errs = []

    def req(obj, key, typ, where):
        if key not in obj:
            errs.append(f"{where}: missing {key}")
            return None
        if typ is not None and not isinstance(obj[key], typ):
            errs.append(f"{where}.{key}: expected {typ}, got {type(obj[key]).__name__}")
        return obj.get(key)

    if r.get("version") != 1:
        errs.append("version must be 1")
    for k in ["reportId", "adapterVersion", "dataset", "scenarioId", "split", "inputHash", "goalId", "planHash", "outputHash", "createdAt"]:
        req(r, k, str, "report")
    req(r, "durationMs", (int, float), "report")
    tk = req(r, "toolkit", dict, "report") or {}
    for k in ["name", "version"]:
        req(tk, k, str, "toolkit")
    cl = req(tk, "commandLog", list, "toolkit") or []
    if not all(isinstance(x, str) for x in cl):
        errs.append("toolkit.commandLog: strings only")
    rep = req(r, "representation", dict, "report") or {}
    for k, v in rep.items():
        if v not in REPRESENTATIONS:
            errs.append(f"representation.{k}: {v} not in {REPRESENTATIONS}")
    for i, a in enumerate(req(r, "privateArtifacts", list, "report") or []):
        for k in ["name", "path", "sha256"]:
            req(a, k, str, f"privateArtifacts[{i}]")
    notes = req(r, "notes", list, "report") or []
    if not all(isinstance(x, str) for x in notes):
        errs.append("notes: strings only")
    ids = set()
    for i, t in enumerate(req(r, "tests", list, "report") or []):
        w = f"tests[{i}]"
        for k in ["id", "name", "source", "scope"]:
            req(t, k, str, w)
        if t.get("id") in ids:
            errs.append(f"{w}: duplicate id {t.get('id')}")
        ids.add(t.get("id"))
        if t.get("kind") not in TEST_KINDS:
            errs.append(f"{w}.kind: {t.get('kind')}")
        if t.get("status") not in STATUSES:
            errs.append(f"{w}.status: {t.get('status')}")
        if t.get("status") != "evaluated" and not t.get("statusReason"):
            errs.append(f"{w}: status {t.get('status')} needs a statusReason")
        for k in ["metrics", "denominators"]:
            d = req(t, k, dict, w) or {}
            for mk, mv in d.items():
                if k == "metrics" and mv is not None and not isinstance(mv, (int, float)):
                    errs.append(f"{w}.metrics.{mk}: number or null")
                if k == "denominators" and not isinstance(mv, (int, float)):
                    errs.append(f"{w}.denominators.{mk}: number")
        if "original" in t:
            for mk, mv in t["original"].items():
                if mv is not None and not isinstance(mv, (int, float)):
                    errs.append(f"{w}.original.{mk}: number or null")
        for k in ["assumptions", "covers"]:
            lst = req(t, k, list, w) or []
            if not all(isinstance(x, str) for x in lst):
                errs.append(f"{w}.{k}: strings only")
        for k in ["statusReason", "sampling"]:
            if k in t and not isinstance(t[k], str):
                errs.append(f"{w}.{k}: string")
    return errs


# ------------------------------------------------------------------ main
UNCOVERED_NOTES = [
    "NOT COVERED (cross_table_key_linkage): no cross-table attack is run; joining customers, conversations and turns through released keys/tokens (customer_id, conversation_id) or timestamps (started_ts) is not attacked by the supplied package.",
    "NOT COVERED (trajectory): the package defines no trajectory/unicity attack for this dataset; turn and conversation timestamps are only covered by k-anonymity over catalogued quasi-identifiers.",
    "NOT COVERED (eval-split text): gold spans for eval-split conversations are organiser-held; leakage on those rows is reported as unsupported, never 0.",
    "NOT COVERED (hidden attackers): organiser-held stronger attackers, breach dumps and hidden labels named in the threat model have not been run; no such result is claimed.",
    "NOT COVERED (membership_inference): membership inference runs in the toolkit only for tables it treats as synthetic; it is not measured for row-level releases.",
    "NOT COVERED (linkage on tables without an attack spec): only the attack specs in metadata/attack_specs.json are run; other tables get linkage.<table>.no_spec = not_applicable.",
]


def eval_split_counts(dataset: str, original_dir: Path, staging_dir: Path, staged: list, cat: list) -> dict:
    """For each free-text column: how many eval-split records exist in the original and are released (via the rowmap)."""
    out = {}
    conv = original_dir / "conversations.csv"
    if dataset != "customer_service" or not conv.exists():
        return out
    split = {}
    with open(conv, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            split[row["conversation_id"]] = row.get("split")
    eval_conv = {k for k, v in split.items() if v == "eval"}
    turn_conv = {}
    turns = original_dir / "turns.csv"
    if turns.exists():
        with open(turns, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                turn_conv[row["turn_id"]] = row["conversation_id"]
    is_eval = {"conversations": lambda rid: rid in eval_conv, "turns": lambda rid: turn_conv.get(rid) in eval_conv}
    n_orig = {"conversations": len(eval_conv), "turns": sum(1 for v in turn_conv.values() if v in eval_conv)}
    for st in staged:
        t = st["name"]
        if t not in is_eval:
            continue
        for c in cat_cols(cat, t, "free_text"):
            released = 0
            rm = (st.get("rowmap") or {}).get("path")
            col_released = st.get("released") and any(x["name"] == c and x["status"] != "suppressed" for x in st.get("columns", []))
            if col_released and rm and (staging_dir.parent.parent / rm).exists():
                released = sum(1 for _, rid in read_rowmap(staging_dir.parent.parent / rm) if is_eval[t](rid))
            elif col_released:
                released = n_orig[t]  # released without a rowmap: assume every eval record is in it
            out[(t, c)] = {"released": released, "original": n_orig[t]}
    return out


def rel(p: Path) -> str:
    try:
        return str(p.resolve().relative_to(MASK_DIR))
    except ValueError:
        return str(p.resolve())


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="run folder written by scripts/bench/run_plan.ts")
    ap.add_argument("--scenario", help="scenario id (default: executed.json scenarioId)")
    ap.add_argument("--pkg", default=os.environ.get("PETS_ROOT", str(DEFAULT_PKG)), help="challenge package root")
    ap.add_argument("--max-adversary", type=int, default=3000)
    ap.add_argument("--python", default=sys.executable, help="python for the toolkit subprocess")
    a = ap.parse_args(argv)
    t0 = time.time()
    run = Path(a.run).resolve()
    pkg = Path(a.pkg).resolve()
    ex = read_json(run / "executed.json")
    dataset = ex["dataset"]
    scenario = a.scenario or ex["scenarioId"]
    if scenario != ex["scenarioId"]:
        print(f"warning: --scenario {scenario} differs from the executed plan's scenario {ex['scenarioId']}", file=sys.stderr)
    original_dir = Path(ex["originalDir"]) if ex.get("originalDir") else pkg / "data" / dataset
    staging = run / "staging" / dataset
    export = run / "export" / dataset
    out = run / "out"
    out.mkdir(parents=True, exist_ok=True)
    (out / "commands.log").write_text("", encoding="utf-8")
    if not (pkg / "metadata" / "field_catalog.csv").exists():
        raise SystemExit(f"package root {pkg} has no metadata/field_catalog.csv; refusing to run (the toolkit would silently score an empty catalog)")
    if out.resolve() == staging.resolve() or str(out.resolve()).startswith(str(export.resolve())):
        raise SystemExit("out folder must be separate from staging and export")
    tk = Toolkit(pkg, out, a.python)
    cat = catalog_rows(pkg, dataset)
    specs = read_json(pkg / "metadata" / "attack_specs.json")["attacks"]
    notes: list = []

    # 1. scorecard
    sc_res = tk.run(["scorecard", "--original", str(original_dir), "--protected", str(staging), "--scenario", scenario,
                     "--root", str(pkg), "--out", str(out), "--max-adversary", str(a.max_adversary)])
    sc_file = out / "scorecard.json"
    if sc_res.returncode != 0 or not sc_file.exists():
        raise SystemExit(f"pets_eval scorecard failed (exit {sc_res.returncode}): {sc_res.stderr[-2000:]}")
    sc = read_json(sc_file)
    if not isinstance(sc.get("scenario"), dict):
        notes.append(f"scenario {scenario} was not resolved by the toolkit: every task of the dataset was treated as required")
    # catalog resolution sanity check (map: an unresolved root silently scores privacy 1.0)
    for t, tr in sc.get("tables", {}).items():
        if tr.get("status") == "released" and cat_cols(cat, t, "quasi_identifier") and "no catalogued quasi-identifier" in str((tr.get("k_anonymity") or {}).get("note", "")):
            kept_qi = [c for c in cat_cols(cat, t, "quasi_identifier") if c not in (tr.get("columns_dropped") or [])]
            if kept_qi:
                raise SystemExit(f"{t}: catalogued quasi-identifiers {kept_qi} are released but the toolkit reports none: catalog not resolved")

    # 2. standalone text leakage per released text column with public gold, through the rowmap
    text_outputs = {}
    staged = ex.get("tables", [])
    for st in staged:
        t = st["name"]
        for c in cat_cols(cat, t, "free_text"):
            gold = pkg / "metadata" / "pii_spans" / f"{dataset}__{t}__{c}.jsonl"
            rm = (st.get("rowmap") or {}).get("path")
            released = st.get("released") and any(x["name"] == c and x["status"] != "suppressed" for x in st.get("columns", []))
            if not (gold.exists() and released and rm):
                continue
            o = out / f"text_{t}__{c}.json"
            r = tk.run(["text", "--gold", str(gold), "--protected", str(run / st["stagingPath"]), "--text-col", c,
                        "--rowmap", str(run / rm), "--out", str(o)])
            if r.returncode == 0 and o.exists():
                text_outputs[(t, c)] = read_json(o)
            else:
                notes.append(f"standalone pets_eval text for {t}.{c} failed (exit {r.returncode}); the scorecard's free_text result is used")

    # 3. residual check on the EXPORT folder (never the staging folder: rowmaps are not part of the artifact)
    chk = None
    r = tk.run(["check", str(export), "--out", str(out / "check.json")])
    if r.returncode == 0 and (out / "check.json").exists():
        chk = read_json(out / "check.json")
    else:
        notes.append(f"pets_eval check failed (exit {r.returncode})")

    # export isolation: the export folder must contain only tables
    bad = [p.name for p in export.rglob("*") if p.is_file() and (p.suffix.lower() != ".csv" or p.name.startswith("rowmap_") or p.name.startswith("_"))]
    if bad:
        raise SystemExit(f"export folder contains non-table files {bad}: refusing to report")

    ctx = {"dataset": dataset, "cat": cat, "specs": specs, "staged": staged, "text_outputs": text_outputs, "check": chk,
           "eval_split": eval_split_counts(dataset, original_dir, staging, staged, cat), "max_adversary": a.max_adversary}
    tests, representation, tnotes = build_tests(sc, ctx)
    notes += tnotes

    # notes: provenance and coverage
    notes.insert(0, "Development self-assessment with the supplied pets-eval toolkit on synthetic challenge data; not the official judging score and not a probability of anonymity.")
    notes.append(f"detectionMode: {ex.get('detectionMode')} - {ex.get('detectionNote', '')}")
    if ex.get("controls"):
        notes.append(f"controls: {', '.join(ex['controls'])} (deliberate control plan: expected to fail privacy or utility constraints)")
    if ex.get("limitRows"):
        notes.append(f"limit-rows subset ({ex['limitRows']}): " + "; ".join(ex.get("subsetLog", [])) + f". The toolkit compared against the same subset of the originals ({rel(original_dir)}); numbers are not comparable with full-size runs.")
    if ex.get("omittedRowmaps"):
        notes.append(f"rowmaps deliberately omitted for {', '.join(ex['omittedRowmaps'])} (representation failure test)")
    if ex.get("shuffled"):
        notes.append("protected rows were reordered deterministically (seeded) before staging; rowmaps map the new order")
    rew = {t["name"]: t["naRewrites"] for t in staged if t.get("naRewrites")}
    if rew:
        notes.append(f"NA-token placeholders rewritten in staging (export keeps the app bytes): {rew}")
    for w in ex.get("proposalWarnings", []):
        notes.append(f"proposal warning: {w}")
    notes.append(f"seed {ex.get('seed')}: {ex.get('sessionKey')}")
    notes.append("fixed toolkit sampling limits and seeds: " + json.dumps(SAMPLING, sort_keys=True))
    notes += UNCOVERED_NOTES
    if sc.get("extra_protected_files"):
        notes.append(f"extra staged files ignored by the toolkit: {sc['extra_protected_files']}")

    # versions and private artifacts
    spans_used = sorted((pkg / "metadata" / "pii_spans").glob(f"{dataset}__*.jsonl"))
    hashes = {
        "toolkit/pets_eval": sha256_dir(pkg / "toolkit" / "pets_eval"),
        "metadata/attack_specs.json": sha256_file(pkg / "metadata" / "attack_specs.json"),
        "metadata/field_catalog.csv": sha256_file(pkg / "metadata" / "field_catalog.csv"),
        "metadata/scenarios.json": sha256_file(pkg / "metadata" / "scenarios.json"),
        **{f"metadata/pii_spans/{p.name}": sha256_file(p) for p in spans_used},
    }
    version = toolkit_version(pkg)
    attack_specs_version = read_json(pkg / "metadata" / "attack_specs.json").get("version")
    notes.append(f"toolkit pets-eval {version} (scorecard tool string '{sc.get('tool')}'), attack_specs version {attack_specs_version}; sha256: "
                 + "; ".join(f"{k}={v}" for k, v in hashes.items()))
    private = []
    for p in sorted(x for x in run.rglob("*") if x.is_file() and x.name != "report.json"):
        parts = p.relative_to(run).parts
        if parts[0] in ("staging", "out", "original") or p.name in ("executed.json", "plan.json", "goal.json"):
            private.append({"name": "/".join(parts), "path": rel(p), "sha256": sha256_file(p)})
    commands = list(tk.log)

    report_id = "bench_" + hashlib.sha256(json.dumps([ex["planHash"], ex["outputHash"], scenario, hashes["toolkit/pets_eval"],
                                                      a.max_adversary, ex.get("detectionMode"), ex.get("limitRows"),
                                                      ex.get("omittedRowmaps"), ex.get("stagingHash")]).encode()).hexdigest()[:20]
    report = {
        "version": 1, "reportId": report_id, "adapterVersion": ADAPTER_VERSION,
        "toolkit": {"name": "pets-eval", "version": version, "commandLog": commands},
        "dataset": dataset, "scenarioId": scenario, "split": ex.get("split", "unknown"),
        "inputHash": ex["inputHash"], "goalId": ex["goalId"], "planHash": ex["planHash"], "outputHash": ex["outputHash"],
        "representation": representation, "tests": tests, "privateArtifacts": private,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "durationMs": int((time.time() - t0) * 1000), "notes": notes,
    }
    errs = validate_report(report)
    if errs:
        (run / "report.invalid.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        raise SystemExit("report failed structural validation:\n  " + "\n  ".join(errs[:30]))
    (run / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary = {s: sum(1 for t in tests if t["status"] == s) for s in STATUSES}
    print(f"report {report_id}: {len(tests)} tests {summary} -> {run / 'report.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
