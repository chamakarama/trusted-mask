# Claude: build the Mask round-trip demo

## Goal

Turn the existing local message preview into a convincing, single-turn demo:

**Original message → local protection → user review → cloud AI → streamed reply → names restored locally.**

Prioritise a useful answer and clear context-dependent protection for roughly 100-word English messages. Keep the optional intended-use field. Extend `mask/web/`, using a minimal white palette and existing fonts; preserve the table demo in `mask/src/`. Model training and data generation can continue independently.

## Starting point

- `mask/web/server.py`: loopback HTTP server and `/api/preview`; currently no provider calls.
- `mask/web/static/`: message/intended-use inputs and protected preview; edits already invalidate obsolete results.
- `mask/ml/privacy_v1/engine.py`, `policy.py`, `contracts.py`: protection, stable PERSON aliases and receiving-AI instructions. Public results deliberately exclude original values and alias maps.
- The privacy models remain experimental and require review. Do not present this integration as a privacy guarantee.

## Implement in this order

1. **Private preview session.** From the same protection pass, retain the exact protected payload and a reverse map for generated PERSON aliases in bounded, expiring local-server memory. Include names found in both message and intended use. Return an opaque preview ID; keep the reverse map out of normal result serialization, exports and logs. Changing either input or starting over invalidates the old preview and approval.

2. **One streaming provider adapter.** Configure the provider, model and API key server-side; keep credentials out of browser code and Git. Read that provider's current official API documentation when implementing. Add a “Send protected message” action after explicit review. The local backend sends only the stored, approved protected payload and existing placeholder-use instruction. Never fall back to raw input/task, or send the reverse map. Reject expired/stale previews. Support cancellation, timeout and sanitised errors; avoid duplicate sends. If credentials are absent, show “API not configured” and test with an explicitly labelled mock.

3. **Local name restoration.** Restore exact, known `[PERSON_n]` tokens in the returned reply using that request's map. Do this deterministically, without another model. Preserve repeated references, buffer tokens split across stream chunks and leave unknown tokens unchanged. Use a single substitution pass. Do not restore generic `[SECRET]`/`[EMAIL]` placeholders, deleted sections or generalised facts. Restored text is display-only and must not become outbound cloud history.

4. **Polished, honest interaction.** Show actual states: protecting → ready for review → sending → receiving → complete/error. Animate detected names becoming placeholder chips, then stream the response and gently reveal restored names. Add “What the AI saw” and “Raw AI reply” views so judges can inspect the protected request and un-restored response. Avoid artificial progress, forced delays and a “100% safe” badge. Include stop/retry, keyboard access and reduced-motion support; render provider text safely as text.

## Done means

- Using fixtures with private names in both message and task, automated tests prove mapped original names and the reverse map are absent from provider requests; the approved protected task is included. Unchanged benign task wording may naturally remain.
- Tests cover stale approval, edits during streaming, cancellation, duplicate sends, timeout, provider failure, request isolation and expiry.
- Restoration tests cover repeated names, every token split boundary, unknown tokens, literal placeholder collisions and HTML-like names/replies.
- Run the existing Python HTTP and frontend tests, plus affected privacy-pipeline tests. Verify the real configured provider with synthetic data; report clearly if only mocked integration was tested.
- Demonstrate one consumer case and one corporate case, including changing the intended use on identical text. Preserve useful facts while protecting the main privacy concerns.
- Update `mask/web/README.md` with setup, environment-variable names and demo commands. Deliver a short result summary and any remaining limitations.

Work in an isolated checkout and inspect its existing changes first. Do not overwrite annotation shards, alter trained weights or switch another agent's shared checkout. Start with the working API round trip, then polish the animation.
