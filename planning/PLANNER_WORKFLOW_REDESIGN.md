# RouteSafe: coherent sharing workflow, city-map planner and synthetic-data plan

Date: 7 November 2026
Status: detailed implementation proposal requested by the product lead. This document does not claim that the redesign or new dataset has been implemented.
Baseline inspected: main at a6d0d53abcb14e553def40865f36bea032294e49; reviewed application 93ad641; existing release e1-aura-001.

## 1. Product outcome and scope

RouteSafe helps a data owner turn sensitive transport records into useful, documented statistics that an external planner can explore without seeing passenger histories.

The product must feel like one connected journey: select data, understand it, define a purpose, review the handling plan, inspect the actual protected result, share it, and open that same result in a useful planner. Every step has a single goal, a tangible output and an explicit completion condition.

The planner becomes a city-map workspace for three questions:

1. Where do trips start or end?
2. How does that pattern change across the day?
3. Which areas or connections deserve further service investigation?

The product lead considers the current planner inadequate: the dashboard is cluttered and does not make these tasks intuitive. This plan prioritises that workflow correction, not additional dashboard features.

### Direction agreed in the planning conversation

- Put an actual city map and a clear demand layer at the centre of the planner.
- Reveal detail through selecting places and connections.
- Make the complete owner-to-recipient journey coherent, with individual working steps and clear goals.
- Develop a separate team-generated synthetic city scenario if needed for richer interaction and spatial detail.
- Preserve the supplied-data benchmark and report its failures separately.
- Generate synthetic individual records, then apply the actual protection pipeline; do not invent final protected-looking heatmap values.

### Scope and relationship to existing documents

This proposal changes the product interaction direction and proposes a new demonstration dataset. It does not silently change the implemented release schema, privacy parameters, inference method or accounting policy.

Retain the core boundaries in [ROUTESAFE_BUILD_PLAN.md](../ROUTESAFE_BUILD_PLAN.md), the review process in [COORDINATION.md](COORDINATION.md), and explicit contract evolution in [INTERFACES.md](INTERFACES.md). Implemented machine schemas and validators must be inspected before coding; the interface prose contains historical proposals.

The current task is to save and push this plan. It does not start builders, generate data, spend model credits, deploy a site, contact organisers or submit an entry.

## 2. One product, two roles, one traceable result

### Data owner

The owner needs to answer: What am I sharing, with whom, for what purpose, what protection was applied, and is the result useful enough for that purpose?

The owner uses a private workbench. Raw records, scanner details, preparation and exact comparisons stay there. The existing local publisher remains the authoritative computation path.

### External planner

The planner needs to understand demand, inspect a place or connection, compare times, and save useful findings. The planner uses the protected release only.

These roles have separate entry points and build outputs. Visual continuity must not collapse their security boundary. A tab or hidden panel inside a public app is not private storage.

### Continuity between the two

Carry a consistent context strip through the owner steps:

- Dataset/scenario name and class.
- Stated recipient and purpose.
- Period and geography.
- Current run and policy version.
- Last completed step and any unresolved limitation.

When a release is shared, the recipient sees its public subset: release ID, purpose, period, units, dataset class and concise limitations. Private filenames, scanner samples, logs and raw counts are excluded.

The same release ID must identify the owner preview, recipient map, assistant answers, saved shortlist and exported tables. The user should never wonder which dataset or processing run they are looking at.

## 3. The complete working flow

Primary path:

Add data -> Understand data -> Define the use -> Review protection -> Check the result -> Share -> Explore

Use a numbered stepper in the private workbench. Each page has one main action, a short explanation and a visible output. Back navigation preserves work. Editing an upstream choice clearly invalidates affected downstream results; it must never leave a stale approval looking current.

