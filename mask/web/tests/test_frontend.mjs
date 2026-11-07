import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
const html = readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
const result = { status: "needs_review", preview_id: "opaque-preview", payload: "instruction\nHello [PERSON_1]", protected_text: "Hello [PERSON_1]", protected_task: "Write to [PERSON_1]", provider_request: { system: "Use labels verbatim.", user: "Hello [PERSON_1]" }, coverage: { complete: true }, context_mode: "message_only", change_count: 1 };
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
function stream(events, chunkSize = 3) {
  const data = new TextEncoder().encode(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(""));
  return { ok: true, body: new ReadableStream({ start(controller) {
    for (let i = 0; i < data.length; i += chunkSize) controller.enqueue(data.slice(i, i + chunkSize));
    controller.close();
  } }) };
}
function setup({ preview = () => json(result), send, configured = true, mock = false, mode = "compare", motion = false } = {}) {
  const dom = new JSDOM(html, { url: "http://127.0.0.1:8788", runScripts: "outside-only" });
  const { window } = dom;
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay) => timeout(fn, delay === 450 ? 0 : delay);
  window.TextDecoder = TextDecoder;
  window.matchMedia = () => ({ matches: !motion });
  const calls = [];
  window.fetch = async (path, options) => {
    calls.push({ path, options });
    if (path === "/api/health") return json({ provider_connected: configured, provider: { mock } });
    if (path === "/api/preview") return preview();
    if (path === "/api/send") return send ? send() : json({ error: "Not configured" }, 503);
    return json({ status: "reset" });
  };
  window.eval(script);
  const $ = (id) => window.document.getElementById(id);
  const type = (value) => { $("message").value = value; $("message").dispatchEvent(new window.Event("input")); };
  const purpose = (value) => { $("task").value = value; $("task").dispatchEvent(new window.Event("input")); };
  if (mode === "compare") $("mode-compare").click();
  return { window, $, type, purpose, calls: (path) => calls.filter((c) => c.path === path), close: () => window.close() };
}
test("minimal two-box layout, optional purpose, explicit send, no automatic provider call", async () => {
  const ui = setup();
  try {
    assert.equal(ui.window.document.querySelectorAll("h1,h2,header,footer").length, 0);
    assert.equal(ui.$("reply-panel").hidden, true);
    ui.type("Hello Emma"); await flush();
    assert.equal(ui.$("output").textContent, result.protected_text);
    assert.deepEqual(JSON.parse(ui.calls("/api/preview")[0].options.body), { text: "Hello Emma" });
    assert.ok(ui.calls("/api/preview")[0].options.headers["X-Mask-Client"].length >= 20);
    assert.equal(ui.$("send").disabled, false);
    assert.equal(ui.calls("/api/send").length, 0);
    ui.$("inspect").click();
    assert.match(ui.$("output").textContent, /Use labels verbatim/);
    ui.$("inspect").click(); assert.equal(ui.$("output").textContent, result.protected_text);
  } finally { ui.close(); }
});
test("purpose edits clear the approved preview and reset its server session", async () => {
  const ui = setup();
  try {
    ui.type("Hello Emma"); await flush(); ui.purpose(" Write a letter ");
    assert.equal(ui.$("output").textContent, ""); assert.equal(ui.$("send").disabled, true);
    await flush();
    assert.equal(JSON.parse(ui.calls("/api/preview")[1].options.body).task, "Write a letter");
    assert.equal(ui.calls("/api/reset").length, 3);
  } finally { ui.close(); }
});
test("obsolete inference cannot restore a preview after an edit", async () => {
  const resolves = [];
  const ui = setup({ preview: () => new Promise((resolve) => resolves.push(resolve)) });
  try {
    ui.type("First"); await flush(); ui.purpose("New purpose"); await flush();
    resolves[1](json({ ...result, protected_text: "New result" })); await flush();
    resolves[0](json({ ...result, protected_text: "Old result" })); await flush();
    assert.equal(ui.$("output").textContent, "New result");
    ui.type(""); assert.equal(ui.$("output").textContent, "");
  } finally { ui.close(); }
});
test("partial inference and absent provider fail closed", async () => {
  const ui = setup({ preview: () => json({ ...result, coverage: { complete: false } }) });
  const noKey = setup({ configured: false });
  try {
    ui.type("Message"); noKey.type("Message"); await flush();
    assert.equal(ui.$("output").textContent, ""); assert.equal(ui.$("send").disabled, true);
    assert.match(ui.$("status").textContent, /No complete preview/);
    assert.equal(noKey.$("send").disabled, true); assert.match(noKey.$("status").textContent, /not configured/);
  } finally { ui.close(); noKey.close(); }
});
test("split UTF-8 and placeholders stream, names restore locally, raw reply stays available", async () => {
  const events = [["start", {}], ["delta", { raw: "Hi [PER", segments: [{ text: "Hi " }] }],
    ["delta", { raw: "SON_1] — hello!", segments: [{ text: "Emma", alias: "[PERSON_1]" }, { text: " — hello!" }] }], ["done", { names: 1, stop_reason: "end_turn" }]];
  const ui = setup({ send: () => stream(events) });
  try {
    ui.type("Hello Emma"); await flush(); ui.$("send").click(); await flush();
    assert.equal(ui.$("reply-panel").hidden, false); assert.equal(ui.$("reply").textContent, "Hi [PERSON_1] — hello!");
    ui.$("names").click(); assert.equal(ui.$("reply").textContent, "Hi Emma — hello!");
    assert.equal(ui.$("reply").querySelector(".restored").textContent, "Emma");
    assert.deepEqual(JSON.parse(ui.calls("/api/send")[0].options.body), { preview_id: "opaque-preview" });
    assert.equal(ui.calls("/api/send")[0].options.headers["X-Mask-Request"], "send");
    ui.$("names").click(); assert.equal(ui.$("reply").textContent, "Hi [PERSON_1] — hello!");
    ui.$("names").click(); assert.equal(ui.$("reply").textContent, "Hi Emma — hello!");
    ui.$("send").click(); assert.equal(ui.calls("/api/send").length, 1);
  } finally { ui.close(); }
});
test("names remain placeholders while the provider is still writing", async () => {
  let push;
  const response = { ok: true, body: new ReadableStream({ start(controller) { push = controller; } }) };
  const ui = setup({ send: () => response });
  try {
    ui.type("Hello Emma"); await flush(); ui.$("send").click(); await flush();
    push.enqueue(new TextEncoder().encode('event: delta\ndata: {"raw":"Hi [PERSON_1]","segments":[{"text":"Hi "},{"text":"Emma","alias":"[PERSON_1]"}]}\n\n'));
    await flush(); assert.equal(ui.$("reply").textContent, "Hi [PERSON_1]");
    assert.equal(ui.$("names").hidden, true);
    push.enqueue(new TextEncoder().encode('event: done\ndata: {"names":1}\n\n')); push.close();
    await flush(); assert.equal(ui.$("reply").textContent, "Hi [PERSON_1]");
    ui.$("names").click(); assert.equal(ui.$("reply").textContent, "Hi Emma");
  } finally { ui.close(); }
});
test("HTML-like reply text and restored names never become markup", async () => {
  const text = '<img src=x onerror="alert(1)">';
  const ui = setup({ preview: () => json({ ...result, protected_text: text }), send: () => stream([
    ["delta", { raw: text + " [PERSON_1]", segments: [{ text }, { text: "<script>bad()</script>", alias: "[PERSON_1]" }] }], ["done", {}]]) });
  try {
    ui.type("Message"); await flush(); ui.$("send").click(); await flush();
    ui.$("names").click();
    assert.equal(ui.window.document.querySelector("img"), null); assert.equal(ui.$("reply").querySelector("script"), null);
    assert.match(ui.$("reply").textContent, /<script>/);
  } finally { ui.close(); }
});
test("provider error and truncated stream never claim successful restoration", async () => {
  for (const events of [[["error", { message: "Claude rejected the key." }]], [["delta", { raw: "Partial [PERSON_1]", segments: [{ text: "Partial " }, { text: "Emma", alias: "[PERSON_1]" }] }]]]) {
    const ui = setup({ send: () => stream(events) });
    try {
      ui.type("Message"); await flush(); ui.$("send").click(); await flush();
      assert.equal(ui.$("reply-status").textContent, "Incomplete reply");
      assert.equal(ui.$("names").hidden, true); assert.equal(ui.$("retry").hidden, false);
      assert.doesNotMatch(ui.$("reply").textContent, /Emma/);
    } finally { ui.close(); }
  }
});
test("editing during a send cancels and ignores the obsolete reply", async () => {
  let finish;
  const ui = setup({ send: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    ui.type("First"); await flush(); ui.$("send").click(); await flush(); ui.type("");
    assert.equal(ui.calls("/api/send")[0].options.signal.aborted, true);
    assert.equal(ui.calls("/api/cancel").length, 1);
    finish(stream([["delta", { raw: "OBSOLETE" }], ["done", {}]])); await flush();
    assert.equal(ui.$("reply-panel").hidden, true); assert.equal(ui.$("reply").textContent, "");
  } finally { ui.close(); }
});
test("stop aborts and sends cancellation, and mock provider is clearly labelled", async () => {
  let finish;
  const ui = setup({ mock: true, send: () => new Promise((resolve) => { finish = resolve; }) });
  try {
    ui.type("Message"); await flush(); ui.$("send").click(); await flush();
    assert.match(ui.$("reply-status").textContent, /Mock/);
    ui.$("stop").click();
    assert.equal(ui.calls("/api/send")[0].options.signal.aborted, true);
    assert.equal(ui.calls("/api/cancel").length, 1);
    finish(stream([])); await flush();
    assert.equal(ui.$("stop").hidden, true);
  } finally { ui.close(); }
});

test("Inline waits for Filter, keeps the original for Edit, and shares its preview with Compare", async () => {
  const ui = setup({ mode: "inline" });
  try {
    ui.type("Hello Emma"); await flush();
    assert.equal(ui.calls("/api/preview").length, 0);
    assert.equal(ui.$("filter").disabled, false);
    ui.$("filter").click(); await flush();
    assert.equal(ui.$("inline-output").textContent, "Hello [PERSON_1]");
    assert.equal(ui.$("message").hidden, true);
    assert.equal(ui.$("message").value, "Hello Emma");
    assert.equal(ui.$("send").disabled, false);
    ui.$("mode-compare").click();
    assert.equal(ui.$("message").hidden, false);
    assert.equal(ui.$("output").textContent, "Hello [PERSON_1]");
    assert.equal(ui.calls("/api/preview").length, 1);
    ui.$("mode-inline").click(); ui.$("edit").click();
    assert.equal(ui.$("message").hidden, false); assert.equal(ui.$("send").disabled, true);
    assert.equal(ui.$("inline-output").textContent, "");
  } finally { ui.close(); }
});
test("Inline animates exact Unicode edits and real DROP ranges, then discards removed text", async () => {
  const data = { ...result, protected_text: "😀 [PERSON_1].", change_count: 2,
    protected_view: { message: [{ text: "😀 " }, { text: "[PERSON_1]", label: "PERSON", action: "ALIAS", start: 2, end: 6 }, { text: "." }, { text: "", label: "HEALTH", action: "DROP", start: 7, end: 15 }] } };
  const ui = setup({ mode: "inline", motion: true, preview: () => json(data) });
  try {
    ui.type("😀 Emma. Secret."); ui.$("filter").click(); await flush();
    assert.equal(ui.$("send").disabled, true);
    assert.match(ui.$("inline-output").textContent, /Emma/);
    assert.ok(ui.$("inline-output").querySelectorAll(".dust").length > 0);
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(ui.$("inline-output").textContent, "😀 [PERSON_1].");
    assert.equal(ui.$("inline-output").querySelector(".dust"), null);
    assert.equal(ui.$("send").disabled, false);
  } finally { ui.close(); }
});
test("editing during an Inline animation cannot bring back the old protected output", async () => {
  const data = { ...result, protected_view: { message: [{ text: "Hello " }, { text: "[PERSON_1]", label: "PERSON", action: "ALIAS", start: 6, end: 10 }] } };
  const ui = setup({ mode: "inline", motion: true, preview: () => json(data) });
  try {
    ui.type("Hello Emma"); ui.$("filter").click(); await flush();
    ui.purpose("New task");
    await new Promise((resolve) => setTimeout(resolve, 850));
    assert.equal(ui.$("inline-output").textContent, ""); assert.equal(ui.$("send").disabled, true);
    assert.equal(ui.$("message").hidden, false);
  } finally { ui.close(); }
});
