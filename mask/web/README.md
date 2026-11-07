# Mask local preview

Two main boxes on a black page, with a compact **Intended use (optional)** field above them. Type or paste a message on the left; the protected payload appears on the right after a short pause. Use the optional field to say what you want the AI to do. The draft/review status is visible below the output. Select text normally to copy it.

Run from the repository root:

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.web.server
```

Open http://127.0.0.1:8787. The model loads once. Use `--model <bundle>` to choose another local model and restart after model changes.

With a blank purpose, the browser posts `{ "text": "…" }` to `/api/preview`. The full message is used as local task context and the response is marked `needs_review` with `message_used_as_intended_use`. There is no automatic goal-extraction model. This combined-input mode still needs evaluation; provide a complete request in the message, or use the separate field to make the purpose explicit. The interface caps each field at 4,000 characters; the encoder can reject shorter combined inputs when its token window is exceeded.

With a nonempty intended use, the browser posts `{ "text": "…", "task": "…" }`. In that mode the response payload includes the protected task and protected message. The engine's fixed `receiving_ai_instruction`, when present, is prepended in either mode so the receiving AI knows it may use labels verbatim. No raw input is used as fallback. Edits to either input invalidate the prior result immediately; obsolete responses are ignored. Errors appear as placeholder text inside the empty output box, not as copyable results. API metadata includes `context_mode`, `runtime_versions`, review reasons and coverage.

Inference stays local. No provider calls, raw request logging, persistence or telemetry. The model's review status appears visibly below the output and remains in the API; there is no automatic sharing. Server/Origin checks, request bounds and single-model concurrency handling remain in place. All interface code is isolated under `mask/web/`.

Checks:

```sh
mask/ml/privacy_v1/.venv/bin/python -m pytest mask/web/tests -q
node --test mask/web/tests/test_frontend.mjs
```

The frontend tests use the existing app's jsdom dependency. Later Claude integration and reversible token mapping are not implemented. Generic placeholders and dropped/generalised facts cannot be reliably restored; a future provider flow needs unique local entity mappings.
