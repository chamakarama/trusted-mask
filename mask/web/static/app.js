// Mask round trip: protect locally -> review -> send the approved protected message -> stream the reply ->
// restore known names locally (the server does the restoring; this page only renders text, never HTML).
const $ = (id) => document.getElementById(id);
const message = $("message");
const task = $("task");
const protectedView = $("protected");
const changeCount = $("change-count");
const sendButton = $("send");
const stopButton = $("stop");
const retryButton = $("retry");
const providerLabel = $("provider");
const status = $("status");
const steps = $("steps");
const reply = $("view-reply");
const raw = $("view-raw");
const sentSystem = $("sent-system");
const sentUser = $("sent-user");
const mockBadge = $("mock-badge");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ORDER = ["protecting", "review", "sending", "receiving", "complete"];

let revision = 0;
let timer = null;
let previewController = null;
let sendController = null;
let current = null;            // { id, request } of the reviewed preview
let provider = { configured: false };
let state = "idle";
let stepIndex = -1;
// Scopes previews to this page so another open tab cannot invalidate this one's approval or reply.
const pageId = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);

function post(path, kind, body, signal) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mask-Request": kind, "X-Mask-Client": pageId },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
}

function setState(next, text = "", isError = false) {
  state = next;
  if (ORDER.includes(next)) stepIndex = ORDER.indexOf(next);
  else if (next === "idle") stepIndex = -1;
  else if (next === "unavailable") stepIndex = 0;
  const failed = ["error", "cancelled", "unavailable"].includes(next);
  [...steps.children].forEach((item, index) => {
    item.classList.toggle("done", index < stepIndex);
    item.classList.toggle("now", index === stepIndex);
    item.classList.toggle("fail", failed && index === stepIndex);
    if (index === stepIndex) item.setAttribute("aria-current", "step"); else item.removeAttribute("aria-current");
  });
  status.textContent = text;
  status.classList.toggle("error", isError);
  reply.classList.toggle("streaming", next === "sending" || next === "receiving");
  updateButtons();
}

function updateButtons() {
  const streaming = state === "sending" || state === "receiving";
  sendButton.disabled = !(state === "review" && current && provider.configured);
  sendButton.textContent = provider.configured || !current ? "Send protected message" : "API not configured";
  stopButton.hidden = !streaming;
  retryButton.hidden = !((state === "error" || state === "cancelled") && current && provider.configured);
}

function placeholder(text) {
  const p = document.createElement("p");
  p.className = "placeholder";
  p.textContent = text;
  return p;
}

const ACTION_CLASS = { ALIAS: "alias", PLACEHOLDER: "placeholder", GENERALISE: "generalise", DROP: "drop" };
const ACTION_HINT = {
  ALIAS: "name replaced with a label; restored on this computer when the reply arrives",
  PLACEHOLDER: "replaced with a generic placeholder; never restored",
  GENERALISE: "made less exact",
  DROP: "removed before sending",
};

function chipNodes(parts, counter) {
  return parts.map((part) => {
    if (!part.label) return document.createTextNode(String(part.text ?? ""));
    const chip = document.createElement("span");
    const action = String(part.action || "PLACEHOLDER").toUpperCase();
    const label = String(part.label);
    chip.className = `chip ${ACTION_CLASS[action] || "placeholder"}`;
    chip.textContent = action === "DROP" ? `${label.toLowerCase()} removed` : String(part.text ?? "");
    chip.title = `${label}: ${ACTION_HINT[action] || "changed"}`;
    chip.setAttribute("aria-label", `${chip.textContent} (${label}, ${ACTION_HINT[action] || "changed"})`);
    chip.style.setProperty("--i", String(counter.n++));
    return chip;
  });
}

function renderProtected(view, request) {
  const counter = { n: 0 };
  const nodes = [];
  if (Array.isArray(view?.task)) {
    const line = document.createElement("span");
    line.className = "task-line";
    line.append("Task: ", ...chipNodes(view.task, counter));
    nodes.push(line);
  }
  nodes.push(...(Array.isArray(view?.message) ? chipNodes(view.message, counter) : [document.createTextNode(request.user)]));
  protectedView.classList.remove("animate");
  protectedView.replaceChildren(...nodes);
  if (!reduceMotion) {
    void protectedView.offsetWidth;   // restart the chip animation
    protectedView.classList.add("animate");
  }
  changeCount.textContent = counter.n === 0 ? "No changes needed" : `${counter.n} change${counter.n === 1 ? "" : "s"}`;
  sentSystem.textContent = request.system ?? "(none)";
  sentUser.textContent = request.user;
}

