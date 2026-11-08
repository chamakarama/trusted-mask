# Mask demo video — script 2.0

Working draft, 8 November 2026. **Two minutes.** Corporate first, consumer second. Leave room for the screen recording and pauses.

This version uses the customer-complaints demo followed by the new context-dependent appointment-note example. The consumer scene uses Mask2 (new DeBERTa Base). Its exact outputs have been verified in the local Python application; confirm them in the deployed browser before recording there.

## Script

### 0:00–0:15 · The mistake

*Look up from the laptop, horrified. Pause after the first sentence. Cut to the synthetic customer export going into a chatbot. Small caption: “Staged example. Fictional customer data.”*

> Shit. I just really, really messed up.
>
> I asked AI to summarise our customer complaints. And sent every customer’s name, email and customer ID with them.
>
> None of that helped answer the question.

### 0:15–0:32 · Introduce Mask

*Return to the same input, this time in Mask. Keep the screen readable and still.*

> This is why we built Mask.
>
> A privacy layer that runs on your device, before your message reaches the chatbot.
>
> The idea is simple: keep what the AI needs for your question. Filter out the personal and confidential details it doesn’t.

### 0:32–1:10 · The corporate demonstration

*Click Filter. Hold on one row long enough to read it. Show the name, email and customer ID becoming placeholders, with the complaint unchanged. Then show the protected message going to Claude and its actual answer.*

> Here are the same six complaints.
>
> Mask replaces the customer details. The complaints stay intact.
>
> Three duplicate charges. Two delayed refunds. One password-reset problem.
>
> The information needed for the analysis is still there.
>
> Only this filtered version goes to the chatbot.

*Allow several seconds without narration for the answer. Show the real result, not a prepared answer presented as live.*

*If the reply refers to customers as `[PERSON_1]` and so on, click **Restore names on this device** and hold while the names come back. If the button stays greyed out, the reply named no one: say the line over the reply and don't stage a restore.*

> If the answer refers to a customer, Mask puts their real name back. Right here, on my device.

### 1:10–1:35 · The consumer demonstration

*Keep the same appointment note visible throughout. First show the manager-email task and its filtered output. Hold on the retained return date and work restrictions. Change only the task to a summary for a new GP: the medical-history paragraph returns, while the name remains masked. See `../consumer-context-animation.md` for the 25-second shot sequence.*

> Now, the same idea with my own medical notes.
>
> For an email to my manager, Mask keeps my return date and work restrictions. My psychiatric history stays private.
>
> Change the task to a summary for my doctor, and those medical details stay.
>
> Same notes. Different task. My name stays masked in both.

### 1:35–1:54 · What we built and where it goes

*Back to camera. Briefly show the working browser demo, then remain on camera.*

> We trained models specifically for this task, on our own data, and built the filtering system around them.
>
> Next, we’re bringing Mask into the AI tools people already use, for individuals and entire companies.

### 1:54–2:00 · End

*Hold a simple end card.*

> Mask. Your AI doesn’t need everything.

## Recording notes

- Warm up the browser model before recording. First use downloads the model. Keep real processing footage, or label any edited wait.
- Use `../corporate-support-message.txt` and the exact source and separate tasks in `../context-dependency-demo/`. Both examples are synthetic. The earlier public browser release protected all 20 targeted identifier occurrences in the corporate message; recheck with the model chosen for recording.
- The 3/2/1 complaint counts are facts preserved in the filtered text. Check the actual chatbot response separately before recording. This review did not send either input to Claude.
- Name restoration runs only in the browser and only after the click. It restores `[PERSON_n]` names, not emails or customer IDs, and the button is enabled only when Claude's reply contains one of this message's name placeholders. The complaints-summary task may not produce one, so check this in the same test run as the chatbot answer.
- Recheck both exact messages after any model or policy change. Both newer section checkpoints currently leave `C-2087` and `C-5028` in their saved corporate-gallery outputs.
- The appointment note was selected after testing alternative phrasings. It demonstrates a working behavior, not an independent accuracy result. Supply the task separately and use the saved wording.
- An animation may replay the saved transformations. Label it as an illustration of recorded outputs; do not present animation timing as inference speed. Mask prepares the input for the chatbot; these outputs are not the final manager email or GP summary.
- Keep `../consumer-budget-message.txt` as a fallback if the context-switching scene has not passed in the recording interface.
- Avoid saying “tiny model”, “zero leaks”, “same answer quality”, or “all unnecessary information disappears”. The deployed model has a substantial download, and relevance/removal errors remain.