| Step | User goal | What the user sees and does | Output and completion condition |
|---|---|---|---|
| 1. Add data | Establish exactly what is being processed | Select an available local dataset or the provided synthetic demo; see source, class, tables, period and validation summary | Validated dataset version with required fields and public reference joins checked |
| 2. Understand data | Understand sensitive fields and analytical meaning | Review classifications, reasons, unknowns and what records actually represent | Complete field inventory; required ambiguities resolved or explicitly blocked; optional unknown fields excluded |
| 3. Define the use | Specify the recipient and decision | Confirm external transport planning, supported questions, time scope and spatial detail | A supported purpose configuration; unsupported individual-history requests are refused |
| 4. Review protection | Understand what will change and why | Inspect field handling and planned statistics, privacy unit and limits | A versioned handling policy ready to execute; no raw export permissions inferred from scanner labels |
| 5. Check the result | Judge protection and usefulness together | Run the bounded publisher in the private environment, inspect the candidate artifact and compare with reference results | Exact candidate release verified; privacy blockers absent; usefulness limitations accepted or scope narrowed explicitly |
| 6. Share | Produce a clear, reusable handoff | Review a release summary, recipient preview and downloadable package | Verified immutable bundle, documented permitted use and deliberate sharing action |
| 7. Explore | Find demand patterns and select priorities | Open the actual city map, choose time, select an area, inspect connections and save a shortlist | A usable planning summary tied to that release |

### Step 1 — Add data

Primary action: **Validate data**.

Initially support known mobility inputs and the generated scenario through explicit adapters. Do not promise arbitrary CSV understanding. Offer a demo dataset choice so a first-time user can complete the path without preparing files.

Show readable failure messages such as “The stop reference contains duplicate IDs” and explain the affected table. Avoid exposing credentials or raw exception traces. Browser file selection is a possible local-workbench feature, not permission to upload records to a hosted server.

Build the simplest real interaction over the existing CLI first. If the UI cannot start a local job yet, provide an explicit command/import-result step; never animate a fake successful processing step.

### Step 2 — Understand data

Primary action: **Confirm data understanding**.

Use a compact inventory grouped by handling relevance, with a row-level explanation available on selection:

- Direct identifiers.
- Fields that connect journeys to a card.
- Time and place information.
- Other sensitive/unclear attributes.
- Public reference information.

For each field, show detected role, reason, uncertainty and whether review is required. Keep classification and handling decisions separate. “Unknown” must not become “safe”.

Explain whether a record is a boarding, a completed journey or another event. This prevents later maps from quietly changing the meaning of the input.

### Step 3 — Define the use

Primary action: **Continue with this purpose**.

A short guided form asks:

- Who will receive the result?
- What decision do they need to make?
- Which supported period and geographic detail do they need?

For the first version, provide one strong supported purpose: external planning of aggregate travel demand. Allow supported variations within it; do not build a general-purpose policy generator.

Show two or three concrete questions the resulting release can answer. Show unsupported requests alongside useful alternatives. The current release cannot answer arbitrary date-by-area-by-line questions.

### Step 4 — Review protection

Primary action: **Create protected result**.

Present a readable transformation preview:

- Names/contact details: omitted.
- Card IDs: internal grouping only.
- Times and locations: grouped into the declared public domain.
- Journey contributions: bounded per card over the release period.
- Counts: protected using the approved mechanism.
- Recipient output: aggregate tables and public geography.

The user should understand the plan before reading technical details. Put caps, epsilon allocation, mechanism/library version and inference definition behind expandable technical details.

No “make safe” slider that silently changes policy or redraws noise. Any supported policy adjustment creates an explicit new candidate with accounting consequences.

### Step 5 — Check the result

Primary action: **Accept this result for the stated use**, available only when the required checks allow it.

Show three separate conclusions:

1. **Protection checks:** schema, allowed output, contribution limits, accounting and artifact integrity.
2. **Usefulness:** numerical changes, temporal/spatial error and whether intended planning priorities survive.
3. **Limitations:** weak regions/bands, inferred destinations and card-level rather than person-level protection.

The owner preview uses the exact candidate artifact that can later be shared. Exact references remain in the private evaluation view; public comparison evidence is allowed only for explicitly synthetic scenarios with a reviewed summary.

A technical privacy failure blocks sharing. Failure of a declared usefulness target must not produce a generic green “passed” state. Offer a narrower supported use with an explicit recorded acknowledgement, or return to the policy step for a deliberately new candidate. Record no certification claim.

Candidate generation may already consume privacy budget. Cancelling, rerunning, going back or declining a result does not reset spent budget. Do not keep drawing until the heatmap looks good.

