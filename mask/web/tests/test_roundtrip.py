"""Round trip: preview session -> approved send -> streamed reply -> local restoration. Synthetic names only."""
import http.client
import json
import re
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from types import SimpleNamespace

import pytest

import mask.web.session as session_module
from mask.web.provider import MockProvider, ProviderError, configured_provider
from mask.web.server import REPLY_FORMAT, ModelService, make_server

INSTRUCTION = "Privacy note: Labels such as [PERSON_1] represent redacted references. Use them verbatim."
NAMES = ["Maria Virtanen", "Jonas", "Liisa"]


@dataclass
class FakeResult:
    value: dict
    def as_dict(self):
        return self.value


class NameProtector:
    """Deterministic stand-in for the model: aliases known names, placeholders e-mail addresses."""
    model = SimpleNamespace(model_id="fake-names")

    def __init__(self):
        self.calls = []

    def protect_text(self, text, task, language):
        self.calls.append((text, task))
        aliases = {}

        def segment(source):
            edits = []
            for name in NAMES:
                for match in re.finditer(re.escape(name), source):
                    alias = aliases.setdefault(name, f"[PERSON_{len(aliases) + 1}]")
                    edits.append({"start": match.start(), "end": match.end(), "label": "PERSON", "action": "ALIAS",
                                  "replacement": alias, "reason": "direct_identifier_policy", "score": None})
            for match in re.finditer(r"\S+@\S+\.invalid", source):
                edits.append({"start": match.start(), "end": match.end(), "label": "EMAIL", "action": "PLACEHOLDER",
                              "replacement": "[EMAIL]", "reason": "direct_identifier_policy", "score": None})
            edits.sort(key=lambda e: e["start"])
            out, cursor = [], 0
            for edit in edits:
                out += [source[cursor:edit["start"]], edit["replacement"]]
                cursor = edit["end"]
            return "".join(out + [source[cursor:]]), edits

        protected_text, edits = segment(text)
        protected_task, task_edits = (protected_text, edits) if task == text else segment(task)
        return FakeResult({"status": "needs_review", "protected_text": protected_text, "protected_task": protected_task,
                           "edits": edits, "context_reports": [{"component": "task", "edits": task_edits}],
                           "retained_sensitive": [], "coverage": {"complete": True}, "review_reasons": [],
                           "receiving_ai_instruction": INSTRUCTION, "model_version": "fake-names"})


class ExplodingProvider:
    name, model = "anthropic", "x"
    def stream(self, system, user, cancel):
        yield "text", "partial "
        raise RuntimeError("RAW Maria Virtanen sk-ant-secret")


