"""Goal-independent pilot rules. No challenge-data name/place lexicons."""
import re
from .contracts import DIRECT, LABELS, Span
from .editing import text_units

NAME_WORD = r"(?-i:[A-ZÀ-ÖØ-Þ][^\W\d_]*(?:['’-][^\W\d_]+)*)"
FULL_NAME = NAME_WORD + r"(?:[ \t]+(?:de |van |von |al )?" + NAME_WORD + r"){1,3}"

PATTERNS = [
    ("EMAIL", r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+"),
    ("PHONE", r"(?<!\w)\+\d(?:[ ()-]*\d){7,14}(?!\d)"),
    ("PHONE", r"\b(?:phone|mobile|tel|call)\s*[:=]?\s*(?P<value>\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})\b"),
    ("NATIONAL_ID", r"\b\d{3}-\d{2}-\d{4}\b"),
    ("SECRET", r"\b(?:password|passcode|api[_ -]?key|access[_ -]?token|secret)(?:\s*[:=]\s*|\s+(?:is|was)\s+)(?P<quote>[\"'])(?P<value>(?:\\.|(?!(?P=quote))[^\r\n])*)(?P=quote)"),
    ("SECRET", r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----"),
    ("SECRET", r"\b(?:password|passcode|api[_ -]?key|access[_ -]?token|secret)(?:\s*[:=]\s*|\s+(?:is|was)\s+)[\"']?(?P<value>[^\s\"';,]+)"),
    ("SECRET", r"\bBearer\s+(?P<value>[A-Za-z0-9._~+/-]+=*)"),
    ("SECRET", r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    ("USERNAME", r"\b(?:username|user name|login)(?:\s*[:=]\s*|\s+(?:is|was)\s+)[\"']?(?P<value>[\w.@+-]+)"),
    ("ACCOUNT_ID", r"\b(?:patient|customer|employee|account|member)\s*(?:id|number|no\.)(?:\s*[:=#]\s*|\s+(?:is|was)\s+|\s+)(?P<value>[\w-]+)"),
    ("ACCOUNT_ID", r"\b(?:reference|reference number|confirmation code)\s*(?:[:=#]\s*|(?:is|was)\s+)?(?P<value>(?=[\w-]*\d)[A-Z0-9][\w-]{3,})\b"),
    ("PERSON", r"\b(?:my name is|name:)\s*(?P<value>[^\W\d_][\w'’-]+(?:[ \t]+[^\W\d_][\w'’-]+){0,2})(?=[,.;\n]|$)"),
    ("PERSON", r"\b(?:I am|I'm|I’m|this is)\s+(?P<value>" + FULL_NAME + r")\b"),
    ("PERSON", r"\bmy\s+(?:partner|wife|husband|mother|father|son|daughter|manager|colleague|friend|doctor)\s*,?\s*(?P<value>" + FULL_NAME + r")\b"),
    ("PERSON", r"\b(?:Dr|Mr|Mrs|Ms|Professor)\.?\s+(?P<value>" + NAME_WORD + r"(?:[ \t]+" + NAME_WORD + r"){0,3})\b"),
    ("ADDRESS", r"\b\d{1,5}\s+(?:[\w'-]+\s+){1,4}(?:Street|Road|Avenue|Lane|Drive|St|Rd|Ave)\b"),
    ("DATE", r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b"),
    ("AGE", r"\b(?:age[d]?\s+)(?P<value>\d{1,3})\b"),
    ("AGE", r"\b(?P<value>\d{1,3})(?=[ -]years?[ -]old\b)"),
]
COMPILED = [(label, re.compile(pattern, re.I | re.UNICODE)) for label, pattern in PATTERNS]
CONTEXTUAL = {
    "HEALTH": r"\b(?:diagnos\w*|diabetes|asthma|cancer|medication|migraine|blood pressure|symptom\w*|allerg\w*|insulin)\b",
    "FINANCIAL": r"\b(?:salary|income|debt|mortgage|bank balance|rent|earn(?:s|ing)?)\b",
    "EMPLOYMENT": r"\b(?:my employer|I work at|my job|I was fired|unemployed)\b",
    "FAMILY": r"\b(?:my wife|my husband|my daughter|my son|my partner|my mother|my father)\b",
}
HEADER_LABELS = {
    "name": "PERSON", "full_name": "PERSON", "patient_name": "PERSON",
    "email": "EMAIL", "email_address": "EMAIL", "phone": "PHONE",
    "address": "ADDRESS", "username": "USERNAME", "user_name": "USERNAME",
    "account_id": "ACCOUNT_ID", "patient_id": "ACCOUNT_ID", "customer_id": "ACCOUNT_ID",
    "ssn": "NATIONAL_ID", "national_id": "NATIONAL_ID", "iban": "IBAN",
    "password": "SECRET", "api_key": "SECRET", "birth_date": "DATE", "age": "AGE",
    "diagnosis": "HEALTH", "medication": "HEALTH", "salary": "FINANCIAL",
    "employer": "EMPLOYMENT", "city": "LOCATION", "organisation": "ORG",
}


def luhn(value: str) -> bool:
    digits = [int(c) for c in value if c.isdigit() and c.isascii()]
    if not 13 <= len(digits) <= 19 or digits[0] not in (2, 3, 4, 5, 6):
        return False
    return sum((d * 2 - 9 if d * 2 > 9 else d * 2) if i % 2 else d
               for i, d in enumerate(reversed(digits))) % 10 == 0


def iban(value: str) -> bool:
    value = re.sub(r"\s", "", value).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", value):
        return False
    return int("".join(c if c.isdigit() else str(ord(c) - 55) for c in value[4:] + value[:4])) % 97 == 1


def detect_rules(text: str, header: str = "") -> list[Span]:
    found = []
    for label, pattern in COMPILED:
        for match in pattern.finditer(text):
            start, end = match.span("value") if "value" in pattern.groupindex else match.span()
            if start == end:
                continue
            if label in {"SECRET", "USERNAME", "ACCOUNT_ID"}:
                if end == len(text) or text[end:end+1] not in {"\"", "'"}:
                    while end > start and text[end-1] in ".,;":
                        end -= 1
                if text[start:end].lower() in {"is", "was", "missing", "unknown", "unavailable", "not", "none"}:
                    continue
            found.append(Span(start, end, label, "rule"))
    for match in re.finditer(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)", text):
        if luhn(match[0]):
            found.append(Span(*match.span(), "PAYMENT_CARD", "rule"))
    for match in re.finditer(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b", text):
        if iban(match[0]):
            found.append(Span(*match.span(), "IBAN", "rule"))
    # Clauses are candidates, not proof of a sensitive fact. Preserve all exact offsets.
    for start, end in text_units(text):
        for label, pattern in CONTEXTUAL.items():
            if re.search(pattern, text[start:end], re.I):
                found.append(Span(start, end, label, "context-rule"))
    normalized = re.sub(r"\W+", "_", header.strip().lower()).strip("_")
    if text.strip() and normalized in HEADER_LABELS:
        found.append(Span(0, len(text), HEADER_LABELS[normalized], "schema-rule"))
    return found


def reconcile(text: str, spans: list[Span]) -> list[Span]:
    """Split overlaps: a broad clause must never swallow an embedded identifier."""
    for span in spans:
        span.validate(text)
    boundaries = sorted({p for s in spans for p in (s.start, s.end)})
    result = []
    for a, b in zip(boundaries, boundaries[1:]):
        active = [s for s in spans if s.start <= a and s.end >= b]
        if not active:
            continue
        winner = max(active, key=lambda s: (s.label == "SECRET", s.label in DIRECT,
                     s.source.endswith("rule"), -(s.end - s.start), -LABELS.index(s.label)))
        if result and result[-1].end == a and (result[-1].label, result[-1].source) == (winner.label, winner.source):
            prev = result.pop()
            result.append(Span(prev.start, b, winner.label, winner.source))
        else:
            result.append(Span(a, b, winner.label, winner.source))
    return result
