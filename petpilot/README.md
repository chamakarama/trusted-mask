# petpilot: the scanner (step 1, "detect")

Give it a table, and for every column it says what kind of information is in it, how risky that is, and why. It runs locally, uses no AI and sends nothing anywhere. `petpilot` is a working name.

## Run

Needs the real data files (`git lfs pull`, see `MATERIALS.md`), not LFS pointer files. Python 3.10+ with pandas.

```bash
# every table of every dataset
python -m petpilot scan --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --out out/scan_labels.csv

# one file, e.g. the mystery HR export with hidden column names
python -m petpilot scan-file TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/unseen/export_2025_q4.csv --out out/unseen_labels.csv

# score against the organisers' answer key
pip install -e TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/toolkit
python -m pets_eval detect --pred out/scan_labels.csv --root TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026
```

Output columns are `dataset, table, column, privacy_role, subtype, art9, confidence, reason, links`. Roles and subtypes use the package's `metadata/taxonomy.md`.

## How it decides

1. **Value checks.** Finnish ID codes (check letter), IBANs (mod-97), card numbers (Luhn), plus emails, phones, plates, IPs, MACs, dates, postcodes, coordinates and long text.
2. **Links between columns.** A birth date already inside an ID code, or a column that is an unsalted hash of another column (it can be reversed).
3. **Column names.** English, Finnish and Swedish keywords, used when the values are not decisive.
4. **Table context.** A reference table of bus stops or sensors is not about people.

## Results so far

- **Answer key** (`metadata/field_catalog.csv`, 475 columns): macro-F1 **0.867**, against 0.646 for the organisers' B1 baseline. It finds **92%** of sensitive columns (B1: 73%). The rules were written with the answer key visible, so treat this as optimistic.
- **Mystery file:** it finds every identifier. Column `c20` is the ID code hashed with unsalted SHA-256. It still misses salary, union membership, sick days and job title when the column names are hidden.

## Next

- Plan step: role + subtype + scenario -> technique + reason.
- Optional AI hint for unclear columns. It sees only a safe summary (name, type, a few non-personal category values), or runs locally.
