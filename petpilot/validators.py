"""Value-level validators: does a single value look like (and check out as) a given kind of identifier?

Everything here runs locally on the raw values. Nothing is sent anywhere.
"""
from __future__ import annotations

import ipaddress
import re
from datetime import date

# ---------------------------------------------------------------- Finnish personal identity code (HETU)
HETU_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY"
_HETU_RX = re.compile(r"^(\d{2})(\d{2})(\d{2})([-+A-FU-Y]?)(\d{3})([0-9A-Y])$")
_CENTURY = {"+": 1800, "-": 1900, "U": 1900, "V": 1900, "W": 1900, "X": 1900, "Y": 1900,
            "A": 2000, "B": 2000, "C": 2000, "D": 2000, "E": 2000, "F": 2000}


def _hetu_match(v: str):
    return _HETU_RX.match(v.strip().upper().replace(" ", ""))


def is_hetu(v: str) -> bool:
    """Full HETU, with or without the century sign, with a valid check character."""
    m = _hetu_match(v)
    if not m:
        return False
    dd, mm, yy, _sign, nnn, chk = m.groups()
    if not (1 <= int(dd) <= 31 and 1 <= int(mm) <= 12):
        return False
    return HETU_CHECK[int(dd + mm + yy + nnn) % 31] == chk


def hetu_birthdate(v: str) -> date | None:
    m = _hetu_match(v)
    if not m:
        return None
    dd, mm, yy, sign, _nnn, _chk = m.groups()
    century = _CENTURY.get(sign, 1900 if int(yy) > 25 else 2000)
    try:
        return date(century + int(yy), int(mm), int(dd))
    except ValueError:
        return None


def hetu_canonical_variants(v: str) -> list[str]:
    """Spellings an attacker would try when hashing a HETU (with/without separators, both centuries)."""
    m = _hetu_match(v)
    if not m:
        return []
    dd, mm, yy, sign, nnn, chk = m.groups()
    signs = {sign} if sign else {"-", "A"}
    out = {v.strip(), v.strip().upper()}
    for s in signs | {"-", "A"}:
        out.add(f"{dd}{mm}{yy}{s}{nnn}{chk}")
    out.add(f"{dd}{mm}{yy}{nnn}{chk}")
    return sorted(out)


# ---------------------------------------------------------------- banking
def is_iban(v: str) -> bool:
    s = re.sub(r"\s", "", v).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", s):
        return False
    digits = "".join(str(int(ch, 36)) for ch in s[4:] + s[:4])
    return int(digits) % 97 == 1


def luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d *= 2
            if d > 9:
                d -= 9
        total += d
        alt = not alt
    return total % 10 == 0


def is_payment_card(v: str) -> bool:
    s = re.sub(r"[\s-]", "", v)
    if re.fullmatch(r"\d{13,19}", s):
        return luhn_ok(s)
    # masked forms: 411111******1111, **** **** **** 1234, XXXX-1234
    return bool(re.fullmatch(r"[\d*Xx•]{8,19}", s)) and bool(re.search(r"[*Xx•]", s)) and len(re.sub(r"\D", "", s)) >= 4


# ---------------------------------------------------------------- contact
_EMAIL_RX = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")


def is_email(v: str) -> bool:
    return bool(_EMAIL_RX.match(v.strip()))


def is_phone(v: str) -> bool:
    s = re.sub(r"[\s()./-]", "", v.strip())
    return bool(re.fullmatch(r"(\+358|00358|0)\d{6,11}", s) or re.fullmatch(r"\+\d{8,14}", s))


# ---------------------------------------------------------------- vehicles, network, devices
def is_plate(v: str) -> bool:
    return bool(re.fullmatch(r"[A-ZÅÄÖ]{2,3}-\d{1,3}", v.strip().upper()))


def is_mac(v: str) -> bool:
    return bool(re.fullmatch(r"[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}", v.strip()))


def ip_kind(v: str) -> str | None:
    """'ip' for an address, 'net' for a CIDR range, None otherwise."""
    s = v.strip()
    try:
        ipaddress.ip_address(s)
        return "ip"
    except ValueError:
        pass
    if "/" in s:
        try:
            ipaddress.ip_network(s, strict=False)
            return "net"
        except ValueError:
            return None
    return None


def hash_kind(v: str) -> str | None:
    s = v.strip()
    if re.fullmatch(r"[0-9a-fA-F]+", s):
        return {32: "md5", 40: "sha1", 64: "sha256"}.get(len(s))
    return None


def is_url(v: str) -> bool:
    return bool(re.match(r"^(https?|ftp)://\S+$", v.strip(), re.I))


def is_domain(v: str) -> bool:
    s = v.strip().lower().rstrip(".")
    return (" " not in s and "@" not in s and "/" not in s
            and bool(re.fullmatch(r"([a-z0-9-]+\.)+[a-z]{2,24}", s)))


