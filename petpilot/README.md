# petpilot: the RouteSafe scanner (step 1, "detect")

Give it a table, and for every column it says what kind of information is in it, how risky that is, and why. It runs locally, uses no AI and sends nothing anywhere. It is rule-based, not AI.

RouteSafe uses it as the first operator step: the **private field inventory** in `planning/INTERFACES.md` ("Scanner and policy handoff"). The inventory only *explains* fields. It never authorises a field to leave the operator: Astra's policy and the publisher's export allowlist decide what is released.

## Requirements

Python 3.10+ and pandas 2 or 3 (`pip install -r petpilot/requirements.txt`). `evaluate-catalog` also needs the supplied toolkit (`pip install -e TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/toolkit`). It needs the real data files (`git lfs pull`), not LFS pointer files.

## Commands

```bash
# RouteSafe handoff: private inventory envelope for the mobility tables (writes into the git-ignored private/)
python -m petpilot inventory --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility --dataset mobility --out private/mobility_inventory.json

# tests on the team-generated synthetic fixture (no supplied labels/truth involved)
python -m unittest discover -s petpilot/tests -t .

# regenerate the fixture (deterministic) and its committed inventories
python petpilot/fixtures/make_mobility_mini.py
python -m petpilot inventory --data petpilot/fixtures/mobility_mini --dataset mobility_mini_fixture --out petpilot/fixtures/mobility_mini.inventory.json

# label-informed development metrics against the supplied field catalog (see caveat below)
python -m petpilot evaluate-catalog --package TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026 --out petpilot/evidence/dev_catalog_eval.json

# older catalog-format outputs (best-guess roles, for pets-eval detect)
python -m petpilot scan --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --only mobility --out private/mobility_labels.csv
python -m petpilot scan-file <one.csv> --out private/labels.csv
```

## Inventory envelope (`inventory_schema_version` 1.0)

The envelope fields are `scanner_version`, `source_commit` (with `+dirty` when uncommitted), `created_at`, `analysis_mode: "rules"`, `dataset`, `tables`, `sampling` (first 5,000 rows per table), `roles` and `fields`. Every input column appears exactly once.

| Field | Meaning |
|---|---|
| `table`, `column` | exact input identifiers |
| `role` | `direct_identifier`, `quasi_identifier`, `sensitive_attribute`, `technical_identifier`, `record_key`, `free_text`, `non_sensitive`, `unknown` |
| `subtype` | taxonomy subtype, e.g. `CARD_ID`, `TIMESTAMP`, `EMAIL` (`CARD_ID` links a card's records; it does not identify a person) |
| `reason` | short explanation, no values |
| `rule_ids` | the decision path, e.g. `val.email`, `name.di.person_name`, `ctx.id_column.entity`, `xcol.hash_of`, `ctx.reference_table`, `fallback.category` |
| `certainty` | `high` / `medium` / `low` from rule strength, `unknown` when no rule matched. Not a probability |
| `needs_review` | true for unknowns, low certainty, art9 hints, name-only evidence for linking/sensitive columns, reference-table downgrades and unlinked hashes |
| `art9_hint`, `links` | private hints: a possible special category; column relationships (`hash_of`, `encoded_in`), never passenger identities |

No raw values, recovered identifiers or row matches are written. `petpilot/tests` checks this on the fixture.

### Safety defaults (E1S)

- **Nothing found is not safe.** A column where no rule matched is `role: unknown` + `needs_review`. Short codes can still encode salary, union membership or health.
- **Reference tables are flagged.** A table with no person signal (e.g. `stops`) is reported `non_sensitive` with `ctx.reference_table` and `needs_review`, because absence of a person signal is not proof.
- **Unlinked hashes stay identifiers.** A hash column with no matched source column stays `technical_identifier` + `needs_review`.
- **Name columns need confirmation.** A bare `name` column with few distinct values (stop or station names) is not confirmed as person names.
- **Travel cards are not payment cards.** Luhn-valid numbers count as payment cards only with a payment-card first digit (2-6), so 9xxx travel-card ids are ids.

## Results (development only)

`petpilot/evidence/dev_catalog_eval.json`, scored with the supplied `pets_eval.detect` on all 475 catalogued columns:

| Metric | Value |
|---|---|
| macro-F1 | 0.902 (B1 baseline 0.646) |
| sensitive-column recall | 0.916 (B1 0.727) |
| unknown rate | 25% |
| sensitive columns missed | 25; **all 25 are flagged `needs_review`**, none is silently marked safe; no direct identifier missed |

**Caveat:** the rules were developed with `field_catalog.csv` visible, so these are label-informed development results, not a blind test. The mystery HR file was also inspected during development, so it is not a blind test either. Independent post-freeze fixtures and Astra's E1S reproduction are the real check.

## Limits

- It sees only the first 5,000 rows of each table.
- Without informative column names it cannot tell that plain numbers are salary or that a short code is a union.
- Shape-based person-name detection can confuse place names with people in small tables. In that case the column is reported as unknown.
