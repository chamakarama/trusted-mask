# Project direction and things to do

Updated 7 November 2026 after rereading the TrustED challenge materials. This is the current priority list; unchecked items are planned work, not implemented capabilities. It takes priority over older feature wish lists.

## Product goal

Build a purpose-aware data protection tool that connects **understand the input → choose suitable protection → transform → measure retained analytical value**. RouteSafe's transport map demonstrates what the output enables.

Keep the simple **upload → download** operator. The system should perform the work and explain the result briefly, without bringing back a wizard. Keep the raw/protected file handoff and the ChatGPT demonstration, using separate fresh chats and actual responses.

The challenge requires identified data types, justified PET choices, a protected output, before/after utility and a clear sharing scenario. The detailed brief makes AI optional. The toolkit scorecard is a self-assessment aid, not the official judging rubric. Our 20% count-error threshold is a team target, not an organiser-imposed passing grade.

## Where we are

- A local scanner produces roles, reasons and uncertainty flags. Its findings are advisory; fixed field handling and the publisher's allowlist control export.
- The mobility publisher aggregates, bounds card contributions and applies OpenDP noise. Immutable artifacts, checksums and a local ledger support repeatable handoffs.
- The operator accepts registered raw JSON/ZIP, automatically processes the known demo and downloads protected JSON. The planner opens both raw and protected JSON with distinct labels.
- The map displays hypothetical demand assignments along public bus geometry. It does not measure actual passenger paths, line occupancy or how many buses to add.
- Evaluation exists, but important accuracy targets fail. The full-day scenario preserves deliberately large patterns; this is not broad evidence of useful transformation.
- The main gap is the connection between detected risks, intended use, transformation selection and measured usefulness. Exact-file matching and pre-existing release reuse make the demo reliable, but do not demonstrate processing a new valid population.

## P0 — connect understanding to protection choices

- [ ] Define the initial supported scope explicitly: structured mobility data, a small set of recognised field types, and public aggregate transport-demand sharing. Report unsupported inputs rather than claiming arbitrary-data understanding.
- [ ] Produce one typed analysis record containing detected field role, semantic type, evidence, confidence/uncertainty, cross-field linkage risks and required analytical fields. Distinguish identifiers, quasi-identifiers, sensitive attributes and public reference data.
- [ ] Connect that record to a constrained policy engine. Each selected treatment must record the detected risk, intended use, technique, parameters, reason and expected effect on utility.
- [ ] Make the purpose explicit. Default to a clearly labelled transport-demand preset; do not infer the recipient's intent from column contents. Add another supported purpose only when its policy and evaluator work.
- [ ] Preserve conservative handling of unknowns. Detection confidence must not become automatic publication permission; required unresolved fields should block processing and unnecessary unknown fields should be excluded.
- [ ] Demonstrate that meaningful input changes produce appropriate decisions. Test renamed columns, extra direct identifiers, precise timestamps/locations, sensitive fare categories and missing required fields. Include failures and abstentions.

**Example decisions for external aggregate demand planning:**

| Input finding | Why it matters | Treatment to justify |
|---|---|---|
| Persistent card identifier | Connects a travel history | Use internally for grouping and contribution limits; exclude individual histories from output |
| Exact stop and timestamp | Identifying in combination with outside observations | Map to the resolution required for the planning task |
| Sensitive fare category | May expose personal characteristics | Exclude unless the stated analysis actually requires it |
| Demand counts | Required analytical signal | Aggregate, bound contributions and apply a calibrated mechanism |

**Done when:** a valid input yields a traceable plan derived from its detected content and declared purpose; unsupported cases are handled explicitly; the plan controls the actual transformation. A decorative explanation of a fixed recipe does not satisfy this item.

## P0 — transform new valid inputs within that scope

- [ ] Separate schema/domain compatibility from exact demonstration-file registration. Accept a new valid population under the supported mobility contract, while retaining the frozen demo as a reproducible example.
- [ ] Define the publication/accounting scope before releasing a new input. Editing a file, changing a filename or using a new runtime must not imply a new privacy allowance for overlapping people/cards.
- [ ] Generate the protected artifact from the accepted input through the real publisher; preserve snapshot provenance, contribution bounds, the export allowlist and exact artifact verification.
- [ ] Keep retries idempotent and failures conservative. Reuse the same artifact for an identical publication request; never redraw until the result looks attractive.
- [ ] Retain direct planner import of the downloaded artifact and its original verified members. Raw preview remains visibly unprotected and local.

**Done when:** a fresh supported synthetic input can be uploaded, transformed and downloaded, and that exact output opens in the planner. A changed input cannot silently receive a previous input's output.