### Step 6 — Share

Primary action: **Prepare share package**; opening the planner locally does not require public deployment.

Show a single release receipt: purpose, recipient, period, dataset class, supported detail, protection summary, limitations, version and download.

Provide **Open recipient view** using the exact verified artifact. In a local demonstration, show the role change explicitly. A local path or localhost URL is not a publicly accessible sharing link.

A production sharing workflow would need authentication, roles and approval controls. Prototype confirmation state must be labelled as local workflow state; it is not a production authorisation system.

### Step 7 — Explore

The recipient lands directly on the map. Do not make them repeat the operator steps or inspect privacy engineering before exploring.

Place a concise source/period label and an accessible **About this data** action on the map. The public interface must remain understandable if received without a live explanation from the owner.

## 4. Planner jobs and first-use experience

### Essential jobs

| Job | Interaction | Successful outcome |
|---|---|---|
| Find where activity is concentrated | Open map, select trip starts/destinations and time | User identifies relevant busy areas and understands the units |
| Understand one area's connections | Select area, choose Show destinations or Show origins | Map shows the conditional spatial distribution |
| Inspect a connection | Select a second area | Detail shows its direction, protected estimate and time profile |
| Compare time periods | Use the time strip with selection retained | User can compare on a fixed scale without losing context |
| Capture findings | Add area/connection to shortlist, export | Saved output includes release, filters, values and limitations |

The planner prioritises further investigation. It does not optimise a timetable, infer unmet demand, measure overcrowding or recommend vehicle capacity from these data.

### Default state

- Actual city street map fitted to the public coverage extent.
- Trip starts, weekday morning, all areas.
- One area-level demand layer and a clear legend.
- Search, starts/destinations toggle, time strip and shortlist control.
- Persistent concise synthetic-data and period labels.
- No selected area; no permanent connection arcs or large statistics cards.

A person should understand what darker colour means within five seconds. This is a usability target to test, not an assertion already established.

## 5. Planner layout and interaction specification

### Desktop

| Position | Contents |
|---|---|
| Top left | Product name and area search |
| Top centre | Trip starts / Trip destinations |
| Top right | Shortlist, Export, About this data |
| Main canvas | City map with one demand layer |
| Bottom centre | Five named time bands |
| Bottom corner | Fixed colour legend, units, data period and source |
| On selection | Compact side panel with detail and next action |

Avoid a permanent dashboard sidebar. The contextual panel appears only when selected content needs it; it must not cover the chosen area. On mobile it becomes a draggable or expandable bottom sheet with accessible buttons.

### Map states

1. **Overview:** area totals for the selected direction and band.
2. **Area selected:** selected area outlined; its estimate, small time profile and next action appear.
3. **Connections from/to selected area:** heat colours encode the selected area's destinations/origins. Other unrelated totals disappear.
4. **Connection selected:** two areas remain outlined; show one directional connector if helpful and the connection detail.
5. **Shortlist open:** compare saved items while retaining the map selection.

Use a visible breadcrumb, such as **All areas > From [area]**, with one-action reset. Escape closes the detail or returns one selection level without clearing the entire exploration. Search selection and map selection must produce the same state.

### Selection detail

Show:

- Public area name and ID, or directional pair.
- Estimated trips per weekday in the selected time band.
- Noise range where the aggregate's range is actually calculated.
- Compact profile across all five bands.
- A concise uncertainty/availability message.
- **Show destinations/origins** and **Add to shortlist**.

For destinations derived from the existing OD table, the time band describes when the journey starts. Do not label it as destination arrival time. Use wording such as “Destinations of trips starting 06–09”.

A neighbourhood/place search can locate the map, but it must resolve results to a supported analysis zone and disclose that zone. It does not create address-level statistics. Start with local public area-name search; external geocoding is optional and must not receive raw records.

### Shortlist and export

Support areas and directional pairs, clearly distinguished. Recommend up to three items for the demonstration, but do not present three as an optimisation result.

Store only public release IDs, selected area/pair IDs, filters and optional user notes in local browser state. Warn if an item belongs to another release; do not silently mix counts.

First export: a print-friendly HTML summary and CSV with selected items, estimates, units, period, active filters, release ID and warnings. Add a map image only after attribution and export behaviour work. Full protected bundle download remains available separately.

