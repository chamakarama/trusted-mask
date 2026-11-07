const message = document.getElementById("message");
const task = document.getElementById("task");
const output = document.getElementById("output");
const status = document.getElementById("status");
let revision = 0;
let timer = null;
let controller = null;

async function preview(currentRevision, attempt = 0) {
  if (currentRevision !== revision || !message.value.trim()) return;
  const requestController = new AbortController();
  controller = requestController;
  output.placeholder = "…";
  status.textContent = "Preparing local preview…";
  output.setAttribute("aria-busy", "true");
  const timeout = setTimeout(() => requestController.abort(), 60000);
  try {
    const response = await fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mask-Request": "preview" },
      body: JSON.stringify({ text: message.value, ...(task.value.trim() ? { task: task.value.trim() } : {}) }),
      cache: "no-store",
      signal: requestController.signal,
    });
    const data = await response.json();
    if (currentRevision !== revision) return;
    if (response.status === 429 && attempt < 2) {
      timer = setTimeout(() => void preview(currentRevision, attempt + 1), 750);
      return;
    }
    if (!response.ok) throw new Error("Preview unavailable. Try again.");
    if (!data.coverage?.complete || !["ready", "needs_review"].includes(data.status)
        || typeof data.payload !== "string") {
      throw new Error("Try a shorter message.");
    }
    output.value = data.payload;
    output.placeholder = "What the AI gets";
    output.title = data.status === "needs_review" ? "Draft — review before sharing" : "Protected preview";
    status.textContent = data.status === "needs_review" ? "Draft — review before sharing." : "Protected preview.";
    if (data.context_mode === "message_only") status.textContent += " Intended use taken from your message.";
  } catch (error) {
    if (currentRevision !== revision) return;
    output.value = "";
    status.textContent = "No protected preview available.";
    output.placeholder = error.name === "AbortError" ? "Try a shorter message."
      : error instanceof TypeError ? "Local model unavailable." : error.message;
  } finally {
    clearTimeout(timeout);
    if (currentRevision === revision) {
      controller = null;
      output.setAttribute("aria-busy", "false");
    }
  }
}

function invalidatePreview() {
  const currentRevision = ++revision;
  clearTimeout(timer);
  controller?.abort();
  controller = null;
  output.value = "";
  output.title = "";
  status.textContent = "";
  output.placeholder = "What the AI gets";
  output.setAttribute("aria-busy", "false");
  if (message.value.trim()) timer = setTimeout(() => void preview(currentRevision), 450);
}

message.addEventListener("input", invalidatePreview);
task.addEventListener("input", invalidatePreview);