def is_user_agent(v: str) -> bool:
    s = v.strip()
    return s.startswith("Mozilla/") or bool(re.match(r"^[\w.-]+/[\d.]+ \(", s))


def is_hostname(v: str) -> bool:
    """Corporate device names such as LT-AINVIR-0423 or WS-FIN-112."""
    return bool(re.fullmatch(r"[A-Z]{2,4}-[A-Z0-9]{2,10}(-[A-Z0-9]{2,10}){0,2}", v.strip().upper())) and any(
        ch.isdigit() for ch in v)


# ---------------------------------------------------------------- time
_TS_RXS = [
    re.compile(r"^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$"),
    re.compile(r"^\d{1,2}\.\d{1,2}\.\d{4} \d{1,2}[:.]\d{2}(:\d{2})?$"),
]
_DATE_RXS = [
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})$"), "ymd"),
    (re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$"), "dmy"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$"), "dmy"),
    (re.compile(r"^(\d{1,2})\.(\d{1,2})\.(\d{2})$"), "dmy"),
    (re.compile(r"^(\d{4})(\d{2})(\d{2})$"), "ymd"),
]
_PERIOD_RXS = [re.compile(r"^\d{4}-\d{2}$"), re.compile(r"^\d{4}-W\d{1,2}$"), re.compile(r"^\d{4}-\d{2}/\d$"),
               re.compile(r"^\d{4}[/-]\d{4}$"), re.compile(r"^(19|20)\d{2}$"), re.compile(r"^\d{4}-?(Q|H)[1-4]$"),
               re.compile(r"^(K|S)\d{4}$|^\d{4}(K|S)$")]


def is_timestamp(v: str) -> bool:
    s = v.strip()
    return any(rx.match(s) for rx in _TS_RXS)


def parse_date(v: str) -> date | None:
    s = v.strip()
    for rx, order in _DATE_RXS:
        m = rx.match(s)
        if not m:
            continue
        a, b, c = m.groups()
        try:
            if order == "ymd":
                return date(int(a), int(b), int(c))
            y = int(c)
            if y < 100:
                y += 1900 if y > 25 else 2000
            return date(y, int(b), int(a))
        except ValueError:
            return None
    return None


def is_date(v: str) -> bool:
    return parse_date(v) is not None


def is_period(v: str) -> bool:
    s = v.strip()
    return any(rx.match(s) for rx in _PERIOD_RXS)


# ---------------------------------------------------------------- places
def is_postcode(v: str) -> bool:
    return bool(re.fullmatch(r"\d{5}|\d{3}\*\*|\d{3}", v.strip()))


_STREET_SUFFIX = (r"(katu|tie|kuja|polku|väylä|vayla|rinne|mäki|maki|kaari|ranta|puisto|aukio|tori|raitti|piha|"
                  r"tanhua|linja|ahde|katu|gatan|vägen|gränd|stigen|backen|street|road|lane|avenue)")
_ADDR_RX = re.compile(
    r"^[A-ZÅÄÖ][\wåäöÅÄÖé.'-]*(\s[\wåäöÅÄÖé.'-]+){0,3}\s\d{1,4}(\s?[A-Za-z]{1,2}(\s?\d{1,3})?)?(,?\s*\d{5}(\s+[\wåäöÅÄÖ\s-]+)?)?$")


def is_street_address(v: str) -> bool:
    s = v.strip()
    return bool(_ADDR_RX.match(s)) and bool(re.search(_STREET_SUFFIX, s.lower()) or re.search(r",\s*\d{5}", s))


_NAME_PART = r"[A-ZÅÄÖÉÜ][a-zåäöéüš'-]+"
_NAME_RX = re.compile(rf"^{_NAME_PART}(?:[ -]{_NAME_PART}){{1,3}}$")
_UPPER_NAME_RX = re.compile(rf"^[A-ZÅÄÖÉÜ'-]{{2,}}(?: (?:{_NAME_PART}|[A-ZÅÄÖÉÜ'-]{{2,}})){{1,3}}$")
_INITIAL_NAME_RX = re.compile(rf"^[A-ZÅÄÖ]\. ?{_NAME_PART}$")
_ORG_SUFFIX_RX = re.compile(r"\b(Oy|Oyj|Ab|Abp|Ltd|ry|Inc|GmbH|AS|AB|Ky|Tmi|plc|LLC|Bank|Pankki)\.?$", re.I)


def is_org_name(v: str) -> bool:
    return bool(_ORG_SUFFIX_RX.search(v.strip()))


def is_person_name(v: str) -> bool:
    s = v.strip()
    if any(ch.isdigit() for ch in s) or is_org_name(s):
        return False
    return bool(_NAME_RX.match(s) or _UPPER_NAME_RX.match(s) or _INITIAL_NAME_RX.match(s))


def is_lat_fi(x: float) -> bool:
    return 59.0 <= x <= 70.5


def is_lon_fi(x: float) -> bool:
    return 19.0 <= x <= 31.6
