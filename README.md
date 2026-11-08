# Mask

**Your AI doesn’t need everything.**

Mask is a local privacy layer for messages sent to AI. It is designed to remove personal and confidential information that is unnecessary for a question while keeping the information needed for a useful answer.

[Try the web demo](https://mask-local-demo.netlify.app/) · [About the project](demo/about-the-project.md) · [Two-minute video script](demo/script-v2.0.md)

## The problem

People paste whole documents into chatbots to answer narrow questions. Customer names travel with complaints. Bank details travel with budgeting notes. Useful context and unnecessary private information arrive together.

A [2025 University of Melbourne and KPMG study, pp. 75–76](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77) found that **48% of surveyed employees who use AI at work reported uploading company information to public AI tools**. This measures self-reported sharing, not whether every upload was unauthorised or unnecessary.

## How Mask works

Mask processes the question and its source material on the user's device. Its model identifies sensitive information and proposes transformations. The filtering system applies exact edits: consistent aliases for names, placeholders for detected identifiers, and removal of unrelated sensitive passages when the model and policy permit it.

The question matters. Analysing complaints needs the problems customers describe. Making a budget needs income and expenses. Both tasks can preserve useful information while sharing fewer identifying details.

The browser demo filters locally, then sends the protected message to Claude when the user chooses Send. The name-to-alias map stays on the device, and names can be restored locally in the reply. Filtering itself makes no cloud inference request.

## What we built

We developed models for privacy detection and relevance decisions using pretrained DeBERTa encoders, trained them on our own synthetic data, and built the system that turns predictions into controlled edits.

The project includes a working browser application, local inference, deterministic edit rules, an optional Claude connection and local reply restoration. The Python engine also supports CSV and values-only XLSX. Direct integration into other chatbot websites is the next product step.

The public browser release uses ONNX Runtime Web and WebAssembly. It requires an initial model download of approximately 370 MB, then runs on the device without a GPU. See the [browser implementation and setup](mask/browser/README.md) and [Python demo instructions](mask/web/README.md).

## Demonstrated today

In the six-ticket corporate example, the current public browser release masks **20 identifier occurrences** while preserving the complaint text. The protected text still contains three duplicate-charge complaints, two delayed-refund complaints and one password-reset complaint.

In the consumer budget example, it masks the person's name and bank account while keeping the income, expenses and uncertainty about overtime.

These are synthetic, rehearsed examples included in training. They demonstrate the workflow, not performance on unseen data or a guarantee of unchanged chatbot answer quality.

## New models and the remaining challenge

On 8 November, we trained new DeBERTa base and large candidates with an additional head for task-dependent passage removal, using **1,236 training records**. Evaluation used the original 50-record development set and a separate 80-record supplemental development set. These sets helped select models, so they are not an independent final test.

The selected base candidate preserves all 182 required facts on the original development set and improves task-dependent removal. On the supplemental set it still misses 24 of 323 identifier targets and loses 8 of 405 required facts. Neither new candidate passes the project's full acceptance criteria. The public web demo nevertheless defaults to the new base candidate (Mask2), which the app labels as experimental; the earlier reviewed DeBERTa release remains selectable as Mask1.

See the [8 November model comparison](evidence/privacy-v1/section-training-20261108/COMPARISON.md) for exact checkpoints, results and limitations.

## How Mask compares with Since AI's SafePrompt

While building Mask, we discovered that Since AI has its own tool for this problem: SafePrompt, which detects sensitive information before a prompt reaches an AI model. Since it comes with a public benchmark, we decided to see how the two compare.

We ran Mask1, Mask2 and MaskMini on [SafePrompt-Bench](https://huggingface.co/datasets/sinceaihq/safeprompt-bench): **1,500 synthetic test documents**, scored with Since AI's own scorer. Our reproduction of SafePrompt's headline score matches its published result.

| Detector | Structured identifiers F1 | Names F1 | Secrets F1 | Clean documents flagged |
|---|---:|---:|---:|---:|
| SafePrompt 0.1.0 | 98.3 | 0.0 (unsupported) | 100.0 | **1 / 299** |
| Mask1 | **98.9** | **100.0** | **100.0** | 15 / 299 |
| Mask2 | 98.3 | **100.0** | **100.0** | 57 / 299 |
| MaskMini | **98.9** | 90.3 | **100.0** | 132 / 299 |

**Mask1** is the reviewed DeBERTa-v3-base checkpoint; **Mask2** is the new DeBERTa-v3-base epoch 2 checkpoint; **MaskMini** is the reviewed MiniLM-L12-H384 checkpoint. All three include Mask's existing detection rules.

Mask1 scores higher on the original identifier metric and adds name detection on these examples, while producing more false positives. Names and secrets are separate columns because SafePrompt's headline score excludes both. The final column counts false alerts across all categories; lower is better.

These are detection scores, not guarantees about final redaction or answer quality. Names use fixed synthetic forms; secrets follow known token formats, which the benchmark authors flag as a circular test. No tuning was performed during this evaluation. See [full results, limitations and reproduction](evidence/safeprompt-bench-2026-11-08/README.md).

## What comes next

We will improve relevance decisions and test them on independently reviewed, unseen documents, including the usefulness of downstream AI answers. We will then bring Mask into existing AI workflows through browser extensions and company integrations.

The ambition is an everyday privacy layer across AI tools: protection at the moment information is about to leave a device, with local processing and controls suited to the organisation using it.

Mask is a prototype for data minimisation and pseudonymisation. It can miss sensitive information or remove useful facts, and retained context can still identify someone. It does not guarantee anonymity or legal compliance.

Built for the TrustED PETs Transformer challenge at Since AI 2026. This working README reflects the repository and public demo reviewed on 8 November 2026.
