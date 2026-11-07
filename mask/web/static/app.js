const examples = [
  "Can you tell me about the medicine I was prescribed and explain why I was given it, based on the medical records below?\nPATIENT DETAILS\nName: Alex Bennett\nDate of birth: 14 June 1995\nPatient number: PT-482071\nEmail: alex.bennett@example.com\n\nVISIT — 29 October 2026\nReason: Runny nose and frequent sneezing.\nMedication prescribed: Cetirizine.\nFollow-up: Contact the clinic if symptoms persist.\n\nVISIT — 14 September 2026\nReason: Persistent itching around the anus.\nPatient reports: “My ass is really itchy, especially at night.”\nExamination and follow-up notes recorded separately.\n\nVISIT — 20 May 2026\nReason: Left wrist pain after a fall while cycling.\nAssessment: Wrist sprain.\nFollow-up: Symptoms improving.",
  "What are the three main things our customers are complaining about in these support tickets? Count the tickets in each category and suggest one practical improvement for each.\n\nHere’s the export from our support system:\n\ncustomer_id,customer_name,email,complaint\nC-1042,Emma Wilson,emma.wilson@example.com,\"I was charged twice for the same order. Please refund the extra payment.\"\nC-2087,Oliver Davis,oliver.davis@example.com,\"I returned my order two weeks ago and still haven’t received my refund. Please send an update to oliver.davis@example.com.\"\nC-3156,Sofia Martin,sofia.martin@example.com,\"The password-reset email never arrives, so I can’t get into my account.\"\nC-4093,Noah Taylor,noah.taylor@example.com,\"My payment failed on screen, so I tried again. Now I can see two charges for one order.\"\nC-5028,Amelia Brown,amelia.brown@example.com,\"Support confirmed my refund ten days ago, but the money still hasn’t arrived.\"\nC-6074,Lucas Harris,lucas.harris@example.com,\"Hi, Lucas Harris here. I’ve been billed twice for a single purchase and need the duplicate charge reversed.\""
];
const message = document.getElementById("message");
const output = document.getElementById("output");
const filter = document.getElementById("filter");
const example = document.getElementById("example");
const pageId = crypto.randomUUID();
const sendNote = document.getElementById("send-note");
const replyLabel = document.getElementById("reply-label");
const send = document.getElementById("send"), replySection = document.getElementById("reply-section");
const reply = document.getElementById("reply"), revert = document.getElementById("revert");
let previewId = null, sendingController = null, replyRaw = "", replyParts = [], replyDone = false;
const motionAllowed = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
function post(path, body, signal) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "X-Mask-Request": "send", "X-Mask-Client": pageId }, body: JSON.stringify(body), cache: "no-store", signal });
}
let exampleIndex = 0, revision = 0, controller = null, timers = [];
function clearTimers() { timers.forEach(clearTimeout); timers = []; }
function reset() {
  if (sendingController && previewId) void post("/api/cancel", {preview_id: previewId}).catch(() => {});
  sendingController?.abort(); sendingController = null;
  previewId = null; send.hidden = true; sendNote.hidden = true; send.disabled = false; send.classList.remove("sending");
  replySection.hidden = true; reply.replaceChildren(); replyRaw = ""; replyParts = []; replyDone = false;
  revert.disabled = true;
  revision++; controller?.abort(); controller = null; clearTimers();
  output.hidden = true; output.replaceChildren(); message.hidden = false;
  filter.textContent = "Filter"; filter.title = ""; filter.disabled = !message.value.trim();
  message.setAttribute("aria-busy", "false");
  void fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json", "X-Mask-Request": "preview", "X-Mask-Client": pageId }, body: "{}" }).catch(() => {});
}
function showProtected(text, target = output) {
  target.replaceChildren();
  appendProtected(text, target);
}
function appendProtected(text, target) {
  let cursor = 0;
  for (const match of text.matchAll(/\[[A-Z]+(?:_[A-Z]+)*(?:_\d+)?\]/g)) {
    target.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = document.createElement("span"); token.className = "token"; token.textContent = match[0]; target.append(token);
    cursor = match.index + match[0].length;
  }
  target.append(document.createTextNode(text.slice(cursor)));
}
function transform(data, source, version) {
  message.hidden = true; output.hidden = false; output.replaceChildren();
  const finish = () => {
    if (version !== revision) return;
    showProtected(data.protected_text); message.value = data.protected_text;
    filter.textContent = "Filter"; filter.disabled = true; controller = null;
    message.setAttribute("aria-busy", "false");
    previewId = data.preview_id || null; send.hidden = !previewId; sendNote.hidden = !previewId; send.disabled = false;
  };
  const parts = data.protected_view?.message;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !Array.isArray(parts) || !parts.some(p => Number.isInteger(p.start))) { finish(); return; }
  const characters = Array.from(source);
  for (const part of parts) {
    if (!Number.isInteger(part.start)) { output.append(document.createTextNode(part.text)); continue; }
    const span = document.createElement("span");
    span.textContent = characters.slice(part.start, part.end).join(""); output.append(span);
    if (part.action === "DROP") {
      span.replaceChildren(...Array.from(span.textContent, letter => {
        const dust = document.createElement("span"); dust.className = "dust"; dust.textContent = letter; return dust;
      }));
    } else timers.push(setTimeout(() => {
      if (version !== revision) return;
      span.textContent = part.text; span.className = "token morph";
    }, 230));
  }
  timers.push(setTimeout(finish, 800));
}
async function protect() {
  if (filter.disabled || !message.value.trim()) return;
  const version = revision, source = message.value;
  controller = new AbortController(); const requestController = controller;
  filter.disabled = true; filter.textContent = "Filtering…"; message.setAttribute("aria-busy", "true");
  const timeout = setTimeout(() => requestController.abort(), 60000);
  try {
    // The opening request is local task context; the complete message is still scanned.
    const task = source.split("\n")[0].trim();
    const response = await fetch("/api/preview", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Mask-Request": "preview", "X-Mask-Client": pageId },
      body: JSON.stringify({ text: source, task }), signal: requestController.signal, cache: "no-store",
    });
    const data = await response.json();
    if (version !== revision) return;
    if (!response.ok || !data.coverage?.complete || !["ready", "needs_review"].includes(data.status) || typeof data.protected_text !== "string") throw new Error("No complete preview. Try a shorter message.");
    transform(data, source, version);
  } catch (error) {
    if (version !== revision) return;
    filter.textContent = "Couldn’t filter — try again";
    filter.title = error.name === "AbortError" ? "The local model timed out." : "The local model could not complete this message.";
    filter.disabled = false; controller = null; message.setAttribute("aria-busy", "false");
  } finally { clearTimeout(timeout); }
}
message.addEventListener("input", reset);
filter.addEventListener("click", () => void protect());
example.addEventListener("click", () => {
  message.value = examples[exampleIndex]; exampleIndex = (exampleIndex + 1) % examples.length;
  reset(); message.scrollTop = 0;
  example.title = exampleIndex === 1 ? "Next example: support tickets" : "Next example: medical records";
});
function edit() {
  if (controller) return;
  output.hidden = true; message.hidden = false; message.focus();
}
output.addEventListener("click", edit);
output.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); edit(); } });

