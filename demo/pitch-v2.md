# Mask pitch v2: four minutes, then six minutes of Q&A

Draft of 8 November 2026, for Vaishnav and Mark. It builds on [pitch-v1](pitch-v1.md), with fixes from a fact-check against the repository, the challenge brief and the original survey PDF.

**Shape:** a skit opening, then 8 slides, all static (no live demo), plus 3 backup slides for the Q&A. About 470 spoken words: about 3:25 at 140 words per minute, plus pauses for the skit. Aim to finish at 3:45.

**Who speaks:** Vaishnav takes slides 1, 3, 4 and 6. Mark takes 2, 5 and 7 (the output, the benchmark and the limits, so he takes the technical Q&A too). Slide 8 is shared.

**Who judges this:** the 4-minute pitch happens only at the finals, in front of the overall Since AI jury from all five challenges. They are generalists, so everything is plain English. The TrustED items the brief requires (data types, a PET per type, protected output, before/after, sharing scenario) are still covered.

## Decisions behind this version

| Decision | Reason |
|---|---|
| **No live demo.** Slide 2 shows real output captured from the live site. | Filtering took about 30 s in our test, and Send needs venue Wi-Fi. Every output on the slides is real, so you can say so. The demo page stays open on the laptop in case a judge asks. |
| A skit opens the pitch and closes it | A jury that sees five pitches back to back remembers a scene. It is the support-ticket scene, so it leads straight into slide 2. |
| Business model slide | Judges will ask. It is clearly labelled as a proposal: no customers and no pricing yet. **Fill in the team price.** |
| "Twenty identifiers masked" is gone | Checked live on 8 Nov: every name and email is masked, but customer IDs **C-2087 and C-5028 go through**. We show one of them on slide 2 and say so. If the rules get fixed, update slide 2. |
| The Since AI joke is cut | The finals jury *is* Since AI. |
| "trained" became "fine-tuned"; "built this weekend" | Accuracy. The models are fine-tuned pretrained encoders. |

## Script

### 1. Skit over the cover · 0:00–0:30 · Vaishnav and Mark

