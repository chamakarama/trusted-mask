"""Regression checks for the retained generic scanner; no benchmark labels used."""
import json
import tempfile
import unittest
from pathlib import Path

from petpilot.inventory import ROLES, build_inventory


def _field(inv, table, column):
    hits = [f for f in inv["fields"] if f["table"] == table and f["column"] == column]
    assert len(hits) == 1
    return hits[0]


class InventoryContract(unittest.TestCase):
    def test_named_and_obfuscated_contacts_are_detected_without_value_leakage(self):
        for email_column in ("email", "c02"):
            with self.subTest(email_column=email_column), tempfile.TemporaryDirectory() as d:
                path = Path(d)
                values = [f"fixture.person{i}@example.test" for i in range(20)]
                (path / "contacts.csv").write_text(
                    f"record_id,{email_column}\n" + "".join(f"R{i},{value}\n" for i, value in enumerate(values))
                )
                inv = build_inventory(path, "synthetic_contacts")
                self.assertEqual(inv["inventory_schema_version"], "1.0")
                self.assertEqual(inv["analysis_mode"], "rules")
                self.assertEqual(len(inv["fields"]), 2)
                self.assertEqual({f["column"] for f in inv["fields"]}, {"record_id", email_column})
                field = _field(inv, "contacts", email_column)
                self.assertEqual((field["role"], field["subtype"]), ("direct_identifier", "EMAIL"))
                for f in inv["fields"]:
                    self.assertIn(f["role"], ROLES)
                    self.assertTrue(f["rule_ids"])
                for value in values:
                    self.assertNotIn(value, json.dumps(inv))

    def test_opaque_categories_require_review(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d)
            (path / "records.csv").write_text("c01\n" + "\n".join(["X", "Y"] * 20) + "\n")
            field = _field(build_inventory(path, "opaque_fixture"), "records", "c01")
            self.assertEqual(field["role"], "unknown")
            self.assertTrue(field["needs_review"])


class FullColumnSweep(unittest.TestCase):
    def test_rare_identifier_beyond_the_sample_is_flagged(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            rows = [f"T{i:05d},{'ok' if i != 4321 else 'someone.rare@fixture.example'},{i % 7}" for i in range(6000)]
            (Path(d) / "events.csv").write_text("event_id,remark,code\n" + "\n".join(rows) + "\n", encoding="utf-8")
            inv = build_inventory(Path(d), "sweep_fixture", sample_rows=1000)
            remark = _field(inv, "events", "remark")
            self.assertTrue(remark["needs_review"])
            self.assertIn("sweep.identifier_shaped_values", remark["rule_ids"])
            self.assertEqual(remark["sweep"]["identifier_shaped_values"].get("email"), 1)
            self.assertNotIn("someone.rare", json.dumps(inv))
            # one e-mail anywhere in the column makes it a (low-certainty) direct identifier, never "unknown"
            self.assertEqual(remark["role"], "direct_identifier")
            self.assertEqual(remark["subtype"], "EMAIL")
            self.assertEqual(remark["certainty"], "low")
            self.assertIn("sweep.direct_identifier", remark["rule_ids"])
            code = _field(inv, "events", "code")
            self.assertNotEqual(code["role"], "direct_identifier")

    def test_phone_shaped_numbers_only_raise_review(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            rows = [f"{i},{'0401234567' if i == 4321 else str(1000 + i)}" for i in range(6000)]
            (Path(d) / "m.csv").write_text("row,reading\n" + "\n".join(rows) + "\n", encoding="utf-8")
            inv = build_inventory(Path(d), "sweep_fixture", sample_rows=1000)
            reading = _field(inv, "m", "reading")
            self.assertTrue(reading["needs_review"])
            self.assertNotEqual(reading["role"], "direct_identifier")


if __name__ == "__main__":
    unittest.main()