@pytest.fixture
def make_api():
    servers = []

    def factory(provider="mock", reply_timeout=10, **mock):
        if provider == "mock":
            provider = MockProvider(delay=mock.pop("delay", 0), **mock)
        info = ({"provider": getattr(provider, "name", None), "model": getattr(provider, "model", None),
                 "mock": isinstance(provider, MockProvider), "configured": True} if provider is not None
                else {"provider": None, "configured": False, "reason": "API not configured"})
        service = ModelService(NameProtector(), provider, info, reply_timeout=reply_timeout)
        server = make_server(service, 0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        servers.append((server, thread))
        return f"http://127.0.0.1:{server.server_address[1]}", service, provider

    yield factory
    for server, thread in servers:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def post(base, path, body, kind):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Mask-Request": kind})
    try:
        return urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        return error


def preview(base, text, task=None):
    body = {"text": text, **({"task": task} if task is not None else {})}
    response = post(base, "/api/preview", body, "preview")
    assert response.status == 200
    return json.load(response)


def parse(body):
    events = []
    for frame in body.split("\n\n"):
        if not frame.strip():
            continue
        lines = dict(line.split(": ", 1) for line in frame.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def send(base, preview_id):
    response = post(base, "/api/send", {"preview_id": preview_id}, "send")
    if response.status != 200:
        return response.status, json.load(response)
    assert response.headers["Content-Type"].startswith("text/event-stream")
    return 200, parse(response.read().decode("utf-8"))


def open_stream(base, preview_id):
    host, port = base.removeprefix("http://").split(":")
    conn = http.client.HTTPConnection(host, int(port), timeout=10)
    conn.request("POST", "/api/send", json.dumps({"preview_id": preview_id}),
                 {"Content-Type": "application/json", "X-Mask-Request": "send"})
    response = conn.getresponse()
    assert response.status == 200
    return conn, response


def next_event(response):
    lines = []
    while True:
        line = response.readline().decode("utf-8")
        if line in ("\n", ""):
            break
        lines.append(line.rstrip("\n"))
    if not lines:
        return None
    parts = dict(l.split(": ", 1) for l in lines)
    return parts["event"], json.loads(parts["data"])


def rest(response):
    events = []
    while (event := next_event(response)) is not None:
        events.append(event)
    return events


def reply_text(events):
    return "".join(s["text"] for name, data in events if name == "delta" for s in data["segments"])


def raw_text(events):
    return "".join(data["raw"] for name, data in events if name == "delta")


def wait_for(predicate, timeout=3):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.02)
    return False


# --- privacy of the outbound request -----------------------------------------------------------------------------

def test_names_and_map_never_reach_the_provider_or_the_api(make_api):
    base, service, provider = make_api()
    text = "Please ask Maria Virtanen whether Jonas can join. Reply to maria.v@example.invalid"
    task = "Write a short note to Maria Virtanen about Jonas"
    data = preview(base, text, task)
    blob = json.dumps(data)
    for secret in ("Maria", "Virtanen", "Jonas", "maria.v@example.invalid"):
        assert secret not in blob
    assert "reverse_map" not in blob
    assert data["provider_request"] == {"system": INSTRUCTION + "\n\n" + REPLY_FORMAT, "user":
        "Task: Write a short note to [PERSON_1] about [PERSON_2]\n\n"
        "Please ask [PERSON_1] whether [PERSON_2] can join. Reply to [EMAIL]"}

    status, events = send(base, data["preview_id"])
    assert status == 200
    assert provider.requests == [(data["provider_request"]["system"], data["provider_request"]["user"])]
    for system, user in provider.requests:
        for secret in ("Maria", "Virtanen", "Jonas", "maria.v@example.invalid"):
            assert secret not in system and secret not in user
    assert events[0] == ("start", {"provider": "mock", "model": "mock-provider", "mock": True})
    assert "[PERSON_1]" in raw_text(events) and "Maria" not in raw_text(events)
    assert "Maria Virtanen" in reply_text(events) and "Jonas" in reply_text(events)
    assert events[-1][0] == "done" and events[-1][1]["names"] == 2


def test_name_only_in_intended_use_is_restored(make_api):
    base, _, provider = make_api()
    data = preview(base, "Can you check the attached measurements?", "Explain them simply to Liisa")
    assert data["provider_request"]["user"].startswith("Task: Explain them simply to [PERSON_1]")
    _, events = send(base, data["preview_id"])
    assert "Liisa" not in provider.requests[0][1]
    assert "Liisa" in reply_text(events)


def test_message_only_mode_sends_message_without_task_line(make_api):
    base, _, provider = make_api()
    data = preview(base, "Tell Jonas the visit moved to Friday.")
    assert data["provider_request"]["user"] == "Tell [PERSON_1] the visit moved to Friday."
    send(base, data["preview_id"])
    assert provider.requests[0][1] == "Tell [PERSON_1] the visit moved to Friday."


def test_changed_intended_use_on_identical_text_makes_a_new_payload_and_kills_the_old(make_api):
    base, _, provider = make_api()
    text = "Maria Virtanen's blood pressure readings are attached."
    first = preview(base, text, "Explain the readings")
    second = preview(base, text, "Draft a note to her employer")
    assert first["preview_id"] != second["preview_id"]
    assert first["provider_request"]["user"] != second["provider_request"]["user"]
    assert send(base, first["preview_id"])[1]["code"] == "stale"
    assert send(base, second["preview_id"])[0] == 200
    assert provider.requests[0][1].startswith("Task: Draft a note to her employer")


# --- approval lifecycle --------------------------------------------------------------------------------------------

def test_stale_unknown_and_reset_previews_are_rejected(make_api):
    base, _, provider = make_api()
    old = preview(base, "Hello Jonas")
    new = preview(base, "Hello Liisa")
    assert send(base, old["preview_id"]) == (409, {"code": "stale", "error": "This preview is out of date. Review the new protected message first."})
    assert send(base, "not-a-preview")[0] == 409
    assert post(base, "/api/send", {"preview_id": 5}, "send").status == 409
    assert post(base, "/api/reset", {}, "preview").status == 200
    assert send(base, new["preview_id"])[1]["code"] == "stale"
    assert provider.requests == []


def test_expired_preview_is_rejected(make_api, monkeypatch):
    base, _, provider = make_api()
    data = preview(base, "Hello Jonas")
    monkeypatch.setattr(session_module, "TTL_SECONDS", -1)
    assert send(base, data["preview_id"])[1]["code"] == "stale"
    assert provider.requests == []


def test_failed_preview_invalidates_the_previous_approval(make_api):
    base, service, _ = make_api()
    data = preview(base, "Hello Jonas")
    service.protector.protect_text = lambda *a, **k: FakeResult({"status": "needs_review", "coverage": {"complete": False}})
    assert preview(base, "Hello Liisa")["preview_id"] is None
    assert send(base, data["preview_id"])[1]["code"] == "stale"


def test_duplicate_sends_are_rejected_while_sending_and_after_completion(make_api):
    base, service, provider = make_api(delay=0.03)
    data = preview(base, "Hello Jonas")
    conn, response = open_stream(base, data["preview_id"])
    assert next_event(response)[0] == "start"
    assert send(base, data["preview_id"]) == (409, {"code": "duplicate", "error": "This message is already being sent."})
    assert rest(response)[-1][0] == "done"
    conn.close()
    assert send(base, data["preview_id"])[1]["code"] == "duplicate"
    assert len(provider.requests) == 1


def test_cancel_stops_the_stream_and_retry_is_allowed(make_api):
    base, service, provider = make_api(delay=0.05)
    data = preview(base, "Hello Jonas")
    conn, response = open_stream(base, data["preview_id"])
    assert next_event(response)[0] == "start"
    assert json.load(post(base, "/api/cancel", {"preview_id": data["preview_id"]}, "send")) == {"cancelled": True}
    events = rest(response)
    conn.close()
    assert events[-1] == ("cancelled", {"reason": "user"})
    assert len(raw_text(events)) < 60
    assert wait_for(lambda: service.store._items[data["preview_id"]].state == "cancelled")
    provider.delay = 0
    status, events = send(base, data["preview_id"])
    assert status == 200 and events[-1][0] == "done"


def test_editing_during_streaming_stops_the_old_reply(make_api):
    base, service, provider = make_api(delay=0.05)
    data = preview(base, "Hello Jonas")
    conn, response = open_stream(base, data["preview_id"])
    assert next_event(response)[0] == "start"
    assert next_event(response)[0] == "delta"
    preview(base, "Hello Jonas, edited")
    events = rest(response)
    conn.close()
    assert events[-1] == ("cancelled", {"reason": "stale"})
    assert send(base, data["preview_id"])[1]["code"] == "stale"


def test_client_disconnect_stops_the_provider(make_api):
    base, service, provider = make_api(delay=0.02, reply="word " * 400)
    data = preview(base, "Hello Jonas")
    conn, response = open_stream(base, data["preview_id"])
    assert next_event(response)[0] == "start"
    preview_obj = service.store._items[data["preview_id"]]
    response.close()
    conn.close()
    assert wait_for(lambda: preview_obj.state == "cancelled", timeout=6)
    assert preview_obj.cancel.is_set()


def post_as(base, path, body, kind, client):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "X-Mask-Request": kind, "X-Mask-Client": client})
    try:
        return urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        return error


