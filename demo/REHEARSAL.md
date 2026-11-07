# RouteSafe demo: rehearsal and recording script

This goes with `demo/STORYBOARD.md`, which sets the narration and what must be on screen. Recording is local. Uploading the video and submitting are done by the team lead.

## 1. Before you record (about 10 minutes)

1. **Start the planner.** Open a terminal in `web/` and run:
   - `npm ci`, the first time only;
   - `npm run sync`, which copies the reviewed release from this commit;
   - `npm run dev`, which serves the planner at http://localhost:5173.
2. **Start the operator workbench** in a second terminal in `web/` with `npm run operator`. It serves http://localhost:5174/operator.html.
   - It needs the private `operator-public/` folder.
   - If that folder is missing, run the inventory step in `web/README.md`, then `npm run operator:data`.
3. **Start the AI helper** in a third terminal. Load the Anthropic key from the local env file outside the repository, then run `npm run assistant`.
   - Keep this terminal **off screen**.
   - Start it **before** opening the planner. The planner checks the helper when the page loads. If you started it later, click *Check again* in the "Ask a question" box.
4. **Open the browser.**
   - One window at 1366×768, zoom 100%, light theme, no devtools, bookmarks bar hidden.
   - Tab 1: http://localhost:5173/?release=e1-aura-001&view=routes&band=06-09
   - Tab 2: http://localhost:5174/operator.html
5. **Check before recording:**
   - The header chips say "synthetic data", "not yet independently audited" and "files verified".
   - The AI badge says **AI on**.
   - The street map tiles have loaded. If they haven't, use *Simple diagram*: it works offline.
6. **Recorder.**
   - Windows: Game Bar records only the active window (Win+Alt+R to start and stop). OBS also works.
   - Record the microphone at the same time, or add the voice afterwards.

## 2. Click path, matching the storyboard timings

| Time | Where | Do exactly this |
|---|---|---|
| 0:00 | Tab 1, *Where people go*, Morning | Let the map and the top-3 list in the left panel show for 2 seconds. Hover route 1 on the map. |
| 0:08 | Tab 1 | Click **Is it safe?**. Point at the red 97.5% card, then the green "0 rows" card. Scroll a little to *Before and after*. |
| 0:24 | Tab 2, operator | Show step 1 (tiles 48 · 4 · 17 \| 11 · 37), then scroll to the step 3 table (*Person check* column). |
| 0:40 | Tab 2 | In step 2, click **A consultancy: everyone's journey rows**. The refusal appears. |
| 0:46 | Tab 2 | Click **Anyone: open demand statistics**, then scroll to step 4 (ε = 1, pending review). |
| 0:56 | Tab 1 | Click **Where people go**. Click route card 1. |
| 1:04 | Tab 1, *Ask a question* | Scroll the left panel down to *Ask a question*. Type `Which morning routes are busiest?` and press Enter. Point at "Read as: Morning 06–09 · from anywhere · top 3" and at 5,491. |
| 1:20 | Tab 1 | Click **Night** in the time-of-day bar at the top of the left panel (it stays in view). Point at the amber "Could be pure noise" note and the grey dashed routes. |
| 1:32 | Tab 1 | Click **Is it safe?** and scroll to *How close are the numbers?* and *What ε = 1 means*. |
| 1:48 | Tab 1 | Click **What's shared** and scroll to the download list. |
| 1:56 | | Stop. |

## 3. Fallbacks

- **AI offline or slow:** click the preset **Busiest morning routes?** instead and say "suggested question". It needs no key.
- **Map tiles missing:** click **Simple diagram**. It needs no network.
- **Anything looks wrong:** reload the tab. The URL keeps the view, the time band and the selected route.
- Never show the terminal, the env file or the key.

## 4. After recording

- Watch it once all the way through. It must be 2:00 or less. Check that the numbers are readable and that "synthetic data" and "pending review" are said.
- Keep a local copy and the offline build (`npm run build`, then the `web/dist/` folder).
- Publishing the video and submitting on Since AI and Devpost are human steps.
