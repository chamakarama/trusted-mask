# Mask

**Your AI doesn’t need everything.**

Mask is a local privacy layer for messages sent to AI. It is designed to remove personal and confidential information that is unnecessary for a question while keeping the information needed for a useful answer.

[Try the web demo](https://mask-local-demo.netlify.app/) · [About the project](demo/about-the-project.md) · [Pitch slides](demo/mask-pitch-v2.pdf) · [Pitch notes](demo/pitch-v2.md) · [Two-minute video script](demo/script-v2.0.md)

## The problem

People paste whole documents into chatbots to answer narrow questions. Customer names travel with complaints. Bank details travel with budgeting notes. Useful context and unnecessary private information arrive together.

A [2025 University of Melbourne and KPMG study, pp. 75–76](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77) found that **48% of surveyed employees who use AI at work reported uploading company information to public AI tools**. This measures self-reported sharing, not whether every upload was unauthorised or unnecessary.

## How Mask works

Mask processes the question and its source material on the user's device. Its model identifies sensitive information and proposes transformations. The filtering system applies exact edits: consistent aliases for names, placeholders for detected identifiers, and removal of unrelated sensitive passages when the model and policy permit it.

The question matters. An email to a manager needs a return-to-work date and physical restrictions. A summary for a doctor also needs the medical history and medication. Mask can treat the same passage differently depending on the request.

The browser demo starts filtering locally after a pause in typing or when an example is loaded. Filter reveals the completed result, or waits for it to finish. Only the separate Send action sends the protected message to Claude. The name-to-alias map stays on the device, and names can be restored locally in the reply. Filtering itself makes no cloud inference request.

## What we built

We trained DeBERTa and MiniLM transformer models on our own annotated synthetic data, with separate prediction heads for sensitive-span detection, task relevance and editing actions. Mask2 adds a section-relevance head for task-dependent passage removal. Deterministic validation and editing rules turn these predictions into exact changes to the source text.

We also built and evaluated a lightweight custom architecture without pretrained embeddings: a sparse logistic token classifier with separate relevance and action classifiers. We selected DeBERTa for the demo after it removed identifiers more reliably in our checks and avoided a surname leak seen with the custom model. The [training comparison](evidence/privacy-v1/training-2026-11-07/COMPARISON.md) records the tradeoffs and remaining failures.

The project includes a working browser application, local inference, deterministic edit rules, an optional Claude connection and local reply restoration. The Python engine also supports CSV and values-only XLSX. Direct integration into other chatbot websites is the next product step.

The browser uses ONNX Runtime Web and CPU WebAssembly, without requiring a GPU. Its selector offers **Mask1** (the earlier DeBERTa Base, approximately 369 MB), **Mask2** (the new DeBERTa Base with a section-relevance head, approximately 371 MB and the default), and **MaskMini** (MiniLM, approximately 67 MB). Only the selected model downloads; verified assets are cached when browser storage permits. These are model-transfer sizes, not peak memory requirements. See the [browser implementation and setup](mask/browser/README.md) and [Python demo instructions](mask/web/README.md).

## Demonstrated today

**Corporate:** the [six-ticket support export](demo/browser-support-example.txt) asks AI to identify the main complaint categories. Mask replaces customer names, emails and IDs while retaining the complaint facts: three duplicate charges, two delayed refunds and one password-reset problem. This version puts the customer name before the ID. The earlier ID-first variant exposed a context-sensitive identifier-rule failure; the retained example is a selected demonstration, not proof of general coverage.

**Consumer:** the [appointment-note example](demo/context-dependency-demo/README.md) holds the source text constant and changes the request. For a manager email, Mask2 removes the surgery sentence and psychiatric-history paragraph while retaining the return date, work restrictions and work-from-home days. For a GP summary, it retains the medical details. The name becomes `[PERSON_1]` in both. The [verification report](evidence/privacy-v1/context-demo-20261108/revision-3-name/preview/verification.json) records the local application results; the [animation](demo/video/context-animation/index.html) illustrates them without running inference.

Both examples are fictional and rehearsed. The support example derives from training demonstrations; the consumer wording was selected after testing alternatives. The consumer verification supplies the task separately, whereas the browser derives it from the opening line. Recheck the exact message in the interface used for a live demonstration. These examples are not an independent accuracy benchmark or a guarantee of unchanged chatbot answer quality.

## New models and the remaining challenge

On 8 November, we trained new DeBERTa base and large candidates with an additional head for task-dependent passage removal, using **1,236 training records**. Evaluation used the original 50-record development set and a separate 80-record supplemental development set. These sets helped select models, so they are not an independent final test.

The selected base candidate preserves all 182 required facts on the original development set and improves task-dependent removal. On the supplemental set it still misses 24 of 323 identifier targets and loses 8 of 405 required facts. Neither new candidate passes the project's full acceptance criteria. The public web demo nevertheless defaults to the new base candidate (Mask2), which the app labels as experimental; the earlier reviewed DeBERTa release remains selectable as Mask1.

See the [8 November model comparison](evidence/privacy-v1/section-training-20261108/COMPARISON.md) for exact checkpoints, results and limitations.

## How Mask compares with Since AI's SafePrompt

While building Mask, we discovered that Since AI has its own tool for this problem: SafePrompt, which detects sensitive information before a prompt reaches an AI model. Since it comes with a public benchmark, we decided to see how the two compare.

**The difference is what each system decides to remove.** [SafePrompt 0.1.0](https://github.com/sinceaihq/safeprompt/tree/64df85bae1677653ef5b6f070a1acf43e0580873) uses patterns, checksum validation and nearby labels to detect structured identifiers and secrets, then lets the user choose which values to replace. Mask combines detection rules with models trained on our own data to detect names and make task-dependent decisions about sensitive passages: the same medical detail may be relevant to a question for a doctor but unnecessary in a message to a manager.

Both process sensitive text locally and support reversible placeholders. Mask's distinction is filtering according to what the user is asking, beyond recognising sensitive values. **The benchmark below compares detection only; it does not test that context-dependent filtering or the quality of the AI's answer.** SafePrompt also produces fewer false alerts on this test, as shown below.

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

## Run and inspect

- Use the [hosted demo](https://mask-local-demo.netlify.app/) without installing Python. The first model load can take time.
- To run locally, follow the [Python setup](mask/web/README.md#setup-once). Model archives are stored in Git LFS; download and unpack the selected bundle before starting it. See the [Mask2 bundle instructions](mask/ml/privacy_v1/bundled_weights/section-training-20261108/README.md).
- To rebuild the browser application, follow the [browser build instructions](mask/browser/README.md#local-build). They require Python 3.12, Node.js, Rust and Git LFS. The [commit mapping](evidence/COMMIT_IDS.md) preserves the exact pinned runtime despite the submission repository's rewritten history.
- Training and development datasets are not distributed in this submission. Training code, dataset hashes and recorded results are included, but full training/development evaluation cannot be reproduced from this checkout alone. SafePrompt uses a separately available public benchmark dataset.
- The optional Claude relay needs your own server-side API key. No key or recording footage is included. The PDF pitch has eight slides and three backup slides for questions; its script, speaker split and source references are in the pitch notes.

Built for the TrustED PETs Transformer challenge at Since AI 2026. This working README reflects the repository and public demo reviewed on 8 November 2026.
