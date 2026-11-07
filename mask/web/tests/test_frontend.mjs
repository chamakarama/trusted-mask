import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const request = { system: "Privacy note: labels are redacted.", user: "Task: Write to [PERSON_1]\n\nHello [PERSON_1], see [EMAIL]" };
const previewResult = (extra = {}) => ({
  status: "needs_review", payload: `${request.system}\n\n${request.user}`, coverage: { complete: true },
  context_mode: "explicit_task", preview_id: "p1", provider_request: request,
  protected_view: {
    task: [{ text: "Write to " }, { text: "[PERSON_1]", label: "PERSON", action: "ALIAS" }],
    message: [{ text: "Hello " }, { text: "[PERSON_1]", label: "PERSON", action: "ALIAS" }, { text: ", see " },
      { text: "[EMAIL]", label: "EMAIL", action: "PLACEHOLDER" }],
  },
  ...extra,
});
const health = (provider = { provider: "anthropic", model: "claude-opus-5-5", mock: false }) =>
  ({ status: "available", provider_connected: !!provider, provider: provider || { reason: "API not configured" } });
const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const frame = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

// A controllable SSE body: push(text) delivers bytes, end() closes the stream.
function sse() {
  const queue = [];
  const waiters = [];
  let closed = false;
  const encoder = new TextEncoder();
  const deliver = (item) => (waiters.length ? waiters.shift()(item) : queue.push(item));
  return {
    response: { ok: true, status: 200, body: { getReader: () => ({
      read: () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve({ done: true }) : new Promise((r) => waiters.push(r))),
      cancel: async () => {},
    }) } },
    push: (text) => deliver({ value: encoder.encode(text), done: false }),
    end: () => { closed = true; deliver({ done: true }); },
  };
}

function setup(routes = {}) {
  const dom = new JSDOM(html, { url: "http://127.0.0.1:8787", runScripts: "outside-only" });
  const { window } = dom;
  window.TextDecoder = TextDecoder;
  window.TextEncoder = TextEncoder;
  const originalTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay) => originalTimeout(fn, delay === 450 ? 0 : delay);
  const calls = [];
  window.fetch = async (path, options = {}) => {
    calls.push({ path, options, body: options.body ? JSON.parse(options.body) : undefined });
    const route = routes[path];
    if (!route) return json({}, 404);
    return route(options, calls);
  };
  routes["/api/health"] ||= async () => json(health());
  routes["/api/reset"] ||= async () => json({ status: "reset" });
  routes["/api/cancel"] ||= async () => json({ cancelled: true });
  window.eval(script);
  const $ = (id) => window.document.getElementById(id);
  const type = (value) => { $("message").value = value; $("message").dispatchEvent(new window.Event("input", { bubbles: true })); };
  const setPurpose = (value) => { $("task").value = value; $("task").dispatchEvent(new window.Event("input", { bubbles: true })); };
  const sent = () => calls.filter((c) => c.path === "/api/send");
  const previews = () => calls.filter((c) => c.path === "/api/preview");
  return { window, $, type, setPurpose, calls, sent, previews };
}

test("protected preview renders chips as text and enables an explicit send", async () => {
  const ui = setup({ "/api/preview": async () => json(previewResult()) });
  try {
    await flush();
    assert.equal(ui.$("send").disabled, true);
    assert.match(ui.$("provider").textContent, /Claude · claude-opus-5-5/);
    ui.setPurpose("  Write to Jane Doe  ");
    ui.type("Hello Jane Doe, see jane@example.invalid"); await flush();
    assert.deepEqual(ui.previews()[0].body, { text: "Hello Jane Doe, see jane@example.invalid", task: "Write to Jane Doe" });
    const chips = [...ui.$("protected").querySelectorAll(".chip")].map((c) => c.textContent);
    assert.deepEqual(chips, ["[PERSON_1]", "[PERSON_1]", "[EMAIL]"]);
    assert.equal(ui.$("protected").textContent, "Task: Write to [PERSON_1]Hello [PERSON_1], see [EMAIL]");
    assert.equal(ui.$("change-count").textContent, "3 changes");
    assert.equal(ui.$("send").disabled, false);
    assert.equal(ui.sent().length, 0, "nothing is sent before the user presses send");
    assert.equal(ui.$("sent-user").textContent, request.user);
    assert.match(ui.$("status").textContent, /Check what the AI will see/);
  } finally { ui.window.close(); }
});

