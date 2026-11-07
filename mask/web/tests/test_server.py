from dataclasses import dataclass
from types import SimpleNamespace
import json
import threading
import urllib.error
import urllib.request
import pytest
from mask.web.server import ModelService, make_server


@dataclass
class FakeResult:
    value: dict
    def as_dict(self):
        return self.value


class FakeProtector:
    model = SimpleNamespace(model_id="test-model")
    def __init__(self):
        self.calls = []
    def protect_text(self, text, task, language):
        assert language == "en"
        self.calls.append((text, task))
        return FakeResult({"status": "needs_review", "protected_text": "Hello [PERSON_1]",
                           "protected_task": "Write to [EMAIL]", "edits": [{}],
                           "retained_sensitive": [{"label": "HEALTH"}],
                           "coverage": {"complete": True}, "review_reasons": ["pilot"], "model_version": "test-model"})


@pytest.fixture
def api():
    service = ModelService(FakeProtector())
    server = make_server(service, 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield base, service
    server.shutdown()
    server.server_close()
    thread.join(timeout=2)


def request(base, body=None, headers=None, path="/api/preview"):
    defaults = {"Content-Type": "application/json", "X-Mask-Request": "preview"}
    defaults.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, headers=defaults)
    try:
        return urllib.request.urlopen(req, timeout=3)
    except urllib.error.HTTPError as error:
        return error


def test_complete_payload_uses_protected_goal(api):
    base, _ = api
    response = request(base, {"text": "Hello raw-name", "task": "Write to raw@example.invalid"})
    result = json.load(response)
    assert response.status == 200
    assert result["payload"] == "Task: Write to [EMAIL]\n\nHello [PERSON_1]"
    assert "raw-name" not in str(result) and "raw@example.invalid" not in str(result)
    assert result["status"] == "needs_review"
    assert result["context_mode"] == "explicit_task"
    assert response.headers["Cache-Control"] == "no-store"


def test_no_raw_fallback_on_incomplete_model_result(api):
    base, service = api
    service.protector.protect_text = lambda *a, **kw: FakeResult({"status": "needs_review", "protected_text": "partial",
                                                                "coverage": {"complete": False}})
    result = json.load(request(base, {"text": "secret", "task": "goal"}))
    assert result["payload"] is None and result["protected_text"] is None
    assert result["status"] == "unsupported"


@pytest.mark.parametrize("body", [{}, {"text": 1, "task": "x"}, {"text": " ", "task": "x"},
                                  {"text": "x", "task": "x", "history": ["extra"]}])
def test_invalid_input_rejected(api, body):
    assert request(api[0], body).status == 400


def test_oversized_input_rejected(api):
    assert request(api[0], {"text": "x" * 32001, "task": "x"}).status == 413
    assert request(api[0], {"text": "x" * 4001}).status == 413


def test_message_only_mode_has_no_duplicate_task(api):
    response = request(api[0], {"text": "Explain this message"})
    result = json.load(response)
    assert response.status == 200
    assert result["payload"] == "Hello [PERSON_1]"
    assert result["context_mode"] == "message_only"
    assert "message_used_as_intended_use" in result["review_reasons"]


def test_blank_optional_purpose_uses_message_context(api):
    base, service = api
    response = request(base, {"text": "Explain this message", "task": "  "})
    result = json.load(response)
    assert response.status == 200
    assert service.protector.calls == [("Explain this message", "Explain this message")]
    assert result["payload"] == "Hello [PERSON_1]"


def test_receiving_instruction_and_runtime_metadata_are_preserved_without_raw_values(api):
    base, service = api
    original = service.protector.protect_text
    instruction = "Privacy note: Use [PERSON_1] verbatim; do not guess the hidden name."
    def with_instruction(*args, **kwargs):
        result = original(*args, **kwargs)
        result.value.update(receiving_ai_instruction=instruction, runtime_versions={"pipeline": "test-v2"})
        return result
    service.protector.protect_text = with_instruction
    result = json.load(request(base, {"text": "RAW_NAME", "task": "RAW_PURPOSE"}))
    assert result["payload"] == instruction + "\n\nTask: Write to [EMAIL]\n\nHello [PERSON_1]"
    assert result["receiving_ai_instruction"] == instruction
    assert result["runtime_versions"] == {"pipeline": "test-v2"}
    assert "RAW_" not in json.dumps(result)


def test_invalid_receiving_instruction_cannot_create_payload(api):
    base, service = api
    service.protector.protect_text = lambda *a, **kw: FakeResult({"status": "needs_review",
        "protected_text": "protected", "protected_task": "protected goal", "receiving_ai_instruction": {"bad": True},
        "coverage": {"complete": True}})
    result = json.load(request(base, {"text": "raw", "task": "raw goal"}))
    assert result["status"] == "unsupported"
    assert result["payload"] is None
    assert result["protected_text"] is None
    assert result["receiving_ai_instruction"] is None


@pytest.mark.parametrize("headers", [{"Origin": "https://unrelated.example"}, {"Host": "attacker.example"},
                                     {"X-Mask-Request": ""}, {"Content-Type": "text/plain"}])
def test_foreign_requests_rejected(api, headers):
    assert request(api[0], {"text": "x", "task": "x"}, headers).status in (403, 415)


def test_model_errors_never_echo_input(api):
    base, service = api
    def fail(*a, **kw):
        raise RuntimeError("RAW_PRIVATE_INPUT")
    service.protector.protect_text = fail
    response = request(base, {"text": "x", "task": "x"})
    assert response.status == 500
    assert b"RAW_PRIVATE_INPUT" not in response.read()
    assert not service.lock.locked()


def test_concurrent_preview_is_bounded(api):
    base, service = api
    with service.lock:
        assert request(base, {"text": "x", "task": "x"}).status == 429


def test_static_health_and_path_traversal(api):
    base, _ = api
    response = request(base, path="/")
    assert response.status == 200
    assert b"Your message" in response.read()
    assert "frame-ancestors 'none'" in response.headers["Content-Security-Policy"]
    health = json.load(request(base, path="/api/health"))
    assert health["provider_connected"] is False
    assert request(base, path="/../../ml/privacy_v1/data/pilot.jsonl").status == 404