function revealReply() {
  if (!replySection.hidden) return;
  replySection.hidden = false;
  requestAnimationFrame(() => {
    if (!replySection.hidden) replySection.scrollIntoView({behavior: motionAllowed() ? "smooth" : "auto", block: "start"});
  });
}
function renderRaw() {
  const nearBottom = reply.scrollHeight - reply.scrollTop - reply.clientHeight < 60;
  // Buffer incomplete placeholders, including multi-word types such as ACCOUNT_ID.
  const partial = /\[[A-Z][A-Z_0-9]*$|\[$/.exec(replyRaw);
  showProtected(replyDone || !partial ? replyRaw : replyRaw.slice(0, partial.index), reply);
  if (nearBottom) reply.scrollTop = reply.scrollHeight;
}
async function sendProtected() {
  if (!previewId || send.disabled || sendingController) return;
  const version = revision, id = previewId;
  const active = new AbortController(); sendingController = active;
  send.disabled = true; send.classList.add("sending"); send.title = "Waiting for Claude…";
  replyRaw = ""; replyParts = []; replyDone = false; revert.disabled = true;
  reply.replaceChildren(); replySection.hidden = true;
  replyLabel.textContent = "Claude is replying…"; revealReply();
  const timeout = setTimeout(() => active.abort(), 150000);
  let reader, finished = false;
  const live = () => version === revision && !active.signal.aborted;
  function event(frame) {
    let name = "", lines = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
    }
    const data = JSON.parse(lines.join("\n") || "{}");
    if (name === "delta") {
      replyLabel.textContent = "Claude’s reply";
      if (typeof data.raw === "string") replyRaw += data.raw;
      if (Array.isArray(data.segments)) replyParts.push(...data.segments);
      revealReply(); reply.classList.add("reply-streaming"); renderRaw();
    } else if (name === "done") {
      if (!replyRaw.trim()) throw new Error("Claude returned no text. Try sending again.");
      finished = true; replyDone = true; renderRaw();
      revert.disabled = !replyParts.some(part => typeof part.alias === "string");
      revert.title = data.stop_reason === "max_tokens" ? "The reply reached its length limit." : "Restore known person names on this device only.";
    } else if (name === "error") throw new Error(data.message || "Claude could not finish. Try sending again.");
    else if (name === "cancelled") throw new Error("Reply stopped. Try sending again.");
  }
  try {
    const response = await post("/api/send", {preview_id:id}, active.signal);
    if (!live()) return;
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not reach Claude."); }
    if (!response.body) throw new Error("Streaming is unavailable in this browser.");
    reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
    while (!finished) {
      const {value,done} = await reader.read(); if (!live()) return;
      buffer += done ? decoder.decode() : decoder.decode(value,{stream:true});
      let cut;
      while (!finished && (cut=buffer.indexOf("\n\n")) >= 0) {
        const frame=buffer.slice(0,cut); buffer=buffer.slice(cut+2); if(frame.trim()) event(frame);
      }
      if(done) break;
    }
    if(!finished) throw new Error("Reply interrupted. Try sending again.");
  } catch(error) {
    if(version !== revision) return;
    replyDone=false; replyParts=[]; revert.disabled=true;
    replyLabel.textContent = "Claude’s reply";
    revealReply(); renderRaw();
    reply.append(document.createTextNode((replyRaw ? "\n\n" : "") + (active.signal.aborted ? "Claude timed out. Try sending again." : error.message)));
    send.disabled=false;
    void post("/api/cancel",{preview_id:id}).catch(()=>{});
  } finally {
    clearTimeout(timeout);
    if(!finished) { try { await reader?.cancel(); } catch {} }
    if(version===revision) { sendingController=null;send.classList.remove("sending");send.title="Send this protected message to Claude";reply.classList.remove("reply-streaming"); }
  }
}
send.addEventListener("click",()=>void sendProtected());
revert.addEventListener("click",()=>{
  if(!replyDone || revert.disabled) return;
  revert.disabled=true; const version=revision; reply.replaceChildren();
  let index=0, pendingText="";
  for(const part of replyParts) {
    if(!part.alias) {pendingText += part.text;continue;}
    appendProtected(pendingText, reply); pendingText="";
    const name=document.createElement("span"); name.className=motionAllowed()?"token":"restored";
    name.textContent=motionAllowed()?part.alias:part.text; name.title="Restored locally from "+part.alias;
    reply.append(name);
    if(motionAllowed()) timers.push(setTimeout(()=>{
      if(version!==revision)return;
      name.textContent=part.text;name.className="restored morph";
    },180+Math.min(index++,5)*65));
  }
  appendProtected(pendingText, reply);
});
window.addEventListener("pagehide",()=>{
  if(sendingController && previewId) void post("/api/cancel",{preview_id:previewId}).catch(()=>{});
  sendingController?.abort();
});

const themeButton = document.getElementById("theme");
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  themeButton.setAttribute("aria-label", label); themeButton.title = label;
  themeButton.setAttribute("aria-pressed", String(theme === "light"));
}
let savedTheme;
try { savedTheme = localStorage.getItem("mask-theme"); } catch {}
setTheme(savedTheme === "light" ? "light" : "dark");
themeButton.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  setTheme(theme);
  try { localStorage.setItem("mask-theme", theme); } catch {}
});
