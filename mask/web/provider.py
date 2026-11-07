"""One streaming provider adapter (Anthropic Claude) plus an explicitly labelled mock.

Configuration is server-side only (environment variables), never in browser code or Git:
  MASK_PROVIDER            anthropic | mock        (default: anthropic when a key is available, otherwise none)
  ANTHROPIC_API_KEY        the API key; or
  MASK_ANTHROPIC_KEY_FILE  path to a local KEY=VALUE file containing ANTHROPIC_API_KEY=...
  MASK_MODEL               default claude-opus-5-5
  MASK_EFFORT              low | medium | high      (default low: short, fast replies for the demo)
  MASK_TIMEOUT_SECONDS     overall reply deadline   (default 90)
The adapter receives only the stored, approved protected payload. Errors are sanitised: no provider message bodies,
request contents or keys are surfaced.
"""
import os
import time
from pathlib import Path


class ProviderError(Exception):
    def __init__(self, code, message):
        super().__init__(code)
        self.code, self.message = code, message


def _key_from_file(path):
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    except OSError:
        return None
    return None


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key, model=None, effort=None, timeout=None):
        import anthropic
        self._anthropic = anthropic
        self.model = model or os.environ.get("MASK_MODEL", "claude-opus-5-5")
        self.effort = effort or os.environ.get("MASK_EFFORT", "low")
        self.deadline = float(timeout or os.environ.get("MASK_TIMEOUT_SECONDS", "90"))
        self.client = anthropic.Anthropic(api_key=api_key, max_retries=1,
                                          timeout=anthropic.Timeout(self.deadline, connect=10.0, read=30.0))

    def describe(self):
        return {"provider": self.name, "model": self.model, "mock": False}

    def stream(self, system, user, cancel):
        """Yield ('text', str) for each text delta, then ('done', {...}). Stops early when `cancel` is set."""
        a = self._anthropic
        started = time.monotonic()
        kwargs = dict(model=self.model, max_tokens=4096, messages=[{"role": "user", "content": user}],
                      output_config={"effort": self.effort})
        if system:
            kwargs["system"] = system          # application-authored instruction, kept apart from user content
        try:
            with self.client.messages.stream(**kwargs) as stream:
                for event in stream:
                    if cancel.is_set():
                        return
                    if time.monotonic() - started > self.deadline:
                        raise ProviderError("timeout", "The AI took too long to reply. Try again.")
                    if event.type == "content_block_delta" and getattr(event.delta, "type", "") == "text_delta":
                        yield "text", event.delta.text
                final = stream.get_final_message()
            if final.stop_reason == "refusal":
                raise ProviderError("refusal", "The AI declined to answer this request.")
            yield "done", {"stop_reason": final.stop_reason, "model": final.model}
        except ProviderError:
            raise
        except a.AuthenticationError:
            raise ProviderError("auth", "The AI service rejected the configured API key.")
        except a.PermissionDeniedError:
            raise ProviderError("auth", "The configured API key is not allowed to use this model.")
        except a.RateLimitError:
            raise ProviderError("rate_limit", "The AI service is busy. Wait a moment and retry.")
        except a.APITimeoutError:
            raise ProviderError("timeout", "The AI took too long to reply. Try again.")
        except a.APIConnectionError:
            raise ProviderError("network", "Could not reach the AI service. Check the connection and retry.")
        except a.APIStatusError as error:
            raise ProviderError("provider", f"The AI service returned an error ({error.status_code}). Try again.")


class MockProvider:
    """Explicitly labelled test double. Streams a canned reply that reuses the request's PERSON labels."""
    name = "mock"
    model = "mock-provider"

    def __init__(self, delay=0.04, reply=None, fail_after=None):
        self.delay, self.reply, self.fail_after = delay, reply, fail_after
        self.requests = []           # (system, user) actually received, for tests

    def describe(self):
        return {"provider": self.name, "model": self.model, "mock": True}

    def stream(self, system, user, cancel):
        self.requests.append((system, user))
        import re
        labels = sorted(set(re.findall(r"\[PERSON_\d+\]", user)), key=lambda s: int(s[8:-1]))
        reply = self.reply
        if reply is None:
            who = labels[0] if labels else "you"
            reply = (f"[MOCK REPLY, no AI was called] Thanks for the details. Here is a suggestion for {who}: "
                     "keep the measurements as they are and list your questions in order of importance. "
                     + (f"You also mentioned {labels[1]}; they can be included in the note. " if len(labels) > 1 else ""))
        for i in range(0, len(reply), 7):    # 7-character chunks split tokens on purpose
            if cancel.is_set():
                return
            if self.fail_after is not None and i >= self.fail_after:
                raise ProviderError("provider", "The AI service returned an error (500). Try again.")
            time.sleep(self.delay)
            yield "text", reply[i:i + 7]
        yield "done", {"stop_reason": "end_turn", "model": self.model}


def configured_provider():
    """Return (provider or None, description). Never raises for missing configuration."""
    choice = os.environ.get("MASK_PROVIDER", "").strip().lower()
    if choice == "mock":
        return MockProvider(), {"provider": "mock", "model": "mock-provider", "mock": True, "configured": True}
    key = os.environ.get("ANTHROPIC_API_KEY") or (
        _key_from_file(os.environ["MASK_ANTHROPIC_KEY_FILE"]) if os.environ.get("MASK_ANTHROPIC_KEY_FILE") else None)
    if choice in ("", "anthropic") and key:
        try:
            p = AnthropicProvider(key)
            return p, {**p.describe(), "configured": True}
        except Exception:
            return None, {"provider": "anthropic", "configured": False, "reason": "client could not start"}
    return None, {"provider": choice or None, "configured": False, "reason": "API not configured"}
