# RouteSafe implementation decisions

## D-001 — Shared transport and ownership (2026-11-06)

O-001 and A-001 acknowledged isolated checkouts, source manifest agreement, Astra as integrator, and Opus ownership of scanner/web/demo. O-004 and A-004 resolve crossed transport messages: issue #3 is authoritative; Astra reads public GitHub HTML and sends outbound messages on `ops/astra`, which Opus relays. The API restriction does not block branch transport or review. No decisions should silently remain only in a local chat. Actual issue links and runtime details are in COORDINATION.md.

## D-002 — Scanner accepted with advisory scope (Astra review, A-004/A-005)

Opus supplied 87b0c06, followed by the full-column review sweep at 4c563b1. Astra ran the scanner tests, independent post-freeze inventory probes, actual full mobility inventory and development scorer. The combined suite passed 21 tests after sweep integration. Development macro-F1 .9017 and sensitive recall .9158 reproduce; these remain label-informed development metrics. Independent fixtures now abstain on unknown categories and keep an unlinked hash as an identifier requiring review. No export permission follows from any scanner label. The reviewed scanner was fast-forwarded to main at 4c563b1. The input package is unchanged.

## D-003 — E1 release retained, no final utility or privacy acceptance yet

Astra's first full-data release uses the plan's experimental caps 32/64/64 and epsilon allocations .6/.3/.1, total 1, add/remove-card adjacency. Manifest SHA-256 is `bcd8b07aca896ffdbeb1a8695beea709642bafacc464e289f4e276d55f8c184d`. Retry returned exactly the same artifact. It is pending independent privacy review, not a final approved policy. All intervals are explicitly unavailable and cells uncertain.

Native OD inference equals upstream exactly. The first draw preserves the morning top-three corridor shortlist but OD WAPE is 25.09%. A 100-draw initial-policy diagnostic never reaches the 20% OD target, despite meeting the decision target every time. Eight predeclared development candidates, 20 draws each on a half-card split, produce no all-target winner. No hidden epsilon increase, lucky-run selection or claim of full MOB-S1 acceptance follows. The native/adapted benchmark scores and all failed criteria remain in evidence/.

Municipality aggregation of the existing signed noisy values followed by clamping gives 14.24% WAPE in that draw. This is a proposed coarser UI fallback, not ratified by silence and not improved area-level performance. A-004 requests Opus's consumer agreement. No new artifact is generated for this proposal.

## D-004 — Consumer mutations block frontend integration (A-005)

Independent Astra tests found that the first TypeScript consumer accepted extra geometry properties, omitted CSV columns, and arbitrary manifest dimensions with recomputed hashes. This is a schema/boundary issue, not a cryptographic hash failure. Astra tightened dimensions/resource/definition IDs in the shared schema; valid existing bundles remain compatible. Opus owns consumer geometry and CSV enforcement. Integration waits for their pushed fix and rerun of the actual mutation tests. Source fixtures are synthetic canaries, not exposed real data.


## D-005 — Reciprocal review completed for critical paths; static E1 scope retained

O-011 reports Opus executed all 30 privacy tests at 1b84370 on Windows/Python 3.12.10 in an isolated checkout and locked fresh environment, including process interruption/concurrency, contribution bounds and OpenDP checks. N1/N2 improvements were accepted. Astra executed scanner and frontend paths, reproduced the consumer boundary defects, accepted their fixes, and checked actual browser values/downloads. Later Astra coverage adds two invented-input publisher retry/interruption tests and a formula-token rejection test; total local Python suite is 43 tests including scanner tests.

O-008 accepts the exact municipality postprocessing contract; the browser's morning totals 12,450 / 10,627 / 8,577 match an independent Python calculation. O-005 boundary fixes passed all three original adversarial cases, resolving D-004. D-003's initial proposal is now an implemented derived view, not an area-accuracy improvement.

Preserve the original E1 bytes and spent ledger. Record review evidence outside the immutable artifact rather than rewriting its pending_review field. The supported scope is an experimental synthetic planning shortlist with exploratory count tables and explicit missed utility targets. No final policy, full MOB-S1 utility acceptance, production readiness or certification is claimed. No new noise draw, broader privacy unit or hidden retuning follows from this review.


## D-006 — Reviewed main integration and production package

Main was fast-forwarded to b223859 on 2026-11-06 after accepting Opus dae86c5. Reciprocal review includes O-011's independent privacy execution and O-012's formula-token review. Astra reproduced and then verified fixes for map-label injection, model free-text claims and stale release selection. The integrated production build passes the model-note and selection-race probes; 43 Python and 20 frontend tests passed at integration. Local browser checks include offline fallback, 390px layout, download hashes and deterministic answers.

The reviewed offline archive contains 33 members, including seven local font assets and notices for 35 frontend packages; its original release bytes match exactly. See evidence/e6/integrated-package.json and integrated-production-boundary.json. No new release or noise draw occurred. Current production preparation differs from original publisher 5438e3c only by stricter public-label validation and an explicit evaluation-only cap override; the production defaults and card-local ranking are unchanged.

Optional model integration is bounded intent translation, not a source of factual answers. Astra used local mocks only; O-012 reports four live functional checks on Opus's human-authorised setup. Deployment, spending authorisation and competition submission remain separate human decisions. D-005's utility limitations and immutable pending_review provenance still apply.
