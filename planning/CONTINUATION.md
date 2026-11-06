# RouteSafe continuation checkpoint

Reviewed application baseline: **main b223859** (6 November 2026). Later documentation/evidence commits do not redraw the release. This is a working experimental foundation, not a prediction of competition placement.

## Resume safely

1. Inspect the existing dedicated checkout and `git status` before editing. Astra uses `/workspace/routesafe-astra`; preserve Opus's separate checkout and the original supplied clone. Fetch origin, inspect new commits, and read issue #3 plus `ops/astra:coordination/astra.md` before assuming work is unstarted.
2. Follow ROUTESAFE_DEVELOPMENT.md for dependencies and local startup. Use `npm run sync --prefix web -- --ref HEAD` explicitly; the old script default still points at Astra's feature branch until Opus updates it. No API key is needed for presets, charts or downloads.
3. Reuse `releases/e1-aura-001`. Preserve `private/publisher.sqlite` where present. If the private ledger is absent in a new machine, use the committed static bundle; do not create a replacement ledger to republish the same population.
4. Poll coordination every five minutes while active, post meaningful status every 30 minutes and push checkpoints at least every 45 minutes. Git works; Astra's GitHub API requests fail with `CONNECT tunnel failed, response 403`. Use the agreed Git mailbox, not a network-policy bypass.

## Verified foundation

- Dataset: manifest's 260 members and 17 LFS objects verified; source package unchanged.
- Independent critical-path review: Opus O-011 executed the privacy suite; O-012 accepted formula-token handling. Astra reviewed the scanner and consumer, reproduced three browser defects and verified the fixes.
- Integration checks: 43 Python tests, 20 frontend tests, TypeScript/Vite public build boundary; actual browser release values and downloads; 390px layout; offline map fallback; HTML-bearing labels refused; model-note injection and stale release responses blocked.
- Production operator browser: 48 fields, actual release, row-export refusal and aggregate fallback. Sign-offs are local demo state, not a production approval engine.
- Offline package receipt: evidence/e6/integrated-package.json. Rebuild it using pipeline.offline; local runtime ZIPs are intentionally not tracked. Font/dependency notices are included in the package.
- Current-environment setup has been exercised. The reusable install/start configuration is saved as an environment draft; saving does not publish it or prove a fresh instance works.

## Next useful work, in order

1. Opus: acknowledge integrated main in issue #3; switch sync default to HEAD and review fresh-launch web instructions. New frontend code still needs Astra review before integration.
2. Opus-owned `opus/submission` at be8dcff contains the technically corrected narrative, but remains a draft outside main. Before recording, update final UI tab names, distinguish optional AI intent translation from offline presets, record completed independent code review separately from the immutable `pending_review` marker, and expand licence attribution for MapLibre/Inter/GeoNames. Astra reviews the resulting technical wording. Do not submit the draft.
3. Rehearse the <=120-second storyboard against the actual UI. Keep the original artifact, synthetic-data label, per-card privacy unit, inferred destinations, failed count-accuracy target and non-applicable row-linkage caveat visible. Prefer the working schematic/preset fallback if optional services fail.
4. Human lead: confirm participant/team/account facts, recording and final submission details. Public deployment, actual competition submission and new paid commitments require separate authorization. Local verification and documentation do not.

## Claims that must remain qualified

The one artifact's area-level OD WAPE is 25.1%; all 100 diagnostic draws miss the 20% target. No predeclared candidate passed every target and MOB-S1 utility is not passing. The morning top three match in 100/100 draws; this is synthetic experimental evidence, not proof of real-world service value. Municipality WAPE 14.2% is for a different, coarser view. Privacy is per card over the stated period, not per person; 635 synthetic people have two cards. Keep the original pending_review artifact marker and record code-review evidence externally. Hashes match files to a manifest; they do not authenticate a publisher.

Astra made no real model calls. Opus O-012 reports four live functional checks using the human-authorised local key; that is not a model accuracy evaluation. Never put a model key in the public bundle or a handoff file.

## Session continuity

No guaranteed runtime lease, token balance or automatic overnight restart is exposed. A stopped chat does not keep executing. To continue, resume this task with: **“Continue RouteSafe from planning/CONTINUATION.md, inspect main and issue #3, preserve the release and ledger, and complete the next reviewed integration and demo checkpoint.”** Local servers must restart in a new environment. No human action currently blocks the reviewed static foundation.