### Secondary tools

Keep line/hour and daily totals in a secondary **More analysis** view. They are different measurement families and do not inherit area filters unless the relevant joint distribution exists.

An optional **Ask the map** input comes after direct manipulation is usable. It may change supported filters/selections through a validated intent. It must never be necessary for completing the core task.

## 6. Heatmap, geography and numerical semantics

### Geography decision

Use an actual basemap with meaningful roads, water, landmarks and place labels. The heat layer represents released zones, not individual positions.

Preferred heatmap: choropleth shading of valid public analysis polygons. This gives clear hit targets and avoids implying continuous knowledge between sparse centres.

The current release has 21 schematic points derived from synthetic stop references. Do not assume their IDs or centres establish exact real postcode boundaries. Before using real polygons, verify a documented correspondence for every ID.

If that correspondence cannot be established:

- Keep the supplied release in an honestly labelled area-marker view on the city map.
- Give the new synthetic scenario its own publicly defined zones: verified administrative polygons or an explicitly labelled fixed analysis grid.
- Generate the synthetic observations within those zones.
- Do not interpolate existing coarse counts into smaller cells or manufacture a smooth street-level surface.

Start the synthetic scenario with roughly 20–40 public zones, subject to the feasibility gate. Increased resolution is an experiment, not a promised improvement. Zooming magnifies the map; it must not invent new measurements.

### Metric contract

- Default heat intensity: estimated trips per weekday per hour within the selected band. This allows comparison between bands with unequal durations.
- Detail count: estimated trips per weekday within that band, with the unit explicitly shown.
- All calculations derive from the same signed protected counts and public calendar/band durations.
- Sum signed counts first, then clamp once. Do not sum already-clamped cells.
- Scale noise intervals by the same normalisation.
- Default overview starts/ends include same-zone trips; explain them in the area detail. Connection mode lists them separately as “Within this area”.
- If an alternative excludes same-zone trips, name it explicitly and keep every view/export consistent.
- One trip contributes once to the origin view and once to the destination view; do not sum both and call the result unique trips.
- Destinations remain inferred for any release using next-origin inference.

The default is volume per zone, not demand per square kilometre or population. State the metric in the legend. Different-sized zones must not silently turn colour into a population-density claim.

Use one light-to-dark, colour-vision-friendly scale and stable numeric breakpoints across time bands for the same metric/mode/release. Choose breaks from protected values or public constants. Conditional connection views may have a separately labelled scale, fixed across their time comparison; never silently rescale every selection.

### Uncertainty

Do not reuse a single OD-cell noise interval for an area sum. Implement and review intervals for each displayed aggregate, or explicitly omit the interval with a brief explanation until supported.

Distinguish:

- Lower estimated demand.
- Too uncertain to distinguish from zero or rank reliably.
- Unsupported or missing measurement.
- Outside the release coverage.

Use patterns/outlines/text in addition to colour. Uncertain does not mean zero. Include noise-only wording where relevant; intervals do not include contribution-cap loss, destination-inference error or real-world representativeness.

Avoid false numerical precision in primary labels. Preserve documented exact released values in downloads.

### Map availability

Use a licensed public basemap and retain attribution. Investigate a permitted local/cached city-map fallback for recording; do not assume tile-provider terms permit bulk caching.

If no city basemap is available, show a clear map-unavailable state with the accessible results list. Do not silently switch to an unlabeled schematic and imply that the city-map requirement passed.

## 7. Two datasets with different jobs

### A. Supplied Aura Transit benchmark

Preserve the supplied inputs, e1-aura-001 bytes, evidence and original accounting history.

Existing measured limitations remain visible: area OD WAPE approximately 25.1%, failed 20% team target, strong morning shortlist retention, and poor performance in some sparse/time-specific cases. Toolkit metrics are self-assessment, not the official judging score.

Do not replace these results with more favourable generated-data results.

### B. Team-generated city scenario

Purpose: develop the planner's interaction and spatial presentation, demonstrate a complete pipeline with known fictional travel patterns, and measure what survives protection.

