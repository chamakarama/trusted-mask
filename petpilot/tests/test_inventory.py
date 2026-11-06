"""Scanner handoff tests on the team-generated synthetic fixture (no supplied labels or truth used).

run: python -m unittest discover -s petpilot/tests -t .
"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

import pandas as pd

from petpilot.inventory import ROLES, build_inventory

FIX = Path(__file__).resolve().parents[1] / "fixtures"
PLANTED_DIRECT = {"holder_name": "PERSON_NAME", "holder_email": "EMAIL", "holder_phone": "PHONE",
                  "holder_id_code": "NATIONAL_ID"}


def _inv(variant: str) -> dict:
    return build_inventory(FIX / variant, "mobility_mini_fixture")


def _field(inv: dict, table: str, column: str) -> dict:
    hits = [f for f in inv["fields"] if f["table"] == table and f["column"] == column]
    assert len(hits) == 1, (table, column, len(hits))
    return hits[0]


class InventoryContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.named = _inv("mobility_mini")
        cls.renamed = _inv("mobility_mini_renamed")
        cls.mapping = json.loads((FIX / "mobility_mini_renamed" / "mapping.json").read_text(encoding="utf-8"))

    def col(self, variant_inv, table, original_column):
        if variant_inv is self.renamed:
            return _field(variant_inv, table, self.mapping[table][original_column])
        return _field(variant_inv, table, original_column)

    def test_envelope_and_every_column_once(self):
        for inv, folder in ((self.named, "mobility_mini"), (self.renamed, "mobility_mini_renamed")):
            self.assertEqual(inv["inventory_schema_version"], "1.0")
            self.assertEqual(inv["analysis_mode"], "rules")
            expected = []
            for f in sorted((FIX / folder).glob("*.csv")):
                expected += [(f.stem, c) for c in pd.read_csv(f, nrows=0).columns]
            got = [(x["table"], x["column"]) for x in inv["fields"]]
            self.assertEqual(sorted(got), sorted(expected))
            for x in inv["fields"]:
                self.assertIn(x["role"], ROLES)
                self.assertIn(x["certainty"], ("high", "medium", "low", "unknown"))
                self.assertTrue(x["rule_ids"], f"no rule ids for {x['column']}")

    def test_planted_direct_identifiers_flagged_even_with_obfuscated_headers(self):
        for inv in (self.named, self.renamed):
            for column, subtype in PLANTED_DIRECT.items():
                f = self.col(inv, "cards", column)
                self.assertEqual(f["role"], "direct_identifier", (column, f))
                self.assertEqual(f["subtype"], subtype, (column, f))

    def test_hash_of_id_code_is_reversible_identifier(self):
        for inv in (self.named, self.renamed):
            f = self.col(inv, "cards", "holder_ref")
            self.assertEqual(f["role"], "direct_identifier", f)
            self.assertIn("xcol.hash_of", f["rule_ids"])

    def test_birth_date_linked_to_id_code(self):
        for inv in (self.named, self.renamed):
            f = self.col(inv, "cards", "holder_birth_date")
            self.assertEqual((f["role"], f["subtype"]), ("quasi_identifier", "BIRTH_DATE"), f)

    def test_travel_card_id_is_not_a_payment_card(self):
        for inv in (self.named, self.renamed):
            f = self.col(inv, "taps", "card_id")
            self.assertNotEqual(f["subtype"], "PAYMENT_CARD", f)
        f = self.col(self.named, "taps", "card_id")
        self.assertEqual((f["role"], f["subtype"]), ("technical_identifier", "CARD_ID"), f)

    def test_ambiguous_categories_are_not_called_safe(self):
        for inv in (self.named, self.renamed):
            seg = self.col(inv, "cards", "segment")
            self.assertEqual(seg["role"], "unknown", seg)
            self.assertTrue(seg["needs_review"])
            ct = self.col(inv, "cards", "card_type")
            self.assertTrue(ct["art9_hint"] and ct["needs_review"], ct)
            self.assertNotEqual(ct["role"], "non_sensitive", ct)

    def test_exact_timestamps_are_quasi_identifiers(self):
        for inv in (self.named, self.renamed):
            f = self.col(inv, "taps", "ts")
            self.assertEqual((f["role"], f["subtype"]), ("quasi_identifier", "TIMESTAMP"), f)

    def test_reference_table_is_flagged_for_review_not_silently_safe(self):
        for x in self.named["fields"]:
            if x["table"] == "stops" and x["role"] != "record_key":
                self.assertTrue(x["needs_review"], x)

    def test_no_raw_values_in_inventory(self):
        cards = pd.read_csv(FIX / "mobility_mini" / "cards.csv", dtype=str, keep_default_na=False)
        text = json.dumps(self.named) + json.dumps(self.renamed)
        for column in list(PLANTED_DIRECT) + ["holder_ref", "card_id"]:
            for v in cards[column]:
                if v:
                    self.assertNotIn(v, text, f"raw value of {column} leaked into the inventory")


if __name__ == "__main__":
    unittest.main()
