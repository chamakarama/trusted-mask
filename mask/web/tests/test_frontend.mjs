import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
const html = readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../static/app.js", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
const result = { status: "needs_review", payload: "Hello [PERSON_1]", coverage: { complete: true }, context_mode: "message_only" };
function setup(response) {
  const dom = new JSDOM(html, { url: "http://127.0.0.1:8787", runScripts: "outside-only" });
  const { window } = dom;
  const originalTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn, delay) => originalTimeout(fn, delay === 450 ? 0 : delay);
  const calls = [];
  window.fetch = async (path, options) => { calls.push({ path, options }); return response(); };
  window.eval(script);
  const input = window.document.getElementById("message");
  const purpose = window.document.getElementById("task");
  const output = window.document.getElementById("output");
  const status = window.document.getElementById("status");
  const type = (value) => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); };
  const setPurpose = (value) => { purpose.value = value; purpose.dispatchEvent(new window.Event("input", { bubbles: true })); };
  return { dom, window, input, output, status, purpose, type, setPurpose, calls };
}
test("two main boxes and an optional intended-use field; empty purpose preserves message-only mode", async () => {
  const ui = setup(async () => ({ ok: true, json: async () => result }));
  try {
    assert.equal(ui.window.document.querySelectorAll("textarea").length, 2);
    assert.equal(ui.window.document.querySelectorAll("button, h1, h2, header, footer").length, 0);
    assert.equal(ui.window.document.querySelectorAll("input").length, 1);
    ui.type("Hello Jane"); await flush();
    assert.equal(ui.output.value, result.payload);
    assert.deepEqual(JSON.parse(ui.calls[0].options.body), { text: "Hello Jane" });
    assert.match(ui.status.textContent, /Draft — review before sharing/);
    assert.match(ui.status.textContent, /Intended use taken from your message/);
  } finally { ui.window.close(); }
});
test("explicit purpose is sent separately and changing it immediately invalidates the prior preview", async () => {
  const ui = setup(async () => ({ ok: true, json: async () => ({ ...result, context_mode: "explicit_task" }) }));
  try {
    ui.setPurpose("  Explain the measurements  ");
    await flush();
    assert.equal(ui.calls.length, 0);
    ui.type("Hello Jane"); await flush();
    assert.deepEqual(JSON.parse(ui.calls[0].options.body), { text: "Hello Jane", task: "Explain the measurements" });
    assert.doesNotMatch(ui.status.textContent, /taken from your message/);
    ui.setPurpose("Plan a budget");
    assert.equal(ui.output.value, "");
    await flush();
    assert.deepEqual(JSON.parse(ui.calls[1].options.body), { text: "Hello Jane", task: "Plan a budget" });
    ui.setPurpose("  "); await flush();
    assert.deepEqual(JSON.parse(ui.calls[2].options.body), { text: "Hello Jane" });
  } finally { ui.window.close(); }
});
test("a response for an obsolete purpose cannot restore the old output", async () => {
  const resolves = [];
  const ui = setup(() => new Promise((resolve) => resolves.push(resolve)));
  try {
    ui.type("Same source"); await flush();
    ui.setPurpose("A different purpose"); await flush();
    resolves[1]({ ok: true, json: async () => ({ ...result, payload: "New result", context_mode: "explicit_task" }) });
    await flush();
    resolves[0]({ ok: true, json: async () => ({ ...result, payload: "Old result" }) });
    await flush();
    assert.equal(ui.output.value, "New result");
  } finally { ui.window.close(); }
});
test("editing immediately clears output; an obsolete response cannot bring it back", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const ui = setup(() => pending);
  try {
    ui.type("Original message"); await flush();
    ui.type("");
    resolve({ ok: true, json: async () => result }); await flush();
    assert.equal(ui.output.value, "");
    assert.equal(ui.calls.length, 1);
  } finally { ui.window.close(); }
});
test("partial results stay empty and show an in-box error", async () => {
  const ui = setup(async () => ({ ok: true, json: async () => ({ ...result, coverage: { complete: false } }) }));
  try {
    ui.type("Some message"); await flush();
    assert.equal(ui.output.value, "");
    assert.equal(ui.output.placeholder, "Try a shorter message.");
  } finally { ui.window.close(); }
});
test("markup is inert text and does not become page elements", async () => {
  const payload = '<img src=x onerror="alert(1)">';
  const ui = setup(async () => ({ ok: true, json: async () => ({ ...result, payload }) }));
  try {
    ui.type("Some message"); await flush();
    assert.equal(ui.output.value, payload);
    assert.equal(ui.window.document.querySelector("img"), null);
  } finally { ui.window.close(); }
});