Label it **Team-generated synthetic travel on real city geography**. No pattern is evidence of actual Turku demand. A scenario selector lives in the dataset/release context, not as an unexplained visual style toggle.

Only expose reviewed public metadata, protected statistics and a deliberately curated synthetic evaluation summary to the planner.

## 8. Synthetic generator design

### Configuration and scale

Proposed starting development configuration, to be revised once with the feasibility evidence:

- One real city region and fixed licensed public geography.
- Four weeks with an explicit timezone and calendar policy.
- Approximately 20,000 fictional cards.
- Roughly 0.5–1 million boarding/journey events, generated from per-card behaviour rather than forced to a target after scoring.
- Roughly 20–40 analysis zones and the existing five time bands.
- Documented scenario proportions, trip-frequency distributions and stochastic variation.

These are proposed test settings, not claims of realism. Freeze the configuration before confirmation evaluation. Publish the assumptions and any revisions.

### Records and separation

Generate persistent fictional people/cards and coherent chronological travel chains. Include multiple-card cases as an explicit identity test. Use synthetic IDs; names/contact details are unnecessary except clearly fictional local scanner fixtures.

Maintain three separate outputs:

1. **Observed-format input:** taps/card keys/public stop references compatible with the declared production adapter.
2. **Evaluation truth:** simulated journey origins/destinations, person/card mapping and scenario labels.
3. **Public geography:** zones, public reference points, attribution and the stable domain definition.

If the production pipeline infers destinations from boarding sequences, keep true destinations out of its inputs. Compare inferred results with truth separately. If a completed-journey adapter is later introduced, version it and declare that it observes destinations; do not silently improve inference by using hidden truth.

Map public reference points from public geography. Sample fictional trip activity within the defined zones. No real person's mobility history is used.

### Scenarios

| Scenario | Intended test |
|---|---|
| Morning residential-to-employment concentration | Discoverable directional morning pattern |
| Afternoon return travel | Reversed direction and time comparison |
| Several comparable destinations | Avoid one artificially obvious winner |
| Evening activity around a public centre | A distinct secondary pattern |
| Sparse peripheral journeys | Correct uncertainty rather than persuasive noise |
| Within-zone trips | Consistent totals and explicit self-pair handling |
| Multiple cards and frequent riders | Contribution caps and identity limitations |
| Transfers, duplicates, missing references | Input/inference validation and safe failure |
| Diffuse demand without dominant hotspots | Honest empty/ambiguous shortlist outcome |

Do not imply the release supports day-specific event maps merely because the generator includes events. A date-by-zone release would require a new measured family and budget review; it is outside the first version.

### Reproducibility and anti-selection rules

- Version generator code, configuration, public geography and synthetic-input seed.
- Separate generator reproducibility seeds from production mechanism randomness.
- Never publish or fix a production noise seed to obtain a prettier artifact.
- Develop on one declared synthetic population/configuration.
- Freeze parameters, then evaluate at least five independent predeclared population seeds; record all outcomes.
- Use repeated mechanism draws as explicitly synthetic experiments, separate from immutable release publication.
- Aim for 100 diagnostic draws for the final frozen candidate per declared evaluation design; if time requires fewer, state the count and reason before running.
- Select the demo population/seed before viewing protected outcomes. Publish once under its declared release identity.
- Do not increase density, remove hard cases or select a favourable draw after seeing failure without declaring a revised development experiment.
- A deterministic display fixture may be used during UI development, visibly labelled; it is never a protected release or measured evaluation result.

## 9. Contract and implementation consequences

A new polygon domain, additional areas or changed measurement semantics will not necessarily fit the current hard-coded v1 contract. Inspect constants in contracts/manifest.schema.json, publisher validation, frontend validation and fixed-domain tests before implementation.

Introduce an explicitly versioned contract where needed. Preserve v1 loading for the original release.

New or revised metadata should cover:

- Dataset/scenario class and public provenance.
- Geography ID, version, geometry type, attribution and correspondence.
- Supported dimensions and time semantics.
- Counting, same-zone and normalisation definitions.
- Supported views and unsupported breakdowns.
- Policy version, aggregate uncertainty methods and review status.
- Public release-resource allowlist and integrity hashes.