test("send posts only the preview id, streams restored names, and keeps raw and sent views", async () => {
  const stream = sse();
  const ui = setup({ "/api/preview": async () => json(previewResult()), "/api/send": async () => stream.response });
  try {
    ui.type("Hello Jane Doe"); await flush();
    ui.$("send").click(); await flush();
    assert.deepEqual(ui.sent()[0].body, { preview_id: "p1" });
    assert.equal(ui.sent()[0].options.headers["X-Mask-Request"], "send");
    const pageIds = new Set(ui.calls.filter((c) => c.options.method === "POST").map((c) => c.options.headers["X-Mask-Client"]));
    assert.equal(pageIds.size, 1);
    assert.match([...pageIds][0], /^[A-Za-z0-9_-]{8,64}$/);
    assert.equal(ui.$("send").disabled, true);
    assert.equal(ui.$("stop").hidden, false);
    stream.push(frame("start", { provider: "anthropic", model: "claude-opus-5-5", mock: false }));
    stream.push(frame("delta", { raw: "Dear [PERS", segments: [{ text: "Dear " }] }).slice(0, 20));
    await flush();
    stream.push(frame("delta", { raw: "Dear [PERS", segments: [{ text: "Dear " }] }).slice(20));
    stream.push(frame("delta", { raw: "ON_1], hi", segments: [{ text: "Jane Doe", alias: "[PERSON_1]" }, { text: ", hi" }] }));
    await flush();
    assert.match(ui.$("status").textContent, /Receiving/);
    stream.push(frame("done", { restored: 1, names: 1 })); stream.end();
    await flush();
    assert.equal(ui.$("view-reply").textContent, "Dear Jane Doe, hi");
    assert.equal(ui.$("view-reply").querySelector(".name").textContent, "Jane Doe");
    assert.equal(ui.$("view-raw").textContent, "Dear [PERSON_1], hi");
    assert.match(ui.$("status").textContent, /1 name put back on this computer/);
    assert.equal(ui.$("send").disabled, true, "a completed preview cannot be sent twice");
    assert.equal(ui.$("stop").hidden, true);
    assert.equal(ui.$("mock-badge").hidden, true);
    ui.$("send").click(); await flush();
    assert.equal(ui.sent().length, 1);
  } finally { ui.window.close(); }
});

test("double clicking send sends once", async () => {
  const stream = sse();
  const ui = setup({ "/api/preview": async () => json(previewResult()), "/api/send": async () => stream.response });
  try {
    ui.type("Hello"); await flush();
    ui.$("send").click(); ui.$("send").click();
    ui.window.document.dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    await flush();
    assert.equal(ui.sent().length, 1);
    stream.end();
  } finally { ui.window.close(); }
});

test("stop cancels on the server, shows retry, and retry resends the same preview", async () => {
  const streams = [sse(), sse()];
  let n = 0;
  const ui = setup({ "/api/preview": async () => json(previewResult()), "/api/send": async () => streams[n++].response });
  try {
    ui.type("Hello"); await flush();
    ui.$("send").click(); await flush();
    streams[0].push(frame("start", { mock: false }));
    await flush();
    ui.$("stop").click(); await flush();
    assert.deepEqual(ui.calls.find((c) => c.path === "/api/cancel").body, { preview_id: "p1" });
    assert.match(ui.$("status").textContent, /Stopped/);
    assert.equal(ui.$("retry").hidden, false);
    streams[0].push(frame("delta", { raw: "late", segments: [{ text: "late" }] }));
    await flush();
    assert.equal(ui.$("view-reply").textContent, "", "nothing from the stopped stream is shown");
    ui.$("retry").click(); await flush();
    assert.deepEqual(ui.sent()[1].body, { preview_id: "p1" });
    streams[1].push(frame("delta", { raw: "ok", segments: [{ text: "ok" }] }) + frame("done", { names: 0 }));
    streams[1].end(); await flush();
    assert.equal(ui.$("view-reply").textContent, "ok");
  } finally { ui.window.close(); }
});

test("editing while a reply streams discards it and invalidates the approval at once", async () => {
  const stream = sse();
  let previewCount = 0;
  const ui = setup({
    "/api/preview": async () => json(previewResult({ preview_id: `p${++previewCount}` })),
    "/api/send": async () => stream.response,
  });
  try {
    ui.type("Hello"); await flush();
    ui.$("send").click(); await flush();
    stream.push(frame("delta", { raw: "first", segments: [{ text: "first" }] })); await flush();
    ui.type("Hello again");
    assert.equal(ui.$("send").disabled, true);
    assert.equal(ui.$("view-reply").textContent, "");
    assert.ok(ui.calls.some((c) => c.path === "/api/reset"));
    stream.push(frame("delta", { raw: " more", segments: [{ text: " more" }] })); await flush();
    assert.equal(ui.$("view-reply").textContent, "");
    assert.equal(ui.$("send").disabled, false);
    ui.$("send").click(); await flush();
    assert.deepEqual(ui.sent()[1].body, { preview_id: "p2" });
  } finally { ui.window.close(); }
});

