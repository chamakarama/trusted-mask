# Mask

**A local privacy layer for messages sent to AI.**

Mask helps people use AI without sharing every personal detail in their source material. It uses the user's message itself as context, detects sensitive information locally, applies explicit privacy transformations, and lets the user review the resulting message before sending it to a cloud AI provider. Its aim is to preserve the information needed for the question while reducing unnecessary disclosure. The user does not need to supply a separate statement of intent.

Built for the **TrustED PETs Transformer challenge at Since AI 2026**, Mask applies the challenge's detect → select → transform → evaluate workflow to a common sharing decision: pasting personal records or customer data into an AI chat.

## Why this matters

A 2025 University of Melbourne and KPMG study found that **48% of surveyed employees who use AI at work reported uploading company information to public AI tools**, including financial, sales or customer information. **34% reported doing so sometimes or more often.** These are self-reported sharing behaviours; the study does not establish whether each upload was necessary or authorised. See [*Trust, attitudes and use of artificial intelligence: A global study 2025*, pp. 75–76, Figure 44](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77).

Useful context and private details often arrive in the same document. Mask is built around the question the user is asking: its aim is to keep the information needed for a useful answer while reducing the unnecessary personal and confidential information shared alongside it.

## The product and the working prototype

The intended product is a privacy layer for **any cloud AI provider**: intercept a message before submission, process it on the user's device, and send the protected version. ChatGPT is one possible integration; the design is independent of the receiving provider. The separate demo page makes those steps visible; it is a demonstration surface, not the intended final product.

**Working today:** a local message-filtering engine, a browser demo with review before sending, an optional Claude API round trip, and local restoration of known person aliases in the reply. CSV and values-only XLSX adapters are also implemented in the Python engine.

**Planned:** direct integration with cloud AI chat interfaces. The current demo uses a Claude adapter and does not yet intercept messages on providers' websites. Its privacy model runs in a local Python process; inference does not run inside the browser.

```text
         User's message
  (request and surrounding context)
              │
              ▼
   Local detection and classification
              │
              ▼
 Context-aware model + explicit PET policy
              │
              ▼
    Exact edits → user reviews draft
              │
              ▼  only after an explicit send
     External AI receives the draft
              │
              ▼
   Reply → optional local name restoration

The alias-to-name map stays on the device.
```

## A realistic sharing scenario

A support manager wants to ask an external AI:

> What are the three main things our customers are complaining about? Count the tickets in each category and suggest one practical improvement for each.

The pasted export contains names, customer IDs, email addresses and complaint text. The analysis needs the complaints and their frequency. It does not need the customers' identities.

One row in our fully synthetic example becomes:

**Before**

```csv
customer_id,customer_name,email,complaint
C-1042,Emma Wilson,emma.wilson@example.com,"I was charged twice for the same order. Please refund the extra payment."
```

**After — actual saved DeBERTa pipeline output**

```csv
customer_id,customer_name,email,complaint
[ACCOUNT_ID],[PERSON_1],[EMAIL],"I was charged twice for the same order. Please refund the extra payment."
```

Across all six tickets, the pipeline transforms **20 identifier occurrences**: six customer IDs, seven person-name mentions and seven email mentions. Repeated full names receive the same alias within the request, including names embedded in a complaint. The original strings targeted by those 20 edits are absent from the protected output.

The analytical content remains usable:

| Complaint category | Original tickets | Protected tickets |
|---|---:|---:|
| Duplicate charge | 3 | 3 |
| Delayed refund | 2 | 2 |
| Password-reset problem | 1 | 1 |
| **Total** | **6** | **6** |

These are content-level counts checked against the saved before/after text, not a benchmark of Claude's answer accuracy. This example was included in the training demonstrations; it illustrates the workflow rather than proving performance on unseen data. The [saved outputs](evidence/privacy-v1/training-2026-11-07/measurements/deberta-v3-base-inspect/gallery.outputs.json) contain the full input, protected text, edit locations and review reasons.

## Which privacy-enhancing techniques does Mask use?

PET selection is constrained by the data type and its relevance to the request and context within the message. Learned predictions propose sensitive spans, relevance and actions; explicit rules constrain the final edits.

| Information | PET / action | Why it fits | Current scope |
|---|---|---|---|
| Person names | **Pseudonymisation:** consistent `[PERSON_n]` aliases | Preserves references between people and statements without sending their names | Implemented; exact repeated full-name matching, not general identity resolution |
| Email, phone, account identifiers and other detected direct identifiers | **Masking / redaction:** typed placeholders | The value is unnecessary for tasks such as counting complaints; the type can remain useful | Implemented; detection can still miss identifiers |
| Sensitive text unrelated to the task | **Suppression:** `DROP` | Removes an unnecessary fact or passage rather than merely hiding its subject | Implemented in the engine, but reliable section removal remains in development |
| Eligible numeric ages | **Generalisation:** decade bands | Can preserve coarse age information with less precision | Limited engine support; not a headline demo result |
| Facts needed for the task | **Retention:** `KEEP` | Preserves useful content instead of deleting every sensitive sentence | Implemented; retained facts remain sensitive |