Do not relax validators to accept arbitrary extra properties. Validate polygon geometry, IDs, size limits and safe label text. Public map layers must never receive card IDs, individual coordinates or truth mappings.

### Suggested code ownership and locations

These are proposed locations to reconcile with current main, not claims of existing modules.

| Work | Likely location / existing owner |
|---|---|
| Coherent private stepper and run state | web/src/operator/ — frontend owner |
| Existing scanner integration | petpilot/ and pipeline/inventory.py — preserve existing owners |
| Scenario generator and configurations | simulation/ — data/evaluation owner |
| Versioned contracts and fixtures | contracts/, fixtures/ — shared review |
| Private publisher adapters and accounting | pipeline/, privacy/ — data/privacy owner |
| Synthetic scenario evaluation | evaluation/, evidence/ — data/evaluation owner |
| Map workspace, selection state, shortlist/export | web/src/ — frontend owner |
| Recorded narrative and reproduction | demo/ and development guide — shared review |

Reuse one deterministic aggregation/query layer for map, panel, chart, assistant and export. Centralise release/view state so stale asynchronous responses cannot overwrite newer selections.

Potential state fields: releaseId, metric, band, selectionMode, originId, destinationId, panelState and shortlist. URL state contains only public selections. Private workflow run state belongs in the local owner environment.

## 10. Evaluation and acceptance

### Coherent-flow acceptance

- Every owner step displays its goal, current input, output and next action.
- A new user can explain what happened at each step without reading the technical guide.
- Invalid input cannot advance as successful.
- Back/edit actions preserve compatible work and invalidate dependent results.
- Repeated clicks/retries do not trigger untracked extra publications.
- The reviewed candidate, recipient preview and downloaded artifact have matching release identity and values.
- Reloading resumes safely or clearly explains what must be rerun; no invented job completion.
- The private/public role transition is explicit.
- Failure states identify a useful next action.

### Planner usability checks

Proposed formative targets; conduct with 3–5 people unfamiliar with the interface, record assistance and failures, and disclose if only internal testing is possible.

1. In under 30 seconds, identify a busy morning area and explain what the colour means.
2. Within three meaningful actions after selection, show where trips from that area go.
3. Compare the same connection across morning/afternoon without resetting map context.
4. Save three candidates and export a readable summary without navigating technical evidence.
5. Recognise a low-confidence result and avoid treating it as verified demand.
6. Identify the dataset as synthetic and distinguish estimated trips from unique people.

For the owner flow, separately test selecting a demo, inspecting one field's handling, reviewing the protected result and opening the matching recipient view. Capture confusion at handoffs, not just click completion.

### Data and privacy checks

- Record input-to-prepared-to-capped-to-noisy-to-displayed stages separately.
- Verify generator invariants, chronological chains, domain membership and source/truth isolation.
- Measure map-area errors, OD errors, band-specific error, top-k set overlap, decision regret and failures on sparse regions.
- Evaluate inferred destinations against simulated truth separately from privacy distortion.
- Validate aggregate noise interval behaviour for sums and adaptive exploration; do not claim selected-ranking confidence without justification.
- Report generated-population results independently from official-input results.
- Any new engineering thresholds must be declared before confirmation. Existing failed benchmark targets remain failed.
- No real-world validity claim follows from planted-pattern recovery.

### Technical and visual checks

- Map/panel/export arithmetic agrees, including signed aggregation, same-zone trips and unequal-band normalisation.
- Old release and fixture still validate and display correctly.
- Invalid polygons, unknown IDs, unsafe labels, unsupported dimensions and malicious model text are refused.
- Public build excludes owner state, scanner samples, generator truth, raw records and credentials.
- Selection, back/reset, rapid filter changes and release switches cannot produce stale views.
- Verify keyboard operation, focus return, touch, screen-reader summaries, non-colour cues and reduced motion.
- Test desktop 1366x768 and 1280x720, and mobile around 390px.
- Provide an accessible list/table alternative to map selection.
- Test slow map loading, tile failure, offline fallback and AI unavailability.
- Profile map responsiveness and reduce the existing large initial JavaScript bundle where practical; load optional tools lazily.
- Resolve or document applicability/mitigation of outstanding dependency advisories before calling the result deployable.

## 11. Delivery phases and review gates

