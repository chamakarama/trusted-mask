# RouteSafe interfaces and artifact contract

This is a **proposed v1 contract for the builders to ratify in T1**, not an implemented API. [Build plan](../ROUTESAFE_BUILD_PLAN.md) defines the product and privacy semantics; [coordination guide](COORDINATION.md) defines how changes are agreed. Astra owns measurement semantics and generation; Opus owns consumption and presentation. Both approve breaking changes.

## 1. Boundary and transport

The public interface is a directory of immutable, versioned files served statically. No private server is required by the explorer. Fetching or filtering these files must never cause a private query or fresh noise draw.

Suggested public paths:

```text
releases/<release_id>/
  manifest.json
  definitions.json
  public_areas.geojson
  od_matrix.csv
  line_hour.csv
  daily.csv
  statistics.json
  README.txt
  checksums.sha256
```

`statistics.json` is the convenient frontend representation of the CSV values, not another measurement. If a family is omitted, its file is absent and the manifest says `not_released` with a public policy reason. Do not represent unsupported data as an empty successful response. Downloaded ZIPs contain exactly the allowlisted release members; ZIP packaging is deterministic or its content manifest is the stable identity.

Private inputs, intermediate files, logs, diagnostic summaries and evaluation artifacts live outside this directory. The public build copies this directory and public assets explicitly, not a broad project folder. This is especially important because the repository also contains the team's supplied synthetic challenge package.

## 2. Manifest fields

Ratify a machine-readable JSON Schema in T1 and derive types or validate both sides against it. Reject unknown top-level properties initially. CSV has UTF-8 headers, decimal points, ISO dates and finite numeric values; no executable spreadsheet formulas in labels.

| Field | Type and semantics |
|---|---|
| `schema_version` | Exact supported major/minor version, initially `1.0`; unknown major fails closed |
| `release_id` | Opaque immutable release identifier; contains no passenger ID |
| `created_at` | UTC timestamp of artifact creation |
| `data_class` | `supplied_synthetic`, `team_synthetic`, or an explicitly supported future production class |
| `fixture` | Boolean; true means illustrative contract/test data, never performance evidence |
| `period` | `start_date`, `end_date_inclusive`, `timezone`, timestamp ambiguity policy |
| `publisher` | Fictional operator and source attribution; not a certification claim |
| `purpose` | Human-readable recipient, supported decision and use limitations |
| `policy_version` | Immutable policy identifier tied to a source commit/configuration |
| `source_commit` | Commit containing publisher code; no secrets or local paths |
| `privacy` | Unit, adjacency, scope, mechanism, budgets, family caps, multiple-identifier limitation, review status |
| `families` | Definitions, availability, dimensions, input meaning, uncertainty method and resource paths |
| `public_domain_version` | Public area/line/calendar domain version; no private observed-group selection |
| `inference` | Algorithm/version and visible limitations; distinguishes inferred OD from recorded boardings |
| `postprocessing` | Clamping/rounding/coarsening/reconciliation definitions |
| `resources` | Allowlisted relative paths, media types and SHA-256 of payloads; no external untrusted fetch URLs |
| `limitations` | Short visible limitations; full definitions may elaborate |
| `licenses` | Data, code, geometry attribution and license links |

The privacy object contains `unit: card`, `scope: whole_release_period`, `adjacency: add_remove_one_card`, numeric `epsilon_release`, `delta_release`, measurement family parameters, and `guarantee_status`. Use `pending_review`, `reviewed_under_stated_assumptions`, or `not_claimed`; do not call this independently certified. Cumulative epsilon can be published as a policy/accounting fact, with scope and assumptions, not as a universal privacy score.

Family parameters include the contribution cap, cap selection rule, epsilon/delta allocation, mechanism/library version, input metric/distance, public domain definition, and uncertainty interpretation. Noise scale may be included when useful. No public random seed. A private input checksum is not automatically a safe public provenance field on real data; publish source package identity for this synthetic benchmark and hashes of released artifacts.

Do not include exact private row counts, clipping percentages, source examples, execution errors containing raw values, unprotected extrema or utility gate outcomes in a real-data public manifest. The synthetic evidence report may contain such evaluation statistics with its separate label.

## 3. Statistics

### OD

CSV fields:

```text
origin_area,destination_area,hour_band,trips,noisy_value,noise_lower,noise_upper,evidence_status
```

`trips` is the documented nonnegative display estimate and the native toolkit adapter column. `noisy_value` is the signed mechanism estimate if retained; `trips` must be a specified post-processing of it. Evaluate both, but benchmark the estimate actually used by the planner. Do not change its meaning silently between CSV and UI.

Area IDs come from the fixed public domain. Hour bands initially match upstream: `00-06`, `06-09`, `09-15`, `15-18`, `18-24`. Counts are weekday inferred journeys over the **entire four-week period**, not per-day averages or unique passengers. Any average is a deterministic division by the public number of relevant calendar days, with the unit displayed.

All 2,205 public-domain cells are measured under the initial 21-area policy. A UI may hide weak results using only protected values/public thresholds. Preserve the full released table for analysis, or define the protected sparse export and its semantics explicitly. Missing rows must never secretly mean “no original riders existed.”

