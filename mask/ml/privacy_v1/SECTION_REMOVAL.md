# Improving task-dependent section removal

> Data availability: the training and development data are not published in this repository. The commands below record what was run; the dataset hash files identify the exact data.

This branch adds an experimental section proposal path, diagnostics and aligned supervision export. It does **not** claim that the existing models now reliably remove irrelevant content. The default remains `legacy`; the web demo is unchanged.

## What changed

Previously, section decisions depended on the detector proposing a complete supported span. Fragmentary detections could prevent removal before the action head had a chance to assess the whole section. The experimental modes enumerate text units independently of detection:

- `paragraph-probe-v1`: complete paragraphs separated by blank lines.
- `clause-probe-v1`: the existing sentence/clause units, including mixed paragraphs.

Contextual detections select category probes; units without a detection are probed against all four existing contextual category heads. Every probe must authorize DROP; essential or uncertain nested evidence vetoes removal. Direct identifiers in retained text still use the existing placeholder pipeline. Intended-use/history sections are not deleted by the experimental path. Scores are model scores, not calibrated probabilities of privacy safety.

These are experiments using existing category-conditioned heads, **not a trained general section-relevance classifier**. In particular, a generic paragraph can be out of distribution for a model trained mainly on entity spans. Do not enable either mode in the demo without passing the quality gates below.

`section_diagnostics` reports offsets, category probes, scores and gate reasons without repeating the private source text. It distinguishes missing candidates, model KEEP/PLACEHOLDER proposals and pipeline vetoes. Existing default behavior is covered by regression tests.

## Reproduce a comparison

After extracting and verifying the reviewed model bundles, run from the repository root:

```sh
python -m mask.ml.privacy_v1.section_audit \
  --data mask/ml/privacy_v1/data/training-2026-11-07/dev.authored.jsonl \
  --model mask/ml/privacy_v1/artifacts/reviewed-2026-11-07/deberta-v3-base \
  --section-mode clause-probe-v1 \
  --output /tmp/mask-deberta-sections.json
```

The output contains baseline and experimental results, missed DROP spans, changed KEEP characters, required-fact retention and decision traces. Use a fresh output path each run. Reports contain synthetic source/output examples; real-input reports should remain local.

## Training next

First export aligned targets using the same command without `--model`, separately for train and dev. The exports in `data/training-2026-11-07/section-targets/` (not included in this repository) preserve original record IDs, families and splits. They are auxiliary section-head supervision, not extra independent records and not input to the current BIO/action trainer.

The current training set yields 177 unnecessary, 2,250 essential and 42 uncertain clause targets; 1,465 clauses are unlabelled. Whole paragraphs yield only 46 unnecessary targets. Unlabelled does **not** mean safe to remove. A required fact or explicit essential KEEP annotation vetoes a DROP target. Preserve required claims including qualifiers, negation and conditions.

The next model change should train a dedicated section relevance head (essential / unnecessary / uncertain) on these runtime-aligned units. Keep entity detection and placeholder actions separate. Use class-balanced sampling or loss selected on dev; do not merely oversample near-duplicate text. Require uncertainty and relevant subclauses to veto deletion. Do not convert the present model's PLACEHOLDER predictions into unconditional paragraph deletion.

Add task-contrast families: exactly the same source under two realistic intended uses, with at least one section changing from KEEP to DROP. Keep all variants of a family in one split. Use the focused generation brief beside this document. Train on train only, select on dev, then evaluate new independent families. The existing demo gallery is training data and cannot establish generalisation.

## Promotion gates

Compare fixed original weights and the new candidate on the same inputs. Report whole-section DROP precision/recall, required-fact retention, direct-identifier removal, and whether the expected section actually changes across paired tasks. Inspect all false removals. Include blank/vague goals, mixed relevant/irrelevant paragraphs, negation, corrections, and multi-line table cells. Do not choose a checkpoint solely by overall token accuracy or name masking.

A prototype improvement needs more correct removals **without losing required facts** on these checks, plus a separately held-out task-pair set. If this fails, keep the demo default and publish the failure rather than showing a fabricated protected output.
