# Mask pitch — four minutes

Working draft, 8 November 2026. Six slides, with short passages of speech and time to show the product.

[Six-slide PDF](mask-pitch-v1.pdf). This is a visual export of the working deck; the editable source remains in the original presentation. The notes below contain the narration and source references.

## 1. Mask · 0:00–0:20

Slide: **Your AI doesn’t need everything.**

> We built Mask because the question you ask AI usually needs less information than the document you paste.
>
> Mask is a local privacy layer designed to separate useful context from unnecessary personal and confidential information.

## 2. The problem · 0:20–0:50

Slide: **48%** of surveyed employees using AI at work reported uploading company information to public AI tools.

> Nearly half of the AI-using employees in this survey reported uploading company information to public AI tools.
>
> Think of a support manager pasting an export to find the biggest customer problems. The complaints matter. The customer identities add exposure.

Source: [University of Melbourne and KPMG, 2025, pp. 75–76](https://mbs.edu/-/media/PDF/Research/Trust_in_AI_Report.pdf?rev=0ee82285b2b0439bba524dbddc58214a#page=77). This is self-reported sharing, not a measured breach rate.

## 3. Corporate demonstration · 0:50–1:45

Slide: **Customer complaints. Customer identities masked. Complaint text retained.**

> Here’s one row from our fictional support export. The name, email and customer ID change. The complaint stays.

*Show Filter working. Hold on the protected text for a few seconds.*

> Across these six tickets, Mask masks twenty identifier occurrences. The text still describes three duplicate charges, two delayed refunds and one password-reset problem.
>
> When we click Send, this protected version goes to the chatbot. The name map stays on our device.

*Show an actual captured response if available. Leave time to read it.*

## 4. Since AI's own benchmark · 1:45–2:20

Slide: **SafePrompt-Bench. Same 1,500 documents. Same scorer.**

| Detector | Structured identifiers F1 | Names F1 | Secrets F1 | Clean documents flagged |
|---|---:|---:|---:|---:|
| SafePrompt 0.1.0 | 98.3 | 0.0 | 100.0 | 1 / 299 |
| Mask1 | **98.9** | **100.0** | **100.0** | 15 / 299 |
| Mask2 | 98.3 | **100.0** | **100.0** | 57 / 299 |
| MaskMini | **98.9** | 90.3 | **100.0** | 132 / 299 |

> We also tried Since AI's own benchmark.
>
> Mask1 scores 98.9 against SafePrompt's 98.3 on the same identifier test. It also detects the benchmark's names. All four detect its synthetic secrets.
>
> We trigger more false alerts, which we still need to improve.

*Optional, with a smile, after giving the result a beat:*

> Maybe Since AI should stick to hosting amazing hackathons.

Mask1 is the reviewed DeBERTa base, Mask2 the new base epoch 2, and MaskMini the reviewed MiniLM. The original-score win belongs to Mask1 and MaskMini, not Mask2. The data is synthetic, names use fixed forms and secrets follow known formats. This is detector scoring, not a test of final privacy edits or answer quality. SafePrompt does not support automatic name detection. Clean-document false alerts count all categories; lower is better. Keep the joke spoken; leave it out of the README and slide text.

[Full benchmark evidence and limitations](../evidence/safeprompt-bench-2026-11-08/README.md). The personal-budget demonstration remains in the two-minute video; this slide takes its place in the pitch to keep six slides.

## 5. What we built · 2:20–3:10

Slide: **The question changes what matters. Models trained for relevance.**

> We developed models specifically for privacy filtering, trained on our own synthetic data using DeBERTa encoders. We built the whole system around them, including local inference and the browser application.
>
> The hardest part is relevance. A sensitive detail can be essential to one question and irrelevant to another.
>
> Our newest models improve removal of unrelated passages. They can still miss details or remove useful facts. Making those decisions reliable is our next priority.

*The public demo defaults to the experimental new base (Mask2); the reviewed checkpoint is selectable as Mask1. Do not call Mask2 accepted.*

## 6. What comes next · 3:10–4:00

Slide: **Privacy across the AI tools people use.**

> We will bring Mask into the AI tools people already use.
>
> For individuals, that means browser extensions across chatbots. For companies, integrations that apply their own data rules before information leaves the organisation.
>
> We propose starting with support teams, where the workflow is clear and the usefulness of protected complaints can be measured. Then we will expand to more tasks and tools.
>
> Mask. Your AI doesn’t need everything.

The support-team starting point is a proposed adoption strategy, not a claim of existing customers. Extensions and company integrations are future work. Both shown examples are rehearsed synthetic training examples, not unseen performance evidence.
