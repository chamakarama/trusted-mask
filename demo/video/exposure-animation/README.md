# Exposure animation

A recording page for the opening “mistake” scene (0:00–0:15 in `../script-v2.0.md`). It looks like a dark chat app with the customer-complaints export ready to send. When you send it, the message moves into the conversation, the view pans and zooms onto it, and every customer detail lights up in red: 7 name mentions, 6 customer IDs and 7 email addresses. One name and one email also appear again inside complaint text. The side note then counts 6 names, 6 customer IDs and 6 email addresses.

The page is self-contained and offline. Nothing is sent anywhere, and there is no chatbot reply.

- **Click the blue send button, or press Space, Enter or Right arrow:** send.
- **Left arrow / R / Home:** back to the ready-to-send view.
- **H:** hide/show playback controls for recording. The caption “Staged example · fictional customer data” stays visible.
- **F:** fullscreen, where supported.
- **`#2` in the URL:** open directly on the final, highlighted view.

Timing after sending: about 0.8 s for the message to move, a 0.7 s pause, a 1.6 s pan, then the highlights sweep down the rows over about 3 s, and the counts appear at about 7 s. Adjust `TIMING` in the script; `pan` must match `--pan` in the CSS.

The greeting reads “Hey, Chark. Ready to dive in?”, matching the reference screenshot. Change it in the `greeting` heading if needed. The message uses `customer_name,customer_id,email,complaint` column order; `../../corporate-support-message.txt`, which the Mask recording uses, has `customer_id` first.

For a local HTTP preview, run from the repository root:

```sh
python3 -m http.server 8794 --bind 127.0.0.1 --directory demo/video
```

Then open `http://127.0.0.1:8794/exposure-animation/`.
