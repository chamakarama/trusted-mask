# Mask local round trip

A white two-column page. Left: an optional **Intended use** field and **Your message**. Right: what the AI will see
(protected locally, with each change shown as a chip), a **Send protected message** button, and the reply.

Flow: **Protect -> Review -> Send -> Reply -> Names restored.**

1. You type. After a short pause the local model protects the message and the intended use. Nothing leaves the computer.
2. You review the protected text. Names become labels such as `[PERSON_1]`; e-mails, IDs and similar become generic
   placeholders such as `[EMAIL]`; some details are removed or made less exact.
3. Only when you press **Send protected message** (or Ctrl+Enter) does the server send that exact reviewed payload to the
   cloud AI. The browser sends only an opaque preview ID, never text.
4. The reply streams back. On this computer the server swaps the `[PERSON_n]` labels it created back to the real names
   for display. Tabs show **Reply** (names restored), **What the AI saw** (the exact instruction and message sent) and
   **Raw AI reply** (what the AI actually wrote, labels included).

## Run

From the repository root, with a key in your environment (never commit it):

```sh
export ANTHROPIC_API_KEY=...        # or: export MASK_ANTHROPIC_KEY_FILE=~/.routesafe/assistant.env
mask/ml/privacy_v1/.venv/bin/python -m mask.web.server
```

Windows (Git Bash) uses `mask/ml/privacy_v1/.venv/Scripts/python.exe`. Open http://127.0.0.1:8787 (use `--port 8788` if
8787 is taken, e.g. by the RouteSafe assistant). The startup line says which cloud AI is in use. The model takes about
two minutes to load on a laptop CPU.

Without a key the page works up to review and shows **API not configured**. For a rehearsal with no AI at all:

```sh
MASK_PROVIDER=mock mask/ml/privacy_v1/.venv/bin/python -m mask.web.server
```

The mock is labelled on the page ("Mock provider - no AI is called") and its reply starts with `[MOCK REPLY, no AI was called]`.

### Environment variables (server side only)

| Name | Meaning | Default |
|---|---|---|
| `MASK_PROVIDER` | `anthropic` or `mock` | `anthropic` when a key is found, otherwise not configured |
| `ANTHROPIC_API_KEY` | Claude API key | - |
| `MASK_ANTHROPIC_KEY_FILE` | path to a local `KEY=VALUE` file with `ANTHROPIC_API_KEY=` | - |
| `MASK_MODEL` | Claude model ID | `claude-opus-5-5` |
| `MASK_EFFORT` | `low`, `medium` or `high` | `low` (short, quick replies) |
| `MASK_TIMEOUT_SECONDS` | longest a reply may take | `90` |

## What is protected, and how

- **Preview session.** One protection pass produces both the payload and a reverse map from generated `[PERSON_n]`
  aliases (from the message and the intended use) to the original names. The server keeps both in memory under an
  opaque preview ID, for at most 15 minutes, at most 16 previews in total. Each open page has its own random page ID
  (`X-Mask-Client`), so a preview or reset in one tab never cancels another tab's approval or reply. The map is never
  put in an API response, export or log, and never sent to the provider.
- **Approval.** Any edit, a new preview, starting over (`/api/reset`) or expiry invalidates the old preview and its
  approval; a reply still streaming for it is stopped. A preview can be sent once; Retry is allowed after an error or
  Stop. Duplicate sends are rejected.
- **Provider request.** System prompt: the engine's fixed receiving-AI instruction plus "Reply in plain text without
  Markdown formatting." (the page shows replies as plain text). User turn: `Task: <protected
  intended use>` (when given) plus the protected message. Nothing else: no raw input, no map, no history.
- **Restoration.** One left-to-right pass restores only exact `[PERSON_n]` labels this preview generated. Labels split
  across stream chunks are buffered. Unknown labels, generic placeholders (`[EMAIL]`, `[PERSON]`...), removed text and
  generalised facts stay as the AI wrote them. Restored names are display-only and are never sent anywhere.
- **Rendering.** All provider and model text is inserted as text, never HTML. Errors are sanitised: no provider
  message bodies, input or keys.
- **Local server only.** Bound to 127.0.0.1, Host/Origin checks, a custom request header per action, request size
  limits, no request logging, `no-store`, a strict CSP.

## API

| Endpoint | Header `X-Mask-Request` | Body | Result |
|---|---|---|---|
| `POST /api/preview` | `preview` | `{text}` or `{text, task}` | protected payload, `preview_id`, `provider_request`, chip segments |
| `POST /api/reset` | `preview` | `{}` | invalidates the current preview |
| `POST /api/send` | `send` | `{preview_id}` | Server-Sent Events: `start`, `delta` (`raw`, `segments`), `done`, `cancelled`, `error` |
| `POST /api/cancel` | `send` | `{preview_id}` | stops the reply |
| `GET /api/health` | - | - | model, `provider_connected`, provider name/model/mock |

## Demo script

Consumer (health, intended use given):

- Intended use: `Explain these results in plain words for Maria Virtanen`
- Message: `Maria Virtanen, 47, got her blood test back: LDL 4.6, HbA1c 41. Her GP Dr. Jonas Lind wants a follow-up.
  Her phone is 040 123 4567.`

Corporate (same text, then a changed intended use):

- Message: `Q3 notes: Liisa Korhonen (CFO) says the Northbay Foods deal slips to January; Jonas Lind will tell the board.
  Contact liisa.korhonen@example.invalid.`
- Intended use 1: `Summarise the risks for the board`
- Intended use 2: `Draft a short e-mail from Jonas Lind to Liisa Korhonen`

Changing only the intended use creates a new protection pass and a new preview. The old approval cannot be sent.

## Checks

```sh
mask/ml/privacy_v1/.venv/bin/python -m pytest mask/web/tests -q
node --test mask/web/tests/test_frontend.mjs
```

The frontend tests use the existing app's jsdom (`cd mask && npm ci`). The table demo in `mask/src/` is unchanged.
