# Consumer scene: same notes, different task

Shot sequence for the 1:05–1:30 consumer scene in [script-v2.0.md](script-v2.0.md). It shows context-dependent filtering after the corporate scene has established basic identifier masking.

The recording page is [context-animation/index.html](context-animation/index.html). Open it in a browser and use **Space** or **Right arrow** to advance through the three steps. **Left arrow** goes back, **R** restarts, **F** enters fullscreen, and **H** hides the controls. The page is a single chat-style message box: original message, filtered for the manager, then the task retyped and filtered for the GP with the caption. See [playback instructions](context-animation/README.md).

Use the exact 80-word synthetic appointment note and tasks in [context-dependency-demo](context-dependency-demo/README.md).

## What the animation shows

Show one chat message box. The intended task is its first paragraph, followed by the notes; filtering happens in place. Use a readable close-up; the viewer does not need to read every word.

| Seconds within scene | Picture | Voiceover |
|---|---|---|
| 0–4 | Same appointment note, then manager task. Mask the name. | Now, the same idea with my own medical notes. |
| 4–12 | Hold on the retained return date and restrictions. The surgery sentence and psychiatric-history paragraph slide out of the filtered version. | For an email to my manager, Mask keeps my return date and work restrictions. My psychiatric history stays private. |
| 12–20 | Change only the task to a GP summary. The medical text returns to the filtered version. Keep the original source still. | Change the task to a summary for my doctor, and those medical details stay. |
| 20–25 | Hold on the GP version. Name remains `[PERSON_1]`. Caption: “Same notes. Different task.” | Same notes. Different task. My name stays masked in both. |

Use short shot labels “Email to my manager” and “Summary for my GP”, but supply the complete saved tasks to the model. Animate movement and reflow over roughly half a second, then hold each result. Do not loop or add a third task. Avoid showing a chatbot reply in this scene; the corporate scene already demonstrates that step.

## Match the observed behavior

- **Manager:** keeps the introduction, work-from-home days, return date, physical restrictions and review date. Removes “Recovering well after knee surgery.” and the entire final medical-history paragraph.
- **GP:** keeps all the source content except the name, which becomes `[PERSON_1]`. It also keeps the work details; do not animate those disappearing.
- **Both:** replace Emma Wilson with `[PERSON_1]`.

The source is fictional. The recorded local application outputs are in `context-dependency-demo/*-protected.txt`. The scene illustrates those transformations, not medical advice or a generated downstream response. For an animated replay, use a small caption such as “Recorded Mask2 outputs · fictional example”. If recording the browser, first reproduce both exact results there using Mask2 and the separate intended-use field.

The saved original verification and the repeat run are under `evidence/privacy-v1/context-demo-20261108/`. This selected example is not an independent benchmark of general context understanding.
