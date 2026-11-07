# Morning handoff — 7 November 2026

**Ready:** redesigned application `93ad641`, independently reviewed and integrated into main at `32efd39`. Later handoff-only commits do not change the application. Scanner → fixed protected artifact → planner, charts, questions and downloads works. No deployment or submission has occurred.

## Open the redesigned UI

Use a new folder name to preserve any active builder checkout. Requires Git and Node/npm (tested with Node 24). From a terminal:

```sh
git clone https://github.com/Chintufp/Since-AI-hackathon---WAWS.git routesafe-morning-32efd39
cd routesafe-morning-32efd39
git checkout --detach 32efd39
npm ci --prefix web
npm run sync --prefix web -- --ref 32efd39
npm run dev --prefix web -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/?release=e1-aura-001&view=routes&band=06-09&map=schematic` on that machine. Expect **5,491 / 4,565 / 4,183**, “files verified”, “synthetic data” and “not yet independently audited”. Click **Busiest morning routes?** to try the offline preset. This path needs no API key or publisher run. If the new folder already exists, choose another name; do not reset existing work. In the cloud, add `--cache /tmp/routesafe-npm-cache` to npm ci; normal Windows npm cache is writable.

For the private operator part of the demo, install Git LFS and Python 3.12, materialise the supplied files, and use an activated virtual environment (`python -m venv .venv`; activate with `.venv\Scripts\Activate.ps1` on PowerShell or `source .venv/bin/activate` on bash). In another terminal at the repository root:

```sh
git lfs install --local
git lfs pull
python -m pip install -r requirements-routesafe.lock
python -m pipeline.verify_source TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026
python -m pipeline.inventory --data TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data --output web/operator-data/mobility-inventory.json
npm run operator:data --prefix web
npm run operator --prefix web -- --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/operator.html`; expect **48 / 4 / 17 / 11 / 37**. Serve only the designated UI directories. Do not republish, reset the ledger or serve the repository root.

## Record a current demo

Use demo/STORYBOARD.md and demo/REHEARSAL.md, updated for the left-panel layout. Record locally at 1366×768, 100% zoom, with narration; target 110–116 seconds and verify the final video is at most 120 seconds.

1. Show the morning shortlist, then **Is it safe?** and the row-risk comparison.
2. Show operator inventory, the consultancy row-sharing refusal and the aggregate alternative with pending review.
3. Return to morning routes; scroll the left panel to **Ask a question** and use the suggested question. Say “preset” or “suggested question”.
4. Show **Night** and the noise warning, then the failed accuracy target and card-level privacy explanation.
5. Finish with **What's shared** and downloads. Watch the full recording; check readable numbers, microphone, duration, “synthetic data” and “pending review”. Keep terminals and credentials off-screen.

The offline map/preset path needs no new costs. A typed live-AI demo is optional and requires the already-authorised helper/key configuration; do not claim a preset is live AI. The preserved 112.56-second silent clip shows the **old layout**, has no narration, and is not a finished current submission video.

## Verified, with limits

- 25 frontend tests; TypeScript/Vite build; 31-file public boundary; all six browser regression scripts. Numeric checks cover 145 cases; scope checks cover 20, including 18 mixed-strength cases. Injection/grounding and stale-response protections pass.
- Comparison and policy values verified; planner/operator keyboard and overflow smoke checks pass at four viewport sizes, including 390px. This is not full accessibility certification; reduced-motion scrolling remains a non-blocking follow-up.
- Fixed release and original fallback archive verified unchanged. Full review: evidence/e6/ui-93ad641-review.md. New local archive: runtime/routesafe-reviewed-93ad641.zip, SHA-256 `497d9604e689945c6fc315dc8442605be1bfb063546afcc9026782c08c13eb1e`. Local runtime files are not carried by Git. Previous reviewed fallback is d997774; archive details are in planning/UI_REVIEW_HANDOFF.md.
- **25.1% area-level OD error misses the 20% target.** Organiser utility is not passing. Morning top-three matches in 100/100 diagnostic draws are synthetic evidence, not real-world validation. Other bands' one-artifact exploratory results do not extend that claim; band_checks stays disabled.
- Privacy is per card, not per person. Ranges cover noise around capped counts, not cap loss. Destinations are inferred. Original pending_review metadata remains; code review is not an audit. Exact reference diagnostics are safe to show here only because the supplied data are synthetic.

## Human decisions and deadlines

The lead still supplies participant/team/account facts, watches and approves the narrated video, and authorises any public upload, deployment, organiser contact or submission. Story draft: demo/DEVPOST.md; judge questions: demo/QA.md. Optional organiser files are prepared but unsent. No extra paid service is necessary.

Plan targets (EET): record Saturday 7 November by **20:00**; submission-ready Sunday 8 November **02:00**; submit target **08:00**; hard deadline **10:00**. Verify actual account access and event requirements before submission; drafts do not complete registration.

Main is frozen after reviewed integration. Resume with “Continue from planning/CONTINUATION.md and planning/MORNING_HANDOFF.md; inspect coordination and preserve the release, ledger and reviewed demo.” No guaranteed runtime lease, token balance or automatic restart is exposed. Coordination: https://github.com/Chintufp/Since-AI-hackathon---WAWS/issues/3 .
