"""Validated structured identifiers with simple field context.

A value is reported when its structure validates (check digits, birth date, issuer, country length) and
its surroundings do not say it is something else. The surroundings are read in the most basic way: the
header cell of a delimited row (CSV, TSV, SQL value tuples), otherwise the nearest label word before the
value on its line or on the line above. Digit-only national numbers that only pass a checksum need a
label; the ones that also encode a birth date need a label, a personal cue or the model's agreement.

`gate_learned` applies the same evidence to the model's own guesses for identifier types, so a UUID,
hash, amount or order number guessed as SECRET/PHONE/... goes to review instead of being replaced.
Pure standard library, like validators.py.
"""
import re
import unicodedata

from .contracts import Span
from . import validators as v

LABEL_WORDS = {
    "NATIONAL_ID": (
        "national id", "national identification", "personal id", "personal number", "personal identity code",
        "identity number", "id number", "id code", "id no", "social security", "ssn", "tax id", "tin",
        "hetu", "henkilotunnus", "sotu", "personnummer", "personnr", "pnr", "samordningsnummer",
        "fodselsnummer", "fnr", "cpr", "isikukood", "asmens kodas", "personas kods", "pesel", "rodne cislo",
        "birth number", "bsn", "burgerservicenummer", "rijksregisternummer", "numero national",
        "national number", "insz", "niss", "svnr", "sozialversicherungsnummer", "versicherungsnummer", "egn",
        "steuer id", "steuerid", "steueridentifikationsnummer", "idnr", "dni", "nie", "nir", "insee",
        "securite sociale", "oib", "ppsn", "pps", "codice fiscale", "cf", "nif", "contribuinte",
        "cartao de cidadao", "cnp", "emso", "nino", "national insurance", "passport",
    ),
    "PHONE": (
        "phone", "telephone", "tel", "mobile", "mob", "cell", "gsm", "fax", "whatsapp", "puhelin", "puh",
        "matkapuhelin", "telefon", "telefonnummer", "handy", "mobil", "telephone", "portable", "telefono",
        "movil", "cellulare", "telefoon", "mobiel", "telefone", "telemovel", "tlf", "reached on", "reached at",
        "call", "ring", "text me", "sms",
    ),
    "IBAN": ("iban", "account number", "bank account", "tilinumero", "kontonummer", "rekeningnummer",
             "numero de compte", "numero de cuenta", "conto corrente", "numer rachunku", "konto"),
    "PAYMENT_CARD": ("card", "credit card", "debit card", "card number", "kortti", "kreditkarte", "carte",
                     "tarjeta", "carta di credito", "pan"),
    "VAT_ID": ("vat", "vat id", "vat number", "vat no", "alv", "y tunnus", "ust id", "ust idnr", "umsatzsteuer",
               "btw", "tva", "iva", "partita iva", "p iva", "moms", "mva", "nip", "cif", "dic", "uid"),
    "SECRET": ("password", "passwd", "pwd", "passcode", "secret", "token", "api key", "apikey", "access key",
               "private key", "client secret", "credential", "credentials", "auth", "bearer", "salasana",
               "passwort", "kennwort", "mot de passe", "contrasena", "wachtwoord", "haslo", "losenord"),
    "PERSON": ("name", "full name", "fullname", "first name", "last name", "surname", "given name",
               "customer name", "contact person", "nimi", "namn", "navn", "naam", "nom", "prenom", "nombre",
               "apellido", "nome", "cognome", "imie", "nazwisko", "vards"),
    # Numbers that belong to documents, goods and systems rather than to people.
    "BUSINESS": (
        "order", "order no", "order number", "invoice", "tracking", "tracking code", "shipment", "parcel",
        "ean", "gtin", "upc", "sku", "barcode", "ticket", "case", "contract", "contract no", "po", "release",
        "version", "build", "commit", "sha", "hash", "checksum", "uuid", "guid", "trace", "span", "req",
        "request", "request id", "correlation id", "epoch", "timestamp", "port", "pid", "ref", "reference",
        "tilaus", "lasku", "bestellung", "rechnung", "commande", "facture", "pedido", "factura", "ordine",
        "fattura", "factuur", "zamowienie", "faktura", "bestallning", "sendungsnummer", "lahetys",
    ),
}
PERSONAL_CUES = re.compile(r"\b(?:my|his|her|their|your|our)\s+(?:\w+\s+)?(?:number|id|code)\b|\bpersonal\b|\bidentity\b")
_COMPILED = {cat: re.compile(r"(?<![a-z0-9])(?:" + "|".join(sorted(map(re.escape, words), key=len, reverse=True))
                             + r")(?:e?s)?(?![a-z0-9])") for cat, words in LABEL_WORDS.items()}