def test_another_page_cannot_invalidate_or_stop_this_pages_reply(make_api):
    base, service, provider = make_api(delay=0.03)
    mine = json.load(post_as(base, "/api/preview", {"text": "Hello Jonas"}, "preview", "page-aaaaaaaa"))
    conn, response = open_stream(base, mine["preview_id"])
    assert next_event(response)[0] == "start"
    other = json.load(post_as(base, "/api/preview", {"text": "Hello Liisa"}, "preview", "page-bbbbbbbb"))
    assert post_as(base, "/api/reset", {}, "preview", "page-bbbbbbbb").status == 200
    events = rest(response)
    conn.close()
    assert events[-1][0] == "done" and "Jonas" in reply_text(events)
    assert send(base, other["preview_id"])[1]["code"] == "stale"       # page B's own reset killed page B's preview
    again = json.load(post_as(base, "/api/preview", {"text": "Hello again Jonas"}, "preview", "page-aaaaaaaa"))
    assert send(base, mine["preview_id"])[1]["code"] in ("duplicate", "stale")
    assert send(base, again["preview_id"])[0] == 200


def test_preview_store_is_bounded_across_pages(make_api):
    base, service, _ = make_api()
    ids = [json.load(post_as(base, "/api/preview", {"text": f"Hello Jonas {i}"}, "preview", f"page-{i:08d}"))["preview_id"]
           for i in range(20)]
    assert len(service.store) == session_module.MAX_PREVIEWS
    assert send(base, ids[0])[1]["code"] == "stale"
    assert send(base, ids[-1])[0] == 200


