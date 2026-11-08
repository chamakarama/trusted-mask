# Project review for the submission materials

8 November 2026. Internal working notes, not submission copy.

## Snapshot

- Local main is `aa76674`; fetched remote main is `0b3854d` (25 commits ahead). Reviewed remote files with `git show`; did not merge over the local work.
- The public browser demo is https://mask-local-demo.netlify.app/ and reports `deberta-v3-base-d78a8b857c68`.
- The browser implementation under `mask/browser/` is currently untracked in this checkout. Make sure the intended source is included before publishing a final repository submission.
- Existing `final_readme_v1.md` and `demo/script-v1.0.md` remain intact. New drafts are in `final_readme_v2.md` and `demo/script-v2.0.md`.
- Confirmed format: two-minute video, four-minute pitch. Keep room for readable examples and pauses.

## Demo checks

The public browser's Filter action was exercised with the exact corporate support input and budget gallery input. No downstream AI request was made during this review.

| Input | Observed output | Suitability |
|---|---|---|
| Corporate support, six tickets | All 20 targeted identifier occurrences masked; complaint text retained | Current browser recording candidate |
| Consumer budget | Name and IBAN masked; income, expenses and overtime caveat retained | Reliable consumer fallback |
| Medical record with unrelated anal itching | Known section-removal problem in prior evidence | Retire from the main script |
| Delivery complaint with unrelated health paragraph | New base's saved Python output removes health paragraph and masks identifiers | Stronger context-removal demonstration, pending exact web-flow check |

The budget numbers imply €1,175 after the listed expenses and €1,025 after also setting aside €150. Other expenses are unspecified; income varies. These are answer-check values, not a captured chatbot response.

Both new base and selected large saved corporate-gallery outputs retain `C-2087` and `C-5028`. They are not drop-in replacements for the recording model. Verify the exact messages again after any upgrade.

## New model evidence

Source: [COMPARISON.md at remote 0b3854d](https://github.com/Chintufp/Since-AI-hackathon---WAWS/blob/0b3854d/evidence/privacy-v1/section-training-20261108/COMPARISON.md).

- Recommendation in report: base epoch 2 for supervised experimental demos; keep the existing working default.
- Selected large checkpoint: epoch 1. Larger is not automatically safer or better.
- 1,236 training records, original 50 development records, 80 family-separated supplemental development records.
- Supplemental base: 24/323 identifier targets missed, 8/405 required facts lost, 20/58 unnecessary clauses removed, five false clause removals.
- Supplemental selected large: 24/323 identifier targets missed, 12/405 required facts lost, 32/58 unnecessary clauses removed, eleven false clause removals.
- Neither passes the no-new-fact-loss requirement across both development sets.
- New section-head bundles need the matching loader and a verified browser export/integration. The published browser export documents the older three-head contract.

## Stronger consumer candidate

The new base's saved fresh-CPU example asks for a delivery complaint about a missing desk. It keeps the order date, €184 payment, delivery timeline, neighbour's observations and seller's requested waiting period. It removes a separate paragraph about a cough and masks personal identifiers.

Source: [BASE_EXAMPLES.md](https://github.com/Chintufp/Since-AI-hackathon---WAWS/blob/0b3854d/evidence/privacy-v1/section-training-20261108/BASE_EXAMPLES.md).

That test supplies the task separately from the source. Our recording interface uses the opening line of the combined message. Run the exact combined input before adopting it. The opposite task (clinical timeline) retains extra delivery material, so do not present the pair as a perfect two-way relevance switch.

## Claims to keep consistent

- Core: local filtering, personal and confidential information, relevance to the question, preserving useful facts.
- Built: task-specific training on our own synthetic data, pretrained DeBERTa encoders, complete filtering and browser system.
- Developing: reliable removal of unrelated sensitive passages across unfamiliar documents.
- Future: extensions and company integrations. These are commitments, not shipped features.
- Avoid: “tiny”, “zero leaks”, “guaranteed privacy”, “same output quality”, “trained the foundation model from scratch”, “new model already live”.

The 48% research statistic concerns self-reported uploading of company information by surveyed AI-using employees. It is not a measured rate of confidential-data breaches.
