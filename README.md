# Mask

**Useful AI conversations. Less unnecessary personal disclosure.**

Mask is a local privacy-editor prototype. It identifies private details, substitutes stable labels such as `[PERSON_1]`, and proposes task-dependent edits while preserving useful facts. The current focus is readable English messages around 100 words. Outputs require review; there is no automatic forwarding to a cloud AI or validated anonymity claim.

Both model approaches are implemented: custom sparse classifiers and a fine-tuned MiniLM encoder. They share the edit pipeline, file adapters and evaluation contracts. The current pilot weights and synthetic pilot dataset are included; better reviewed training data and independent evaluation are the next steps.

## Run the local message demo

From the repository root:

```sh
git lfs install
git lfs pull --include="mask/ml/privacy_v1/artifacts/**,mask/ml/privacy_v1/bundled_weights/**"
python3 -m mask.ml.privacy_v1.restore_bundles
python3 -m venv mask/ml/privacy_v1/.venv
mask/ml/privacy_v1/.venv/bin/python -m pip install -r mask/ml/privacy_v1/requirements.lock
mask/ml/privacy_v1/.venv/bin/python -m mask.web.server
```

Open **http://127.0.0.1:8787**. Paste a message and optionally provide its intended use; the proposed protected payload appears beside it. Blank intended use uses the message itself as context. The payload includes a short instruction allowing the receiving AI to reuse placeholders. All inference stays local.

The default bundle is encoder B. See [model setup and provenance](mask/ml/privacy_v1/MODEL_BUNDLES.md) to run custom A. Python APIs and CLI adapters also support bounded CSV and values-only XLSX.

## Existing table-review demo

The original table UI remains intact, including typography, divider, highlights, explanations, review controls and export:

```sh
npm ci --prefix mask
npm run dev --prefix mask
```

Open **http://localhost:5173**. This interface uses the existing institutional table pipeline; it is separate from the new Python message models. Its code, fixtures, learned selector, label provenance and benchmark adapter remain available. Both servers have entries in `.claude/launch.json`.

## Work and evidence

- [Current model plan](planning/LOCAL_MODEL_PLAN.md) and [implementation brief](planning/CLAUDE_BUILD_BRIEF.md)
- [Shared training-data producer prompt](mask/ml/privacy_v1/annotation/TRAINING_DATA_PROMPT.md) and [annotation contract](mask/ml/privacy_v1/annotation/README.md)
- [Python model/API/CLI instructions](mask/ml/privacy_v1/README.md)
- [Latest pipeline results and known failures](evidence/privacy-v1/pipeline-v2/REPORT.md)
- [Table UI](mask/README.md), [institutional ML baseline](mask/ml/README.md), [benchmark adapter](mask/bench/README.md)
- [Challenge materials and licences](MATERIALS.md)

The unused standalone scanner, duplicate challenge ZIP/presentation files and superseded plans have been removed from the active tree. The supplied unpacked evaluation package and measured outcomes remain available. Earlier work is recoverable in Git history.