def test_invalid_page_id_is_rejected(make_api):
    base, _, _ = make_api()
    assert post_as(base, "/api/preview", {"text": "Hello"}, "preview", "bad id!").status == 400


# --- failures -----------------------------------------------------------------------------------------------------

def test_timeout_is_reported_and_retry_is_possible(make_api):
    base, service, _ = make_api(delay=0.15, reply="slow " * 50, reply_timeout=0.4)
    data = preview(base, "Hello Jonas")
    status, events = send(base, data["preview_id"])
    assert status == 200
    assert events[-1] == ("error", {"code": "timeout", "message": "The AI took too long to reply. Try again."})
    assert service.store._items[data["preview_id"]].state == "error"
    assert send(base, data["preview_id"])[0] == 200          # retry from error is allowed


def test_provider_errors_are_sanitised(make_api):
    base, _, _ = make_api(provider=ExplodingProvider())
    data = preview(base, "Hello Maria Virtanen")
    _, events = send(base, data["preview_id"])
    assert events[-1] == ("error", {"code": "provider", "message": "The AI reply failed. Try again."})
    assert "sk-ant" not in json.dumps(events) and "RAW" not in json.dumps(events)


def test_provider_status_error_message(make_api):
    base, _, _ = make_api(fail_after=14)
    data = preview(base, "Hello Jonas")
    _, events = send(base, data["preview_id"])
    assert events[-1] == ("error", {"code": "provider", "message": "The AI service returned an error (500). Try again."})


def test_unconfigured_provider_says_so_and_keeps_the_preview_usable(make_api):
    base, service, _ = make_api(provider=None)
    health = json.load(urllib.request.urlopen(base + "/api/health", timeout=5))
    assert health["provider_connected"] is False and health["provider"]["reason"] == "API not configured"
    data = preview(base, "Hello Jonas")
    assert send(base, data["preview_id"]) == (503, {"code": "not_configured", "error": "API not configured."})
    service.provider = MockProvider(delay=0)
    assert send(base, data["preview_id"])[0] == 200


# --- isolation and restoration ------------------------------------------------------------------------------------

def test_each_reply_is_restored_only_with_its_own_preview_map(make_api):
    base, _, provider = make_api(reply="[PERSON_1] and [PERSON_2] and [EMAIL]")
    first = preview(base, "Ask Maria Virtanen and Jonas.")
    assert reply_text(send(base, first["preview_id"])[1]) == "Maria Virtanen and Jonas and [EMAIL]"
    second = preview(base, "Ask Liisa.")
    assert reply_text(send(base, second["preview_id"])[1]) == "Liisa and [PERSON_2] and [EMAIL]"


def test_html_like_reply_text_is_carried_as_data(make_api):
    base, _, _ = make_api(reply='<script>alert(1)</script> [PERSON_1]')
    data = preview(base, "Hello Jonas")
    events = send(base, data["preview_id"])[1]
    assert reply_text(events) == "<script>alert(1)</script> Jonas"


# --- request hygiene ----------------------------------------------------------------------------------------------

@pytest.mark.parametrize("headers", [{"X-Mask-Request": "preview"}, {"X-Mask-Request": ""},
                                     {"Origin": "https://unrelated.example"}, {"Host": "attacker.example"}])
