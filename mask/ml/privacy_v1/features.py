"""Track A features; no pretrained embeddings and no labels in input features."""
import re
from collections import Counter

TOKEN = re.compile(r"\w+(?:[.@'’-]\w+)*|[^\w\s]", re.UNICODE)


def tokens(text):
    return [(m[0], m.start(), m.end()) for m in TOKEN.finditer(text)]


def words(text):
    return re.findall(r"[\w'-]+", text.lower(), re.UNICODE)


def token_features(sequence, index):
    raw = sequence[index][0]
    low = raw.lower()
    out = {"bias": 1, "word=" + low: 1, "upper": float(raw.isupper()),
           "title": float(raw.istitle()), "digit": float(raw.isdigit()),
           "has_digit": float(any(c.isdigit() for c in raw)), "length": min(len(raw), 30) / 30}
    for n in (2, 3, 4):
        if len(low) >= n:
            out["prefix=" + low[:n]] = 1
            out["suffix=" + low[-n:]] = 1
    for offset in (-2, -1, 1, 2):
        j = index + offset
        out[f"neighbor{offset}=" + (sequence[j][0].lower() if 0 <= j < len(sequence) else "<boundary>")] = 1
    return out


def action_features(text, span, task, context=""):
    value = text[span.start:span.end]
    out = {"type=" + span.label: 1, "bias": 1}
    for namespace, source in (("goal", task), ("value", value), ("text", text), ("context", context)):
        for word, count in Counter(words(source)).items():
            out[namespace + "=" + word] = min(count, 3)
            if namespace == "goal":
                out["goal_by_type=" + span.label + ":" + word] = 1
    out["goal_value_overlap"] = len(set(words(task)) & set(words(value)))
    for word in words(value):
        for n in (3, 4):
            for i in range(max(0, len(word) - n + 1)):
                out["char=" + word[i:i+n]] = 1
    return out


def bio_labels(text, spans):
    sequence = tokens(text)
    labels = []
    for _, a, b in sequence:
        matches = [s for s in spans if s.start < b and a < s.end]
        if len(matches) > 1:
            raise ValueError("Annotations overlap at a token boundary")
        if not matches:
            labels.append("O")
        else:
            s = matches[0]
            labels.append(("B-" if a <= s.start else "I-") + s.label)
    return sequence, labels


def decode_bio(sequence, labels, source):
    from .contracts import Span
    result = []
    previous_label = "O"
    for (_, a, b), label in zip(sequence, labels, strict=True):
        if label == "O":
            previous_label = label
            continue
        prefix, category = label.split("-", 1)
        if prefix == "I" and result and previous_label != "O" and result[-1].label == category:
            previous = result.pop()
            result.append(Span(previous.start, b, category, source))
        else:
            result.append(Span(a, b, category, source))
        previous_label = label
    return result
