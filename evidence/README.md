# RouteSafe evidence guide

All numerical evaluations here use supplied synthetic data or explicitly invented test traces. Exact reference counts, attack results and identity truth belong to evaluation, not the protected release. Equivalent real-data diagnostics must not be published automatically. The public demo reads only the curated `evidence-summary.json`; it does not browse this directory.

The immutable experimental release is `releases/e1-aura-001`, manifest SHA-256 `bcd8b07aca896ffdbeb1a8695beea709642bafacc464e289f4e276d55f8c184d`. Its publisher revision is `5438e3c`; later evaluation or integration revisions do not change its provenance. Preserve its bytes and spent ledger.

| Question | Evidence | Finding |
|---|---|---|
| Does the first path work? | `e1/e1.json`, `e1/protected-output.html`, `e6/browser-smoke.json` | Full data → bounded OpenDP counts → verified bundle → actual browser values/download |
| Is the scanner trustworthy enough for advisory use? | `e1s/opus-handoff-review.json`, `../petpilot/evidence/dev_catalog_eval.json` | Development metrics reproduced; independent probes keep unknowns/review flags. Labels never grant export permission. |
| What do destinations mean? | `e2/inference.json`, `e2/inference-edges.json` | Exact upstream heuristic parity, 516,119 inferred journeys. Withholding final inferred legs retains the same morning shortlist. No destination-truth accuracy claim. |
| Does the initial policy meet utility targets? | `e3/initial-policy-100.json` | No: area OD WAPE target fails 100/100 draws. Exact top-three set repeats 100/100 in this synthetic diagnostic. |
| Was a better final policy selected? | `e3/policy-search-spec.json`, `e3/policy-search.json` | Eight predeclared candidates, 20 draws each; none passes all targets. No final-policy confirmation run or hidden retuning. |
| Does coarsening help? | `e3/municipality-postprocessing.json` | Existing signed area estimates summed then clamped once: 14.24% WAPE for municipality totals only, with no new draw. |
| Where are errors large? | `e3/strata.json` | Low-volume cells have large relative errors; cap loss also varies by band/date. Exact-volume strata are evaluation-only. |
| Why not release rows? | `e4/trajectory.json` | Native four-point unicity .970/.974/.904 for B0/B2/B2-k. Fixed-cohort curves state sampling, unavailable denominators and Wilson intervals. Aggregate lookup is not applicable, not zero risk. |
| Does independent scoring agree? | `e5/benchmark.json`, `e5/baselines-reproduced.json` | Native U1=0; aggregate-adapted U2=0/U3=.772. Unprotected adapter parity passes. Nine baseline task scores/details exactly match supplied scorecards. |
| Can retries or failures bypass accounting? | `../tests/privacy/test_publisher.py`, `../tests/privacy/test_accounting_processes.py`, `e6/opus-privacy-review.json` | No second draw on identical retry; interrupted draws remain charged; competing publishers serialize. Opus executed critical tests independently. |
| Can private content enter the public build? | `e6/consumer-review.json`, `e6/consumer-fix-review.json`, `e6/public-build-mutations.json`, `e6/input-isolation.json` | Three original consumer defects fixed and retested; private inventory/canary build injections rejected; publisher runs without metadata/truth/evaluation directories. |
| Does the interface survive practical constraints? | `e6/expanded-browser-review.json`, `e6/keyboard-mobile-offline.json`, `e6/offline-playback.json` | Actual values agree with independent calculations; mobile keyboard path works; loaded controls work offline; extracted local package works. |
| Is this person-level protection? | `identity/multiple-cards.json` | No. Card-level adjacency; 635 synthetic people have two active cards. Observed maximum is not a production bound. |

Native MOB-U1 is clipped at zero when qualifying-cell MAPE exceeds 50%; here it is 55.67%. That does not contradict 25.09% WAPE: MAPE gives each qualifying cell equal weight, while WAPE weights by count volume. The shortlist and municipality view support a narrower exploratory planning story, not full MOB-S1 utility acceptance.

Reproduction commands live in `../ROUTESAFE_DEVELOPMENT.md`. Additional modules: `evaluation.baselines`, `evaluation.strata`, `evaluation.inference_edges` and `evaluation.summary`. Use the locked Python environment. Re-running random experiments can change diagnostics and must not replace a release with a favorable draw. Packaging uses `pipeline.bundle` and `pipeline.offline` and performs zero noise draws.

Peer review is documented in issue #3 and `e6/opus-privacy-review.json`. It is implementation review, not certification. The existing artifact's `pending_review` field remains immutable; limitations and failed utility gates remain visible.

Technical answers for the demo are collected in [DEMO_FACTS.md](DEMO_FACTS.md). E7's fixed-neighbour membership diagnostic (`e7/membership.json`, protocol `../evaluation/E7_PROTOCOL.md`) was accepted in Opus O-015 after independent code and executable checks (`e7/opus-review.json`). It is now included in the curated synthetic summary. The selected-interval coverage issue in `e6/selected-interval-review.json` is resolved by a fixed simultaneous bound across all 2,205 OD cells; this derived UI range does not alter the release's original null interval fields.

The before/after charts use `e5/utility-comparison.json`, extracted by `evaluation.utility_comparison` from the existing synthetic E1 inputs and unchanged release. Opus accepted the extraction and separate stage definitions in O-019 (`e5/comparison-review.json`). Exact route references still use inferred destinations. Cap, signed-noise and displayed-total WAPEs use different bases and must not be stacked. `e6/comparison-d53af29.json` checks all 28 daily tooltips, ten route pairs and nine stage metrics in the actual browser.
