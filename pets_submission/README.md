# Outputs for the optional organiser checks

`docs/EVALUATION.md` in the supplied package says the organisers can, **on request during the event**, score outputs that teams cannot overfit. This folder holds RouteSafe's outputs for that. The team lead decides whether to ask for the checks. Nothing here is sent anywhere automatically.

## `unseen_field_labels.csv`: labels for `data/unseen/export_2025_q4.csv`

- Format, as given in `data/unseen/README.md`: `column,privacy_role,subtype` (vocabularies from `metadata/taxonomy.md`). There are 26 rows, one per column.
- Produced unedited by the rule-based scanner (no AI, no manual relabelling):
  `python -m petpilot scan-file data/unseen/export_2025_q4.csv --out <file>`. The scanner is the one on main at `a519ec3` (`petpilot` 0.2.0 with the full-column e-mail sweep). The extra scanner columns were then dropped.
- Honest caveats:
  - The file's values were inspected during scanner development, so this is blind to the private labels only, not to the data.
  - The 13 columns the rules cannot explain are written as the scanner's best guess, `non_sensitive`. In the private inventory they are `unknown` and need a person's check. The scanner never treats them as safe to publish.
  - No free-text span file (`c16` is labelled `free_text` as a whole column).

## Not included

- Protected tables with row maps: RouteSafe publishes only aggregate tables (`releases/e1-aura-001/`), so there are no row maps. A mobility subfolder can be added if the organisers want to run their hidden attacker on the aggregate release.
- Customer-service redaction: not attempted.
