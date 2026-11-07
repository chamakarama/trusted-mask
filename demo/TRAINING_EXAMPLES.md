# Demo examples for the web UI and video

`web-examples.json` supplies six synthetic examples: both exact video messages, a second prescription question, a sick-day email, a budget request and a pasted support CSV. Each includes `text`, `intended_use`, a training record ID and an annotated expected output.

A gallery button should populate text and intended use and invoke the actual protection pipeline. **Do not use expected outputs as canned model results.** All six examples and 16 further related examples are included in training; label demonstrations accordingly. This file does not wire buttons into either UI.

All current reviewed training/development data are consolidated in `mask/ml/privacy_v1/data/training-2026-11-07/`. Its `adapter-fixtures/video-support.csv` is ready to upload; `video-support.expected.csv` is an annotation-derived comparison target. Preserve all six tickets and the expected issue counts of 3 duplicate charges, 2 delayed refunds and 1 password-reset problem. Count rows, not repeated identities.

The medical example preserves the recorded prescription and symptoms. It does not establish a diagnosis or the clinician's complete reasoning. The video script's browser-local execution claim must match the implementation actually recorded.
