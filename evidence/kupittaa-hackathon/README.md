# Since AI at Kupittaa — working synthetic demo

This fictional scale test is the demonstration scenario, not observed attendance, travel, dates or venue data. The frozen [scenario](../../planning/KUPITTAA_DEMO.md) was committed at `8027e59` before publication. It uses 2,000 background cards plus an exaggerated 10,000 attendee cards with morning inbound trips and afternoon returns on two invented weekdays, 30–31 October 2025. The public Kupittaan asema coordinates locate the destination within TRK-G14; the map marker is the coarse analysis-area centre, not a home or claimed venue address.

## What works

- A real, bounded ZIP upload into the private workbench. It accepts the registered frozen city or Kupittaa datasets; an unregistered/modified population is refused rather than silently reusing a release or resetting a budget. ZIP root members, total size, duplicates, paths and symlinks are checked. No arbitrary-data sanitisation claim.
- The private page validates, reviews, protects/reuses, evaluates and prepares the output. Source records and exact reference values stay in the private service.
- A portable `routesafe-protected.json` download contains the original nine release files verbatim, plus readable aggregate destination tables and limitations. Tables sum signed released counts before clamping.
- The separate planner can open that downloaded file locally. It independently validates the nine files and checksums, derives map values from them, ignores unverified convenience summaries, and sends no uploaded file contents to a server or AI service. Only the public schema and map resources are fetched. Hashes establish consistency, not publisher authenticity.
- The owner page supplies two copyable questions for manually uploading the same protected file into a fresh ChatGPT chat. No AI answer is fabricated or claimed as a privacy proof; no external upload has been performed by this implementation.
- The map shows the Kupittaa morning surge, 106 named public Föli bus lines, line geometry, and 1,489 public stops in the map extent. Stops are searchable and selectable. Heat remains modelled shared-street demand, not observed ridership on that line. Public routes include variants and are a 2026 snapshot used with an illustrative 2025 calendar.

## Measured result and accounting

The single OpenDP publication has manifest SHA-256 `75e319a4220939b66684c2b183ee3434857ea905ac24809fcbdfdd6beaa370d5`. Publisher source is `8027e59`. The unchanged card-level policy spends epsilon 1 once in `private/kupittaa-hackathon-accounting/ledger.sqlite`, scoped to this disjoint invented HACK- card population. The earlier city and benchmark artifacts remain unchanged. This separate fictional population does not justify resetting accounting for overlapping real populations.

Kupittaa is the largest morning destination: **20,488 protected period trips versus 20,000 raw inferred reference trips** (2.44% relative error for this one selected aggregate). The rate is 341.5 per weekday per hour, averaged over all 20 weekdays, versus a clamped midday estimate of zero; zero is not proof of no demand. The conservative noise-only range for morning destination demand is approximately 287–1,762 per weekday. This excludes inference, modelling and cap errors.

The predeclared spike criterion passes, but **fine-pair WAPE is 98.6%**, and morning connection-pair top-three overlap is 0/3. These failures remain visible. Area shortlist overlap is 2/3 with 1.1% selection regret; no repeated-population reliability claim is made for this new scenario. See [all evaluation results](evaluation.json) and [publication receipt](release-receipt.json). There was no noise redraw or favorable-seed search.

## Reproduce and run

```sh
# Only if the private scenario folder does not already exist:
.venv/bin/python -m simulation.hackathon
npm --prefix web run sync
npm --prefix web run build
npm --prefix web run build:operator
# Serve web/dist on localhost:8791, then:
.venv/bin/python -m pipeline.workflow --city-input simulation/private/kupittaa-hackathon-v1 --runtime private/kupittaa-demo --port 8792
```

Start on `/operator.html`, download the raw demo ZIP, upload it, and complete the five visible stages. Download the protected JSON; open it through **Open protected file** in the planner. The new workbench matches the input fingerprint and reuses the committed release—do not rerun the publisher or replace its ledger.

Automated checks: 78 Python tests and 49 frontend tests passed, including malformed ZIPs, upload invalidation/persistence, protected export, local file import, tampering, and public route references. Both builds and the public-file boundary check pass. Browser QA exercised the actual raw ZIP upload, validation/review, publication reuse, local protected-file import, event selection, bus-line selection and stop focus. Full accessibility, real-world utility, bus capacity, external AI response and unfamiliar-user testing remain outside this verification.
