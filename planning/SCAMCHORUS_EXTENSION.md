# ScamChorus: a second application of the private-to-shared workflow

Status: proposal and implementation specification, 7 November 2026. The transport workflow works locally. Call processing, cross-bank aggregation, authentication and scam detection are not implemented. The lead's suggested demo uses a fully fictional call with a synthetic victim voice and private-looking fictional information. No real victim material is required.

## Product point and immediate visual hook

**Banks learn about scam campaigns together; victims' calls stay with their bank.**

The reusable product idea is controlled sharing of useful signals, with purpose-specific privacy treatment and measurable utility. Avoid describing it as a universal “anonymize any file” system. Removing names from a transcript does not establish anonymity, and a scanner finding does not authorise export.

Show three clearly separated surfaces at once:

| Surface | What the viewer sees | What actually crosses the boundary |
|---|---|---|
| Bank A — private | A fictional 15–20 second victim call, waveform and transcript with highlighted name, bank/account placeholder and personal circumstances | Nothing from the audio or transcript |
| Recipient packet | Reviewed structured categories such as claimed bank authority, urgency, request for a transfer to a “safe account”; release status and permitted use | Only the versioned, allowlisted output of the selected protection policy |
| Other banks — shared picture | A protected aggregate campaign signal across fictional organisations; Bank B uses it as context when reviewing a new local case | Shared aggregates, uncertainty and provenance; Bank B's own case stays local |

Make the difference visible by toggling **Inside Bank A / What Bank B receives**. The recipient view must render an actual generated output, not merely hide private text with CSS. The private name and waveform must disappear because those fields are absent from the packet. A compact boundary counter can say “Audio shared: none; transcripts shared: none” only when tests verify the payload.

## Short fictional call and 35–45 second demonstration

Example scripted premise, not a real incident: “My name is Mira Example. Someone said they were from my bank and that my savings were at risk. They knew my address, 14 Example Street. They told me to move the money to a safe account right now and not call the bank.” Display an obviously invalid account placeholder, not a plausible person's account. Use a clearly labelled synthetic voice; do not clone a real victim.

1. **0–8 seconds:** hear the fictional call and see the sensitive details inside Bank A. Caption: “Useful evidence. Private people.”
2. **8–16 seconds:** local processing marks what stays private and extracts fixed scam indicators. One primary action: **Preview shared result**.
3. **16–25 seconds:** switch to the actual recipient packet. No voice, transcript, name, account or verbatim quote. Show the narrow signals and protected aggregate, with a short method label.
4. **25–35 seconds:** the cross-bank picture shows the same campaign category recurring in the predefined fictional dataset. Include benign reports and insufficient-evidence cases in the underlying demo; do not manufacture a universal positive detector.
5. **35–45 seconds:** Bank B receives a similar local call, flags it for staff review and can warn its own customer. Caption: “Share the warning, keep the victim private.” Do not claim a payment was blocked or money saved unless that action actually exists in the demo and is explicitly simulated.

For a versatility coda to the transport video, use only a 10–15 second cut showing the same private → reviewed output → useful recipient result structure. A full second demo is worth including only once the main route view and this second path both work. A simulated concept is labelled a concept, not counted as a working integration.

## What transfers from RouteSafe

| Existing part | Reuse | New work / limitation |
|---|---|---|
| Input snapshot and fingerprints | Bind processing, review and output to exact input bytes | New audio/transcript inventory and retention rules |
| Tabular scanner and handling presentation | Show detected sensitive fields, uncertainty and exclusions | Current scanner does not understand raw audio or general transcript semantics; identifiers in context and voice identity need separate handling |
| Purpose and recipient gate | Name the recipient, approved questions and excluded uses | Cross-bank campaign analysis is a new purpose with a separate policy |
| Bounded statistics and OpenDP integration | Reuse mechanism plumbing and testing approach | Define new fixed categories, privacy unit, contribution caps, time windows and budget; transport ε/caps are not transferable approval |
| Ledger and immutable artifact | Preserve once-only release/reuse and cumulative accounting pattern | Coordinate multi-bank and repeated-window budgets; the current local SQLite ledger is not a consortium service |
| Strict output contract and verifier | Allowlist output, verify exact artifact, refuse extras | Define a scam-signal schema; no audio, transcript, quotes, identifiers or embeddings in the initial shared output |
| Utility evaluation | Separate privacy protection from usefulness | Test extraction, false alarms, missed campaigns, rare cases and cross-bank generalisation |
| Recipient UI | Consume only a validated output | Build campaign cards and local review interaction; the map itself is not reusable fraud detection |

## Smallest honest working extension

Use three independent **simulated bank folders/processes**, fully fictional calls and a predefined scam-category vocabulary. First version can use a prepared transcript paired with the audio; label it “prepared transcript” and do not imply live speech recognition. If transcription is added, it runs inside the private boundary or the product must explicitly state the external processor and trust assumptions.

Each bank locally extracts a fixed feature vector, reviews uncertain cases and applies a new bounded-count privacy policy before sharing. The simplest reuse is separately protected aggregate vectors, combined for a campaign overview. This avoids claiming secure aggregation that is not built; it can add substantial noise and must be tested. Do not show a single victim's feature vector as automatically anonymous or publish a singleton alert under an aggregate label. Small cohorts may need an “insufficient evidence” result under a specified, privacy-reviewed release rule.