Detected person names are aliased and other detected direct identifiers are masked by policy even if a learned prediction would keep them. For contextual content, an uncertain decision is retained and flagged for review. Removing a whole passage requires an explicit unnecessary-`DROP` decision and compatible boundaries, without competing essential or unresolved evidence.

This is **data minimisation and pseudonymisation, not guaranteed anonymisation**. The prototype does not claim differential privacy, k-anonymity or protection against every re-identification attack. Its selected techniques preserve exact complaint content and counts without introducing statistical noise. That is proportionate to this demonstration's goal; residual context can still identify someone.

## Technology

The privacy engine combines machine learning with deterministic editing:

1. **Detect and classify.** Rules and a trained span detector identify candidate entities and sensitive text. The schema covers direct identifiers and contextual categories such as health, financial and employment information.
2. **Assess relevance and propose an action.** Learned relevance and action heads use context taken from the message itself. The current single-box demo uses the opening line as its conditioning context and scans the complete message. There is no separate intent field for the user to fill in.
3. **Apply policy.** Supported actions, entity shapes, boundaries and review conditions constrain model predictions.
4. **Execute exact edits.** Replacements use source offsets. Text outside the accepted edits is preserved; a generative model does not rewrite the source during filtering.
5. **Review and optionally send.** The server stores the transformed provider payload and alias map locally. Sending references that stored preview; editing the input invalidates it.

| Component | Implementation |
|---|---|
| Privacy engine and local server | Python; server bound to `127.0.0.1` |
| Selected demo model | Fine-tuned **DeBERTa-v3-base**, learning rate `2e-5`, epoch 1 |
| Compared alternatives | Fine-tuned **MiniLM-L12-H384** and a custom sparse logistic model without pretrained embeddings |
| Model tasks | BIO span/type detection, relevance classification and transformation-action classification |
| ML tooling | PyTorch, Hugging Face Transformers/tokenizers, safetensors, NumPy and scikit-learn |
| Demo interface | HTML, CSS and JavaScript |
| Optional external AI | Anthropic's official Python SDK; explicitly configured Claude model |
| Table support | CSV and values-only XLSX, with reconstructed workbook output |
| Training | Temporary NVIDIA L4 cloud GPU; exported bundles support offline CPU inference |

Once the model is downloaded, local filtering needs no cloud inference or API key. The external AI is used only for the optional downstream answer. That request contains the protected message and any message-derived context used by the demo, plus a fixed instruction about aliases; it does not include a separate raw-input copy, the alias map or conversation history. Unremoved sensitive content can still be present in the draft.

Known `[PERSON_n]` labels in the reply can be restored locally on request. Mask does not restore dropped passages or generic placeholders, and name restoration makes no additional cloud call. The server keeps previews in memory, disables request logging, checks request origins and serves responses with `no-store`.

## Evidence and current results

The 7 November campaign trained three candidates on **516 synthetic, model-reviewed training records**. A separate **50-record development set** was used for checkpoint selection, not fitting. Model review is not a human audit, and development-set results are not an independent final test.

These measurements evaluate the **complete detection-and-editing pipeline**, including its policy rules:

| Candidate | Direct identifier spans removed / 30 | Required facts retained / 182 | Required-removal spans missed / 46 ↓ | Requested `DROP` spans removed / 9 |
|---|---:|---:|---:|---:|
| Rules baseline | 7 | 182 | 39 | 0 |
| Custom sparse model | 28 | 181 | 16 | 2 |
| MiniLM | 30 | 182 | 15 | 0 |
| **DeBERTa — demo choice** | **30** | **182** | **15** | **0** |

The direct-identifier targets are a subset of the 46 required-removal targets. Removing 30/30 of them is not a claim of complete privacy protection. A missed target means an annotated span requiring transformation was not fully covered by an edit.

DeBERTa ties MiniLM on these development measurements. It was chosen for the demo after also inspecting the rehearsed examples, where it avoids some MiniLM mistakes. This is not evidence that it is universally the best model.

Additional diagnostics used three newly authored 112–120-word messages under two tasks each. DeBERTa removed all 12 direct-identifier targets and retained all 18 required facts, but left all four requested section removals unchanged. Neither encoder changed its output across the seven development task-swap groups. **Identifier protection has improved; reliable task-dependent removal of unrelated content is not yet demonstrated.**

All three selected bundles passed offline CPU inference and export/reload checks with identical predictions on 12 diagnostic cases. DeBERTa's uncompressed bundle is approximately 747 MB. Its measured warm CPU median was 664 ms across those cases on a four-vCPU cloud machine; this is not a guarantee for other devices.

