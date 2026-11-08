# Mask browser demo

Live demo: https://mask-local-demo.netlify.app

The privacy model runs inside a browser worker. Visitors do not install Python,
download an archive manually, or send original input to an inference service.
The current first visit downloads a 371 MB model, an 8.7 MB tokenizer, and the
browser runtimes. Verified model files are cached when browser storage permits.
Cache eviction or private browsing can require another download.

The existing Python demo under `mask/web/` is unchanged. This directory contains
the separate deployable browser application and an optional Claude relay.

The interface reuses the local demo's layout, typography, icons and controls.
Download progress disappears once the model is ready. Model details and session
controls live in the small toolbar menu; the exact outbound request remains
available under “What the AI sees” after filtering.

## Current release

| Selector | Checkpoint | Model download | Storage |
| --- | --- | ---: | --- |
| mask1 | Reviewed original DeBERTa Base | 369 MB | FP16 weights, FP32 computation |
| mask2 (default) | New DeBERTa Base, section-head epoch 2 | 371 MB | FP16 weights, FP32 computation |
| maskmini | Reviewed MiniLM encoder-b | 67 MB | FP16 weights, FP32 computation |

The small selector loads only the selected model. Switching terminates the old
worker and any active reply, clears its preview and local alias map, and keeps
the original input ready to filter again. Cached assets are reused after integrity
verification. All three choices use the same updated deterministic identifier rules.

`runtime-source.json` pins Python inference to committed source `0b3854d` (`6e4853e` in this repository, with identical Python files; see [commit IDs](../../evidence/COMMIT_IDS.md)).
Builds extract that source with `git show`; unrelated working-tree edits cannot
silently change the deployed policy. The new identifier validators distinguish
validated personal IDs, cards and IBANs from order numbers, UUIDs, hashes and code
references. IP and VAT detections remain for review, matching the source policy.

The new Base includes the dedicated section relevance head and its exact runtime
settings. It is experimental: its upstream evaluation found fact-loss regressions,
and remains experimental. Its FP16-storage version is the default.
Across 75 cases, FP16 storage preserves protected text, task, applied edits and
section-deletion decisions. One extra ACCOUNT_ID review annotation disappears;
the NATIONAL_ID review annotation on the same span remains. This narrowly reviewed
exception is recorded in `evidence/precision-review-mask2.json`, bound to the
exact model, source commit and difference-file hash. The full-precision release
`mask2-685d912bc114` remains available for rollback.

- Runtime: ONNX Runtime Web 1.24.3, **CPU WebAssembly**. No WebGPU requirement.
- Reduced storage for all three models reduces transfer size, not peak inference
  memory to half. No INT8 model is deployed.
- Tokenizer: the same Hugging Face Rust `tokenizers` 0.22.2 as Python, compiled
  to WASM. Single/pair token IDs, masks, overflow windows and code-point offsets
  are preserved. The current JS tokenizer lacks the required offset API.
- Policy: the reference Python rules run through Pyodide 0.29.3. A narrow AST
  transformation makes model calls awaitable; rules/thresholds/regexes are not
  independently reimplemented in JavaScript.
- Netlify site ID: `9c43dcbd-b335-401a-8e6d-e428bd58d5c2`.
- Public model bucket: `gs://mask-browser-models-439502948711`, exclusively model
  files, tokenizer, manifest and upstream license. It never stores messages or keys.
- Optional relay: `mask-demo-relay`, Google Cloud project `cleveland-464404-m0`,
  region `europe-north1`, Claude Sonnet 5.5.

The worker reports ready only after loading and running an actual forward pass.
Failures cannot expose a Send button for an incomplete preview. There is no
automatic cloud inference or model substitution.

## Privacy boundary

The source message, task context, alias map and restored names stay in browser
memory. Clear Session invalidates previews; reload discards session state.
Only model assets enter persistent browser storage. No analytics, form capture,
message database or third-party page scripts are included.

Filter makes no inference API request. Send is a separate explicit action and
uses a frozen preview of the protected system/user payload. Editing input
invalidates it. The complete outbound request is inspectable in the review panel.
The relay forwards that request to Anthropic, then streams the reply. Names are
restored only in the browser after the user requests it. Protected text may still
contain sensitive retained context: review remains necessary.

