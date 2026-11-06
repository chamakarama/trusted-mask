# RouteSafe submission (DRAFT, not submitted)

> Opus owns this narrative and checklist. Astra reviews every technical claim by PR. The human lead fills the participant/account facts and does the actual submission. **Every number below comes from a committed evidence file. Nothing is a target presented as a result.** Fields marked TODO are not done.

| Field | Content |
|---|---|
| Project / challenge / team | **RouteSafe** · TrustED PETs Transformer, Since AI Hackathon 2026 (Turku, 6–8 Nov) · team: TODO (human) |
| One-sentence problem and recipient | A transport operator wants external planners to see where people travel, but even pseudonymised tap records reveal individual travel histories. RouteSafe publishes protected demand statistics instead of histories. |
| Working product and actual decision | A planner explorer that answers "which weekday-morning corridors deserve a closer look?" from a released bundle only (map, ranked shortlist, line × hour, daily taps, downloads), plus a private operator workbench (scanner inventory → purpose → handling → release). |
| Architecture and privacy unit | Private publisher (Python, OpenDP integer vector Laplace, SQLite ledger) → immutable static release bundle (manifest, CSV/JSON, public area points, checksums) → static React explorer that validates the bundle in the browser. Privacy unit: **one travel card's records over the whole 4-week period** (add/remove one card), ε = 1 in total (OD 0.6, line-hour 0.3, daily 0.1), with each card's contribution capped (32 / 64 / 64). Status **pending review**, not certified. |
| Measured result with exact evidence link | See [Measured results](#measured-results-synthetic-benchmark). |
| Inference and multiple-card limitations | Destinations are **inferred** (next boarding of the same card; last journey closes to the first), not observed. The guarantee is per card; a person with m cards gets m·ε. In this synthetic data 635 of 21,926 people hold 2 cards (not a production bound). |
| R1 data types | Operator workbench step 1, from the `petpilot/` rule-based scanner inventory (no AI): 48 mobility columns, each with role, reason, rule ids, certainty and review flag; unknowns are not called safe. Development metrics: `petpilot/evidence/dev_catalog_eval.json` (label-informed, not blind). |
| R2 PETs per data type | Operator workbench step 3 (scanner reason and policy handling side by side): omit / internal grouping only / time bands / public lookup / aggregate input, then card-level contribution cap + DP noise per released table. Parameters are in the release `manifest.json` `privacy` object. |
| R3 protected output | `releases/e1-aura-001/` (manifest SHA-256 `bcd8b07a…`), shown in the planner and downloadable file by file. |
| R4 utility before/after | Planner **Evidence** tab and `evidence/evidence-summary.json` (synthetic evaluation). |
| R5 sharing scenario | MOB-S1-style public planning release. Recipient, purpose, what is and is not released, and limitations are on the **What was shared?** tab. Row-level consultancy requests return `UNSUPPORTED_SHARING_SCENARIO`. |
| Live app / offline instructions / release tag | TODO. Local: `cd web && npm ci && npm run sync && npm run dev`; offline: `npm run build` then serve `web/dist/`. No public deployment authorised yet. |
| Public video URL / duration / local backup | TODO (≤ 120 s; see `demo/STORYBOARD.md`). |
| Reproduction command / input package / runtime | Input: the supplied TrustED PETs Proving Ground 2026 package (MANIFEST verified, 260/260 members). Publisher and evidence commands: `ROUTESAFE_DEVELOPMENT.md`. Web: `web/README` TODO. Python 3.12/3.14, Node 22+. |
| Pre-existing materials and licences | Supplied package: data/docs CC BY 4.0, code MIT (Since AI ry); OpenDP (MIT); React, Vite, ajv, vitest (MIT). |
| Work completed during event | All RouteSafe code, the scanner, the release and the evidence were produced during the event (6–8 Nov 2026). TODO: human to confirm. |
| AI and model use, incl. coding assistance | Much of the code and documentation was written by AI coding agents working under the team's direction and review: an Opus 5.5 agent (scanner, planner, operator view) and a GPT-6 agent "Astra" (publisher, privacy, evaluation). The rule-based scanner itself uses no AI. The planner's free-text assistant is **not connected to a model yet**. TODO: human to confirm wording and the final model used. |
| Additional synthetic data and its role | `petpilot/fixtures/` is a tiny deterministic team-generated mobility fixture for scanner tests only. `fixtures/protected-v1` is an illustrative contract fixture (`fixture: true`), never evidence. |
| Product next steps | Reviewed final policy (E3 found none meeting all targets); published noise intervals; person-level accounting with an authorised account-to-card mapping; repeated releases with cumulative accounting. |
| Since AI status and receipt | NOT SUBMITTED (human) |
| Devpost status and receipt | NOT SUBMITTED (human) |
| Last logged-out access check and reviewer | TODO |

## Measured results (synthetic benchmark)

All values come from `evidence/evidence-summary.json` (release `e1-aura-001`, publisher commit `62c916c`), except the attack curve, which comes from `evidence/e4/trajectory.json`.

- **Why not share rows:** in the organisers' trajectory test, **4 known (stop, hour) sightings single out 97.0%** of travel cards once names are removed (B0), 97.4% with pseudonyms and coarser values (B2), and 90.4% even with k ≥ 5 suppression (B2-k). On a fixed cohort of 1,000 cards (names removed): 2 sightings 70.0%, 3 sightings 92.6%, 4 sightings 97.5%. RouteSafe releases no rows, so this lookup is **not applicable**. That is not a claim of 0% risk.
- **Decision kept:** the protected weekday-morning top-3 corridor shortlist equals the exact one (3/3, regret 0). The decision target passed in **100 / 100** fresh noise draws of the same policy.
- **Error (WAPE) of the released counts:** corridors at area level **25.1%** (median 24.1% over 100 draws; **misses the team's 20% target in 100/100 draws**), line × hour 14.7%, daily 7.2%. The derived municipality view has 14.2%; that figure applies to municipality totals only.
- **Organisers' utility tasks:** native MOB-U1 0.00, adapted MOB-U2 0.00, adapted MOB-U3 0.77. **MOB-S1 utility is not passing.**
- **Policy search:** eight predeclared candidate policies; none met every target. No final policy is claimed.
- **Scanner (development, label-informed):** macro-F1 0.902 vs 0.646 for baseline B1 on the 475-column catalog, sensitive-column recall 0.916. All 25 sensitive misses are flagged for review; none is called safe.

## Honest limits (say these in the video and Q&A)

- The privacy guarantee is per card, for this period, with the policy pending review. It is not person-level anonymity and not a certification.
- Destinations are inferred, and area-level counts are noisy (about 25% error). The shortlist is what survives reliably.
- The checksum shows the files match their manifest. Without a trusted signature it does not prove who published them or how they were computed.
- The assistant only answers preset questions until a model is connected. It never sees private data and cannot run new computations.