Define adjacency at a victim/customer level over a declared period, with an explicit rule for repeated calls. A person appearing at more than one bank affects composition; do not call per-case or per-bank accounting person-level without justification. Reserve all release spending across the demonstrated windows. Replays reuse identical releases; demo controls do not silently resample noise.

The shared campaign signal assists **local** decisions. It does not identify a victim at another bank, issue payment blocks, prove a call is fraudulent or certify compliance. Exact attacker-account matching and novel free-text campaign discovery are separate future designs. Federated learning is another possible extension; keeping training data local alone does not protect model updates. Secure aggregation and differential privacy address different disclosure risks and require their own implementation and evaluation ([NIST on model updates](https://www.nist.gov/blogs/cybersecurity-insights/protecting-model-updates-privacy-preserving-federated-learning), [NIST on trained models](https://www.nist.gov/blogs/cybersecurity-insights/protecting-trained-models-privacy-preserving-federated-learning)).

## Current private-to-shared workflow: specific improvements

This audit is based on `web/src/operator/WorkflowApp.tsx` and `pipeline/workflow.py`, not a new user study. Existing strengths: real backend actions, immutable snapshots, stale-review invalidation, excluded raw/truth data, output verification, measured failures, a bound acceptance receipt and deterministic packaging. These should be retained.

| Priority | Current issue | Improvement | Acceptance check |
|---|---|---|---|
| P0 — both applications | Seven screens communicate internal process more than the boundary crossing | Present a persistent five-stage visual: **Private input → Purpose → Protect → Check → Share**; keep detailed backend gates inside it | A novice can identify what is private and what the recipient gets without reading disclosures |
| P0 — both | Field names/handling and file lists are abstract; no side-by-side private/recipient preview | Show one labelled synthetic source example beside the actual generated recipient packet | Recipient pane is constructed only from verified allowlisted output; searching it cannot find planted private markers |
| P0 — both | A green verification check can be mistaken for privacy or utility approval | Separate **Files match**, **Policy status**, **Usefulness**, **Sharing scope** with independent states | A valid artifact with failed utility never displays a combined “safe/ready” success; UI wording “Files match the release” is already corrected |
| P0 — judging | The purpose screen is transport-specific and the visible result is several steps away | Put the recipient's concrete question first, with a small expected-output preview; unsupported questions are visibly refused | No interface promises specific-bus recommendations or scam stopping before the supporting methods exist |
| P0 — both | Share means a local ZIP/static copy, not authenticated delivery | Call it **Prepare recipient package** locally; show exact output, recipient, use scope and release identity before sharing | Do not claim multi-bank transfer; an actual hosted pilot requires separate identity, authorisation and delivery |
| P0 — ScamChorus | There is no call/transcript adapter, local extraction or suitable privacy unit | Build the small extension above with fixed categories and explicit trust boundaries | Audio/transcript stay private; unknown extraction stays unknown; victims with repeated calls are bounded as specified |
| P0 — ScamChorus | A rare case can reveal identity even after names disappear | Release reviewed, protected cohort-level signals; show insufficient support explicitly | Include a planted unique victim case and verify that the output does not expose its narrative or trigger a deterministic singleton release |
| P0 — both | Replays, input changes and repeated publishing can obscure what was actually processed | Show “Reused verified release” versus “New release”; invalidate downstream review on input changes | Replay has identical hash and no ledger spend; changed input cannot reuse an old approval |
| P1 — judging | Too many technical nouns and repeated acknowledgements slow the story | One goal, visible output and primary action per stage; disclosure panels for budget/schema details | Core demonstration works without opening technical panels; limitations remain plainly visible |
| P1 — judging | It is hard to see usefulness survive the privacy step | Show one predeclared task before/after, plus failure examples | Route priority/false-alarm metrics come from held-out evidence; neither attractive paths nor a successful story substitutes for evaluation |
| P1 — both | Claim “records stay here” is broader than a hosted product's untested infrastructure | Show a factual boundary diagram and actual request/payload audit for the local demo | Public build/recipient process has no source-file access; tests deliberately plant identifiers and reject accidental extra fields |
| P1 — ScamChorus | “Across banks” could be a cosmetic view over one shared directory | Use separate simulated bank stores and a separate recipient-only service with no mount/access to private stores | Starting the recipient with only released packets still works; removing private inputs does not break its view |
| P1 — readiness | No unfamiliar-user comprehension test or full mobile/accessibility pass | Run a five-second purpose test and a short task test on the exact video/UI | Participants can explain the problem, the private/shared distinction and the useful result; record failures and fix them |

## Done gates for a claim of versatility

1. The two applications use identifiable common snapshot, policy, publication, validation and accounting interfaces; separate hard-coded videos do not prove reuse.
2. A fictional source call produces an actual reviewed shared artifact. Recipient code cannot access the call, transcript or hidden private DOM.
3. The fraud-specific privacy unit and output contract are reviewed. No one reuses mobility caps or treats redaction as a universal guarantee.
4. On held-out synthetic cases and campaign families, report false positives, misses, extraction errors and aggregate utility, including uncommon/benign cases and split victims across banks. Record all declared seeds.
5. Show how new evidence helps a local review, with no invented “money saved”, detection accuracy or automatic blocking claim.
6. Label synthetic voice, fictional bank stores, prepared transcripts, simulated delivery and modelled results where applicable. These labels can be concise without being hidden.

Suggested positioning: **“One protected-sharing workflow, two decisions: where buses are needed, and which scam patterns banks should investigate.”** Today only the transport path runs; ScamChorus is the next adapter and decision view, not a finished second product.