def test_foreign_send_requests_are_rejected(make_api, headers):
    base, _, provider = make_api()
    data = preview(base, "Hello Jonas")
    req = urllib.request.Request(base + "/api/send", data=json.dumps({"preview_id": data["preview_id"]}).encode(),
                                 headers={"Content-Type": "application/json", "X-Mask-Request": "send", **headers})
    with pytest.raises(urllib.error.HTTPError) as error:
        urllib.request.urlopen(req, timeout=5)
    assert error.value.code == 403
    assert provider.requests == []


def test_send_body_accepts_only_the_preview_id(make_api):
    base, _, provider = make_api()
    data = preview(base, "Hello Jonas")
    response = post(base, "/api/send", {"preview_id": data["preview_id"], "text": "Hello Jonas"}, "send")
    assert response.status == 400
    assert provider.requests == []


# --- configuration and the real adapter (no network) --------------------------------------------------------------

def test_configuration_from_environment(monkeypatch, tmp_path):
    for name in ("MASK_PROVIDER", "ANTHROPIC_API_KEY", "MASK_ANTHROPIC_KEY_FILE"):
        monkeypatch.delenv(name, raising=False)
    assert configured_provider() == (None, {"provider": None, "configured": False, "reason": "API not configured"})
    monkeypatch.setenv("MASK_PROVIDER", "mock")
    provider, info = configured_provider()
    assert isinstance(provider, MockProvider) and info["mock"] is True
    pytest.importorskip("anthropic")
    monkeypatch.delenv("MASK_PROVIDER")
    key_file = tmp_path / "assistant.env"
    key_file.write_text("OTHER=1\nANTHROPIC_API_KEY=sk-ant-test-not-real\n", encoding="utf-8")
    monkeypatch.setenv("MASK_ANTHROPIC_KEY_FILE", str(key_file))
    provider, info = configured_provider()
    assert info["provider"] == "anthropic" and info["configured"] is True
    assert "sk-ant" not in json.dumps(info)


def test_anthropic_adapter_sends_only_the_given_payload():
    anthropic = pytest.importorskip("anthropic")
    from mask.web.provider import AnthropicProvider

    class FakeStream:
        def __init__(self, events, final):
            self.events, self.final = events, final
        def __enter__(self):
            return self
        def __exit__(self, *exc):
            return False
        def __iter__(self):
            return iter(self.events)
        def get_final_message(self):
            return self.final

    class FakeMessages:
        def __init__(self, events, stop_reason="end_turn"):
            self.calls, self.events, self.stop_reason = [], events, stop_reason
        def stream(self, **kwargs):
            self.calls.append(kwargs)
            return FakeStream(self.events, SimpleNamespace(stop_reason=self.stop_reason, model=kwargs["model"]))

    delta = lambda kind, text: SimpleNamespace(type="content_block_delta", delta=SimpleNamespace(type=kind, text=text))
    adapter = AnthropicProvider.__new__(AnthropicProvider)
    adapter._anthropic, adapter.model, adapter.effort, adapter.deadline = anthropic, "claude-opus-5-5", "low", 30
    adapter.client = SimpleNamespace(messages=FakeMessages([delta("thinking_delta", "hidden"), delta("text_delta", "Hi [PERSON_1]")]))
    out = list(adapter.stream("SYSTEM", "USER [PERSON_1]", threading.Event()))
    assert out == [("text", "Hi [PERSON_1]"), ("done", {"stop_reason": "end_turn", "model": "claude-opus-5-5"})]
    assert adapter.client.messages.calls == [{"model": "claude-opus-5-5", "max_tokens": 4096, "system": "SYSTEM",
        "messages": [{"role": "user", "content": "USER [PERSON_1]"}], "output_config": {"effort": "low"}}]

    adapter.client = SimpleNamespace(messages=FakeMessages([], stop_reason="refusal"))
    with pytest.raises(ProviderError) as error:
        list(adapter.stream("S", "U", threading.Event()))
    assert error.value.code == "refusal"

    class Failing:
        def stream(self, **kwargs):
            error = anthropic.APIConnectionError.__new__(anthropic.APIConnectionError)
            Exception.__init__(error, "Connection error to https://api.anthropic.com")
            raise error
    adapter.client = SimpleNamespace(messages=Failing())
    with pytest.raises(ProviderError) as error:
        list(adapter.stream("S", "U", threading.Event()))
    assert error.value.code == "network" and "anthropic.com" not in error.value.message
