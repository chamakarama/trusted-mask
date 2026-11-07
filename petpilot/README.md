# Detector baseline for Mask

This retained component classifies table columns using rules. It does not use an LLM, train a model, choose transformations, redact spans or authorise export. Its package name remains `petpilot` to preserve imports.

## Run

Requires Python 3.10+ and pandas (`python -m pip install -r petpilot/requirements.txt`).

```sh
python -m petpilot inventory --data <dataset-folder> --dataset <dataset-name> --out private/inventory.json
python -m petpilot scan-file <table.csv> --out private/labels.csv
python -m unittest discover -s petpilot/tests -t .
```

The inventory includes every column, its role/subtype, rule IDs, reason, heuristic certainty, review flag and detected relationships. Roles are `direct_identifier`, `quasi_identifier`, `sensitive_attribute`, `technical_identifier`, `record_key`, `free_text`, `non_sensitive`, and `unknown`.

Rules inspect the first 5,000 rows. The inventory then sweeps every row of non-direct-identifier columns for a limited set of identifier shapes. Unknowns and ambiguous matches require review. This is not a general text detector; the sweep cannot prove absence of personal information.

`certainty` is rule strength, not a calibrated probability. Inventories omit raw cell values, but schema names, counts and relationships can themselves be sensitive; keep them private.

## Evidence limits

Inherited rules were developed with the supplied catalog visible; the unlabelled HR file was also inspected previously. Historical scores are not blind Mask evaluation. Old product-specific fixtures and reports have been retired. Current regression tests cover named/obfuscated contacts, unknown handling, identifiers beyond the sample, and value omission from inventories.

The method selector in [the Mask plan](../planning/MASK_PLAN.md) is future work.
