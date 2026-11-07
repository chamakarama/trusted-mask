# Astra review of PR #10

Verdict: **ACCEPT**, exact head `93ad641c883d2a0ac8c8b70476749885a8930faf`, base `d9977747a91002bcd7d9afd7cafde83811273a94`. Review conducted 7 November 2026 UTC. PR: https://github.com/Chintufp/Since-AI-hackathon---WAWS/pull/10 .

O-025 records the human lead's request lifting the recording freeze for visual layout only. O-026 supplies Opus's implementation handoff. Astra reviewed the changed presentation code and independently ran the production build and checks below. No blocking regression found. This accepts the bounded redesign, not a broader change to utility or privacy claims.

## Evidence

- 25 frontend tests pass, including hash-recomputed HTML-bearing label refusal, signed aggregation and intent boundaries. TypeScript/Vite build passes; public build contains 31 allowlisted files.
- Six existing browser scripts run unmodified against the exact-head production build: 145 numeric cases; 20 scope cases including 18 mixed-strength cases; 28 daily tooltips, 10 route pairs and 9 error-source metrics; 8 policy bars; model-note canary rejection and grounded 5,491; stale release and pending-response versus preset refusal regressions. Receipts: ui-93ad641-{numeric,scope,comparison,policy,boundary,assistant_race}.json.
- Additional keyboard smoke checks: activate tabs with Enter, bands and operator refusal with Space, and a preset with Enter. Correct results at 1366×768, 1280×720, 390×844 and 640×480; all tabs and operator have no document-level horizontal overflow. Actual operator counts remain 48/4/17/11/37. No page exceptions. Receipt: ui-93ad641-layout.json.
- Inspected desktop and mobile screenshots. Noise ranges, synthetic-data marker, not-audited marker, source attribution and cap/noise limits remain available. The mobile page is deliberately long; this review does not claim a complete assistive-technology audit.
- MapLibre changed layer expressions exercised against a local blank style, with no layer-validation or page errors. This checks the changed rendering path without sending any release or question to a service. External tile/glyph availability is not certified by this check. The schematic fallback remains the reliable offline demo path.
- No changes to pipeline/, privacy/, web/src/data/, web/src/assistant/, web/server/, releases/ or evidence/ in the PR. Text-node popup rendering and the assistant generation/abort guards remain intact. Static review finds no new unsafe HTML rendering. All numbers still derive from the allowlisted artifact; model notes do not become factual output.

The comparison script's prior `.ba` strict-selector ambiguity is removed by changing the policy section to `.tradeoff` only. This is consistent with the intended DOM contracts.

## Limits and follow-up

New JavaScript smooth-scroll actions do not consult prefers-reduced-motion. This is a non-blocking accessibility polish item, not a claim of WCAG conformance. Radio groups remain usable by Tab plus Space but this review does not certify complete ARIA arrow-key behavior or screen-reader navigation. Daily/heatmap hover interactions retain pre-existing accessibility limitations. No real model call was made and no external service uptime was tested.

The fixed release still verifies to manifest SHA-256 bcd8b07aca896ffdbeb1a8695beea709642bafacc464e289f4e276d55f8c184d. The reviewed old offline ZIP remains unchanged (SHA-256 a7be23e9b30b1bd9a65bdca4c97fa9bb1d0f3ac8f61b5235439a1abdc370f1b6), with a local copy of its built directory at runtime/reviewed-fallback-d997774. The old 112.56-second silent clip remains valid for the old layout only; it is not a recording of this redesign.

O-026 separately accepts the exploratory band diagnostic after reproduction at b7f5e08. Only the evaluator and report may be integrated as exploratory evidence, with band_checks disabled. The diagnostic is one post-hoc synthetic artifact check, not repeated confirmation, and exposes exact synthetic reference counts. Keep the morning-led demo and 25.1% OD error disclosure.

Reproduction: existing browser helpers use the arguments documented in their --help output. The two review-specific scripts browser_ui93_layout.py and browser_ui93_map.py target loopback planner 8794 and operator 8795, with all external requests blocked/mocked. They are evidence tools for this review, not application features.
