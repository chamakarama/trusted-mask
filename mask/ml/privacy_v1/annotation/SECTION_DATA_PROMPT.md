# Copy-paste prompt: next Mask data campaign

> Historical record: this is the brief given to the LLM writer and reviewer sessions that produced Mask's synthetic training data. The generated data and the branches it names are not included in this repository.

Paste the block below into your repo-connected data-generation coordinator. Start from `codex/section-removal-pipeline` or a branch containing its section tools and these instructions; use a separate worktree if the current checkout is busy. The runner's configured model is used unless you explicitly select another one.

```text
Create the next Mask training-data campaign. Read and follow mask/ml/privacy_v1/annotation/SECTION_DATA_INSTRUCTIONS.md and REVIEW_RUBRIC.md; use example.section-pair.authoring.json to understand the exact schema. The new instructions supersede the older general campaign's quotas and publishing restrictions.

Deliver 500 independently model-reviewed records: 200 same-source/two-task pairs (400 records), plus 50 relevant-sensitive controls, 25 benign controls and 25 vague-task controls. Use 70% consumer / 30% corporate families. Focus on realistic, roughly 100–180-word sources where task changes justify KEEP versus whole-clause/paragraph DROP. Preserve essential facts and stable person aliases. Include the specified pasted CSV/TSV cases without claiming spreadsheet-file coverage.

Use parallel writer/reviewer subagents if available, each with private claimed paths. Calibrate on two pairs, check the first 50 accepted records, then continue to 500. One independent review per record is enough after calibration; at most two repair rounds. Do not generate 500 name-swapped templates, self-approve, change validators, train models or touch the UI.

Put everything in one unique data/section-removal-<RUN_ID>/ folder as instructed. Validate, independently review, merge, compile and export both section-target datasets. Report actual complete pairs and switched sections, not just record count. Commit and push your own reviewed campaign on a separate branch, including provenance and clearly separated rejects, excluding scratch/caches. Finish with the commit, counts, limitations and exact file paths. Do the work through completion without routine reconfirmation.
```