function clearReply() {
  reply.replaceChildren();
  raw.textContent = "";
  mockBadge.hidden = true;
}

async function preview(currentRevision, attempt = 0) {
  if (currentRevision !== revision || !message.value.trim()) return;
  const controller = new AbortController();
  previewController = controller;
  setState("protecting", "Protecting on this computer…");
  protectedView.classList.add("busy");
  protectedView.setAttribute("aria-busy", "true");
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const body = { text: message.value, ...(task.value.trim() ? { task: task.value.trim() } : {}) };
    const response = await post("/api/preview", "preview", body, controller.signal);
    const data = await response.json();
    if (currentRevision !== revision) return;
    if (response.status === 429 && attempt < 2) {
      timer = setTimeout(() => void preview(currentRevision, attempt + 1), 750);
      return;
    }
    if (!response.ok) throw new Error("Preview unavailable. Try again.");
    if (!data.coverage?.complete || !["ready", "needs_review"].includes(data.status) || typeof data.payload !== "string"
        || typeof data.preview_id !== "string" || typeof data.provider_request?.user !== "string") {
      throw new Error("Try a shorter message.");
    }
    current = { id: data.preview_id, request: data.provider_request };
    renderProtected(data.protected_view, data.provider_request);
    let note = "Check what the AI will see, then send.";
    if (data.context_mode === "message_only") note += " Intended use taken from your message.";
    setState("review", note);
  } catch (error) {
    if (currentRevision !== revision) return;
    current = null;
    changeCount.textContent = "";
    protectedView.replaceChildren(placeholder(error.name === "AbortError" ? "Try a shorter message."
      : error instanceof TypeError ? "Local model unavailable." : error.message));
    setState("unavailable", "No protected preview available.", true);
  } finally {
    clearTimeout(timeout);
    if (currentRevision === revision) {
      previewController = null;
      protectedView.classList.remove("busy");
      protectedView.setAttribute("aria-busy", "false");
    }
  }
}

function abortStream() {
  const controller = sendController;
  sendController = null;
  controller?.abort();
}

function invalidate() {
  const currentRevision = ++revision;
  clearTimeout(timer);
  previewController?.abort();
  previewController = null;
  abortStream();
  // The old preview and its approval die now, not when the next preview arrives.
  if (current) void post("/api/reset", "preview", {}).catch(() => {});
  current = null;
  protectedView.classList.remove("animate");
  protectedView.replaceChildren(placeholder("Your protected message appears here."));
  changeCount.textContent = "";
  sentSystem.textContent = "";
  sentUser.textContent = "";
  clearReply();
  setState("idle");
  if (message.value.trim()) timer = setTimeout(() => void preview(currentRevision), 450);
}

function appendText(container, text) {
  if (!text) return;
  const last = container.lastChild;
  if (last && last.nodeType === 3) last.appendData(text);
  else container.append(document.createTextNode(text));
}

function appendSegments(segments) {
  for (const segment of Array.isArray(segments) ? segments : []) {
    const text = String(segment?.text ?? "");
    if (typeof segment?.alias === "string") {
      const name = document.createElement("span");
      name.className = reduceMotion ? "name settled" : "name reveal";
      name.textContent = text;
      name.title = `Restored on this computer from ${segment.alias}`;
      reply.append(name);
      if (!reduceMotion) setTimeout(() => name.classList.add("settled"), 1400);
    } else {
      appendText(reply, text);
    }
  }
}

function parseFrame(frame) {
  let name = "message";
  const data = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event: ")) name = line.slice(7).trim();
    else if (line.startsWith("data: ")) data.push(line.slice(6));
  }
  try {
    return { name, data: JSON.parse(data.join("\n") || "{}") };
  } catch {
    return { name: "error", data: { message: "The reply could not be read." } };
  }
}

