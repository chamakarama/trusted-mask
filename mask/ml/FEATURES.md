# Base feature spec (`FEATURE_SPEC_VERSION` 1.0.0)

Implemented in `src/core/selector/features.ts` (`baseFeatures(unit, ctx)`, `featureNames()`). The training export
(`scripts/labels/export_features.ts`) calls the same function, so Python never recomputes features. Change the code and
this file together and bump the version; the learned selector refuses artifacts with a different version.

Every feature is named `<group>:<value>`. The **group** (text before the first `:`) is the unit of explanation: the
selector's reason sums `w·x` per group. An artifact lists the feature names it was trained on
(`featureSpec.baseFeatures`); the selector maps by name, so artifacts may use a subset (zero-in-training columns and
ablated groups are dropped by `train.py`).

No raw cell values are used. For a field group the strongest-role detection (`primaryDetection`) and its column
statistics describe the unit.

## Unit (data) features

| Group | Values | Encoding |
|---|---|---|
| `unit.kind` | field, field_group, span_class, table | one-hot |
| `unit.role` | the 8 privacy roles | one-hot (`unknown` when no detection) |
| `unit.subtype` | the 50 subtypes | one-hot |
| `unit.art9` | `on` | 1 if any detection of the unit is Art. 9 |
| `unit.detection` | `confidence` (high 1, medium .66, low .33, unknown 0), `score` [0,1], `needsReview` | numeric |
| `unit.stats` | `uniqueRatio`, `nullShare` (1 − nonEmpty/count), `numericShare`, `spaceShare`, `logMeanLength` (ln(1+len)/5) | numeric |
| `unit.distinct` | le2, le10, le50, le200, le1k, le10k, gt10k | one-hot bucket of distinct count (sample) |
| `unit.type` | inferred types (string, integer, number, boolean, date, datetime, empty) | one-hot |
| `unit.group` | `on`, `size` (min(n,10)/10), `tables` (distinct tables/10) | field groups only |
| `unit.relationships` | `on` | unit takes part in a relationship |
| `unit.span` | the 20 span labels | one-hot, span_class units only |
| `unit.spanFreq` | `share` (label count / rows scanned), `logCount` (ln(1+count)/10) | span_class units only |

## Goal features

| Group | Values |
|---|---|
| `goal.task` | task kinds (one-hot) |
| `goal.trust` | internal, contractual, controlled_research, public |
| `goal.output` | row_level, text_corpus, aggregate |
| `goal.textNeed` | none, topic_only, fluent, verbatim_evidence |
| `goal.linkage` | none, within_table, across_tables |
| `goal.time` | time resolutions + `unset` |
| `goal.location` | location resolutions + `unset` |
| `goal.ageBand` | `set` when an age band is requested |
| `goal.mentioned` | `on` when the unit's column is in requiredFields/groupings or named in a measure |
| `goal.excl` | `special_category`, `other` |
| `goal.unresolved` | `on` when the goal has open questions |
| `goal.emb` | `0..255`: the goal embedding (`hashed-bow-v1`, 256 dims). Zero when the goal has none, or when its model differs from the artifact's `embedding.model` (noted in the decision detail). |

## Explicit interactions

These let a linear model with per-class weights condition the same data feature on the goal (a goal-only feature
already shifts each class differently because weights are class-specific; interactions add data × goal terms).

| Group | Terms |
|---|---|
| `x.trust_role` | trust × role |
| `x.textNeed_span` | textNeed × span label |
| `x.trust_span` | trust × span label |
| `x.linkage_role` | linkage × role |
| `x.mentioned_role` | goal names the column × role |
| `x.trust_art9` | trust × Art. 9 |

The goal-agnostic ablation (`train.py --ablate-goal`) drops every `goal.*` and `x.*` feature.

## Model

`logit(unit, class) = W[class] · x + b[class]`; softmax with temperature `T` over valid candidates that have a class;
argmax with ties to the lower class key; abstain if nothing remains. Classes are (recipe, parameter bundle) keys from
`candidateKey`, e.g. `generalize_datetime@resolution=hour` (list: `ml/data/classes.json`).
