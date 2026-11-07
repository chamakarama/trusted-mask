# Reviewed UI handoff — 7 November 2026

PR #10 at exact head **93ad641c883d2a0ac8c8b70476749885a8930faf** is accepted by Astra. O-025 records the lead's request for a visual overhaul, lifting the prior freeze for layout only. O-026 provides Opus's handoff; A-055 records Astra's independent acceptance. The review, limitations and executable receipts are in evidence/e6/ui-93ad641-review.md. Preserve the freeze after this reviewed integration.

Passed: 25 frontend tests, TypeScript/Vite build and 31-file public boundary; six existing browser regressions (145 numeric cases, 20 scope cases, comparison and policy charts, injected model-note rejection with grounded values, stale/preset response races). Additional keyboard/layout checks pass at four sizes including 390px and 640×480. Operator inventory/refusal checks pass. The changed MapLibre layers validate against a local blank style; external tiles/glyph service availability is not certified. No paid/model calls, uploads, deployment or submission occurred.

Non-blocking follow-up: JavaScript smooth scrolling does not honor reduced-motion preference. This was not a full WCAG or screen-reader audit; existing radio arrow-key and hover-chart accessibility limitations remain. Keep these limits explicit rather than claiming accessibility certification.

## Run and fallback

From a dedicated checkout on integrated main, follow ROUTESAFE_DEVELOPMENT.md: npm sync from HEAD, test/build, then serve only web/dist on loopback. Current cloud review previews use 8794 for planner and 8795 for private operator; they are not public links. Defaults and presets need no model key. Use the schematic map for the offline demo.

New local public archive: runtime/routesafe-reviewed-93ad641.zip, SHA-256 **497d9604e689945c6fc315dc8442605be1bfb063546afcc9026782c08c13eb1e**, 33 members. Receipt: evidence/e6/offline-package-93ad641.json. Public build and fixed release files only; no private inventory or ledger.

Verified fallback remains commit **d997774**, application **2e8e023**, with runtime/routesafe-reviewed-2e8e023.zip SHA-256 **a7be23e9b30b1bd9a65bdca4c97fa9bb1d0f3ac8f61b5235439a1abdc370f1b6**. A preserved directory copy is runtime/reviewed-fallback-d997774. These runtime files are local and ignored, not transported by Git. Use the commit to rebuild if the workspace is replaced; preserve existing work when switching.

The original 112.56-second silent rehearsal remains at runtime/routesafe-silent-rehearsal-2e8e023-v3.webm. It depicts the older layout. Do not label it as a recording of the redesign. The recorder/receipt and morning handoff are retained on astra/band-evidence; they were not silently merged with this UI review. Use the updated reviewed demo/STORYBOARD.md and demo/REHEARSAL.md for a new human-approved narrated take. No narrated final video has been completed by Astra.

## Evaluation and privacy boundaries

O-026 reproduced the five-band diagnostic at b7f5e08, byte-identical apart from source_commit, and accepted it as exploratory Q&A evidence. Only its evaluator and saved report are integrated. band_checks is still disabled; neither the public summary nor the fixed release changed.

Top-three set overlap: night 0/3 (95.85% regret), morning 3/3, midday 3/3, afternoon 2/3 (2.52% regret), evening 3/3. This is one post-hoc synthetic artifact check, not repeated confirmation. Midday capping alone retained 2/3; this draw restored 3/3. Afternoon capping retained the set while changing order, then noise changed set membership. Exact unnoised references are synthetic-only; the manifest's synthetic flag cannot establish safety for arbitrary real-data inputs.

Keep the morning-led demonstration, **25.1% OD error**, missed 20% target, non-passing organiser utility, cap-loss/noise distinction, card-level adjacency, and original pending_review artifact marker. The release verifies to the original bcd8b07a… manifest digest; no redraw or ledger operation was needed.

## Next actions

Opus should sync integrated main and confirm the layout on the human's recording machine. Optional reduced-motion polish can be a small separately reviewed follow-up. Do not expand features or enable exploratory band claims in the UI. The human lead still owns final narration/video approval, participant/account facts and authorization for external submission or upload. No token balance, guaranteed runtime lease or automatic restart is exposed; resume from planning/CONTINUATION.md if the session stops.
