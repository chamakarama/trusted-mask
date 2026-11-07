# Mask Local — executable A/B pilot

This package implements the first engineering milestone of [the local model plan](../../../planning/LOCAL_MODEL_PLAN.md): **two trained local prototypes sharing policy, exact-offset edits, message handling and basic table adapters**. It is not a validated privacy release. All draft outputs remain `needs_review`; unsupported inputs return no protected text/file. Raw softmax scores are not calibrated certainty.

## Implemented

- Track A: a custom sparse logistic BIO detector and separate relevance/action heads. No pretrained embeddings. JSON/NPZ export, with no pickle loading.
- Track B: one fine-tuned MiniLM encoder with BIO, relevance and action heads. Pinned source revision `44acabbec0ef496f6dbc93adadea57f376b7c0ec`; local-only loading; safetensors export. Training completed on this computer's CPU.
- Shared detection rules, policy masks, stable aliases, placeholders, exact source offsets, and conservative review fallbacks. No invented realistic personal data.
- Local API/CLI for English messages, task and history, CSV and values-only XLSX. Reports exclude raw values and entity maps. Original sensitive facts intentionally kept in review drafts are identified by offsets/types.
- Fresh workbook reconstruction, scanning every exported nonempty cell, neutral sheet names, omission of hidden content/comments/links/source metadata, explicit rejection of formulas/macros/embedded media/merged layouts and resource-limit failures.
- 384 reproducible synthetic records (288 train, 96 development). Eight source-template families; no human audit, independent validation or final-test set.
- Bundle integrity checks, export/reload parity tests, offline inference checks, and development metrics that separate gold-span classification from the full detector/edit pipeline.

The experiment results and known failures are in [the milestone report](../../../evidence/privacy-v1/BUILD_REPORT.md). Existing TypeScript app and institutional labels/models/splits remain unchanged.

## Current output pipeline and data handoff

The non-model update uses `privacy-edit-pipeline.2` and `consumer-v1-pilot.2`, while accepting the original version-1 training-policy bundles and reporting both versions. No trained bundle was changed. See [the pipeline report](../../../evidence/privacy-v1/pipeline-v2/REPORT.md) for checks, measured failures and limits.

Names now use stable `[PERSON_1]` labels, preserving relationship words. Identified full names are reused for exact repeated mentions; ambiguous identities and alternate spellings still need review. Whole-entity edits avoid overlapping fragments. Unconfirmed learned fragments are retained with review metadata. Whole-clause DROP requires an explicit unnecessary-DROP prediction and no competing essential or unresolved evidence; a PLACEHOLDER prediction cannot delete a paragraph. The old pilots have no supervised DROP examples, so unrelated sections often remain until better labels and retraining are available.

The [local browser preview](../../web/README.md) has an optional intended-use field. With it blank, the message itself is used as context; there is no separate intent-extraction model. The proposed payload includes the fixed receiving-AI instruction and only protected content. Changing either input clears stale output. Task/history and table reports expose review locations and runtime provenance; raw scores are not calibrated certainty, and direct policy edits have no fabricated confidence score.

Use [this shared producer prompt](annotation/TRAINING_DATA_PROMPT.md) in every repo-connected data-generation session. Each writer claims its own UUID directory, starts with 40 reviewed examples, then grows to 200 only if quality holds. The tools resolve exact quotes, replay approved outputs, check required facts, bind independent model reviews to content hashes, reject split leakage and compile separate detector/action targets. Model review is not human audit. This first campaign covers English messages plus explicit intended use; independent development data, tables and conversation authoring remain separate work.

## Run from the repository root

The installed environment is `mask/ml/privacy_v1/.venv/`. To recreate it:

```sh
python3 -m venv mask/ml/privacy_v1/.venv
mask/ml/privacy_v1/.venv/bin/python -m pip install -r mask/ml/privacy_v1/requirements.lock
```

Generate the pilot and train A. Outputs are exclusive-create: use new paths for subsequent runs, rather than overwriting evidence.

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.make_pilot --output mask/ml/privacy_v1/data/pilot.jsonl
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.train --track custom-a --data mask/ml/privacy_v1/data/pilot.jsonl --output mask/ml/privacy_v1/artifacts/custom-a-pilot
```

Download B explicitly once, then train locally with networking disabled. The download records the exact revision; check it against `configs/encoder_b.json` for this experiment. No model/API download occurs during inference.

```sh
HF_HOME=.cache/huggingface HF_HUB_DISABLE_XET=1 mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.fetch_encoder --output .cache/privacy-v1/minilm
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.train --track encoder-b --data mask/ml/privacy_v1/data/pilot.jsonl --base .cache/privacy-v1/minilm --output mask/ml/privacy_v1/artifacts/encoder-b-pilot --epochs 1 --device cpu
```

Evaluate development data and run checks:

```sh
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.evaluate --model mask/ml/privacy_v1/artifacts/custom-a-pilot --data mask/ml/privacy_v1/data/pilot.jsonl --output evidence/privacy-v1/custom-a-new-run.json
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.evaluate --model mask/ml/privacy_v1/artifacts/encoder-b-pilot --data mask/ml/privacy_v1/data/pilot.jsonl --output evidence/privacy-v1/encoder-b-new-run.json
HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false mask/ml/privacy_v1/.venv/bin/python -m pytest mask/ml/privacy_v1/tests -q
```

`evaluate --baseline rules` needs no model. `--baseline goal-agnostic --model <bundle>` holds task wording constant. Development results include review drafts and are explicitly not automatic protection success. Encoder integration tests skip if its local trained bundle is absent; the build report records actual runs with both models installed.

Local API:

```python
from mask.ml.privacy_v1.bundle import load_model
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.tables import protect_table