Timeboxes below are planning estimates from actual authorised kickoff. Do not treat them as unattended execution promises. Reconcile with the remaining event schedule and preserve recording/submission buffers.

| Phase | Work and output | Exit gate | Suggested timebox |
|---|---|---|---|
| P0: scope and current-state check | Inspect main, coordination, dependency findings, schema and available geometry; freeze supported questions | Named integration owner, no conflicting edits, first dataset/domain path chosen | 30–45 min |
| P1: flow and interaction prototype | Numbered owner steps plus clickable map selection flow using labelled fixture | Lead can follow add-data-to-recipient narrative and complete core planner path | 60–90 min |
| P2: geography and synthetic feasibility | Generator/config, domain mapping, fixed fixture, initial protected experiment | Suitable geography and a measured resolution/utility trade-off; no hidden truth input | 90–120 min |
| P3: real end-to-end slice | Known dataset through actual workbench steps into verified recipient map | Actual candidate/preview/export agree; no fake working steps | 2–3 hours |
| P4: comparison and capture | Time profile, shortlist, export, uncertainty and data context | Core planner tasks work without AI or technical navigation | 60–90 min |
| P5: verification and handoff | Independent privacy/consumer checks, formative usability, narrative and offline rehearsal | Blocking findings resolved or scope reduced; reviewable release candidate | 90–120 min |

P1 can use the existing artifact while P2 investigates new data. Do not block the coherent owner flow on a richer generator. If the full scope exceeds available time, prioritise the complete vertical slice and cut secondary tools.

### Scope tiers

**Essential:** seven coherent working steps; actual city map; honest area heat layer; time switching; area-to-destination/origin drilldown; clear detail; simple shortlist/export; preserved release boundary; synthetic provenance; correct uncertainty states.

**Next:** polished comparison table, local restore, advanced place search, richer generator scenarios, optional grounded questions and additional charts.

**Deferred:** arbitrary dataset ingestion, date-by-area-by-line analysis, street-level journey reconstruction, real-time feeds, optimal bus routes, capacity recommendations, city-wide forecasting and multi-user approval infrastructure.

### Fallback decisions

- If real polygons do not match supplied IDs, use a separately defined synthetic analysis grid with its own generator/domain; never fabricate the correspondence.
- If fine zones destroy usefulness, coarsen the synthetic domain and rerun the declared evaluation. Do not merely hide failed cells.
- If generated data is not ready, ship the coherent flow over the existing release with honest area markers; explicitly mark the polygon heatmap requirement incomplete.
- If workbench job orchestration is not ready, use a genuine local command/result import step and label it; no pretend end-to-end automation.
- If time is short, retain direct map interaction and export; cut AI, additional analysis pages and decorative animation first.
- If dependency security remains unresolved, retain a reviewed local demonstration and do not describe it as production-ready.

## 12. Integration, deliverables and definition of done

Use feature branches and reviewable PRs under the existing coordination process. The designated integrator merges to main. This plan proposes work allocation but does not dispatch agents or authorise external messages.

Preserve the reviewed existing release and fallback during development. A new synthetic release receives a new dataset identity, policy/domain version as needed, release ID and properly scoped accounting. Never reset the original ledger to make experimentation convenient.

Required deliverables:

1. Connected owner workflow with real outputs at each step.
2. Map-first recipient workspace with selection, time comparison and shortlist/export.
3. Generator source, frozen config, public geography provenance and reproducibility instructions.
4. Versioned contracts and fixtures, including backwards compatibility.
5. Protected generated-data release and separately labelled evaluation results.
6. Original supplied-data evaluation preserved and accessible.
7. Privacy, boundary, numerical, usability and accessibility review receipts.
8. A concise current-product demo showing the entire causal chain.
9. Updated startup/recording handoff identifying the exact reviewed commit and artifact.
10. A list of remaining limitations and unfinished acceptance criteria.

The redesign is done when an unfamiliar user can move through clear owner steps, open the exact resulting release, answer the core planning questions on the city map and export a useful shortlist, while understanding the dataset class and material uncertainty.

A polished mockup, a heatmap built from invented final values, a passing test count, or a disconnected collection of screens does not meet that definition.