// Returns true for a terminal event.
function handleEvent({ name, data }) {
  if (name === "start") {
    mockBadge.hidden = !data.mock;
    return false;
  }
  if (name === "delta") {
    if (state === "sending") setState("receiving", "Receiving — names are put back on this computer as they arrive.");
    appendSegments(data.segments);
    appendText(raw, typeof data.raw === "string" ? data.raw : "");
    return false;
  }
  if (name === "done") {
    const count = Number(data.names) || 0;
    setState("complete", count ? `Done. ${count} name${count === 1 ? "" : "s"} put back on this computer — the AI never saw ${count === 1 ? "it" : "them"}.`
      : "Done. No names needed putting back.");
    return true;
  }
  if (name === "cancelled") {
    setState("cancelled", data.reason === "stale" ? "Stopped because the message changed." : "Stopped. You can retry the same protected message.");
    return true;
  }
  if (name === "error") {
    setState("error", String(data.message || "The AI reply failed. Try again."), true);
    return true;
  }
  return false;
}

async function send() {
  if (!current || !provider.configured || sendController || !["review", "error", "cancelled"].includes(state)) return;
  const currentRevision = revision;
  const controller = new AbortController();
  sendController = controller;
  const preview_id = current.id;
  clearReply();
  selectTab(tabs[0], false);
  setState("sending", `Sending the protected message to ${provider.mock ? "the mock provider" : "the AI"}…`);
  const timeout = setTimeout(() => controller.abort(), 180000);
  const live = () => currentRevision === revision && sendController === controller;
  try {
    const response = await post("/api/send", "send", { preview_id }, controller.signal);
    if (!live()) return;
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch { /* keep the generic message */ }
      if (!live()) return;
      if (data.code === "stale") {
        // Expired on the server: protect the same text again; the user reviews before anything is sent.
        sendController = null;
        current = null;
        setState("idle", "That preview expired. Protecting again — review before sending.");
        void preview(++revision);
        return;
      }
      if (data.code === "not_configured") provider = { configured: false };
      setState("error", String(data.error || "The AI could not be reached. Try again."), true);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (!live()) { void reader.cancel?.().catch?.(() => {}); return; }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while (!finished && (cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        finished = handleEvent(parseFrame(frame));
      }
    }
    if (!finished && live()) setState("error", "The reply ended unexpectedly. Try again.", true);
  } catch (error) {
    if (!live()) return;
    if (error.name === "AbortError") setState("error", "The AI took too long to reply. Try again.", true);
    else setState("error", "Could not reach the local server. Try again.", true);
  } finally {
    clearTimeout(timeout);
    if (sendController === controller) sendController = null;
    updateButtons();
  }
}

function stop() {
  if (!sendController || !current) return;
  void post("/api/cancel", "send", { preview_id: current.id }).catch(() => {});
  abortStream();
  setState("cancelled", "Stopped. You can retry the same protected message.");
}

function selectTab(tab, focus = true) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    $(item.getAttribute("aria-controls")).hidden = !selected;
  }
  if (focus) tab.focus();
}

async function loadProvider() {
  try {
    const response = await fetch("/api/health", { cache: "no-store", headers: { "X-Mask-Request": "preview" } });
    const data = await response.json();
    const info = data.provider || {};
    provider = { configured: data.provider_connected === true, mock: info.mock === true, model: info.model, name: info.provider };
  } catch {
    provider = { configured: false };
  }
  providerLabel.textContent = !provider.configured ? "API not configured"
    : provider.mock ? "Mock provider — no AI is called"
    : `${provider.name === "anthropic" ? "Claude" : String(provider.name)} · ${String(provider.model)}`;
  updateButtons();
}

message.addEventListener("input", invalidate);
task.addEventListener("input", invalidate);
sendButton.addEventListener("click", () => void send());
retryButton.addEventListener("click", () => void send());
stopButton.addEventListener("click", stop);
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    selectTab(tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]);
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && state === "review") { event.preventDefault(); void send(); }
  if (event.key === "Escape" && (state === "sending" || state === "receiving")) stop();
});

setState("idle");
void loadProvider();
