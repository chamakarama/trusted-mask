# Outputs for the optional organiser checks

`docs/EVALUATION.md` in the supplied package says the organisers can, **on request during the event**, score outputs that teams cannot overfit. This folder holds RouteSafe's outputs for that. The team lead decides whether to ask for the checks. Nothing here is sent anywhere automatically.

## Unseen dataset: `data/unseen/export_2025_q4.csv`

- **`unseen_field_labels.csv`** holds the 14 of 26 columns the scanner could classify. The format follows `data/unseen/README.md`: `column,privacy_role,subtype`, with vocabularies from `metadata/taxonomy.md`.
- **`unseen_abstentions.csv`** holds the other 12 columns. The scanner found no recognisable meaning in them, so it reports `unknown` with `needs_review`, and a person must check them.
  - They are left out of the primary file on purpose. The taxonomy defines `non_sensitive` as safe to share, and guessing it for a column we cannot explain would be a false safety claim.
  - The organisers' rules count omitted columns as wrong, so coverage is **14 of 26** and those 12 columns score as misses.
- How it was made: the rule-based scanner on main at `a519ec3` (`petpilot` 0.2.0, including later inventory-sweep fixes). This command uses the sampled classifier path; it does not invoke the inventory full-column sweep. Command: `python -m petpilot scan-file data/unseen/export_2025_q4.csv --out <file>`. No AI and no manual relabelling were involved; unknown rows were separated as abstentions and output columns reduced.
- Honest caveat: the file's values were inspected during scanner development. The score is blind to the private labels only, not to the data.
- No free-text span file: `c16` is labelled `free_text` as a whole column.

## Mobility: `mobility/`

Exact byte copies of the published protected release `releases/e1-aura-001/`: all nine canonical files, so the manifest and checksums can be verified independently. See `mobility-NOTE.md` for the exact verification command. This is an **aggregate** release (scenario MOB-S1): no rows, no card ids and no row maps, so row-linkage attacks do not apply. Each travel card is protected with ε = 1 for the whole period (`manifest.json` → `privacy`). Its status is pending review.

## Not included

Customer-service redaction was not attempted.
