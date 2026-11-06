# RouteSafe two-agent coordination and launch guide

Read [the build plan](../ROUTESAFE_BUILD_PLAN.md) and [the interface contract](INTERFACES.md) before starting. This document is a proposed operating protocol; writing it does not launch agents, create issue threads, start monitoring or publish a product.

## 1. Shared state and actual communication

The shared repository is **[Chintufp/Since-AI-hackathon---WAWS](https://github.com/Chintufp/Since-AI-hackathon---WAWS)**. Its default branch is `main`. The teammate's existing README is background ideation; the RouteSafe build plan is the specific build brief. Preserve unrelated work and reconcile actual repository changes before starting.

`COMBINED_IDEA.md` is the teammate's proposal. The build plan's “Accepted scanner integration” section records the adopted scope: reuse `petpilot/`, make field reasoning and purpose-specific handling visible, retain MOB-S1 aggregate publication, defer MOB-S2 row export and keep the mystery-file scene optional. Follow those decisions rather than implementing every feature in the original proposal.

Both machines clone this remote independently. **Files, conversations, terminals, runtime state and local databases are not shared.** A commit not pushed to the remote does not exist for the other builder. A chat message in one vendor's interface does not reach the other model automatically.

Use Git for implementation and GitHub issue comments for coordination. At kickoff create three issues, then record their actual numbers/URLs in the project-state section below:

1. **RouteSafe coordination:** shared decisions, contract requests, blockers, handoffs and integration ownership. Both agents may comment; do not rewrite the other person's message.
2. **RouteSafe Astra status:** Astra alone updates its status; Opus reads it and asks questions in coordination.
3. **RouteSafe Opus status:** Opus alone updates its status; Astra reads it and asks questions in coordination.

Agents post through `gh issue comment <number> --repo Chintufp/Since-AI-hackathon---WAWS --body-file <local-message-file>` or an available authenticated GitHub tool. Use real newlines and body files, not shell-interpolated prose. Readers use `gh issue view <number> --comments` or the equivalent connector. These commands are examples for the authorised build; no coordination messages have been sent by this planning document.

Public issue messages contain no raw records, secrets, tokens or real sensitive data. This repository contains synthetic source materials at the team's request; production privacy boundaries still apply to the delivered application. Do not assume GitHub issue comments are a confidential operator workbench.

### If GitHub issue messaging is unavailable

Keep Git as the transport: each agent writes only its own mailbox file on its own branch, `ops/astra` → `coordination/astra.md` and `ops/opus` → `coordination/opus.md`. Fetch these refs and read them with `git show origin/ops/astra:coordination/astra.md` and the counterpart. Messages carry monotonically increasing IDs and references to acknowledgements. Do not merge mailbox-only commits into `main` on every poll. Choose either issue threads or mailbox branches as the active channel and record the choice; do not split decisions across both silently.

If neither remote channel is available, exchange a small Git bundle/patch and status text through the human lead. The receiving builder verifies commit hashes and applies the patch on a branch. Separate environments can continue against the last agreed contract in the meantime. Cloud filesystem paths, localhost URLs and local app thread tools are not cross-machine transports.

## 2. Roles and directory ownership

| Owner | Primary responsibility | Required cross-review |
|---|---|---|
| GPT-6 Astra | Data validation; scanner handoff validation and independent evaluation; inference; approved transformation policy; OpenDP integration; release ledger; privacy claims; initial integrator | Run and critique scanner evidence, operator explanations, UI, accessibility, filter semantics, narrative and downloads |
| Opus 5.5 maximum effort, with Vaishnav's scanner handoff | Existing `petpilot/` scanner and inventory; operator policy presentation; product flows; visual system; map/charts; public app; grounded AI interaction; demo recording and submission copy | Independently inspect sensitivity assumptions, caps, repeated-release handling, aggregate adapter parity and claims |
| Human lead | Event accounts and rules clarification; real user/product judgement; participant information; final external approvals/submission unless explicitly delegated | Watch rehearsal and confirm the concrete final entry |

Recommended code ownership: Astra `pipeline/`, `privacy/`, `evaluation/`, `tests/privacy/`; Vaishnav/Opus `petpilot/`, `web/`, `demo/`, `tests/ui/`. Astra owns approved policy/measurement semantics and the scanner adapter; Opus owns scanner internals and their honest presentation. Do not implement duplicate scanners in two folders. Ownership is a starting allocation, not a ban on helping. Take over a file only after a message identifying the scope; do not overwrite simultaneous work.

At kickoff, inspect the scanner already pushed in commit `4cd1374`. Vaishnav/Opus supplies any missing dependency details, development results and fixtures on a feature branch. Astra runs E1S, checks label/truth isolation and returns a reproducibility review. Use the private inventory contract in INTERFACES.md. If the code is not available within 30 minutes, Astra continues with a declared known-schema inventory; Opus continues the fixture-driven planner instead of blocking both tracks. Timebox integration to 90 minutes and do not let generic detection expansion consume the map/demo allocation.

## 3. Git workflow

* `main` is the authoritative integrated project. Only the current integrator merges to it during the build. A working feature branch is not “done” until it is pushed, reviewed, tested with the current contract and integrated.
* Use short branches such as `astra/e1-publisher`, `opus/planner-shell` and `astra/e3-evaluation`. Start from current `origin/main`, keep changes coherent, and commit at working milestones or at least every 45 minutes.
* Push at least every 45 minutes and before handoffs or long experiments. Commit incomplete safe work to the feature branch when necessary, clearly labelled; do not push secrets or broken claims to `main`.
* Use draft PRs early for visibility. Each PR states outcome, definition/contract changes, command/evidence, known limits, and remaining work. Keep scope reviewable; avoid an overnight giant merge.
* Before integration, fetch, review changed files, run the relevant checks and resolve conflicts on the feature branch. No force-push of `main`, no unrequested deletion/reset, no replacing the teammate's work.
* Rebase/squash strategy is the integrator's routine choice; do not rewrite another agent's active branch without agreement. Preserve traceable experiment commits and tag release candidates.
* If the remote advances, inspect and integrate the change normally. Never use force to make an upload “succeed.”

The official source package remains unmodified. Product code imports or copies only explicitly licensed helpers with attribution. Raw challenge files may be large and tracked with Git LFS; both builders must install LFS and run `git lfs pull`. A successful clone containing only pointer files is not dataset readiness. Verify package member hashes against `MANIFEST.json` after materialisation. Avoid modifying line endings of supplied files.

## 4. Cadence, acknowledgement and handoffs

Poll the selected coordination channel **every five minutes while active**, at the start/end of each task, before altering contracts, and before merging. This is a behaviour for the running agents; it is not a background service created by this document. A long process should emit progress and permit a coordination check at least every ten minutes.

Post a status every **30 minutes** and immediately when blocked, changing a contract, failing a gate, preparing a handoff or going offline. Include UTC timestamps so machines do not disagree about time zones. Use the EET deadlines in the build plan for human-facing checkpoints.

| Message | Receiver action | Timeout / sender action |
|---|---|---|
| `FYI` | Read by next poll; acknowledgement optional | Keep working |
| `REQUEST` | Acknowledge within 10 minutes while active; answer or give ETA | At 15 minutes, continue independent work against current contract; do not silently make the requested breaking change |
| `BLOCKER` | Triage immediately at next poll | At 15 minutes use the documented fallback; escalate only if essential progress remains impossible |
| `HANDOFF` | Verify pushed SHA, artifact/schema version and instructions; acknowledge acceptance | After 15 minutes sender preserves branch/artifact and continues an independent task; no assumption that silence means review passed |
| `REVIEW` | Review the concrete PR/artifact, report blocking vs nonblocking findings | If needed reviewer swaps task priority; no self-approval of a changed privacy claim because review is slow |

Use message IDs such as `A-012` and `O-009`. Reply with the referenced ID and explicit `ACK`, `ACCEPT`, `REJECT` or `NEEDS_EVIDENCE`. Do not bury a changed API in a general status paragraph.

### Handoff contents

A useful handoff contains the pushed commit/PR URL, exact input and contract versions, executable commands, expected outputs with artifact hash, results versus acceptance criteria, open failures, next action and who owns it. Attach a small protected fixture or link to a committed one. Never send “finished backend, connect frontend” without a consumable artifact.

## 5. Integration and disagreement

Astra is initial integrator. Routine UX choices belong to Opus; numerical/privacy correctness choices belong to Astra, subject to cross-review. Neither can override the shared boundary, required evidence or submission deadline unilaterally. Resolve a substantive disagreement by stating the two alternatives, running the smallest discriminating experiment, and recording the consequence. Timebox to 30 minutes. Prefer the simpler valid method if evidence is tied. Escalate to the human if the dispute changes the use case, privacy claim, official compliance or delivery viability.

Never merge a known privacy-boundary failure to preserve a visual feature. Conversely, do not spend hours on a mathematically sophisticated improvement while the agreed end-to-end path remains broken.

### If an agent becomes unavailable

Thirty minutes without a status/ack is a warning. Check the coordination thread, remote branch timestamps and any stated long-running task before assuming failure. After 45 minutes without contact, the survivor declares a reduced-scope plan and continues tasks that do not require unavailable private work. Use pushed commits and the last agreed contract; do not invent the missing results.

If Astra is unavailable, Opus can become integrator through either explicit human/Astra handoff or the pre-agreed lease protocol below. If communication infrastructure is down, do not assume ownership has transferred: work on branches until contact or an explicit human handoff is possible.

**Optional automated lease, only if both can implement it correctly in E0:** use a dedicated `ops/integrator` branch containing owner and expiry UTC. Renew a 15-minute lease every five minutes. Acquisition/renewal must be a new commit with the last observed lease commit as parent and a normal fast-forward push; concurrent stale writers are rejected. No force-pushing this ref. A backup may claim only after expiry plus five minutes, announcing the claim and successfully pushing the new lease commit. Before each `main` integration, fetch and confirm lease ownership and sufficient remaining time. A resumed former owner must re-check before writing. If this setup costs more than 15 minutes, use explicit human handoff instead. A comment timestamp alone is not an atomic lock.

Stop or narrow features when one agent is lost: preserve a reviewed static release, the core map/table, evidence and recording. Do not make new formal privacy claims without a second review; retain the last reviewed policy. The human can provide that review or defer the affected claim.

## 6. Small set of authoritative documents

| Document | Owner and update rule |
|---|---|
| `ROUTESAFE_BUILD_PLAN.md` | Integrator; changes only when requirements, scope, gates or accepted decisions change. Do not rewrite after every status. |
| `planning/INTERFACES.md` and eventual machine schema | Astra proposes measurement changes, Opus approves consumer consequences; version each incompatible change. Schema is execution authority, document explains semantics. |
| `planning/COORDINATION.md` | Integrator; update actual setup details, owners and transport once agreed. |
| `planning/DECISIONS.md` created at build kickoff | Integrator appends accepted significant decisions from issue discussion. Other agent proposes entries in PR/comments instead of editing it concurrently. |
| Agent status issue/mailbox | Exactly one writer per agent; current task, evidence, blocker and next step. Not a second specification. |
| `SUBMISSION.md` created before Saturday noon | Opus owns narrative/checklist/links; Astra reviews technical claims via PR. Human fills participant/account facts. |

Tests, schemas, release manifests and machine-readable experiment results are normal implementation artifacts, not more hand-maintained status documents. Avoid a separate roadmap, backlog, sprint log, daily log and duplicate spec.

## 7. Initial templates

### Project state — fill in at kickoff

```text
Remote: https://github.com/Chintufp/Since-AI-hackathon---WAWS
Authoritative integrated branch: main
Source package: TRUSTED_PETS_PROVING_GROUND_2026; verify MANIFEST.json
Contract version: proposed 1.0; ratified SHA = <fill>
Coordination issue: <actual URL>
Astra status issue: <actual URL>
Opus status issue: <actual URL>
Active transport: <GitHub issues OR ops mailboxes>
Integrator: Astra; handover method = <explicit human OR tested lease>
Astra environment/runtime: <fill without credentials>
Opus environment/runtime: <fill without credentials>
Raw input path per machine: <local configuration, not a shared path>
Publisher of record / ledger location: <one private environment>
Human submission owner: <fill>
Published deadline: 2026-11-08 10:00 EET / 08:00 UTC
Latest operational deadline check: <source and time>
Target submission: 2026-11-08 08:00 EET / 06:00 UTC
Deployment/video destinations and approvals: <fill>
```

### Agent status — one writer each

```text
Agent: <Astra | Opus>
Updated UTC: <timestamp>
State: working | blocked | needs review | offline
Task/gate: <T/E ID and concrete outcome>
Current branch and pushed SHA: <branch, SHA>
Contract/release version: <version>
Completed since last update: <one or two facts>
Evidence: <command/result path or PR>
Current risk/blocker: <specific dependency, or none>
Next milestone and ETA UTC: <outcome, time>
Requested response: <message ID, action, needed by>
Offline/recovery note: <where last safe work is pushed>
```

### Coordination request

```text
ID: A-001
Type: REQUEST | BLOCKER | HANDOFF | REVIEW | FYI
To: Opus
Need by UTC: <timestamp>
Decision/action needed: <one sentence>
Current contract/commit: <version/SHA>
Evidence: <specific result>
Proposed change: <scope>
Consequence: <privacy, utility, UI, timing>
Safe work while waiting: <independent next action>
Response: reference A-001 with ACK and answer/ETA
```

### Decision entry

```text
Decision D-001 — <plain title>
Time UTC / approvers:
Question and previous assumption:
Options considered:
Evidence / experiment / commit:
Chosen outcome and reason:
Privacy and utility consequences:
Interface/demo/schedule consequences:
Rejected alternatives and why:
Revisit only if:
```

### Review and submission templates

```text
Review target: <PR, SHA, artifact hash>
Reviewer / time:
Ran or inspected:
Acceptance criteria checked:
Blocking findings:
Nonblocking improvements:
Disposition: accepted | revise | narrowed claim accepted
```

```text
# RouteSafe submission
Project / challenge / team:
One-sentence problem and recipient:
Working product and actual decision:
Architecture and privacy unit:
Measured result with exact evidence link:
Inference and multiple-card limitations:
R1 / R2 / R3 / R4 / R5 evidence links:
Live app / offline instructions / repository release tag:
Public video URL / duration / local backup:
Reproduction command / input package / runtime:
Pre-existing materials and licenses:
Work completed during event:
AI and model use, including coding assistance:
Additional synthetic data generation and role:
Product next steps:
Since AI status and submission receipt:
Devpost status and submission receipt:
Last logged-out access check and reviewer:
```

## 8. Launch prompts

These prompts start the implementation phase **only when the user launches them**. Configure the requested models/effort in their respective environments; do not silently substitute a model. Give both agents repository access and an active runtime. Unlimited tokens do not create uninterrupted execution, shared state or network access.

### GPT-6 Astra

> Build RouteSafe according to ROUTESAFE_BUILD_PLAN.md, planning/INTERFACES.md and planning/COORDINATION.md in Chintufp/Since-AI-hackathon---WAWS. You own privacy architecture, private data processing, inference, release accounting, experiments and evaluation, and are the initial integrator. Opus owns UX and presentation; this is a practical division and both of you must review critical work. First inspect current main and other active branches, verify source package materialisation, establish the agreed cross-machine channel, and ratify the small contract fixture together. Deliver E1's real vertical slice before expanding scope. Use evidence to revise hypotheses; record changes and preserve privacy/measurement semantics. Keep truth and labels evaluation-only, and never equate passing attacks with anonymity. Work autonomously on routine reversible choices within the plan, respect its timeboxes and absolute deadline, post/poll as specified, and push coherent checkpoints. Your messages to your teammate travel through the agreed repository issue/mailbox protocol, not local chat. Review the actual frontend and demo claims. Do not publish a site, contact outsiders, spend unapproved money or submit the competition entry without applicable user authorisation. Finish with an integrated, reproducible release and honest evidence, not merely code on your machine.

> Integrate Vaishnav/Opus's existing `petpilot/` scanner through the agreed private inventory contract; do not rebuild it. You own approved transformation policy and independent E1S evaluation. Treat the reported scanner scores as label-informed development claims until reproduced, and the mystery file as already inspected. Verify that scanner misclassification cannot bypass the aggregate export allowlist. Implement MOB-S1 only; the combined proposal's pseudonymised consultancy row release is deferred. Use the known-schema fallback if scanner delivery would block the vertical slice.

### Opus 5.5 maximum effort

> Build RouteSafe according to ROUTESAFE_BUILD_PLAN.md, planning/INTERFACES.md and planning/COORDINATION.md in Chintufp/Since-AI-hackathon---WAWS. You own product UX, visualisation, the public explorer, grounded AI interaction, demo and submission integration. Astra owns privacy/data/evaluation and initially integrates; both of you must review critical work. First inspect current main and other active branches, establish the real cross-machine channel, and ratify a tiny protected-output fixture together. Build an excellent planner experience independently against that fixture while Astra proves the pipeline, then integrate actual measured artifacts early. Make the attack→protected release→useful decision story immediately understandable, with synthetic/inferred/precomputed labels and no invented numbers. Keep raw records out of the public build. Independently challenge contribution bounds, privacy claims, release accounting and evaluation semantics; request evidence rather than treating the backend as a black box. Work autonomously on routine reversible design choices, respect scope and timeboxes, post/poll through the agreed issue/mailbox channel, and push checkpoints. Prepare the ≤2-minute actual-product recording, offline fallback and concrete submission pack before the deadline buffers. Do not publish a site, contact outsiders, spend unapproved money or submit the competition entry without applicable user authorisation. Finish with a polished, tested, integrated experience and reviewable evidence.

> You also own the existing `petpilot/` scanner handoff with Vaishnav and its operator inventory/policy presentation. Push the existing code, exact command and development evidence promptly, then ratify the private inventory contract with Astra. Connect detected type/reason to purpose-specific handling without authorising raw-field export. After the 90-minute E1S timebox, prioritise the map and core demo. Do not implement the deferred MOB-S2 row-export switch. Keep mystery-file/hash demonstrations optional and accurately labelled as inspected synthetic development examples. Do not describe the rule-based scanner as AI or transmit category samples to cloud AI without the plan's explicit safety boundary.
