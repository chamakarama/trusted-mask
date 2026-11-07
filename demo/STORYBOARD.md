# RouteSafe — current city-map video cut

Project-lead update, 7 November 2026: participants also judge from videos. Most are beginners; each participant chooses between two videos 20 times. Do not assume they read the repository or know differential privacy. Scoring weights are not established by this information.

Target a clear 100–115 second cut within the existing 120-second project limit. Confirm the event's final submission requirements before uploading. This is a recording plan; no finished video or submission is claimed.

| Time | Actual screen/action | One idea to communicate |
|---|---|---|
| 0–7 s | Open the city **route-demand** view, morning. Show the map immediately. | “Where should we investigate adding more buses? Start with travel demand, without exposing individual journeys.” |
| 7–18 s | Data owner: choose the generated dataset; show the private-to-public boundary. | A data owner has journeys. A planner needs useful patterns. |
| 18–35 s | Show four key fields, the aggregate-planning purpose, then the four protection steps. | Identifiers stay inside; contributions are limited; calibrated noise protects the shared counts. |
| 35–45 s | Show the actual result, its failed accuracy target and the limited-use acknowledgement. Open the exact release. | These are measured results, with limits. |
| 45–70 s | Select a bright street segment. Inspect a contributing connection. Switch morning/afternoon and show the changed pattern. | Where demand concentrates, how places connect, and when it changes. |
| 70–88 s | Save a connection and another area; open the shortlist; export the planning summary. | A concrete output for further investigation. |
| 88–103 s | One quiet limits frame over the map; show Data & limits if useful. | Synthetic travel; artificial zones; 31.2% count error misses the target. Exploration only. |
| 103–115 s | Return to a clean map with the product name and the completed data → protection → map sequence. | A coherent prototype, with a clear path to better data and validated utility. |

## Visual rules

- Show the actual working UI at a readable scale. Use short on-screen labels, visible clicks, and one action at a time.
- First-frame comprehension test: in five seconds, can a beginner say what the product does and who would use it?
- Prefer a visible map change to a paragraph describing it. Keep primary actions above the fold. Avoid opening multiple technical disclosures during the main cut.
- Keep the synthetic-data label and meaningful uncertainty visible. Never imply that bright paths are measured congestion or observed passenger GPS traces; route geometry is public, demand and assignment are synthetic/modelled.
- The route layer follows public Föli bus shapes and aggregates modelled demand on shared segments. The default hides the analysis-zone grid. Paths are assigned from public zone centres by a declared shortest-distance model, not observed passenger journeys. The target decision is where more bus service could help. The current build shows demand only; it does not compare available service or recommend a number of extra buses.
- Use the same immutable city release throughout. Do not regenerate noise, pick another seed, alter counts or conceal a failed metric for a better shot.
- Processing may be shortened in the edit, with an honest transition. Do not turn a mock animation into evidence that a real job ran.
- Captions must remain readable on a small video player. Keep technical details in the repository and Data & limits panel.

## Facts allowed in this cut

- Frozen generated population: 20,000 fictional cards, 18,000 fictional people, 767,122 boarding observations, 25 artificial grid zones.
- Release: `city-turku-v1`; manifest SHA-256 starts `2a1735f0`.
- One actual OpenDP publication. All displayed views are post-processing of that release.
- Actual OD WAPE: 31.2%; target 20%; morning top-three overlap: 2/3. These describe this constructed scenario and inference procedure.
- The six-population, 600-draw distribution simulation is separate from production publication. It evaluates OD noise/cap effects only. It does not validate real-city demand or the entire OpenDP runtime.
- Do not reuse the original benchmark's 3/3 or 100/100 figures as city results. The original benchmark remains a separate release and evidence set.

## Before recording

Use [web/README.md](../web/README.md) to start the checked builds. Start the private workflow with the frozen generated input if demonstrating the complete owner flow. The public build already includes the immutable city artifact. Verify both URLs, the release name, all visible labels, the map tile connection and the downloaded summary. Capture a local backup. Human review of the finished cut and external submission remain outstanding.

Optional second-application cut: see [ScamChorus and workflow improvements](../planning/SCAMCHORUS_EXTENSION.md). Do not show its proposed screens as a working system until the privacy-specific adapter and recipient artifact are built and tested.

## Stronger privacy-to-decision cut (latest implementation)

Use the owner **Share** stage to show actual private rows on the left and exact protected recipient records on the right. Then use **Check** to show which morning destinations survived protection. In the map, click **Morning priorities**, inspect the first destination's modelled inbound routes, save all three and export. Say: “Find places to investigate without sharing individual travel histories.” The narrower synthetic task passed 300/300 simulations under its declared overlap/regret criterion; this does not mean exact rankings or accurate absolute counts in all 300 draws.

### Proposed visible demand-surge scenario — not implemented

A fictional event or new workplace is a stronger demonstration than a hotspot at a house. Show a coherent increase across many fictional cards and origins, followed by a coarse destination-area increase and the modelled street routes serving it. The protected output deliberately reveals aggregate location patterns; it must not be described as hiding every location. Current input represents boarding stops, not home addresses; destinations remain inferred.

Prepare and label a baseline and event scenario ahead of recording. Freeze the intervention, privacy accounting and evaluation criteria before generating either protected result. Each release for an overlapping protected population must compose in the same accounting scope; do not reset ledgers or redraw until the map looks good. Show absolute views on a shared scale. A difference view needs uncertainty for both releases, plus cap and inference limitations. Establish the expected effect against the private synthetic reference, and report whether the protected result actually preserves it. No house marker or raw person trace may enter the recipient build.

The planner's present decision is “investigate service here.” To say “add buses,” implement a separate declared supply scenario (timetable, route assignment, usable capacity, period and assumptions) and validate the demand/supply comparison. Synthetic supply is acceptable if visibly labelled; it must not be presented as measured Föli service insufficiency. Do not fake a live spike by mutating released counts in the browser.
