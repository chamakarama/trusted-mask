"""Loopback-only HTTP adapter: local protection preview, then an explicitly approved round trip to one AI provider.

Raw input never leaves this process. The provider receives only the stored protected payload of an approved preview;
the alias-to-name map stays in server memory and is applied to the reply locally, for display only.
"""
import argparse
import json
import os
import queue
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .provider import ProviderError, configured_provider
from .restore import TOKEN, Restorer
from .session import PreviewStore, SessionError

ROOT = Path(__file__).resolve().parent
MASK = ROOT.parent
MAX_BODY = 256 * 1024
CLIENT_ID = re.compile(r"[A-Za-z0-9_-]{8,64}")
# Application-authored, shown in "What the AI saw". The page renders replies as plain text, never Markdown/HTML.
REPLY_FORMAT = "Reply in plain text without Markdown formatting."
ASSETS = {
    "/": (ROOT / "static/index.html", "text/html; charset=utf-8"),
    "/app.js": (ROOT / "static/app.js", "text/javascript; charset=utf-8"),
    "/styles.css": (ROOT / "static/styles.css", "text/css; charset=utf-8"),
    "/font.woff2": (MASK / "public/fonts/InterVariable.woff2", "font/woff2"),
}


class Busy(Exception):
    pass


def _person_map(source, edits, payload_user):
    """Reverse map for PERSON aliases this pass generated and that actually occur in the outbound content."""
    mapping = {}
    for edit in edits or []:
        try:
            if edit.get("label") != "PERSON" or edit.get("action") != "ALIAS":
                continue
            alias, start, end = edit["replacement"], edit["start"], edit["end"]
        except (AttributeError, KeyError, TypeError):
            continue
        if (isinstance(alias, str) and TOKEN.fullmatch(alias) and alias in payload_user
                and isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(source)):
            mapping.setdefault(alias, source[start:end])
    return mapping


def _chips(source, edits, protected):
    """Protected text split into plain runs and changed runs. Only replacements are exposed, never originals."""
    try:
        parts, cursor = [], 0
        for edit in sorted(edits, key=lambda e: (e["start"], e["end"])):
            start, end, replacement = edit["start"], edit["end"], edit["replacement"]
            if start < cursor or not isinstance(replacement, str):
                raise ValueError
            if start > cursor:
                parts.append({"text": source[cursor:start]})
            parts.append({"text": replacement, "label": str(edit["label"]), "action": str(edit["action"])})
            cursor = end
        if cursor < len(source):
            parts.append({"text": source[cursor:]})
        if "".join(part["text"] for part in parts) != protected:
            raise ValueError
        return parts
    except (KeyError, TypeError, ValueError):
        return [{"text": protected}]


class ModelService:
    def __init__(self, protector, provider=None, provider_info=None, reply_timeout=None):
        self.protector = protector
        self.lock = threading.Lock()
        self.store = PreviewStore()
        self.provider = provider
        self.provider_info = provider_info or {"provider": None, "configured": False, "reason": "API not configured"}
        self.reply_timeout = float(reply_timeout or os.environ.get("MASK_TIMEOUT_SECONDS", "90"))

    def preview(self, text, task=None, client="default"):
        if not self.lock.acquire(blocking=False):
            raise Busy()
        try:
            task = task.strip() if isinstance(task, str) else task
            message_only = task is None or task == ""
            # The single input includes both the user's request and its context.
            result = self.protector.protect_text(text, text if message_only else task, language="en").as_dict()
            complete = result.get("coverage", {}).get("complete") is True
            protected_text = result.get("protected_text")
            protected_task = result.get("protected_task")
            instruction = result.get("receiving_ai_instruction")
            supported = result.get("status") in ("ready", "needs_review")
            # The right panel is the complete proposed payload, including the protected goal.
            # Never silently fall back to the raw task or source when inference fails.
            if (supported and complete and isinstance(protected_text, str) and isinstance(protected_task, str)
                    and (instruction is None or isinstance(instruction, str))):
                parts = [instruction.strip()] if isinstance(instruction, str) and instruction.strip() else []
                if not message_only:
                    parts.append(f"Task: {protected_task.strip()}")
                parts.append(protected_text)
                payload = "\n\n".join(parts)
            else:
                payload = None
                result["status"] = "unsupported"
            review_reasons = list(result.get("review_reasons", []))
            if message_only and payload is not None:
                result["status"] = "needs_review"
                review_reasons.append("message_used_as_intended_use")
            session = None
            if payload is None:
                self.store.invalidate_client(client)
            else:
                # The provider gets the application-authored instruction as a system prompt and the protected content
                # as the user turn: exactly the reviewed payload, split at the same seam.
                system = "\n\n".join(part for part in (
                    instruction.strip() if isinstance(instruction, str) else "", REPLY_FORMAT) if part)
                user = protected_text if message_only else f"Task: {protected_task.strip()}\n\n{protected_text}"
                task_edits = next((r.get("edits", []) for r in result.get("context_reports", [])
                                   if isinstance(r, dict) and r.get("component") == "task"), [])
                reverse_map = _person_map(text, result.get("edits"), user)
                if not message_only:
                    for alias, name in _person_map(task, task_edits, user).items():
                        reverse_map.setdefault(alias, name)
                session = self.store.create(system, user, reverse_map, client)
            return {
                "preview_id": session.id if session else None,
                "provider_request": {"system": session.system, "user": session.user} if session else None,
                "protected_view": {
                    "task": _chips(task, task_edits, protected_task) if session and not message_only else None,
                    "message": _chips(text, result.get("edits", []), protected_text) if session else None,
                },
                "status": result["status"],
                "payload": payload,
                "protected_text": protected_text if payload is not None else None,
                "protected_task": protected_task if payload is not None else None,
                "model_version": result.get("model_version", "unknown"),
                "runtime_versions": result.get("runtime_versions", {}),
                "context_mode": "message_only" if message_only else "explicit_task",
                "receiving_ai_instruction": instruction if payload is not None else None,
                "change_count": len(result.get("edits", [])),
                "retained_types": sorted({item["label"] for item in result.get("retained_sensitive", [])}),
                "review_reasons": sorted(set(review_reasons)),
                "coverage": result.get("coverage", {}),
            }
        finally:
            self.lock.release()


