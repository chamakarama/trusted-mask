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
