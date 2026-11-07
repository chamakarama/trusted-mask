"""Deterministic local restoration of generated PERSON aliases in a streamed reply.

Only exact `[PERSON_n]` tokens that this request generated are restored; unknown tokens, generic placeholders
(`[EMAIL]`, `[SECRET]`...), dropped sections and generalised facts are left exactly as the AI wrote them.
One left-to-right pass over the provider's text: restored names are never re-scanned, so a name that itself looks
like a token cannot trigger a second substitution. Tokens split across stream chunks are buffered until complete.
"""
import re

TOKEN = re.compile(r"\[PERSON_(\d{1,6})\]")
# A suffix that could still grow into a token: "[", "[P", ..., "[PERSON_", "[PERSON_12"
PARTIAL = re.compile(r"\[(?:P(?:E(?:R(?:S(?:O(?:N(?:_\d{0,6})?)?)?)?)?)?)?$")


class Restorer:
    def __init__(self, mapping):
        # alias ("[PERSON_1]") -> original name; only well-formed PERSON aliases are accepted
        self.mapping = {k: v for k, v in dict(mapping).items() if TOKEN.fullmatch(k) and isinstance(v, str)}
        self.buffer = ""
        self.restored_count = 0
        self.restored_aliases = set()

    def _segments(self, text):
        segments, cursor = [], 0
        for match in TOKEN.finditer(text):
            alias = match.group(0)
            if alias not in self.mapping:
                continue
            if match.start() > cursor:
                segments.append({"text": text[cursor:match.start()]})
            segments.append({"text": self.mapping[alias], "alias": alias})
            self.restored_count += 1
            self.restored_aliases.add(alias)
            cursor = match.end()
        if cursor < len(text):
            segments.append({"text": text[cursor:]})
        return segments

    def feed(self, chunk):
        """Return display segments that are safe to show now; hold back a possible partial token."""
        self.buffer += chunk
        match = PARTIAL.search(self.buffer)
        cut = match.start() if match else len(self.buffer)
        ready, self.buffer = self.buffer[:cut], self.buffer[cut:]
        return self._segments(ready)

    def flush(self):
        ready, self.buffer = self.buffer, ""
        return self._segments(ready)


def restore_text(text, mapping):
    """Whole-text convenience wrapper (same rules as streaming)."""
    r = Restorer(mapping)
    return "".join(s["text"] for s in r.feed(text) + r.flush())
