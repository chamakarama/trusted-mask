"""Status mapping of run_bench.build_tests on a saved (sanitised) scorecard.json fixture.

    python3 -I bench/tests/test_status_mapping.py
The fixture is the CS-S1 leaky control on a 3000-customer subset (scorecard 'examples' removed).
"""
import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import run_bench as rb  # noqa: E402

PKG = rb.DEFAULT_PKG
SC = json.loads((HERE / "fixtures" / "scorecard_cs_s1_leaky_subset.json").read_text())
STAGED = json.loads((HERE / "fixtures" / "staged_cs_s1_leaky_subset.json").read_text())


def ctx():
    return {"dataset": "customer_service", "cat": rb.catalog_rows(PKG, "customer_service"),
            "specs": json.loads((PKG / "metadata" / "attack_specs.json").read_text())["attacks"], "staged": STAGED,
            "text_outputs": {}, "check": {"totals": {}, "n_files_scanned": 3},
            "eval_split": {("turns", "text"): {"released": 10, "original": 20}, ("conversations", "agent_note"): {"released": 1, "original": 2}},
            "max_adversary": 3000}


def by_id(tests):
    return {t["id"]: t for t in tests}


@unittest.skipUnless((PKG / "metadata" / "field_catalog.csv").exists(), "challenge package not found")
class StatusMapping(unittest.TestCase):
    def test_leaky_fixture(self):
        tests, rep, _ = rb.build_tests(SC, ctx())
        t = by_id(tests)
        self.assertEqual(rep, {"customers": "row_level", "conversations": "row_level", "turns": "row_level"})
        self.assertEqual(t["representation.turns"]["status"], "evaluated")
        self.assertGreater(t["direct_identifiers_retained.customers"]["metrics"]["direct_identifiers_retained"], 0)
        lk = t["linkage.customers.leaked_customer_list"]
        self.assertEqual(lk["status"], "evaluated")
        self.assertGreater(lk["metrics"]["reidentification_rate"], 0)
        self.assertIn("n_targets_in_data", lk["denominators"])
        self.assertEqual(t["linkage.turns.no_spec"]["status"], "not_applicable")
        self.assertEqual(t["text_leakage.turns.text.eval_split"]["status"], "unsupported")
        self.assertGreater(t["text_leakage.turns.text"]["metrics"]["hard_label_leaks"], 0)
        self.assertEqual(t["direct_identifiers_retained.turns"]["status"], "not_applicable")
        self.assertEqual(rb.validate_report({**self.shell(), "tests": tests, "representation": rep}), [])

    def shell(self):
        return {"version": 1, "reportId": "r", "adapterVersion": "a", "toolkit": {"name": "pets-eval", "version": "1.0.0", "commandLog": []},
                "dataset": "customer_service", "scenarioId": "CS-S1", "split": "test", "inputHash": "i", "goalId": "g", "planHash": "p",
                "outputHash": "o", "privateArtifacts": [], "createdAt": "x", "durationMs": 1, "notes": []}

    def test_failures_and_unsupported_are_never_zero(self):
        sc = copy.deepcopy(SC)
        sc["tables"]["turns"]["row_alignment"] = "original record ids kept in the release (itself a linkage key)"
        sc["tables"]["conversations"] = {"table": "conversations", "status": "error", "error": "KeyError: 'share_below'"}
        lk = sc["tables"]["customers"]["linkage"]["leaked_customer_list"]
        sc["tables"]["customers"]["linkage"]["leaked_customer_list"] = {"evaluated": True, "qis_used": [], "reidentification_rate": 0.0,
                                                                         "baseline_reidentification_rate_original": lk.get("baseline_reidentification_rate_original")}
        sc["utility"][0] = {**sc["utility"][0], "score": None, "metric": "not answerable", "detail": {"missing": ["text"]}}
        sc["utility"][1] = {**sc["utility"][1], "score": None, "metric": "error", "detail": {"error": "ValueError"}}
        tests, rep, _ = rb.build_tests(sc, ctx())
        t = by_id(tests)
        self.assertEqual(t["representation.turns"]["status"], "failed")
        self.assertEqual(t["text_leakage.turns.text"]["status"], "unsupported")
        self.assertEqual(t["k_anonymity.turns"]["status"], "unsupported")
        self.assertEqual(t["representation.conversations"]["status"], "failed")
        self.assertEqual(t["direct_identifiers_retained.conversations"]["status"], "failed")
        stub = t["linkage.customers.leaked_customer_list"]
        self.assertEqual(stub["status"], "unsupported")
        self.assertIsNone(stub["metrics"]["reidentification_rate"])
        self.assertEqual(t[f"utility.{sc['utility'][0]['id']}"]["status"], "unsupported")
        self.assertEqual(t[f"utility.{sc['utility'][1]['id']}"]["status"], "failed")
        self.assertEqual(t["aggregate_score"]["status"], "unsupported")
        for x in tests:
            if x["status"] != "evaluated":
                self.assertTrue(x.get("statusReason"), x["id"])

    def test_withheld_table(self):
        sc = copy.deepcopy(SC)
        sc["tables"]["turns"] = {"table": "turns", "status": "withheld", "rows_original": 1}
        t = by_id(rb.build_tests(sc, ctx())[0])
        for i in ["representation.turns", "k_anonymity.turns", "text_leakage.turns.text", "text_leakage.turns.text.eval_split", "residual_check.turns"]:
            self.assertEqual(t[i]["status"], "not_applicable", i)


if __name__ == "__main__":
    unittest.main()