The relay cannot independently prove that arbitrary external callers have
filtered their input. It accepts a fixed schema and fixed system instruction,
checks the site origin, bounds input/output, rejects duplicate completed sends,
and limits concurrency and request rates. CORS is not authentication. Rate and
deduplication state are in memory and reset on instance restart; the service is
configured for at most one instance. Configure Anthropic account spend limits
if a hard monetary cap is required.

## API key

The local `.env.local` is ignored by Git and has mode `0600`. Never add a
`VITE_` prefix to the key. Do not put it in `public/`, a model manifest, a URL,
an application config, shell command arguments or a deployment variable value.

Production uses Secret Manager secret `mask-demo-anthropic-key`, mounted into
the relay as `ANTHROPIC_API_KEY`. The dedicated runtime service account is
`mask-demo-relay@cleveland-464404-m0.iam.gserviceaccount.com`. Its direct secret
binding grants access to this secret only. Project administrators retain their
normal administrative permissions. The browser receives no credential.

`scripts/upload_secret.py PROJECT SECRET [--new-version]` transfers the local
key over stdin and suppresses credential output. After rotation, deploy the new
secret version explicitly. Do not republish the static website to rotate a key.

## Local build

From the repository root, install the documented Python training environment
first. Then:

```sh
npm ci --prefix mask/browser
mask/ml/privacy_v1/.venv/bin/python -m pip install \
  --target mask/browser/.tools/python \
  -r mask/browser/scripts/export-requirements.txt
sh mask/browser/scripts/build_tokenizer.sh
# Export each already unpacked checkpoint with its explicit selector key:
mask/ml/privacy_v1/.venv/bin/python mask/browser/scripts/export_model.py --key mask1 --half-storage
mask/ml/privacy_v1/.venv/bin/python mask/browser/scripts/export_model.py --key mask2 --model mask/ml/privacy_v1/artifacts/section-training-20261108/deberta-v3-base --half-storage
mask/ml/privacy_v1/.venv/bin/python mask/browser/scripts/export_model.py --key maskmini --model mask/browser/.cache/reference/encoder-b --half-storage
# Repeat for each key with its matching original Python checkpoint:
mask/ml/privacy_v1/.venv/bin/python mask/browser/scripts/validate_model.py --key mask1 --reference mask/browser/.cache/reference/deberta-v3-base
node mask/browser/scripts/check-tokenizer.mjs mask1
npm --prefix mask/browser run build
npm --prefix mask/browser run preview
```

Use the **production preview** for browser testing. The runtime modules are
self-hosted static assets; the Vite development server tries to transform their
public imports and is not the supported local preview. The default preview URL
is `http://127.0.0.1:8790`. The export script verifies the bundled archive checksum
and extracts a separate reference under `.cache/`; it does not change the
existing Python model directory. Large generated files are ignored by Git.

The Rust target and wasm-bindgen CLI require a Rust toolchain and first-time
registry downloads. `Cargo.lock` pins tokenizer build dependencies. JS and Python
export dependencies are pinned as well. `prepare-assets.mjs` copies the existing
branding, fonts and synthetic example inputs and packages the current policy.
Runtime/model assets must exist before a build; no missing model is silently
replaced with a pilot or rules-only detector.

## Verification

```sh
node --test mask/browser/tests/*.test.mjs
node --test mask/browser/relay/server.test.mjs
mask/ml/privacy_v1/.venv/bin/python mask/browser/scripts/check_policy.py
```

Actual browser parity:

```sh
mkdir -p mask/browser/public/qa
for key in mask1 mask2 maskmini; do
  mkdir -p "mask/browser/public/qa/$key"
  cp "mask/browser/.cache/validation/$key/cases.json" "mask/browser/public/qa/$key/cases.json"
done
MASK_QA=1 npm --prefix mask/browser run build
npm --prefix mask/browser run preview
```

Open `/qa.html`, select each model, click **Run browser parity checks**, and wait for `PASSED`.
This executes the real browser worker on synthetic cases, not fixture outputs.
Production staging excludes the QA page, fixtures and all local model folders.

