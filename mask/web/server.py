"""Loopback-only HTTP adapter for the existing Protector API. No provider calls."""
import argparse
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
MASK = ROOT.parent
MAX_BODY = 256 * 1024
ASSETS = {
    "/": (ROOT / "static/index.html", "text/html; charset=utf-8"),
    "/app.js": (ROOT / "static/app.js", "text/javascript; charset=utf-8"),
    "/styles.css": (ROOT / "static/styles.css", "text/css; charset=utf-8"),
    "/font.woff2": (MASK / "public/fonts/InterVariable.woff2", "font/woff2"),
}


class Busy(Exception):
    pass


class ModelService:
    def __init__(self, protector):
        self.protector = protector
        self.lock = threading.Lock()

    def preview(self, text, task=None):
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
            return {
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
            except (BrokenPipeError, ConnectionResetError):
                pass  # User edited the source and cancelled this obsolete request.

        def do_GET(self):
            if not self._same_origin():
                return self._send(403, {"error": "This preview is available only from its local page."})
            path = urlsplit(self.path).path
            if path == "/api/health":
                return self._send(200, {"status": "available", "model": service.protector.model.model_id,
                                        "inference": "local", "provider_connected": False})
            asset = ASSETS.get(path)
            if not asset:
                return self._send(404, {"error": "Not found."})
            return self._send(200, asset[0].read_bytes(), asset[1])

        def do_POST(self):
            if not self._same_origin() or self.headers.get("X-Mask-Request") != "preview":
                return self._send(403, {"error": "Open the local Mask page to preview a message."})
            if urlsplit(self.path).path != "/api/preview":
                return self._send(404, {"error": "Not found."})
            if self.headers.get_content_type() != "application/json" or self.headers.get("Transfer-Encoding"):
                return self._send(415, {"error": "A JSON message is required."})
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self._send(400, {"error": "Invalid request size."})
            if not 0 < length <= MAX_BODY:
                return self._send(413, {"error": "The message is too large for this preview."})
            try:
                request = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError, TimeoutError):
                return self._send(400, {"error": "The message could not be read."})
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
                result = service.preview(text, task)
            except Busy:
                return self._send(429, {"error": "The local model is finishing another preview. Try again shortly."})
            except Exception:
                # Exception strings may contain private input. Expose neither traceback nor values.
                return self._send(500, {"error": "The local model could not finish. Try a shorter message."})
            return self._send(200, result)

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
    service = ModelService(Protector(load_model(args.model)))
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
