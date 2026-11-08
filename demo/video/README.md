# Demo video

Working folder for the two-minute demo video.

| File | Use |
| --- | --- |
| [script-v2.0.md](script-v2.0.md) | Copy of the video script. The original stays at `../script-v2.0.md`, which the submission README links to. Edit one and copy it to the other so they stay the same. |
| [exposure-animation/](exposure-animation/README.md) | 0:00–0:15 “the mistake”: a dark chat app sends the customer export, then zooms in and highlights every exposed name, customer ID and email. |
| [context-animation/](context-animation/README.md) | 1:10–1:35 consumer scene: one note, filtered for the manager, then for the GP. Shot notes are in `../consumer-context-animation.md`. |

Both pages are offline, replay fixed fictional data, and send nothing anywhere. To serve them, run this from the repository root:

```sh
python3 -m http.server 8794 --bind 127.0.0.1 --directory demo/video
```

Then open `http://127.0.0.1:8794/exposure-animation/` or `http://127.0.0.1:8794/context-animation/`.