engine = Protector(load_model("mask/ml/privacy_v1/artifacts/encoder-b-pilot"))
result = engine.protect_text(
    "My name is Alina Birch; I have asthma; email: demo@example.invalid.",
    task="Explain the health information.",
    history=[],
    language="en",
)
assert result.status == "needs_review"  # This prototype cannot authorise sending.
report = protect_table(engine, "input.csv", "protected.csv", "Explain the health information.")
```

CLI (task/message files stay local; provide your own input paths):

```sh
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.protect --model mask/ml/privacy_v1/artifacts/encoder-b-pilot --input message.txt --task-file task.txt --output protected.json
mask/ml/privacy_v1/.venv/bin/python -m mask.ml.privacy_v1.protect --model mask/ml/privacy_v1/artifacts/encoder-b-pilot --input input.xlsx --task-file task.txt --output protected.xlsx --table
```

Do not pipe these draft outputs directly to a provider. No send integration is implemented. The API's status is authoritative; a protected-looking file can still contain unrecognised identifiers or intentionally retained sensitive facts.

## Exact pilot scope and limitations

The taxonomy declares 18 types; only PERSON, EMAIL, PHONE, USERNAME, ACCOUNT_ID, SECRET, AGE, HEALTH and FINANCIAL appear in this pilot's supervised targets. Rules add ordinary emails, international `+` phone formats, cued US-style phones, SSN-shaped numbers, cued secrets/account IDs/usernames, basic English name/address cues, Luhn-valid card patterns, checksum-valid IBAN patterns, ISO dates and ages. These are candidates, not completeness guarantees or identity validation. The legacy Finnish/Swedish lexicons are not imported. Obfuscated contacts, indirect re-identification and languages other than English remain unvalidated.

Implemented treatment registry: KEEP, DROP, ALIAS, ROLE, GENERALISE, PLACEHOLDER. The pilot trains KEEP/ALIAS/PLACEHOLDER only. ROLE is policy-disabled until source-evidence resolution exists; GENERALISE currently supports only numeric age bands and is blocked for predicted essential facts. Unsupported classes are not silently advertised as learned capabilities.

Both tracks scan the task/history locally. Multi-turn inference and cross-field identifying combinations remain review reasons, not solved risk assessment. Language is an explicit caller assertion; automatic language identification is not implemented. Names sharing a surface form are not robustly entity-resolved.

Text limit: 32,000 characters, with 16,000 task/history characters. B scans overlapping detection windows, but action context exceeding 512 tokens currently fails explicitly rather than silently truncating. Long-context action windowing remains work. CSV/XLSX: 10 MiB input, 50 MiB unpacked XLSX, 10,000 nonempty exported cells, 100,000 rectangular cells, 1,000,000 total cell characters and 16,000-character row context. B has its smaller token context limit too. These are resource caps, not measured throughput guarantees.

First visible row is the schema/header row; hidden header rows are unsupported. Hidden rows/columns/sheets are excluded and counted. Only visible values are exported. CSV uses UTF-8, rectangular comma-separated records, and rejects formula-like values; supported `+` phone literals are allowed into protection, but unsafe unchanged output is rejected. No delimiter inference. XLSX accepts ordinary literals/numbers/dates, preserving types when unchanged; formatting is intentionally rebuilt. Archive and physical-cell bounds are checked before workbook allocation. Unsupported cases raise before export. Output files are published atomically without overwriting existing paths; filesystems without hard-link support fail without publishing a partial final file.

## Next work, in order

1. Audit the annotation contract and expand independently authored source families, benign negatives, task variants, table rows and conversations. See [annotation instructions](annotation/README.md).
2. Reduce detector misses/overbroad spans; improve A's generalisation without memorising development names, and assess B's actual advantage across broader data. Keep both trainable.
3. Implement bounded action windows, evidence-backed role/generalisation support and explicit relation/conflict handling.
4. Add independently audited validation, calibration/risk-coverage curves, factual/downstream utility and inference-attack evaluation. Development template scores cannot select a release.
5. Export/compare ONNX and INT8 with parity checks; B's current float bundle exceeds the 100 MiB asset target. Benchmark named-machine latency, peak memory and full table throughput.
6. Freeze both finalists and the validation-selected candidate before opening independent final-test labels. Ship only after every applicable gate in `configs/acceptance.json` passes.

The current synthetic pilot dataset and both trained pilot bundles are versioned; large weights use Git LFS. Follow [the shared-bundle setup](MODEL_BUNDLES.md) after cloning. Other generated model experiments, exports, environments and caches remain ignored. The generator, pinned source revision, dependency lock, metadata and evidence are retained. Neither cloud compute nor external LLM labelling was needed for the original engineering pilot.