test("an obsolete preview response cannot bring back an old approval", async () => {
  const resolves = [];
  const ui = setup({ "/api/preview": () => new Promise((resolve) => resolves.push(resolve)) });
  try {
    ui.type("Same source"); await flush();
    ui.setPurpose("A different purpose"); await flush();
    resolves[1](json(previewResult({ preview_id: "new" })));
    await flush();
    resolves[0](json(previewResult({ preview_id: "old" })));
    await flush();
    ui.$("send").click(); await flush();
    assert.deepEqual(ui.sent()[0]?.body, { preview_id: "new" });
  } finally { ui.window.close(); }
});

test("without credentials the page says API not configured and never sends", async () => {
  const ui = setup({ "/api/health": async () => json(health(null)), "/api/preview": async () => json(previewResult()) });
  try {
    await flush();
    ui.type("Hello"); await flush();
    assert.equal(ui.$("provider").textContent, "API not configured");
    assert.equal(ui.$("send").disabled, true);
    assert.equal(ui.$("send").textContent, "API not configured");
    ui.$("send").click(); await flush();
    assert.equal(ui.sent().length, 0);
  } finally { ui.window.close(); }
});

test("mock provider is labelled before and after sending", async () => {
  const stream = sse();
  const ui = setup({
    "/api/health": async () => json(health({ provider: "mock", model: "mock-provider", mock: true })),
    "/api/preview": async () => json(previewResult()), "/api/send": async () => stream.response,
  });
  try {
    await flush();
    assert.match(ui.$("provider").textContent, /Mock provider — no AI is called/);
    ui.type("Hello"); await flush();
    ui.$("send").click(); await flush();
    stream.push(frame("start", { provider: "mock", mock: true })); await flush();
    assert.equal(ui.$("mock-badge").hidden, false);
    stream.end();
  } finally { ui.window.close(); }
});

test("provider errors and stale previews are handled", async () => {
  const stream = sse();
  let sendResponses = [async () => stream.response, async () => json({ code: "stale", error: "out of date" }, 409)];
  let previewCount = 0;
  const ui = setup({
    "/api/preview": async () => json(previewResult({ preview_id: `p${++previewCount}` })),
    "/api/send": () => sendResponses.shift()(),
  });
  try {
    ui.type("Hello"); await flush();
    ui.$("send").click(); await flush();
    stream.push(frame("error", { code: "timeout", message: "The AI took too long to reply. Try again." })); stream.end();
    await flush();
    assert.equal(ui.$("status").textContent, "The AI took too long to reply. Try again.");
    assert.ok(ui.$("status").classList.contains("error"));
    assert.equal(ui.$("retry").hidden, false);
    ui.$("retry").click(); await flush(40);
    assert.equal(ui.previews().length, 2, "an expired preview is protected again, not sent");
    assert.equal(ui.sent().length, 2);
    assert.match(ui.$("status").textContent, /Check what the AI will see/);
  } finally { ui.window.close(); }
});

test("markup in names, replies and payloads stays inert text", async () => {
  const evil = '<img src=x onerror="alert(1)">';
  const stream = sse();
  const ui = setup({
    "/api/preview": async () => json(previewResult({ provider_request: { system: null, user: evil },
      protected_view: { task: null, message: [{ text: evil, label: "PERSON", action: "ALIAS" }] } })),
    "/api/send": async () => stream.response,
  });
  try {
    ui.type("Hello"); await flush();
    ui.$("send").click(); await flush();
    stream.push(frame("delta", { raw: evil, segments: [{ text: evil, alias: "[PERSON_1]" }, { text: evil }] }));
    stream.push(frame("done", { names: 1 })); stream.end(); await flush();
    assert.equal(ui.window.document.querySelector("img"), null);
    assert.equal(ui.$("view-reply").textContent, evil + evil);
    assert.equal(ui.$("view-raw").textContent, evil);
    assert.equal(ui.$("sent-user").textContent, evil);
  } finally { ui.window.close(); }
});

test("partial results show an error and no send", async () => {
  const ui = setup({ "/api/preview": async () => json(previewResult({ coverage: { complete: false } })) });
  try {
    ui.type("Some message"); await flush();
    assert.equal(ui.$("protected").textContent, "Try a shorter message.");
    assert.equal(ui.$("send").disabled, true);
  } finally { ui.window.close(); }
});

test("tabs switch views with arrow keys", async () => {
  const ui = setup({});
  try {
    const tabs = [...ui.window.document.querySelectorAll('[role="tab"]')];
    tabs[0].dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(tabs[1].getAttribute("aria-selected"), "true");
    assert.equal(ui.$("view-sent").hidden, false);
    assert.equal(ui.$("view-reply").hidden, true);
    tabs[1].dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.equal(ui.$("view-reply").hidden, false);
  } finally { ui.window.close(); }
});