See the [comparison and limitations](evidence/privacy-v1/training-2026-11-07/COMPARISON.md), [measurement files](evidence/privacy-v1/training-2026-11-07/measurements), and [training reproduction instructions](evidence/privacy-v1/training-2026-11-07/README.md). These results describe the reviewed 7 November models, not the earlier pilot models.

## Run the demo

Run from the repository root with Python 3.12 or newer, Git LFS and sufficient disk space for the model and PyTorch environment. The recorded cloud training environment used Python 3.12.3. No GPU is required for the demo.

### 1. Install the Python dependencies

```sh
python3 -m venv mask/ml/privacy_v1/.venv
source mask/ml/privacy_v1/.venv/bin/activate
python -m pip install -r mask/ml/privacy_v1/requirements.lock
```

### 2. Download and unpack the reviewed model

Fetch **DeBERTa**, verify its archive against the repository checksum, and extract it into a new directory:

```sh
git lfs install
git lfs pull --include="mask/ml/privacy_v1/bundled_weights/training-2026-11-07/deberta-v3-base.tar.gz"
python - <<'PY'
import hashlib
import tarfile
from pathlib import Path

root = Path("mask/ml/privacy_v1")
archives = root / "bundled_weights/training-2026-11-07"
archive = archives / "deberta-v3-base.tar.gz"
checksums = dict(line.split()[::-1] for line in (archives / "SHA256SUMS").read_text().splitlines())
with archive.open("rb") as stream:
    actual = hashlib.file_digest(stream, "sha256").hexdigest()
if actual != checksums[archive.name]:
    raise SystemExit("Archive checksum mismatch; check the Git LFS download.")
destination = root / "artifacts/reviewed-2026-11-07"
destination.mkdir(parents=True, exist_ok=False)
with tarfile.open(archive) as bundle:
    bundle.extractall(destination, filter="data")
print("Verified and unpacked DeBERTa.")
PY
```

If this reviewed bundle is already installed, skip extraction. Instructions for [all three bundles](mask/ml/privacy_v1/bundled_weights/training-2026-11-07/README.md) include their integrity checks and third-party notices. Git LFS pointer files alone are not usable weights.

### 3. Start local filtering

```sh
HF_HUB_OFFLINE=1 python -m mask.web.server \
  --model mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/deberta-v3-base
```

Open **http://127.0.0.1:8787**. Paste the message you would send to an AI, including your question and source material, or use the built-in examples. Click **Filter** and review the draft. Passing the model path explicitly avoids silently using an earlier pilot when the reviewed model is absent.

For a real AI reply, install `anthropic`, configure `ANTHROPIC_API_KEY` and `MASK_MODEL` in the server environment, and restart. Keep the key out of source files and public materials. The [provider configuration](mask/web/README.md#environment-variables-server-side-only) documents the available settings. Without a key, local filtering still works. Setting `MASK_PROVIDER=mock` provides a visibly labelled rehearsal response; it does not call an AI service.

## How this addresses the challenge

| Challenge requirement | Mask's implementation and evidence |
|---|---|
| Identify data types and privacy risks | Typed spans and edit reports expose names, contacts, identifiers and contextual sensitive content |
| Select suitable PETs | Explicit type-based rules combine with predictions conditioned on message context; the PET table explains the choice and limits |
| Produce protected output | Local exact-offset edits produce a reviewable message, with a demonstrated external-AI round trip |
| Show measurable before/after utility | Six-ticket category counts remain 3/2/1; development measurements separately track required facts and removal misses |
| Demonstrate a realistic sharing scenario | A support manager analyses synthetic customer complaints with an external AI |
| Explain limitations honestly | Training examples are labelled, model-selection data is identified, and failed section removals are reported |

The main contribution is bringing privacy transformation into the moment a user is about to share context with an AI. Local filtering, inspectable edits, consistent aliases and local reply restoration make that interaction practical. The model does not authorize disclosure on the user's behalf.

## Limits and next steps

Every current model output remains **`needs_review`**. Supported-input checks can reject oversized or unsupported content, and rejection does not authorize sending the original input. The current scope is English text and bounded inputs, not arbitrary documents, attachments or unlimited conversations.

Detection misses, short identifiers, non-ISO dates, indirect identification and ambiguous references remain concerns. The medical example still retains unrelated visit histories. Retaining useful sensitive facts also retains disclosure risk; aliases alone cannot eliminate that risk.

The next priorities are more reliable section relevance and removal, human-audited evaluation on unseen sources, downstream answer-utility checks, and direct integrations with cloud AI providers. Each integration must prevent the original message from being submitted and establish when the host page can access it; a separate local demo does not establish that boundary.

The training and demonstration records described here are synthetic. Data preparation used AI-assisted annotation and separate model review; the encoders build on pretrained Microsoft models rather than training a foundation model from scratch. Their third-party licence notices are retained with the bundles. Results and implementation described here reflect the reviewed 7 November 2026 snapshot.