def make_server(service, port=8787):
    class Handler(BaseHTTPRequestHandler):
        server_version = "MaskLocal"

        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, *_args):
            # No message bodies, URLs, inputs or inference output in access logs.
            return

        def _same_origin(self):
            actual_port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{actual_port}", f"localhost:{actual_port}"}
            origin = self.headers.get("Origin")
            return self.headers.get("Host") in hosts and (origin is None or origin in {f"http://{h}" for h in hosts})

        def _send(self, status, body, content_type="application/json; charset=utf-8"):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            try:
                self.wfile.write(body)
            except OSError:
                pass  # The page edited the source and aborted this obsolete request (BrokenPipe/Reset/Aborted).

        def do_GET(self):
            if not self._same_origin():
                return self._send(403, {"error": "This preview is available only from its local page."})
            path = urlsplit(self.path).path
            if path == "/api/health":
                info = service.provider_info
                return self._send(200, {"status": "available", "model": service.protector.model.model_id,
                                        "inference": "local", "provider_connected": bool(info.get("configured")),
                                        "provider": {k: info.get(k) for k in ("provider", "model", "mock", "reason")}})
            asset = ASSETS.get(path)
            if not asset:
                return self._send(404, {"error": "Not found."})
            return self._send(200, asset[0].read_bytes(), asset[1])

        def _read_json(self):
            if self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding"):
                self._send(415, {"error": "A JSON message is required."})
                return None
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send(400, {"error": "Invalid request size."})
                return None
            if not 0 < length <= MAX_BODY:
                self._send(413, {"error": "The message is too large for this preview."})
                return None
            try:
                return json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError, TimeoutError):
                self._send(400, {"error": "The message could not be read."})
                return None

        def do_POST(self):
            path = urlsplit(self.path).path
            routes = {"/api/preview": ("preview", self._preview), "/api/reset": ("preview", self._reset),
                      "/api/send": ("send", self._send_protected), "/api/cancel": ("send", self._cancel)}
            route = routes.get(path)
            if not self._same_origin() or self.headers.get("X-Mask-Request") not in ("preview", "send"):
                return self._send(403, {"error": "Open the local Mask page to preview a message."})
            if route is None:
                return self._send(404, {"error": "Not found."})
            if self.headers.get("X-Mask-Request") != route[0]:
                return self._send(403, {"error": "Open the local Mask page to preview a message."})
            client = self.headers.get("X-Mask-Client", "default")
            if client != "default" and not CLIENT_ID.fullmatch(client):
                return self._send(400, {"error": "Invalid page ID."})
            self.client = client
            request = self._read_json()
            if request is not None:
                route[1](request)

        def _preview(self, request):
            if (not isinstance(request, dict) or set(request) not in ({"text"}, {"text", "task"})
                    or not isinstance(request.get("text"), str)
                    or "task" in request and not isinstance(request["task"], str)):
                return self._send(400, {"error": "Enter a message."})
            text, task = request["text"], request.get("task")
            task = task.strip() or None if task is not None else None
            if not text.strip():
                return self._send(400, {"error": "Enter a message."})
            if len(text) > (4000 if task is None else 32000) or task is not None and len(task) > 4000:
                return self._send(413, {"error": "Use a shorter message or purpose."})
            try:
                result = service.preview(text, task, self.client)
            except Busy:
                return self._send(429, {"error": "The local model is finishing another preview. Try again shortly."})
            except Exception:
                # Exception strings may contain private input. Expose neither traceback nor values.
                service.store.invalidate_client(self.client)
                return self._send(500, {"error": "The local model could not finish. Try a shorter message."})
            return self._send(200, result)

        def _reset(self, request):
            if request != {}:
                return self._send(400, {"error": "Invalid request."})
            service.store.invalidate_client(self.client)
            return self._send(200, {"status": "reset"})

        def _cancel(self, request):
            if not isinstance(request, dict) or set(request) != {"preview_id"}:
                return self._send(400, {"error": "Invalid request."})
            return self._send(200, {"cancelled": service.store.cancel(request["preview_id"])})

        def _event(self, name, data):
            self.wfile.write(f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()

        def _send_protected(self, request):
            if not isinstance(request, dict) or set(request) != {"preview_id"}:
                return self._send(400, {"error": "Invalid request."})
            provider = service.provider
            if provider is None:
                return self._send(503, {"code": "not_configured", "error": "API not configured."})
            try:
                preview = service.store.begin_send(request["preview_id"])
            except SessionError as error:
                return self._send(409, {"code": error.code, "error": error.message})
            # Only the stored, reviewed payload goes out. The reverse map is used below, locally, and nowhere else.
            system, user, cancel = preview.system, preview.user, preview.cancel
            restorer = Restorer(preview.reverse_map)
            events = queue.Queue()

            def produce():
                try:
                    for kind, value in provider.stream(system, user, cancel):
                        events.put((kind, value))
                        if kind == "done" or cancel.is_set():
                            return
                except ProviderError as error:
                    events.put(("error", {"code": error.code, "message": error.message}))
                except Exception:
                    events.put(("error", {"code": "provider", "message": "The AI reply failed. Try again."}))
                finally:
                    events.put(("end", None))

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            threading.Thread(target=produce, daemon=True).start()
            deadline = time.monotonic() + service.reply_timeout
            final = "error"
            try:
                self._event("start", {k: service.provider_info.get(k) for k in ("provider", "model", "mock")})
                while True:
                    if cancel.is_set():
                        stale = preview.state == "invalidated"
                        final = "cancelled"
                        self._event("cancelled", {"reason": "stale" if stale else "user"})
                        break
                    if time.monotonic() > deadline:
                        cancel.set()
                        self._event("error", {"code": "timeout", "message": "The AI took too long to reply. Try again."})
                        break
                    try:
                        kind, value = events.get(timeout=0.2)
                    except queue.Empty:
                        continue
                    if kind == "text" and isinstance(value, str) and value:
                        self._event("delta", {"raw": value, "segments": restorer.feed(value)})
                    elif kind == "done":
                        tail = restorer.flush()
                        if tail:
                            self._event("delta", {"raw": "", "segments": tail})
                        self._event("done", {"restored": restorer.restored_count, "names": len(restorer.restored_aliases),
                                             "stop_reason": (value or {}).get("stop_reason")})
                        final = "complete"
                        break
                    elif kind == "error":
                        self._event("error", value)
                        break
                    elif kind == "end":
                        self._event("error", {"code": "provider", "message": "The AI reply ended unexpectedly."})
                        break
            except OSError:
                final = "cancelled"             # browser closed or aborted: stop the provider too
            finally:
                if final != "complete":
                    cancel.set()
                service.store.finish(preview, final)

        def do_OPTIONS(self):
            self._send(403, {"error": "Cross-origin requests are not supported."})

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description="Mask local message preview")
    parser.add_argument("--model", type=Path, default=MASK / "ml/privacy_v1/artifacts/encoder-b-pilot")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    from mask.ml.privacy_v1.bundle import load_model
    from mask.ml.privacy_v1.engine import Protector
    print("Loading the local privacy model…", flush=True)
    provider, info = configured_provider()
    service = ModelService(Protector(load_model(args.model)), provider, info)
    label = (f"{info['provider']} ({info['model']})" + (" - MOCK, no AI is called" if info.get("mock") else "")
             if info.get("configured") else "API not configured (set ANTHROPIC_API_KEY or MASK_PROVIDER=mock)")
    print(f"Cloud AI: {label}", flush=True)
    server = make_server(service, args.port)
    print(f"Mask is ready at http://127.0.0.1:{args.port} — Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
