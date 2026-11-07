const $ = (id) => document.getElementById(id);
const message = $("message"), task = $("task"), output = $("output");
const pageId = crypto.randomUUID();
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let revision = 0, timer, previewController, sendController, current;
let provider = { configured: false }, sending = false, inspecting = false;
let rawReply = "", replyParts = [], showNames = false, complete = false;
let mode = "inline", filterAnimating = false, filterTimers = [];
let revealTimers = [], revealVersion = 0;

function post(path, kind, body, signal) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Mask-Request": kind, "X-Mask-Client": pageId }, body: JSON.stringify(body), cache: "no-store", signal });
}
function status(text = "", error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function buttons() {
  $("send").disabled = !current || !provider.configured || sending || complete || filterAnimating;
  $("filter").disabled = !message.value.trim() || Boolean(previewController) || filterAnimating || sending;
  $("stop").hidden = !sending;
  $("workspace").classList.toggle("sending", sending);
}
function clearReveal() { revealVersion++; revealTimers.forEach(clearTimeout); revealTimers = []; }
function tokens(container, text) {
  const fragment = document.createDocumentFragment();
  let end = 0;
  for (const match of text.matchAll(/\[[A-Z]+(?:_\d+)?\]/g)) {
    fragment.append(document.createTextNode(text.slice(end, match.index)));
    const span = document.createElement("span"); span.className = "token"; span.textContent = match[0];
    fragment.append(span); end = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(end)));
  container.append(fragment);
}
function visibleStream(text) {
  const start = text.lastIndexOf("[");
  if (start < 0) return text;
  const suffix = text.slice(start);
  return "[PERSON_".startsWith(suffix) || /^\[PERSON_\d*$/.test(suffix) ? text.slice(0, start) : text;
}
function renderProtected() {
  output.replaceChildren();
  if (!current) return;
  if (inspecting) {
    for (const [label, text] of [["SYSTEM", current.provider_request.system], ["MESSAGE", current.provider_request.user]]) {
      if (!text) continue;
      const heading = document.createElement("span"); heading.className = "request-label"; heading.textContent = label;
      const body = document.createElement("span"); body.className = "request-body"; body.textContent = text + "\n\n";
      output.append(heading, body);
    }
  } else {
    if (current.context_mode === "explicit_task") {
      const line = document.createElement("span"); line.className = "task-line";
      tokens(line, current.protected_task); output.append(line);
    }
    tokens(output, current.protected_text);
  }
  $("inspect").textContent = inspecting ? "Preview ↙" : "Request ↗";
  $("inspect").setAttribute("aria-pressed", String(inspecting));
  $("inspect-inline").textContent = inspecting ? "Preview ↙" : "Request ↗";
  $("inline-output").replaceChildren(...Array.from(output.childNodes, (node) => node.cloneNode(true)));
}
function clearFilterAnimation() {
  filterTimers.forEach(clearTimeout); filterTimers = []; filterAnimating = false;
}
function showFiltered() {
  message.hidden = mode === "inline";
  $("inline-output").hidden = mode !== "inline";
  $("filter").hidden = true; $("edit").hidden = false; $("inspect-inline").hidden = false;
  $("workspace").classList.add("filtered");
  $("panels").querySelector(".original-panel").classList.add("filtered");
  $("inline-count").textContent = $("change-count").textContent;
}
function animateFilter(data, version) {
  showFiltered();
  const parts = data.protected_view?.message;
  if (reducedMotion() || !Array.isArray(parts) || !parts.some((part) => Number.isInteger(part.start))) return;
  filterAnimating = true; buttons();
  const box = $("inline-output"), source = Array.from(message.value);
  box.replaceChildren();
  if (data.context_mode === "explicit_task") {
    const line = document.createElement("span"); line.className = "task-line";
    tokens(line, data.protected_task); box.append(line);
  }
  for (const part of parts) {
    if (!Number.isInteger(part.start)) { box.append(document.createTextNode(part.text)); continue; }
    const span = document.createElement("span");
    const original = source.slice(part.start, part.end).join("");
    span.textContent = original; span.className = "before-value"; box.append(span);
    if (part.action === "DROP") {
      span.replaceChildren(...Array.from(original, (letter) => {
        const dust = document.createElement("span"); dust.className = "dust"; dust.textContent = letter; return dust;
      }));
    } else filterTimers.push(setTimeout(() => {
      if (version !== revision) return;
      span.textContent = part.text; span.className = "token inline-token-morph";
    }, 260));
  }
  filterTimers.push(setTimeout(() => {
    if (version !== revision) return;
    filterAnimating = false; renderProtected(); buttons();
  }, 800));
}
function setMode(next) {
  if (mode === next) return;
  mode = next;
  $("workspace").classList.toggle("inline-mode", next === "inline");
  $("workspace").classList.toggle("compare-mode", next === "compare");
  $("mode-inline").setAttribute("aria-pressed", String(next === "inline"));
  $("mode-compare").setAttribute("aria-pressed", String(next === "compare"));
  clearFilterAnimation();
  if (current) { renderProtected(); showFiltered(); buttons(); }
  else invalidate();
}
function renderReply(animate = false) {
  clearReveal();
  const version = revealVersion;
  const box = $("reply"), nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.replaceChildren();
  if (!complete || !showNames) tokens(box, sending ? visibleStream(rawReply) : rawReply);
  else {
    let index = 0;
    for (const part of replyParts) {
      if (!part.alias) { box.append(document.createTextNode(part.text)); continue; }
      const span = document.createElement("span");
      const motion = animate && !reducedMotion();
      span.className = motion ? "token" : "restored";
      span.textContent = motion ? part.alias : part.text;
      span.title = "Restored locally from " + part.alias;
      box.append(span);
      if (motion) revealTimers.push(setTimeout(() => {
        if (version !== revealVersion) return;
        span.textContent = part.text; span.className = "restored morph";
      }, 420 + Math.min(index++, 5) * 75));
    }
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
  $("names").textContent = showNames ? "Show placeholders" : "Restore names";
  $("names").setAttribute("aria-pressed", String(showNames));
}
function resetReply() {
  clearReveal(); rawReply = ""; replyParts = []; complete = false; showNames = false;
  $("reply").replaceChildren();
  $("reply-panel").hidden = true; $("reply-panel").classList.remove("error", "streaming");
  $("workspace").classList.remove("has-reply");
  $("names").hidden = true; $("retry").hidden = true;
}
async function preview(version, attempt = 0) {
  if (version !== revision || !message.value.trim()) return;
  const controller = new AbortController(); previewController = controller;
  $("filter-label").textContent = "Filtering…";
  $("panels").querySelector(".original-panel").classList.add("filtering"); buttons();
  $("panels").querySelector(".protected-panel").classList.add("busy");
  output.dataset.placeholder = "Protecting…"; output.setAttribute("aria-busy", "true");
  status("Protecting on this device…");
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await post("/api/preview", "preview", { text: message.value, ...(task.value.trim() ? { task: task.value.trim() } : {}) }, controller.signal);
    const data = await response.json();
    if (version !== revision) return;
    if (response.status === 429 && attempt < 3) { timer = setTimeout(() => void preview(version, attempt + 1), 750); return; }
    if (!response.ok || !data.coverage?.complete || !["ready", "needs_review"].includes(data.status)
        || !data.preview_id || typeof data.provider_request?.user !== "string"
        || typeof data.protected_text !== "string") throw new Error("No complete preview. Try a shorter message.");
    current = data; renderProtected();
    const panel = $("panels").querySelector(".protected-panel");
    panel.classList.remove("reveal"); void panel.offsetWidth; panel.classList.add("ready", "reveal");
    $("change-count").textContent = `${data.change_count ?? 0} change${data.change_count === 1 ? "" : "s"}`;
    $("inspect").hidden = false;
    if (mode === "inline") animateFilter(data, version);
    status(provider.configured ? "Review, then send." : "Claude API not configured.");
  } catch (error) {
    if (version !== revision) return;
    current = null; output.replaceChildren(); output.dataset.placeholder = "What the AI gets";
    status(error.name === "AbortError" ? "Preview timed out. Try a shorter message." : error instanceof TypeError ? "Local server unavailable." : error.message, true);
    $("retry").hidden = false;
  } finally {
    clearTimeout(timeout);
    if (version === revision) {
      previewController = null; output.setAttribute("aria-busy", "false");
      $("filter-label").textContent = "Filter";
      $("panels").querySelector(".original-panel").classList.remove("filtering");
      $("panels").querySelector(".protected-panel").classList.remove("busy"); buttons();
    }
  }
}
function invalidate() {
  const version = ++revision;
  clearFilterAnimation();
  $("workspace").classList.remove("filtered");
  $("panels").querySelector(".original-panel").classList.remove("filtered", "filtering");
  message.hidden = false; $("inline-output").hidden = true; $("inline-output").replaceChildren();
  $("filter").hidden = false; $("edit").hidden = true; $("inspect-inline").hidden = true;
  $("inline-count").textContent = ""; $("filter-label").textContent = "Filter";
  clearTimeout(timer); previewController?.abort(); previewController = null;
  if (sendController && current) void post("/api/cancel", "send", { preview_id: current.preview_id }).catch(() => {});
  sendController?.abort(); sendController = null; sending = false;
  void post("/api/reset", "preview", {}).catch(() => {});
  current = null; inspecting = false;
  output.replaceChildren(); output.dataset.placeholder = "What the AI gets"; output.setAttribute("aria-busy", "false");
  $("inspect").hidden = true; $("change-count").textContent = "";
  $("panels").querySelector(".protected-panel").classList.remove("ready", "reveal", "sent", "busy");
  $("send").classList.remove("sent"); resetReply(); status(); buttons();
  if (mode === "compare" && message.value.trim()) timer = setTimeout(() => void preview(version), 450);
}
function parseFrame(frame) {
  let name = "message"; const data = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return { name, data: JSON.parse(data.join("\n") || "{}") };
}
async function send() {
  if (!current || !provider.configured || sending || complete || filterAnimating) return;
  const version = revision, approved = current;
  const controller = new AbortController(); sendController = controller; sending = true;
  rawReply = ""; replyParts = []; complete = false; showNames = false; clearReveal();
  $("reply").replaceChildren(); $("names").hidden = true; $("retry").hidden = true;
  $("reply-panel").hidden = false; $("reply-panel").classList.remove("error"); $("reply-panel").classList.add("streaming");
  $("workspace").classList.add("has-reply");
  $("panels").querySelector(".protected-panel").classList.add("sent");
  $("reply-status").textContent = provider.mock ? "Mock · no AI called" : "Connecting to Claude…";
  status(provider.mock ? "Mock provider · no AI is called." : "Sending the protected message…"); buttons();
  const timeout = setTimeout(() => controller.abort(), 150000);
  let finished = false, reader;
  const live = () => version === revision && !controller.signal.aborted;
  function handle({ name, data }) {
    if (!live()) return;
    if (name === "delta") {
      if (typeof data.raw === "string") rawReply += data.raw;
      if (Array.isArray(data.segments)) replyParts.push(...data.segments);
      $("reply-status").textContent = provider.mock ? "Mock · no AI called" : "Claude is replying…";
      status("Reply received with placeholders."); renderReply();
    } else if (name === "done") {
      complete = true; finished = true;
      $("reply-panel").classList.remove("streaming");
      const hasNames = replyParts.some((part) => part.alias);
      $("names").hidden = !hasNames;
      $("reply-status").textContent = provider.mock ? "Mock · no AI called" : data.stop_reason === "max_tokens" ? "Claude · length limit" : "Claude";
      renderReply();
      status(data.stop_reason === "max_tokens" ? "Reply reached the length limit." : "Reply received.");
    } else if (name === "error") throw new Error(data.message || "Claude could not finish. Try again.");
    else if (name === "cancelled") throw new Error("Reply stopped.");
  }
  try {
    const response = await post("/api/send", "send", { preview_id: approved.preview_id }, controller.signal);
    if (!live()) return;
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not send to Claude."); }
    if (!response.body) throw new Error("Streaming is unavailable in this browser.");
    reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    while (!finished) {
      const { value, done } = await reader.read();
      if (!live()) return;
      buffer += (done ? decoder.decode() : decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let cut;
      while (!finished && (cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        if (frame.trim()) handle(parseFrame(frame));
      }
      if (done) break;
    }
    if (!finished) throw new Error("Reply interrupted. Try again.");
  } catch (error) {
    if (version !== revision) return;
    complete = false; replyParts = []; clearReveal(); $("names").hidden = true;
    $("reply-panel").classList.add("error");
    $("reply-status").textContent = "Incomplete reply";
    renderReply();
    if (!rawReply) $("reply").dataset.placeholder = "No reply received.";
    status(controller.signal.aborted ? "Reply stopped." : error.message, true);
    $("retry").hidden = false;
    void post("/api/cancel", "send", { preview_id: approved.preview_id }).catch(() => {});
  } finally {
    clearTimeout(timeout);
    if (!finished) { try { await reader?.cancel(); } catch {} }
    if (version === revision) {
      sending = false; sendController = null;
      $("reply-panel").classList.remove("streaming"); $("send").classList.toggle("sent", complete); buttons();
    }
  }
}
message.addEventListener("input", invalidate); task.addEventListener("input", invalidate);
$("send").addEventListener("click", () => void send());
$("stop").addEventListener("click", () => { sendController?.abort(); if (current) void post("/api/cancel", "send", { preview_id: current.preview_id }).catch(() => {}); });
$("retry").addEventListener("click", () => { invalidate(); if (mode === "inline" && message.value.trim()) void preview(revision); });
$("filter").addEventListener("click", () => { if (!$("filter").disabled) void preview(revision); });
$("edit").addEventListener("click", () => { invalidate(); message.focus(); });
$("mode-inline").addEventListener("click", () => setMode("inline"));
$("mode-compare").addEventListener("click", () => setMode("compare"));
$("inspect-inline").addEventListener("click", () => { inspecting = !inspecting; renderProtected(); });
$("inspect").addEventListener("click", () => { inspecting = !inspecting; renderProtected(); });
$("names").addEventListener("click", () => {
  showNames = !showNames; renderReply(showNames);
  status(showNames ? "Names restored on this device." : "Original reply from Claude.");
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sending) $("stop").click();
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !$("send").disabled) { event.preventDefault(); void send(); }
});
window.addEventListener("pagehide", () => {
  sendController?.abort();
  void fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json", "X-Mask-Request": "preview", "X-Mask-Client": pageId }, body: "{}", keepalive: true }).catch(() => {});
});
void fetch("/api/health", { cache: "no-store" }).then(async (response) => {
  if (!response.ok) throw new Error();
  const data = await response.json();
  provider = { configured: data.provider_connected === true, mock: data.provider?.mock === true };
  if (provider.mock) status("Mock provider · no AI is called.");
  else if (!provider.configured) status("Claude API not configured.");
  buttons();
}).catch(() => status("Local server unavailable.", true));
