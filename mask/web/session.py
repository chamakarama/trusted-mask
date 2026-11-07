"""Bounded, expiring, in-memory preview sessions for the local server.

Each open page has its own client ID. A new preview from a page invalidates that page's older previews only, so
two tabs cannot cancel each other's replies. At most MAX_PREVIEWS are held across all pages; the oldest go first.

A session holds the exact approved payload (system instruction + protected user content) and the reverse map from
generated PERSON aliases to original names. The reverse map never leaves this process: it is not serialised into
API results, exports or logs (see `public()`), and it is never sent to a provider.
"""
import secrets
import threading
import time
from dataclasses import dataclass, field

TTL_SECONDS = 15 * 60   # a preview expires after this long
MAX_PREVIEWS = 16


class SessionError(Exception):
    def __init__(self, code, message):
        super().__init__(code)
        self.code, self.message = code, message


@dataclass(repr=False)
class Preview:
    id: str
    system: str | None
    user: str
    reverse_map: dict
    created: float
    client: str = "default"
    state: str = "ready"            # ready -> sending -> complete | error | cancelled ; invalidated
    cancel: threading.Event = field(default_factory=threading.Event)

    def __repr__(self):              # never print names or payloads by accident
        return f"Preview(id={self.id[:6]}…, state={self.state})"

    def expired(self, now=None):
        return (now or time.monotonic()) - self.created > TTL_SECONDS

    def public(self):
        return {"preview_id": self.id, "expires_in": max(0, int(TTL_SECONDS - (time.monotonic() - self.created))),
                "provider_request": {"system": self.system, "user": self.user}}


class PreviewStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._items: dict[str, Preview] = {}

    def _drop(self, keys):
        for key in keys:
            old = self._items.pop(key)
            old.state = "invalidated"
            old.cancel.set()        # stops any reply still streaming for it

    def create(self, system, user, reverse_map, client="default"):
        preview = Preview(secrets.token_urlsafe(18), system, user, dict(reverse_map), time.monotonic(), client)
        with self._lock:
            # A new protection pass invalidates this page's older previews and their approval.
            now = time.monotonic()
            self._drop([k for k, v in self._items.items() if v.client == client or v.expired(now)])
            self._items[preview.id] = preview
            self._drop(list(self._items)[:-MAX_PREVIEWS])
        return preview

    def invalidate_client(self, client="default"):
        with self._lock:
            self._drop([k for k, v in self._items.items() if v.client == client])

    def begin_send(self, preview_id):
        """Atomically move a fresh preview into 'sending'; reject stale, expired and duplicate sends."""
        with self._lock:
            now = time.monotonic()
            self._drop([k for k, v in self._items.items() if v.expired(now)])
            preview = self._items.get(preview_id) if isinstance(preview_id, str) else None
            if preview is None:
                raise SessionError("stale", "This preview is out of date. Review the new protected message first.")
            if preview.state == "sending":
                raise SessionError("duplicate", "This message is already being sent.")
            if preview.state == "complete":
                raise SessionError("duplicate", "This message was already sent. Edit it to send again.")
            if preview.state not in ("ready", "error", "cancelled"):
                raise SessionError("stale", "This preview is out of date. Review the new protected message first.")
            preview.state = "sending"
            preview.cancel = threading.Event()
            return preview

    def finish(self, preview, state):
        with self._lock:
            if preview.state == "sending":
                preview.state = state

    def cancel(self, preview_id):
        with self._lock:
            preview = self._items.get(preview_id) if isinstance(preview_id, str) else None
            if preview and preview.state == "sending":
                preview.cancel.set()
                return True
            return False

    def __len__(self):
        return len(self._items)