## P0 — prove the intended analysis survives

- [ ] Predeclare the analytical task, raw reference, utility metrics and acceptance thresholds before choosing the final protection design. Start with destination-area priorities and peak time bands; retain the relevant supplied MOB-S1 tasks in the evidence.
- [ ] Compare the same task on raw inferred statistics and the protected result. Distinguish destination inference, contribution-cap loss, noise and route-assignment assumptions.
- [ ] Investigate coarser areas/time bands and fewer necessary statistics when detailed cells are unreliable. Evaluate changes on independent synthetic development/confirmation populations; do not increase fictional attendance simply to improve the score.
- [ ] Account for any private-data-dependent policy selection, tuning or published diagnostics. Do not expose raw evaluation results or assume adaptive selection is privacy-free on real data.
- [ ] Test small spikes, sparse journeys, different background distributions and multiple cards per person. Preserve unsuccessful cases alongside successes.
- [ ] Add an explicit suitability result: which tasks passed, which failed and what the output supports. A failed result must not be presented as validated service-planning data.

**Done when:** the result can answer “what analysis remains useful?” with measured before/after evidence on held-out scenarios. An attractive map and a surviving large event spike alone are insufficient.

## P1 — make privacy evidence match the threat

- [ ] Connect detected risks to concrete attack/evaluation cases using the supplied attacker knowledge where applicable. Distinguish singling out, linkage, attribute inference and membership inference.
- [ ] Evaluate the released representation fairly. The absence of rows makes some row-lookup attacks inapplicable; it does not establish zero disclosure risk.
- [ ] Maintain the card-level scope, preprocessing argument, release composition and remaining review limitations. Do not imply person-level protection when people can hold multiple cards.
- [ ] Keep the ChatGPT segment as an accessible illustration: aggregate demand should remain visible; individual records should not be retrievable from the protected file. Show actual answers and distinguish evidence from guesses. A refusal is not the privacy guarantee.

**Done when:** each privacy claim names the mechanism or test that supports it and the limits of that evidence. No extra IDs-removed comparison screen/file is needed in the short demo; rigorous comparisons may remain in technical evaluation.

## P1 — explain the result without complicating the UI

- [ ] Keep upload and download as the primary interactions, with a visible purpose preset and truthful processing status.
- [ ] Add a compact result summary: **what was found → what changed and why → what analysis survived**. Use actual run results, not canned promises.
- [ ] Keep field-level decisions, uncertainty, parameters, failed metrics and receipts in expandable Details and a portable report.
- [ ] Make the five challenge demonstration requirements visible in the recording, even if most implementation detail stays collapsed in the product.
- [ ] Use one coherent transport example throughout: private records, meaningful risk, justified transformations, protected download, preserved demand pattern and honest limitations. Keep text short for participant video voting.

**Done when:** a viewer can explain what the protection tool decided and what useful information remains, without needing to understand the code or navigate a dashboard.

## Defer until the core connection works

- Further map embellishments beyond fixes needed to demonstrate utility.
- ScamChorus as a second application. It needs its own data adapter, threat model, protection policy and utility evaluation; reusing the UI does not establish those.
- RL training. First build a transparent policy baseline and define a defensible objective. A learned selector would need to outperform that baseline while obeying fixed privacy constraints and accounting for training/tuning leakage.
- Broad multi-domain or production-readiness claims, deployment and competition submission.

## Completion checklist for the project direction

- [ ] A new supported input is understood, not merely recognised by a frozen fingerprint.
- [ ] Detected risks and the declared purpose determine the actual protection plan.
- [ ] A verifiable protected artifact is generated and directly usable downstream.
- [ ] Before/after evidence supports the declared analytical task on independent cases.
- [ ] Privacy guarantees, empirical tests and demonstrations are clearly distinguished.
- [ ] The short demo shows all of the challenge's requested elements with minimal text.

## Sources and existing evidence

- [Official challenge PDF](../TRUSTED_SinceAI2026_FINAL/Challenge_TRUSTED_PETs_Transformer_EN%20%281%29%20%281%29.pdf)
- [Detailed challenge brief](../TRUSTED_SinceAI2026_FINAL/TrustED_PETs_Transformer_Challenge_Brief_FINAL_REVIEW%20%281%29.docx)
- [Scenario definitions](../TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/docs/SCENARIOS.md), [PET playbook](../TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/docs/PET_PLAYBOOK.md), [evaluation rules](../TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/docs/EVALUATION.md)
- [Scanner scope and limitations](../petpilot/README.md), [original benchmark evidence](../evidence/README.md), [full-day demo evidence](../evidence/kupittaa-day-v2/README.md)