`noise_lower`/`noise_upper` are optional mechanism-noise intervals around the bounded statistic; absence is explicit, not zero. `evidence_status` is `usable`, `uncertain`, or `not_supported`, determined only from released data and public rules. It is not a private exact-count threshold.

### Line-hour

```text
line,hour,boardings,noisy_value,noise_lower,noise_upper,evidence_status
```

Counts are weekday boardings excluding marked double taps, whole period. Hour is integer 0–23. A predefined public line domain comes from stops/approved reference policy, with a declared unknown-line handling rule. The table does not support origin/destination-by-line or line-by-date unless those joints are explicitly measured and accounted.

### Daily

```text
date,tap_events,noisy_value,noise_lower,noise_upper,evidence_status
```

One row per public date in the period. For benchmark parity, the upstream daily metric counts tap events, including marked double taps. The UI calls them “recorded tap events,” with the distinction available in definitions. If a cleaned boarding series replaces this, version the definition and report the benchmark mismatch.

### Geography

GeoJSON uses longitude, latitude order. Features contain public area ID/name, municipality and source. Use points at public-stop-derived centroids unless legitimate area boundaries are supplied. No passenger-weighted centroid, individual destination, hidden card count or copied raw stop event. Arcs are schematic links between these points. Include geometry attribution.

## 4. Example frontend object

This excerpt illustrates types only. The values are invented fixture values, **not computed RouteSafe results**, and do not form a complete release. T1 must supply a complete small fixture with all required manifest fields and a self-consistent fictional domain; the frontend displays a fixture badge until it loads a real reviewed release.

```json
{
  "schema_version": "1.0",
  "release_id": "fixture-only-001",
  "fixture": true,
  "data_class": "team_synthetic",
  "od": [
    {
      "origin_area": "example-west",
      "destination_area": "example-centre",
      "hour_band": "06-09",
      "trips": 1200,
      "noisy_value": 1200,
      "noise_lower": 1104,
      "noise_upper": 1296,
      "evidence_status": "usable"
    }
  ]
}
```

The example interval is illustrative; the implemented mechanism must calculate its own. Do not copy it into a reported result.

## 5. Public query and AI contract

The assistant returns a proposed intent, never SQL, Python, a filesystem path or a private query. Initial allowed intent shape:

```json
{
  "view": "od",
  "hour_band": "06-09",
  "origin_area": null,
  "action": "rank_corridors",
  "limit": 3
}
```

Deterministic validation checks the enum, allowed areas, released dimensions and limit bounds. Additional properties are rejected. The executor returns values plus `release_id`, `definition_id`, `result_ids`, units, availability and warnings. An explanation references those result IDs. Validate every numeric assertion against executor results or use a deterministic explanation template. Render model text as text/limited safe Markdown; never evaluate it.

Unsupported requests return a typed `unsupported_breakdown` or `individual_history_unavailable` result and a useful supported alternative. The assistant cannot combine marginal tables into a joint distribution, infer an individual's trip, access another release implicitly, or initiate publication. Model failure returns `ai_unavailable` and presets. Static fallback answers are not labelled live AI.

## 6. Private command boundaries

### Scanner and policy handoff

Vaishnav/Opus supplies `petpilot/` as a local scanner, not a second publisher. Astra consumes its inventory through an adapter. Agree the callable/CLI entrypoint in T1 after inspecting the existing implementation; do not require a rewrite to match an invented command. `routesafe inspect` may delegate to it. The minimum handoff is pushed code, dependency requirements, an exact run command, a small synthetic fixture and the inventory produced from it.

The scanner is now available in commit `4cd1374`. Its inspected CLI supports this mobility-only invocation (to be executed and validated during E1S):

```sh
python -m petpilot scan --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --only mobility --out private/mobility_labels.csv
```

The current folder-scan CSV is `dataset, table, column, privacy_role, subtype, art9, confidence, reason, links`. Adapt `privacy_role` to the contract's `role`; retain the original heuristic `confidence` privately without presenting it as a calibrated probability. Map `links` as column relationships, not passenger identities. Treat `art9` as a scanner hint requiring review, not a legal determination. The single-file CLI lacks dataset/table fields, so its adapter must supply them explicitly. The scanner samples rows: include the sampling rule/limit in private provenance and test rare values outside the sample. Absence of a match cannot imply absence of sensitive information.

Use an independent `inventory_schema_version` initially `1.0`. The private inventory envelope includes `scanner_version`, source commit, dataset/table identifiers, analysis mode (`rules` or explicitly declared `known_schema`), and a list of fields. Include every column exactly once, including unknowns. Do not include raw example values, recovered identifiers or row-level matches in the shared fixture or operator-summary contract.