**Slide:** the cover, unchanged (Your AI doesn't need everything, 48%).

> **Vaishnav:** Mark, those customer complaints: did you analyse them like I asked?
>
> **Mark:** Yep. Pasted the whole export into Claude.
>
> **Vaishnav:** You *what*? That has every customer's name, email, customer ID…
>
> **Mark:** Relax. I used Mask.
>
> **Vaishnav** *(turning to the jury)*: He's not the only one pasting. 48 percent of employees using AI at work say they've uploaded company information to public AI tools. But the question usually needs far less than what gets pasted. So we built Mask: a privacy model that runs in your browser.
>
> **Mark:** Here's what Claude actually saw.

*Mark clicks to slide 2.* Say "customer ID", not "account number", since the export holds customer IDs. Mask doesn't send anything by itself, so the skit says "pasted into Claude", never "sent emails".

### 2. What Claude actually received · 0:30–1:05 · Mark

**Slide:** three rows before and after, captured from the live site. Row 2 shows C-2087 going through.

> Here's exactly what Claude received: real output from our live site.
>
> Every name became a consistent label: person one, person two. Every email became a placeholder. The complaints are untouched, so everything Claude needs to find the top complaints is still there.
>
> One customer ID slipped through: our rules weren't sure it was personal. That's a known gap.
>
> And when Claude answers, the real names come back on my laptop, never on Claude's side.

Facts: the model runs in the browser tab. Only the protected text goes, via our relay in Finland, to Claude, and the name map stays in browser memory (`mask/browser/README.md`, "Privacy boundary"). Only `[PERSON_n]` labels are restored.

### 3. One protection per data type · 1:05–1:25 · Vaishnav

> That's one protection per data type.
>
> Names get pseudonyms, and the key stays with you. Emails, IDs and secrets become placeholders, checked by rules like the IBAN checksum. Passages the question doesn't need are removed. Everything else stays word for word.

### 4. The question decides what goes · 1:25–1:55 · Vaishnav

> But removing names alone rarely protects anyone. The harder question is: what does the task actually need?
>
> Here's one GP's note and two requests. Asking a manager for desk duties, our newest model removes the mental-health history. Writing to a new GP, it keeps it.
>
> Same note, different purpose, different answer.

Facts: real Mask2 outputs from the local Python pipeline (`demo/context-dependency-demo/`, 16/16 checks), not the browser.

### 5. Since AI's own benchmark · 1:55–2:20 · Mark

> We also ran Since AI's own benchmark, SafePrompt-Bench: fifteen hundred synthetic documents, the original scorer.
>
> On structured identifiers, Mask1 scores 98.9; SafePrompt, 98.3. SafePrompt doesn't detect names; Mask finds the benchmark's names.
>
> The cost: we flag 15 of 299 clean documents. SafePrompt flags one.

Facts: `evidence/safeprompt-bench-2026-11-08/README.md`. The benchmark names use a few fixed forms (stated in the slide footer). Most of the 98.9 probably comes from our shared validator rules; see the Q&A.

### 6. Business model · 2:20–2:50 · Vaishnav

> How we make money.
>
> Individuals get a free browser extension: that's how people find us. Teams pay five euros per user per month for their own data rules, an admin view and a log of what was hidden. And AI platforms, like contact-centre analytics, can license Mask to take in customer text safely.
>
> Because filtering runs on the user's own device, we pay for almost no servers.

If asked about the €5: it's a starting price we'd test in the pilot. For example, 100 support staff comes to €500 a month for one company.

### 7. Built this weekend, and what still fails · 2:50–3:20 · Mark

> Built this weekend: three privacy models, fine-tuned on our own synthetic data, live in a public browser demo.
>
> What still fails, on our harder test set: the newest model removes only a third of the passages it should, sometimes drops a needed fact, and misses about seven percent of identifiers. English only.
>
> And pseudonymised text is still personal data, so we promise less exposure, not anonymity.

Facts: on the 80-message supplemental dev set, Mask2 removes 20/58 unneeded clauses, loses 8/405 facts and misses 24/323 identifiers (`evidence/privacy-v1/section-training-20261108/COMPARISON.md`).

### 8. Next, and the closing beat · 3:20–4:00 · Vaishnav and Mark

> **Vaishnav:** Next, a pilot with a support team, where we can measure whether answers on protected text stay as good. Then integrations that apply each company's own data rules. And a browser extension, so Mask works inside the chatbot you already use: no separate tab.
>
> *(pause)*
>
> **Vaishnav:** So, Mark: the complaints analysis?
>
> **Mark:** Done. And Claude never saw a single customer's name.
>
> **Both:** Mask. Your AI doesn't need everything.

*Stop. Smile. Wait for the first question.*

## Before going on stage

1. Rehearse the skit at least three times with a timer. Say the lines naturally, not as if reading. If the whole pitch runs over 3:50, cut slide 3's speech to one sentence.
2. Keep https://mask-local-demo.netlify.app open on the laptop with `mask1` selected and the export pasted, in case a judge asks to see it live in the Q&A. The page forgets the model choice on reload.
3. Check that an Anthropic spend limit is set for the relay key.

## Backup slides (only for the Q&A)

- **A1 How the data flows:** what stays in the browser and what leaves on Send, plus the plan: a browser extension inside the chatbot, no separate tab.
- **A2 Full benchmark:** all four detectors, including MaskMini and secrets.
- **A3 Why a model, not just rules:** rules alone catch 8 of 30 identifiers; Mask1 catches 30 and keeps all 182 needed facts.

## Words never to say

"anonymised", "guaranteed", "zero leaks", "GDPR compliant", "trained from scratch", "WebGPU" (the demo runs on CPU WebAssembly), "customers" or "pilot" as if they exist, "endorsed by TrustED".