Recorded evidence in `evidence/`:

- FP32 ONNX/PyTorch comparison across sequence lengths 8, 37, 128, 332 and 512:
  maximum absolute logit error `3.8147e-6`.
- Python conversion comparison: mask1 and maskmini match all 75 results each.
  Mask2 matches all 75 protected outputs, edits and section decisions, with one
  reviewed metadata difference. The small model is not claimed to be identical
  to full precision on every internal annotation.
- Browser evidence is recorded separately in `browser-mask1.json`, `browser-mask2.json`
  and `browser-maskmini.json` after each actual worker run.
- Rust/WASM tokenization: 209/209 per model (627 exact comparisons).
- Reference engine, deterministic identifier, structural and section-head tests
  against the generated async policy: 73 pass. One Python web-server restoration
  test is excluded; the browser has separate alias restoration tests.

These are implementation-parity checks, not an independent model-quality
benchmark. Existing limitations, including unreliable removal of unrelated
medical sections, remain. macOS Chromium was exercised through the Codex browser;
Windows, Firefox and Safari are not yet independently verified. Older devices,
limited memory, restricted WASM or unavailable storage can affect startup.

## Deployment

The frontend and model use separate hosting. Publish only an allowlisted static
package; never upload the checkout. The private relay has its own small source
directory and `.dockerignore` and contains no model inference code.

```sh
npm --prefix mask/browser run build
MASK_MODEL_BASE_URL=https://storage.googleapis.com/mask-browser-models-439502948711/ \
MASK_RELAY_URL=https://mask-demo-relay-439502948711.europe-north1.run.app/send \
  node mask/browser/scripts/stage_deploy.mjs
cd mask/browser
netlify deploy --dir out/netlify --prod --no-build \
  --site 9c43dcbd-b335-401a-8e6d-e428bd58d5c2
```

The staging script checks for environment files and the literal local API key in
all deployment files. The `netlify.toml` headers enable isolation for WASM threads,
restrict origins, and keep changing pointers uncached. Pyodide's generated JS
requires evaluation within the isolated worker; only that worker response has
`unsafe-eval`. The page itself retains the stricter policy.

Cloud Run deployment (requires the existing private secret and service account):

```sh
gcloud run deploy mask-demo-relay --source=mask/browser/relay \
  --project=cleveland-464404-m0 --region=europe-north1 \
  --service-account=mask-demo-relay@cleveland-464404-m0.iam.gserviceaccount.com \
  --set-secrets=ANTHROPIC_API_KEY=mask-demo-anthropic-key:1 \
  --set-env-vars=MASK_MODEL=claude-haiku-5-5,MASK_ORIGIN=https://mask-local-demo.netlify.app \
  --timeout=90 --memory=256Mi --cpu=1 --concurrency=4 \
  --min-instances=0 --max-instances=1 --allow-unauthenticated
```

## Replacing the trained model

1. Export the new complete training bundle using `--model PATH`. Base and MiniLM use the three-head contract; new Base also exports its dedicated
   fourth section head.
   New labels, policies, tokenizer algorithms or sequence limits require an
   explicitly tested adapter. Loading the state dictionary is strict.
2. Treat the exported local `current.json` as a development candidate, not approval
   to publish. Run Python and browser parity for the new source checkpoint and
   evaluate privacy/fact-retention changes before selecting reduced precision.
3. Confirm practical download, memory and latency on target laptops. Large is
   not assumed to fit or perform like Base. CPU WASM is the validated launch path;
   WebGPU is a separate future validation exercise.
4. Upload only the new immutable model/tokenizer/manifest/license directory.
   Later exports derive release identity from weights, tokenizer, contract and
   policy source digests to prevent cache collisions.
5. Verify public asset checksums/CORS, then stage with the new manifest URL and
   deploy. Keep the old release intact for rollback. Existing open pages remain
   on the version they loaded; reloading obtains the new pointer.

Pass the exact matching checkpoint to `validate_model.py --key KEY --reference PATH`.
The staging script refuses unreviewed conversion differences, changed release
identities, missing browser evidence and any output/edit/section-decision change
under the reviewed precision exception. Keep new differences blocked until they
have been evaluated separately.
