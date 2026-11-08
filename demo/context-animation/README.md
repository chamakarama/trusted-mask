# Context animation

Open `index.html` in a browser. It is a self-contained, offline recording page with no dependencies or model download. It looks like a chat app's message box.

- **Space / Right arrow:** next step.
- **Left arrow / Shift+Space:** previous step.
- **R / Home:** restart.
- **H:** hide/show playback controls for recording.
- **F:** fullscreen, where supported. The browser's own fullscreen command also works.
- **`#2` or `#3` in the URL:** open directly on that step.

The three steps are:

1. **Original message:** the manager request followed by the appointment notes.
2. **Filtered for the manager:** the removed surgery line and medical-history paragraph flash rose, then fold away. The name becomes `[PERSON_1]` in violet.
3. **Filtered for the GP:** the request is selected and retyped as the GP task. The medical text returns in green, the name stays masked, and the caption “Same notes. Different task.” appears.

Each step waits for your keypress. Quick repeated presses are ignored during a transition. The page shows no chatbot reply.

The original source and output text come from the verified files in `../context-dependency-demo/`. Only paragraph layout changes for readability. The request is shown as the first paragraph of the message; in the verified model run, it was supplied through the separate intended-use field.

This page replays recorded local Mask2 results on a fictional example. It does not run the model or send anything to an AI service. The source caption under the message box remains visible when controls are hidden. `comparison.png` is a screenshot of the earlier side-by-side version.

For a local HTTP preview, run from the repository root:

```sh
python3 -m http.server 8793 --bind 127.0.0.1 --directory demo/context-animation
```

Then open `http://127.0.0.1:8793/`.