STRUCTURED = frozenset({"NATIONAL_ID", "PHONE", "IBAN", "PAYMENT_CARD", "VAT_ID", "IP_ADDRESS", "SECRET"})


def normalize(text: str) -> str:
    """Lower case, no diacritics, `_`/`-` as spaces, so `rodne_cislo` matches "rodné číslo"."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    return re.sub(r"[_\-]+", " ", text.replace("ø", "o").replace("ł", "l").replace("æ", "ae"))


def _nearest(text: str):
    """Category of the label word that ends closest to the end of text, or None."""
    best, best_end = None, -1
    norm = normalize(text)
    for cat, pattern in _COMPILED.items():
        for m in pattern.finditer(norm):
            if m.end() > best_end or (m.end() == best_end and cat != "BUSINESS"):
                best, best_end = cat, m.end()
    return best


def _delims(line: str, delim: str) -> int:
    """Delimiter count of a row, ignoring the "),"/");" that ends an SQL value tuple."""
    line = line.rstrip()
    if delim == "," and line.endswith(("),", ");", ")")):
        line = line.rstrip(",;")
    return line.count(delim)


def _row_header(text: str, start: int):
    """Header cell for a value inside a delimited row, using the first row of the block above."""
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", start)
    line_end = len(text) if line_end < 0 else line_end
    line = text[line_start:line_end]
    for delim in ("\t", ";", "|", ","):
        n = _delims(line, delim)
        if n < 2:
            continue
        lines = text[:line_end].split("\n")
        i = len(lines) - 1
        while i > 0 and _delims(lines[i - 1], delim) == n:
            i -= 1
        if i == len(lines) - 1:
            if i == 0:
                return None
            header = lines[i - 1]  # e.g. "INSERT ... (a, b, c) VALUES" above a single tuple
            if _delims(header, delim) != n:
                return None
        else:
            header = lines[i]
        column = line[:start - line_start].count(delim)
        cells = header.split(delim)
        if header == line or column >= len(cells):
            return None
        return cells[column]
    return None


def _clause_before(text: str, start: int, window: int) -> str:
    """Text before `start` on the same line and in the same sentence, at most `window` characters."""
    line_start = text.rfind("\n", 0, start) + 1
    before = text[max(line_start, start - window):start]
    cut = max((m.end() for m in re.finditer(r"[.!?]\s+(?=[A-ZÀ-Þ])", before)), default=0)
    return before[cut:]


def context(text: str, start: int, window: int = 48):
    """(category, source) describing what the surroundings say a value at `start` is."""
    header = _row_header(text, start)
    if header is not None:
        cat = _nearest(header)
        if cat:
            return cat, "column"
    line_start = text.rfind("\n", 0, start) + 1
    before = _clause_before(text, start, window)
    cat = _nearest(before)
    if cat:
        return cat, "label"
    if not text[line_start:start].strip() and line_start > 0:  # value alone on its line: "Telefon:\n040 123 4567"
        prev = text[text.rfind("\n", 0, line_start - 1) + 1:line_start - 1]
        cat = _nearest(prev[-window:])
        if cat:
            return cat, "label"
    return None, None


def _personal_cue(text: str, start: int) -> bool:
    return bool(PERSONAL_CUES.search(normalize(_clause_before(text, start, 40))))


# ---------------------------------------------------------------- look-alikes

LOOKALIKES = [re.compile(p) for p in (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",  # UUID
    r"(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,}",  # lower-case hex: hashes, commits, trace ids
    r"(?=[0-9A-F]*[A-F])(?=[0-9A-F]*\d)[0-9A-F]{16,}",
    r"\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?",  # ISO date/time
    r"\d{1,2}[./]\d{1,2}[./]\d{2,4}",  # dates
    r"v?\d+(?:\.\d+){1,2}",  # versions, decimals
    r"\d{1,3}(?:[ ,.\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?",  # amounts with thousand separators
    r"-?\d{1,3}\.\d{4,}",  # coordinates
)]


def lookalike(value: str) -> bool:
    value = value.strip()
    return any(p.fullmatch(value) for p in LOOKALIKES)


# ---------------------------------------------------------------- candidate finders

_B = r"(?<![\w+/@.-])"  # left boundary
_E = r"(?![\w@/-]|\.\w)"  # right boundary

SECRET_FORMATS = [re.compile(p) for p in (
    r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b",
    r"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
    r"\bgithub_pat_[A-Za-z0-9_]{40,}\b",
    r"\bglpat-[A-Za-z0-9_-]{20,}\b",
    r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b",
    r"\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b",
    r"\bAIza[0-9A-Za-z_-]{35}\b",
    r"\bsk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,}\b",
    r"\bhf_[A-Za-z0-9]{30,}\b",
    r"\bnpm_[A-Za-z0-9]{36}\b",
    r"\bpypi-[A-Za-z0-9_-]{40,}\b",
    r"\bSG\.[\w-]{20,}\.[\w-]{40,}\b",
    r"\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}",  # JSON Web Token
)]
URL_PASSWORD = re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s:/@]+:(?P<value>[^\s@/]+)@", re.I)
KEY_VALUE = re.compile(r"(?P<key>[A-Za-z_][\w.-]{1,40})[\"']?\s*(?:=|:|=>)\s*[\"']?(?P<value>[^\s\"',;]{4,})")
CODE_REFERENCE = re.compile(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+[\[(]?|[A-Za-z_]\w*[\[(].*")  # os.environ[..], env("..")
PLACEHOLDER_VALUE = re.compile(r"<[^>]*>|\$\{?[\w.]+\}?|\*+|x{3,}|\.{3,}|(?:null|none|true|false|changeme|"
                               r"redacted|example|your[_-]\w+|todo|tbd|undefined)", re.I)

IPV4 = re.compile(r"(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)")
IPV6 = re.compile(r"(?<![\w:.])(?=[0-9A-Fa-f:]*::|(?:[0-9A-Fa-f]{1,4}:){3})[0-9A-Fa-f:]{6,39}(?![\w:])")
IBAN_RE = re.compile(r"(?<![\w])[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}(?![\w])")
CARD_RE = re.compile(r"(?<![\w.-])(?<!\d,)\d(?:[ -]?\d){11,18}(?![\w-]|\.\d|,\d{1,2}\b)")
VAT_RE = re.compile(r"(?<![\w])(?:EL|[A-Z]{2}) ?[0-9A-Z][0-9A-Z.\- ]{1,13}[0-9A-Z](?![\w])")
PHONE_INTL = re.compile(r"(?<![\w+])(?:\+|00)\d[\d ()./-]{5,20}\d(?![\w])")
PHONE_LOCAL = re.compile(r"(?<![\w+./-])(?<!\d,)\(?\d[\d ()./-]{4,16}\d(?![\w]|[./-]\d|,\d{1,2}\b)")
NAME_VALUE = re.compile(r"(?P<key>[A-Za-z][\w .-]{1,30}?)[\"']?\s*[:=]\s*[\"']?(?P<value>[^\n\"',;:=]{3,60})")

# Detection priority when spans overlap (higher wins), then longer wins.
PRIORITY = {"SECRET": 7, "IBAN": 6, "PAYMENT_CARD": 5, "NATIONAL_ID": 4, "VAT_ID": 3, "IP_ADDRESS": 3,
            "PHONE": 2, "PERSON": 1}


def _shrink(text, m, check):
    """Try the match, then drop trailing space-separated groups until `check` passes."""
    start, end = m.span()
    while end > start:
        value = text[start:end].rstrip(" -")
        result = check(value)
        if result:
            return start, start + len(value), result
        cut = max(text.rfind(" ", start, end - 1), text.rfind("-", start, end - 1))
        if cut <= start:
            return None
        end = cut
    return None


def _overlaps_any(start, end, spans):
    return any(s.start < end and start < s.end for s in spans)


def _national_shapes():
    alternatives = sorted({shape for _, _, shape in v.NATIONAL_SCHEMES.values()}, key=len, reverse=True)
    return [re.compile(_B + "(?:" + shape + ")" + _E, re.I if "[A-Z]" in shape else 0) for shape in alternatives]


NATIONAL_SHAPES = _national_shapes()


def detect_structured(text: str, learned=()):
    """Validated identifier spans (source "id-rule"). `learned` model spans count as agreement only."""
    found = []  # (priority, length, Span)

    def add(start, end, label):
        while end > start and text[end - 1] in ".,;:":
            end -= 1
        if end > start:
            found.append((PRIORITY[label], end - start, Span(start, end, label, "id-rule")))

    # Secrets: documented token formats, passwords in URLs, values of secret-named keys.
    for pattern in SECRET_FORMATS:
        for m in pattern.finditer(text):
            add(*m.span(), "SECRET")
    for m in URL_PASSWORD.finditer(text):
        if not PLACEHOLDER_VALUE.fullmatch(m["value"]):
            add(*m.span("value"), "SECRET")
    for m in KEY_VALUE.finditer(text):
        key = normalize(m["key"])
        if _COMPILED["SECRET"].search(key) and not re.search(r"\b(?:url|uri|path|file|type|name|length|expir\w*|"
                                                           r"ttl|endpoint|header|public)\b", key):
            if not PLACEHOLDER_VALUE.fullmatch(m["value"]) and not CODE_REFERENCE.fullmatch(m["value"]):
                add(*m.span("value"), "SECRET")

    for m in IBAN_RE.finditer(text):
        hit = _shrink(text, m, v.iban)
        if hit:
            add(hit[0], hit[1], "IBAN")

    for m in CARD_RE.finditer(text):
        if v.card(m[0]) and context(text, m.start())[0] not in ("BUSINESS", "IBAN", "NATIONAL_ID", "PHONE"):
            add(*m.span(), "PAYMENT_CARD")

    model_says = [s for s in learned if s.label in STRUCTURED or s.label == "ACCOUNT_ID"]
    for pattern in NATIONAL_SHAPES:
        for m in pattern.finditer(text):
            schemes = v.national_id(m[0])
            if not schemes:
                continue
            strength = schemes[0][1]
            cat, _ = context(text, m.start())
            if cat == "NATIONAL_ID":
                ok = True
            elif cat is not None:
                ok = False  # labelled as something else: phone, order number, ...
            elif strength == "strong":
                ok = True
            elif strength == "medium":
                ok = _personal_cue(text, m.start()) or _overlaps_any(m.start(), m.end(), model_says)
            else:
                ok = False
            if ok:
                add(*m.span(), "NATIONAL_ID")

    for m in VAT_RE.finditer(text):
        hit = _shrink(text, m, v.vat)
        if hit and context(text, hit[0])[0] in (None, "VAT_ID"):
            add(hit[0], hit[1], "VAT_ID")

    for pattern in (IPV4, IPV6):
        for m in pattern.finditer(text):
            if v.ip_address(m[0]) and context(text, m.start())[0] != "BUSINESS":
                add(*m.span(), "IP_ADDRESS")

    for m in PHONE_INTL.finditer(text):
        hit = _shrink(text, m, v.phone)
        if hit and context(text, hit[0])[0] in (None, "PHONE"):
            add(hit[0], hit[1], "PHONE")
    for m in PHONE_LOCAL.finditer(text):
        if context(text, m.start())[0] == "PHONE":  # the label outranks shape: "512 345 678" is not an amount
            hit = _shrink(text, m, lambda x: v.phone(x, local_ok=True))
            if hit:
                add(hit[0], hit[1], "PHONE")

    # Names under a name column or after a name key ("Nimi: ...", "full_name", "name": "...").
    from .candidates import plausible_person  # local import: candidates imports this module
    for m in NAME_VALUE.finditer(text):
        if _nearest(m["key"]) == "PERSON" and _COMPILED["PERSON"].search(normalize(m["key"])):
            value = m["value"].strip()
            start = m.start("value") + m["value"].index(value)
            if plausible_person(value):
                add(start, start + len(value), "PERSON")
    for m in re.finditer(r"[^\n\t;|,]+", text):
        cell = m[0].strip().strip("'\"").strip()
        if not cell or not plausible_person(cell) or _row_header(text, m.start()) is None:
            continue
        header = _row_header(text, m.start())
        if _nearest(header) == "PERSON":
            start = m.start() + m[0].index(cell)
            add(start, start + len(cell), "PERSON")

    chosen = []
    for _, _, span in sorted(found, key=lambda x: (-x[0], -x[1], x[2].start)):
        if not _overlaps_any(span.start, span.end, chosen):
            chosen.append(span)
    return sorted(chosen, key=lambda s: s.start)


# ---------------------------------------------------------------- gate for learned guesses

GATED = frozenset({"SECRET", "PHONE", "PAYMENT_CARD", "NATIONAL_ID", "IBAN", "ACCOUNT_ID"})


def gate_learned(text: str, span: Span):
    """None if a learned identifier guess may be used as is, else a review reason."""
    value = text[span.start:span.end]
    if span.label in ("PERSON", "ORG", "LOCATION"):
        line_prefix = text[text.rfind("\n", 0, span.start) + 1:span.start]
        if text[span.end:span.end + 1] == ":" and line_prefix.strip(" \t-*•") == "":
            return "field_label_not_name"  # "Tilinumero: ..." or "- PESEL: ..." is a key
        return None
    if span.label not in GATED:
        return None
    if lookalike(value):
        return "lookalike_identifier_shape"
    cat, _ = context(text, span.start)
    if cat == "BUSINESS":
        return "business_number_context"
    if span.label == "PHONE" and not v.phone(value, local_ok=(cat == "PHONE")):
        return "unvalidated_phone"
    if span.label == "PAYMENT_CARD" and not v.card(value):
        return "unvalidated_card"
    if span.label == "IBAN" and not v.iban(value):
        return "unvalidated_iban"
    if span.label == "NATIONAL_ID" and cat != "NATIONAL_ID" and not v.national_id(value):
        return "unvalidated_national_id"
    if span.label == "SECRET" and cat != "SECRET":
        mixed = re.search(r"[a-z]", value) and re.search(r"[A-Z]", value) and re.search(r"\d", value)
        if not (len(value) >= 20 and mixed):
            return "unconfirmed_secret_shape"
    return None