| Field record | Contract |
|---|---|
| `table`, `column` | Exact input identifiers; unique together |
| `role` | Declared taxonomy: direct identifier, quasi-identifier, sensitive attribute, technical identifier, record key, free text, non-sensitive, or unknown; use stable machine enum spellings |
| `subtype` | Optional semantic type, e.g. `persistent_card_id`, `timestamp`, `email`; not an assertion of person-level identity |
| `reason` | Short explanation tied to detected structure or a named schema rule; no private values |
| `rule_ids` | Rules that produced the finding, for reproducibility and review |
| `certainty` | `high`, `medium`, `low`, or `unknown`; heuristic confidence, not a calibrated probability |
| `needs_review` | Boolean; ambiguity remains visible rather than being forced into non-sensitive |

The existing CSV does not yet emit rule IDs or review flags. Allow an empty `rule_ids` list with an explicit evidence-unavailable marker during adaptation, and default ambiguous/unmapped findings to review. Do not invent detector evidence to satisfy the schema. Ratify these defaults with both builders in T1.

Astra's separate, versioned policy mapping associates each field with `purpose_id`, `handling`, `rationale`, `required_for_analysis` and `review_status`. Initial purpose is public aggregate mobility planning. Handling is an allowlisted operation such as `omit`, `internal_grouping_only`, `public_reference_lookup`, `time_bin`, or `aggregate_input`. Contribution bounds and noise parameters live in the approved family policy, not in an LLM-generated field suggestion. A scanner reason and a policy rationale are different facts and should appear separately in the operator view.

The publisher independently validates required fields, public reference joins and the exact release schema. Neither `role: non_sensitive` nor high certainty is permission to export a column. Inject a deliberately false-safe finding in a test and verify no extra field reaches the release. Unknown optional columns are excluded; a missing/invalid required analytical field blocks preparation with an actionable error. An unavailable scanner can use the explicitly labelled known-schema fallback so the vertical slice continues, with no generic-detection claim.

Inventory and policy discussion are private workbench artifacts. The public release may contain a reviewed, value-free explanation of handling, not the whole scanner report. An unsupported request for consultancy row histories returns `UNSUPPORTED_SHARING_SCENARIO`; it never activates rotating-pseudonym export. If AI hints are added, default to local inference or approved schema metadata only. Category values are not safe merely because they look like short codes.

Scanner evaluation files record the taxonomy, labelled column set, commands, macro-F1, sensitive-column recall, unknown rate and per-role errors. Separate label-informed development results from independently designed post-freeze fixtures. The already-inspected mystery file cannot be labelled a blind test. Hash-recovery demonstrations record the synthetic candidate source and measured matches in evaluation, not recovered values in the public inventory.

### Pipeline commands

Implement equivalent commands; these names are proposed, not existing CLI promises:

```text
routesafe inspect --input <private-path> --report <private-path>
routesafe prepare --input <private-path> --policy <policy-file> --output <private-path>
routesafe publish --prepared <private-path> --policy <policy-file> --ledger <private-db> --output <release-path>
routesafe evaluate --input <synthetic-input> --release <release-path> --eval-data <labels-and-truth> --output <evidence-path>
routesafe verify-release --release <release-path>
```

Exit nonzero for schema/policy/privacy/accounting failures. Structured progress reports contain stage, status and actionable safe error codes; the public app never receives raw exceptions. Required errors include `INVALID_SCHEMA`, `UNKNOWN_POLICY`, `DOMAIN_MISMATCH`, `BUDGET_EXHAUSTED`, `RELEASE_CONFLICT`, `ARTIFACT_INVALID` and `UNSUPPORTED_VERSION`.

`publish` does not import evaluation helpers or inspect ground-truth identity files. `evaluate` can access truth because it is an explicitly separate private/synthetic benchmark command. No environment flag should silently turn a production input into an evaluation-truth-enriched input.

## 7. Evaluation artifact contract

Evaluation evidence is separate from the protected release. For this fully synthetic challenge it can be made public after checking for package rowmaps and unnecessary copied records. A real-data product would retain it privately or protect it separately.

Each experiment result records:

* experiment ID, command, commit, library versions, source package identity and data class;
* input definition, baseline/reproduced/supplied status, inference policy and public domain;
* selected privacy parameters, contribution rules and post-processing;
* reference stage and compared stage: R0/R1/R2/R3/R4;
* metric formula, denominator, zero handling, selection thresholds and task ID;
* number of draws, seed policy for synthetic experiments, summary distribution and selected artifact's result;
* decision definition, K, overlap, regret and near-tie treatment;
* attack sample/cohort, known-point assumptions, candidate sets, uncertainty and applicability;
* limitations, failures, changes and evidence paths.

The public synthetic evidence UI may read a compact, reviewed `evidence-summary.json`; it must not gain a general path to the evaluation directory. Do not mix benchmark error bars with the planner's mechanism-noise intervals.

## 8. Contract acceptance and evolution

T1 is done when both builders independently validate the same complete fixture, render at least one statistic, and reject an invalid fixture. This may be a tiny in-memory two-area example; full data is not required for the handshake.

Before a breaking change, send a coordination request with the old/new shape, reason, semantic effect, migration and sample. Both acknowledge; Astra integrates the new schema and Opus updates consumption. Additive optional metadata can use a minor version if the current validator deliberately allows it. Keep one known-good fixture and release until replacement has passed integration tests. UI code must never guess missing units or privacy parameters.
