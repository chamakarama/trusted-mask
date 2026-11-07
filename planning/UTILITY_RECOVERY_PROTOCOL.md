# Narrow planning-task evaluation — frozen before execution

7 November 2026. This is a new, prospective evaluation of a narrower task after the original OD-volume task failed. It does not replace or reinterpret that failure, tune privacy parameters, republish the data or validate the road-assignment model.

## Task and intervention

Question: **Which three destination areas should a planner investigate for weekday-morning travel demand?** Output is an exploratory shortlist, not an instruction to add buses. Compare area-level prioritisation with the existing pair-level task. All estimates use the existing signed protected OD vector, sum by destination first, then clamp once. Existing card caps and epsilon allocation remain unchanged. No raw/truth-derived final values enter the recipient.

Primary task: morning (06–09), all destinations, including within-zone trips. Primary target: at least 2/3 exact top-three overlap and <=10% selection regret in at least 95 of 100 simulated draws **for each** of three new populations. Secondary counts: destination-area WAPE <=20%; report separately, not a requirement silently substituted for the primary task. Report all five time bands, origins as well as destinations, cap loss and all failed populations. No-demand relative metrics are null, not success or zero error. Exact ties break lexicographically for reproducibility; regret remains necessary because arbitrary tie overlap can understate equivalent decisions.

## Frozen holdouts and simulations

- Generator: unchanged PR #12 config `simulation/config/turku-grid-v1.json`, 20,000 cards per population.
- Newly declared population seeds: **7071101, 7071102, 7071103**. These have not been generated or evaluated when this protocol is committed.
- 100 difference-of-geometric discrete-Laplace distribution simulations per population, independent simulation root seed **2026110717**, with the production scales. These are not additional protected publications, runtime validation of OpenDP or extra privacy expenditure.
- Evaluate the actual immutable city release separately against its original input. It is development evidence, not a held-out population. Record the exact release, generator configuration, input and evaluator identities.
- Preserve all outputs, including failures. Do not modify targets or select a new noise seed after inspecting results. A code correction requires a documented reason and a rerun of the complete declared set.

## Evidence limits and adversarial checks

These holdouts vary people and noise under the same fictional generator. They do not establish transfer to another population model, true destination accuracy, real Turku service need or route-choice accuracy. Existing multi-card destination-inference limitations remain. A successful shortlist need not have accurate absolute counts.

Test signed-sum arithmetic, self-zone inclusion, direction, unequal time-band duration and undefined zero-demand metrics. Add explicit zero-demand and equal-demand counterexamples: the interface must not describe a noisy ordering as a proven rank, and must show insufficient signal where its conservative noise-only bounds include zero. Do not silently label uncertain zero estimates as no demand.

## Product integration rule

Only a matching, hash-bound public evidence summary may describe this task. If the primary target passes, say exactly which synthetic task and populations it passed. Retain the failed 31.2% fine-pair error beside it. Show a useful released shortlist with labels, time context, counts and uncertainty; never show private exact values in the recipient. The private workbench may compare exact and protected outputs to demonstrate utility.
