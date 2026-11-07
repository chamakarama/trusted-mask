# Training data review — 8 November 2026

Reviewed release: `mask/ml/privacy_v1/data/training-2026-11-07c/`, from upstream commit `2ce7a94`. This branch also includes the existing section proposal/audit tools. No models were fitted for this review.

## Verified

- 1,316 train records: 516 original + 300 placeholder preservation + 500 section removal. 1,044 families and 1,058 distinct source texts. The 50-record original dev set is unchanged.
- All 1,366 authored and compiled records pass repository validation together. Recompiling reviewed annotations exactly reproduces both compiled files. All release source hashes match.
- Train action counts: ALIAS 3,031; PLACEHOLDER 1,743; KEEP 1,575; DROP 425; GENERALISE 6. DROP is 6.27% of action targets; ALIAS plus PLACEHOLDER is 70.41%. These proportions do not by themselves guarantee training balance.
- The new section campaign has 200 same-source/different-task pairs. Every pair has at least one essential/unnecessary switch using runtime clause boundaries: 428 switched units in total. Paragraph boundaries expose a switch in only 98 pairs, so whole-paragraph-only training would discard much of the useful contrast.
- Across all train records the clause projection produces 5,397 essential, 678 unnecessary and 138 uncertain targets. Another 3,783 units have no target: they must not become negative examples automatically.
- New DROP spans do not partially cut any runtime clause unit.
- All 1,366 detection inputs and 6,841 marked action inputs fit the current 512-token limit. Maximum actual marked action input: MiniLM 327 tokens, DeBERTa 332. Recheck any new backbone/tokenizer and section marker format separately.

Full counts and hashes: `audit.json`. Accepted review status is model review, not human validation.

## Semantic spot-check and limitations

Inspected 10 deterministically selected records across both new campaigns: ordinary identity masking, full/short names, essential placeholders, dropped sections, vague tasks, and no-edit controls. The sampled outputs generally follow the intended preservation/substitution/removal behavior. This is not a semantic audit of every label.

There is remaining synthetic-data noise. The parental-leave example `7d2a33058e7546b6b66be709394da98b:p8-f4-notice-draft` gives January–March leave dates but a May notice deadline; Mask should preserve the source rather than silently repair it. Some required-fact quotes are fragments at alias boundaries. The handover record `6aee5db7e0b14b99b2d4bc9b2de9f98c:cred-002` marks a password essential even though the task is about expiry/reminders/rate limits; its PLACEHOLDER output remains appropriate. Relevance targets are imperfect supervision, not an authority to expose identifiers.

323 train records (164 in the placeholder campaign) associate distinct person-name surface forms with the same entity ID. The current runtime calls exact-value aliasing without the gold entity ID. Good span/action predictions alone cannot guarantee the expected cross-surface placeholder consistency.

83 essential PLACEHOLDER targets have non-direct labels (FINANCIAL 61, ORG 20, EMPLOYMENT 1, DATE 1). The existing essential-to-KEEP shortcut conflicts with these target combinations. Review this distinction explicitly rather than treating relevance as permission to reveal a value.

The original dev set is short (56–67 words) and has only nine DROP decisions. It is insufficient by itself to choose a reliable model for longer contextual deletion. New campaign files are train-only. Reserve fresh family groups for development before fitting, and retain the original dev as a regression set. There is still no independent human-audited final test. Table-like messages do not establish actual spreadsheet adapter quality.

## Reproduce

From the repository root, with project Python dependencies and the reviewed model bundles extracted:

```sh
python evidence/privacy-v1/data-review-2026-11-08/audit.py --output-dir /tmp/mask-data-review
```

Use `--skip-token-checks` if the local tokenizer artifacts are unavailable; that does not reproduce the token-length checks. The script writes a deterministic semantic sample for inspection, but cannot perform semantic review automatically. The committed report additionally records the ten inspected IDs.

The training handoff is at `mask/ml/privacy_v1/TRAINING_HANDOFF_2026-11-08.md`.
