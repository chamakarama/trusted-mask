"""Check-digit and structure validation for structured identifiers.

Pure standard library (the browser build runs this module under Pyodide). Every function takes the
raw matched text, strips the separators people normally type, and returns the scheme name or False.
Algorithms follow the issuing authorities' published rules; a valid checksum proves the value is
well-formed, never that it belongs to anyone.
"""
import datetime as _dt
import ipaddress
import re

__all__ = ["card", "iban", "luhn", "national_id", "phone", "vat", "ip_address", "NATIONAL_SCHEMES"]


def _digits(value: str) -> str:
    return "".join(c for c in value if c.isascii() and c.isdigit())


def _compact(value: str) -> str:
    return re.sub(r"[\s./-]", "", value).upper()


def _date(year: int, month: int, day: int) -> bool:
    try:
        return _dt.date(year, month, day) <= _dt.date.today()
    except ValueError:
        return False


def _mod11_10(digits: str) -> bool:
    """ISO 7064 MOD 11,10 (hybrid system), used by several tax numbers."""
    p = 10
    for d in digits[:-1]:
        s = (int(d) + p) % 10 or 10
        p = (2 * s) % 11
    return (11 - p) % 10 == int(digits[-1])


def luhn(value: str) -> bool:
    d = _digits(value)
    if not d:
        return False
    total = 0
    for i, c in enumerate(reversed(d)):
        n = int(c)
        if i % 2:
            n = n * 2 - 9 if n > 4 else n * 2
        total += n
    return total % 10 == 0


# ---------------------------------------------------------------- payment cards

_CARD_BRANDS = (  # (prefix ranges, allowed lengths)
    ("visa", ((4, 4),), (13, 16, 19)),
    ("mastercard", ((51, 55), (2221, 2720)), (16,)),
    ("amex", ((34, 34), (37, 37)), (15,)),
    ("discover", ((6011, 6011), (644, 649), (65, 65)), (16, 19)),
    ("jcb", ((3528, 3589),), (16, 17, 18, 19)),
    ("diners", ((300, 305), (36, 36), (38, 39)), (14, 15, 16)),
    ("unionpay", ((62, 62),), (16, 17, 18, 19)),
    ("maestro", ((50, 50), (56, 58), (6304, 6304), (6759, 6759), (676770, 676774)), (16, 17, 18, 19)),
)


def card(value: str):
    """Issuer prefix, length and Luhn. Grouping must be blocks of 4 (Amex/Diners 4-6-x) or none."""
    if not re.fullmatch(r"\d[\d -]*\d", value):
        return False
    groups = re.split(r"[ -]", value)
    if len(groups) > 1 and not (all(len(g) == 4 for g in groups[:-1]) or [len(g) for g in groups[:2]] == [4, 6]):
        return False
    d = _digits(value)
    if not luhn(d):
        return False
    for brand, ranges, lengths in _CARD_BRANDS:
        if len(d) not in lengths:
            continue
        for lo, hi in ranges:
            width = len(str(lo))
            if lo <= int(d[:width]) <= hi:
                return brand
    return False


# ---------------------------------------------------------------- IBAN

_IBAN_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16, "BG": 22, "BH": 22, "BR": 29,
    "BY": 28, "CH": 21, "CR": 22, "CY": 28, "CZ": 24, "DE": 22, "DK": 18, "DO": 28, "EE": 20, "EG": 29,
    "ES": 24, "FI": 18, "FO": 18, "FR": 27, "GB": 22, "GE": 22, "GI": 23, "GL": 18, "GR": 27, "GT": 28,
    "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IQ": 23, "IS": 26, "IT": 27, "JO": 30, "KW": 30, "KZ": 20,
    "LB": 28, "LC": 32, "LI": 21, "LT": 20, "LU": 20, "LV": 21, "MC": 27, "MD": 24, "ME": 22, "MK": 19,
    "MR": 27, "MT": 31, "MU": 30, "NL": 18, "NO": 15, "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29,
    "RO": 24, "RS": 22, "SA": 24, "SC": 31, "SE": 24, "SI": 19, "SK": 24, "SM": 27, "ST": 25, "SV": 28,
    "TL": 23, "TN": 24, "TR": 26, "UA": 29, "VA": 22, "VG": 24, "XK": 20,
}


# Account-number (BBAN) layout for countries where it is fixed: n = digits, a = letters, c = either.
_BBAN = {
    "AT": "16n", "BE": "12n", "CH": "5n12c", "CZ": "20n", "DE": "18n", "DK": "14n", "EE": "16n",
    "ES": "20n", "FI": "14n", "FR": "10n11c2n", "GB": "4a14n", "HR": "17n", "HU": "24n", "IE": "4a14n",
    "IT": "1a10n12c", "LT": "16n", "LU": "3n13c", "LV": "4a13c", "NL": "4a10n", "NO": "11n",
    "PL": "24n", "PT": "21n", "RO": "4a16c", "SE": "20n", "SI": "15n", "SK": "20n",
}


def _es_ccc(bban):
    """Spanish account code: two control digits, over bank+branch and over the account number."""
    weights = (1, 2, 4, 8, 5, 10, 9, 7, 3, 6)

    def control(digits):
        c = 11 - sum(w * int(d) for w, d in zip(weights, digits)) % 11
        return {11: 0, 10: 1}.get(c, c)
    return control("00" + bban[:8]) == int(bban[8]) and control(bban[10:]) == int(bban[9])


def _bban_pattern(layout):
    parts = re.findall(r"(\d+)([nac])", layout)
    return "".join({"n": "[0-9]", "a": "[A-Z]", "c": "[A-Z0-9]"}[kind] + "{%s}" % count for count, kind in parts)


def iban(value: str):
    v = re.sub(r"[\s-]", "", value).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{8,30}", v):
        return False
    expected = _IBAN_LENGTHS.get(v[:2])
    if expected is not None and len(v) != expected:
        return False
    if expected is None and not 15 <= len(v) <= 34:
        return False
    if v[:2] in _BBAN and not re.fullmatch(_bban_pattern(_BBAN[v[:2]]), v[4:]):
        return False
    if v[:2] == "BE" and (int(v[4:14]) % 97 or 97) != int(v[14:]):
        return False  # Belgian account numbers carry their own mod-97 check
    if v[:2] == "ES" and not _es_ccc(v[4:]):
        return False
    rearranged = v[4:] + v[:4]
    if int("".join(str(int(c, 36)) for c in rearranged)) % 97 != 1:
        return False
    return "iban_" + v[:2].lower()


# ---------------------------------------------------------------- national identifiers
# Each validator returns True/False for a separator-stripped or raw value. STRENGTH says how much
# structure the format carries: "strong" values are rarely produced by chance, "medium" ones are
# digit strings that also encode a valid birth date, "weak" ones only pass a checksum.

def _fi_hetu(v):
    m = re.fullmatch(r"(\d{2})(\d{2})(\d{2})([-+A-FU-Y])(\d{3})([0-9A-Y])", v.upper())
    if not m:
        return False
    dd, mm, yy, sign, serial, check = m.groups()
    century = {"+": 1800, "-": 1900, "U": 1900, "V": 1900, "W": 1900, "X": 1900, "Y": 1900}.get(sign, 2000)
    if not _date(century + int(yy), int(mm), int(dd)) or int(serial) < 2:
        return False
    return "0123456789ABCDEFHJKLMNPRSTUVWXY"[int(dd + mm + yy + serial) % 31] == check


def _se_personnummer(v):
    m = re.fullmatch(r"(\d{2})?(\d{2})(\d{2})(\d{2})([-+]?)(\d{4})", v)
    if not m:
        return False
    cent, yy, mm, dd, sep, tail = m.groups()
    day = int(dd) - 60 if int(dd) > 60 else int(dd)  # coordination numbers add 60 to the day
    if cent:
        year = int(cent + yy)
    else:  # "-" means under 100 years old, "+" 100 or older
        this_year = _dt.date.today().year
        year = this_year - (this_year - int(yy)) % 100 - (100 if sep == "+" else 0)
    if cent and int(cent) not in (18, 19, 20):
        return False
    if not _date(year, int(mm), day):
        return False
    return luhn(yy + mm + dd + tail)


def _no_fodselsnummer(v):
    if not re.fullmatch(r"\d{11}", v):
        return False
    d = [int(c) for c in v]
    k1 = 11 - sum(w * x for w, x in zip((3, 7, 6, 1, 8, 9, 4, 5, 2), d)) % 11
    k2 = 11 - sum(w * x for w, x in zip((5, 4, 3, 2, 7, 6, 5, 4, 3, 2), d)) % 11
    k1, k2 = (0 if k1 == 11 else k1), (0 if k2 == 11 else k2)
    if k1 == 10 or k2 == 10 or (k1, k2) != (d[9], d[10]):
        return False
    day, month = int(v[:2]), int(v[2:4])
    if day > 40:
        day -= 40  # D-number
    if month > 40:
        month -= 40  # H-number
    individual = int(v[6:9])
    yy = int(v[4:6])
    if individual < 500:
        year = 1900 + yy
    elif individual < 750 and yy >= 54:
        year = 1800 + yy
    elif individual >= 900 and yy >= 40:
        year = 1900 + yy
    else:
        year = 2000 + yy
    return _date(year, month, day)


def _dk_cpr(v):
    # Since 2007 the modulus-11 check is no longer guaranteed; only the date is validated.
    m = re.fullmatch(r"(\d{2})(\d{2})(\d{2})-?(\d)(\d{3})", v)
    if not m:
        return False
    dd, mm, yy, c7, _rest = m.groups()
    yy, c7 = int(yy), int(c7)
    if c7 <= 3 or (c7 in (4, 9) and yy >= 37):
        year = 1900 + yy
    elif c7 in (4, 9):
        year = 2000 + yy
    elif yy >= 58:
        year = 1800 + yy
    else:
        year = 2000 + yy
    return _date(year, int(mm), int(dd))


def _ee_lt(v):
    """Estonian isikukood and Lithuanian asmens kodas share the layout and check digit."""
    if not re.fullmatch(r"[1-6]\d{10}", v):
        return False
    d = [int(c) for c in v]
    s = sum(w * x for w, x in zip((1, 2, 3, 4, 5, 6, 7, 8, 9, 1), d)) % 11
    if s == 10:
        s = sum(w * x for w, x in zip((3, 4, 5, 6, 7, 8, 9, 1, 2, 3), d)) % 11
        s = 0 if s == 10 else s
    if s != d[10]:
        return False
    year = 1800 + 100 * ((d[0] - 1) // 2) + int(v[1:3])
    return _date(year, int(v[3:5]), int(v[5:7]))


def _lv_personas_kods(v):
    v = v.replace("-", "")
    if not re.fullmatch(r"\d{11}", v):
        return False
    if v.startswith("32"):  # post-2017 codes carry no birth date
        d = [int(c) for c in v]
    else:
        century = {"0": 1800, "1": 1900, "2": 2000}.get(v[6])
        if century is None or not _date(century + int(v[4:6]), int(v[2:4]), int(v[:2])):
            return False
        d = [int(c) for c in v]
    check = (1101 - sum(w * x for w, x in zip((1, 6, 3, 7, 9, 10, 5, 8, 4, 2), d))) % 11
    return check != 10 and check == d[10]


def _pl_pesel(v):
    if not re.fullmatch(r"\d{11}", v):
        return False
    d = [int(c) for c in v]
    if (10 - sum(w * x for w, x in zip((1, 3, 7, 9, 1, 3, 7, 9, 1, 3), d)) % 10) % 10 != d[10]:
        return False
    month = int(v[2:4])
    base = {0: 1900, 1: 1900, 2: 2000, 3: 2000, 4: 2100, 5: 2100, 6: 2200, 7: 2200, 8: 1800, 9: 1800}[month // 10]
    month = month % 20
    return _date(base + int(v[:2]), month, int(v[4:6]))


def _cz_sk_rodne_cislo(v):
    v = v.replace("/", "")
    if not re.fullmatch(r"\d{9,10}", v):
        return False
    yy, mm, dd = int(v[:2]), int(v[2:4]), int(v[4:6])
    if mm > 70:
        mm -= 70
    elif mm > 50:
        mm -= 50
    elif mm > 20:
        mm -= 20
    if len(v) == 9:
        year = 1900 + yy
        if year >= 1954:
            return False
    else:
        year = 1900 + yy if yy >= 54 else 2000 + yy
        if not (int(v) % 11 == 0 or (int(v[:9]) % 11 == 10 and v[9] == "0")):
            return False
    return _date(year, mm, dd)


def _nl_bsn(v):
    if not re.fullmatch(r"\d{9}", v) or v == "000000000":
        return False
    return sum(w * int(c) for w, c in zip((9, 8, 7, 6, 5, 4, 3, 2, -1), v)) % 11 == 0


def _be_national_number(v):
    v = re.sub(r"[ .-]", "", v)
    if not re.fullmatch(r"\d{11}", v):
        return False
    body, check = int(v[:9]), int(v[9:])
    if 97 - body % 97 == check:
        year = 1900
    elif 97 - int("2" + v[:9]) % 97 == check:
        year = 2000
    else:
        return False
    mm, dd = int(v[2:4]), int(v[4:6])
    if mm == 0 or dd == 0:  # unknown birth date components are allowed
        return True
    if mm > 40:
        mm -= 40  # bis numbers
    elif mm > 20:
        mm -= 20
    return _date(year + int(v[:2]), mm, dd)


def _at_svnr(v):
    v = v.replace(" ", "")
    if not re.fullmatch(r"\d{10}", v) or v[0] == "0":
        return False
    d = [int(c) for c in v]
    s = sum(w * x for w, x in zip((3, 7, 9, 0, 5, 8, 4, 2, 1, 6), d)) % 11
    if s == 10 or s != d[3]:
        return False
    dd, mm = int(v[4:6]), int(v[6:8])
    if mm > 12 or dd > 31:
        return False  # unknown dates are written with day/month up to 13+ in rare cases; reject
    return dd >= 1 and mm >= 1


def _bg_egn(v):
    if not re.fullmatch(r"\d{10}", v):
        return False
    d = [int(c) for c in v]
    c = sum(w * x for w, x in zip((2, 4, 8, 5, 10, 9, 7, 3, 6), d)) % 11
    if (0 if c == 10 else c) != d[9]:
        return False
    mm = int(v[2:4])
    year = 1900 + int(v[:2])
    if mm > 40:
        mm, year = mm - 40, year + 100
    elif mm > 20:
        mm, year = mm - 20, year - 100
    return _date(year, mm, int(v[4:6]))


def _de_steuer_id(v):
    v = v.replace(" ", "")
    if not re.fullmatch(r"[1-9]\d{10}", v):
        return False
    counts = sorted((v[:10].count(c) for c in set(v[:10])), reverse=True)
    # Exactly one digit repeats (twice, or three times not all adjacent); the rest occur once.
    if counts[0] not in (2, 3) or (len(counts) > 1 and counts[1] > 1):
        return False
    if counts[0] == 3 and re.search(r"(\d)\1\1", v[:10]):
        return False
    return _mod11_10(v)


def _hr_oib(v):
    return bool(re.fullmatch(r"\d{11}", v)) and _mod11_10(v)


def _es_dni_nie(v):
    v = v.replace("-", "").replace(" ", "").upper()
    m = re.fullmatch(r"([XYZ]?)(\d{7,8})([A-Z])", v)
    if not m:
        return False
    prefix, num, letter = m.groups()
    if prefix:
        if len(num) != 7:
            return False
        num = str("XYZ".index(prefix)) + num
    elif len(num) != 8:
        return False
    return "TRWAGMYFPDXBNJZSQVHLCKE"[int(num) % 23] == letter


def _fr_nir(v):
    v = v.replace(" ", "").upper()
    m = re.fullmatch(r"([1-478])(\d{2})(\d{2})(\d{2}|2A|2B)(\d{6})(\d{2})", v)
    if not m:
        return False
    _sex, _yy, mm, dept, rest, key = m.groups()
    if not (1 <= int(mm) <= 12 or 20 <= int(mm) <= 42 or 50 <= int(mm) <= 99):
        return False
    numeric = v[:13].replace("2A", "19").replace("2B", "18")
    return 97 - int(numeric) % 97 == int(key)


def _ie_ppsn(v):
    v = v.replace(" ", "").upper()
    m = re.fullmatch(r"(\d{7})([A-W])([ABHW]?)", v)
    if not m:
        return False
    digits, check, extra = m.groups()
    total = sum(int(c) * (8 - i) for i, c in enumerate(digits))
    if extra:
        total += 9 * (ord(extra) - 64)
    return "WABCDEFGHIJKLMNOPQRSTUV"[total % 23] == check


_CF_ODD = dict(zip("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                   (1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21,
                    2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23)))
_CF_OMOCODE = dict(zip("LMNPQRSTUV", "0123456789"))


def _it_codice_fiscale(v):
    v = v.replace(" ", "").upper()
    if not re.fullmatch(r"[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]", v):
        return False
    total = 0
    for i, c in enumerate(v[:15]):
        total += _CF_ODD[c] if i % 2 == 0 else (int(c) if c.isdigit() else ord(c) - 65)
    if chr(65 + total % 26) != v[15]:
        return False
    day = int("".join(_CF_OMOCODE.get(c, c) for c in v[9:11]))
    day = day - 40 if day > 40 else day
    month = "ABCDEHLMPRST".index(v[8]) + 1
    yy = int("".join(_CF_OMOCODE.get(c, c) for c in v[6:8]))
    return _date(1900 + yy if yy else 2000, month, day)  # century unknown; 19yy has 20yy's leap years


def _pt_nif(v):
    if not re.fullmatch(r"[1235689]\d{8}", v):
        return False
    s = sum(int(c) * w for c, w in zip(v[:8], range(9, 1, -1)))
    check = 11 - s % 11
    return (0 if check >= 10 else check) == int(v[8])


def _pt_cc(v):
    v = v.replace(" ", "").upper()
    if not re.fullmatch(r"\d{9}[A-Z0-9]{2}\d", v):
        return False
    total = 0
    for i, c in enumerate(reversed(v)):
        n = int(c, 36)
        if i % 2:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _ro_cnp(v):
    if not re.fullmatch(r"[1-9]\d{12}", v):
        return False
    d = [int(c) for c in v]
    c = sum(w * x for w, x in zip((2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9), d)) % 11
    if (1 if c == 10 else c) != d[12]:
        return False
    century = {1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000}.get(d[0])
    county = int(v[7:9])
    if not (1 <= county <= 52 or county in (70, 80, 81, 82, 83)):
        return False
    if century is None:  # residents/foreigners: date still checked against 1900
        century = 1900
    return _date(century + int(v[1:3]), int(v[3:5]), int(v[5:7]))


def _si_emso(v):
    if not re.fullmatch(r"\d{13}", v):
        return False
    d = [int(c) for c in v]
    s = sum(w * x for w, x in zip((7, 6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2), d))
    k = 11 - s % 11
    k = 0 if k == 11 else k
    if k == 10 or k != d[12]:
        return False
    yyy = int(v[4:7])
    year = 1000 + yyy if yyy >= 800 else 2000 + yyy
    return _date(year, int(v[2:4]), int(v[:2]))


def _us_ssn(v):
    m = re.fullmatch(r"(\d{3})-?(\d{2})-?(\d{4})", v)
    if not m:
        return False
    area, group, serial = m.groups()
    return area not in ("000", "666") and area[0] != "9" and group != "00" and serial != "0000"


def _uk_nino(v):
    v = v.replace(" ", "").upper()
    if not re.fullmatch(r"[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]", v):
        return False
    return v[:2] not in ("BG", "GB", "KN", "NK", "NT", "TN", "ZZ")


# scheme -> (validator, strength, accepted raw shape)
NATIONAL_SCHEMES = {
    "fi_hetu": (_fi_hetu, "strong", r"\d{6}[-+A-FU-Y]\d{3}[0-9A-Y]"),
    "se_personnummer": (_se_personnummer, "medium", r"(?:\d{6}|\d{8})[-+]?\d{4}"),
    "no_fodselsnummer": (_no_fodselsnummer, "medium", r"\d{6} ?\d{5}"),
    "dk_cpr": (_dk_cpr, "medium", r"\d{6}-?\d{4}"),
    "ee_isikukood": (_ee_lt, "medium", r"\d{11}"),
    "lt_asmens_kodas": (_ee_lt, "medium", r"\d{11}"),
    "lv_personas_kods": (_lv_personas_kods, "medium", r"\d{6}-?\d{5}"),
    "pl_pesel": (_pl_pesel, "medium", r"\d{11}"),
    "cz_sk_rodne_cislo": (_cz_sk_rodne_cislo, "medium", r"\d{6}/?\d{3,4}"),
    "nl_bsn": (_nl_bsn, "weak", r"\d{9}|\d{4}\.\d{2}\.\d{3}"),
    "be_national_number": (_be_national_number, "medium", r"\d{2}\.?\d{2}\.?\d{2}[- ]?\d{3}[.-]?\d{2}"),
    "at_svnr": (_at_svnr, "medium", r"\d{4} ?\d{6}"),
    "bg_egn": (_bg_egn, "medium", r"\d{10}"),
    "de_steuer_id": (_de_steuer_id, "weak", r"\d{2} ?\d{3} ?\d{3} ?\d{3}"),
    "hr_oib": (_hr_oib, "weak", r"\d{11}"),
    "es_dni_nie": (_es_dni_nie, "strong", r"[XYZ]?-?\d{7,8}-?[A-Z]"),
    "fr_nir": (_fr_nir, "strong", r"[1-478] ?\d{2} ?\d{2} ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3} ?\d{2}"),
    "ie_ppsn": (_ie_ppsn, "strong", r"\d{7}[A-W][ABHW]?"),
    "it_codice_fiscale": (_it_codice_fiscale, "strong", r"[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]"),
    "pt_nif": (_pt_nif, "weak", r"\d{9}"),
    "pt_cc": (_pt_cc, "strong", r"\d{8} ?\d ?[A-Z]{2}\d"),
    "ro_cnp": (_ro_cnp, "medium", r"\d{13}"),
    "si_emso": (_si_emso, "medium", r"\d{13}"),
    "us_ssn": (_us_ssn, "medium", r"\d{3}-\d{2}-\d{4}"),
    "uk_nino": (_uk_nino, "strong", r"[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]"),
}
_STRENGTH_ORDER = {"strong": 3, "medium": 2, "weak": 1}


def national_id(value: str, schemes=None):
    """Return [(scheme, strength), ...] for every scheme the raw value validates under."""
    out = []
    raw = value.strip()
    for name, (check, strength, shape) in NATIONAL_SCHEMES.items():
        if schemes is not None and name not in schemes:
            continue
        if not re.fullmatch(shape, raw, re.I):
            continue
        # Validators that read a separator (century sign, slash, dash) get the raw value without spaces.
        keeps_separator = name in ("fi_hetu", "se_personnummer", "dk_cpr", "lv_personas_kods", "us_ssn",
                                   "cz_sk_rodne_cislo")
        compact = raw.replace(" ", "") if keeps_separator else _compact(raw)
        try:
            if check(compact):
                out.append((name, strength))
        except (ValueError, KeyError, IndexError):
            continue
    return sorted(out, key=lambda x: -_STRENGTH_ORDER[x[1]])


# ---------------------------------------------------------------- VAT

def _vat_at(b):
    if not re.fullmatch(r"U\d{8}", b):
        return False
    d = [int(c) for c in b[1:]]
    s = 0
    for i, x in enumerate(d[:7]):
        if i % 2:
            x = x * 2
            x = x // 10 + x % 10
        s += x
    return (10 - (s + 4) % 10) % 10 == d[7]


def _vat_be(b):
    if re.fullmatch(r"\d{9}", b):
        b = "0" + b
    return bool(re.fullmatch(r"[01]\d{9}", b)) and 97 - int(b[:8]) % 97 == int(b[8:])


def _vat_de(b):
    return bool(re.fullmatch(r"[1-9]\d{8}", b)) and _mod11_10(b)


def _vat_dk(b):
    return bool(re.fullmatch(r"[1-9]\d{7}", b)) and \
        sum(w * int(c) for w, c in zip((2, 7, 6, 5, 4, 3, 2, 1), b)) % 11 == 0


def _vat_fi(b):
    if not re.fullmatch(r"\d{8}", b):
        return False
    s = sum(w * int(c) for w, c in zip((7, 9, 10, 5, 8, 4, 2), b)) % 11
    if s == 1:
        return False
    return (0 if s == 0 else 11 - s) == int(b[7])


def _vat_fr(b):
    m = re.fullmatch(r"(\d{2})(\d{9})", b)
    if not m or not luhn(m.group(2)):
        return False
    return int(m.group(1)) == (12 + 3 * (int(m.group(2)) % 97)) % 97


def _vat_it(b):
    if not re.fullmatch(r"\d{11}", b) or b[:7] == "0000000":
        return False
    office = int(b[7:10])  # provincial office code
    return (1 <= office <= 100 or office in (120, 121, 888, 999)) and luhn(b)


def _vat_nl(b):
    m = re.fullmatch(r"(\d{9})B(\d{2})", b)
    if not m or m.group(2) == "00":
        return False
    if _nl_bsn(m.group(1)):
        return True
    converted = "".join(str(int(c, 36)) for c in "NL" + b)  # sole-trader numbers since 2020
    return int(converted) % 97 == 1


def _vat_pl(b):
    if not re.fullmatch(r"\d{10}", b):
        return False
    s = sum(w * int(c) for w, c in zip((6, 5, 7, 2, 3, 4, 5, 6, 7), b)) % 11
    return s != 10 and s == int(b[9])


def _vat_se(b):
    return bool(re.fullmatch(r"\d{10}01", b)) and luhn(b[:10])


def _vat_lu(b):
    return bool(re.fullmatch(r"\d{8}", b)) and int(b[:6]) % 89 == int(b[6:])


def _vat_es(b):
    if _es_dni_nie(b):
        return True
    m = re.fullmatch(r"([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])", b)
    if not m:
        return False
    digits = m.group(2)
    s = 0
    for i, c in enumerate(digits):
        n = int(c)
        if i % 2 == 0:
            n *= 2
            n = n // 10 + n % 10
        s += n
    check = (10 - s % 10) % 10
    return m.group(3) in (str(check), "JABCDEFGHI"[check])


_VAT = {
    "AT": _vat_at, "BE": _vat_be, "DE": _vat_de, "DK": _vat_dk, "FI": _vat_fi, "FR": _vat_fr, "IT": _vat_it,
    "NL": _vat_nl, "PL": _vat_pl, "SE": _vat_se, "LU": _vat_lu, "ES": _vat_es, "PT": _pt_nif, "HR": _hr_oib,
}
def vat(value: str):
    """Return 'vat_xx' when the member state's check digit validates (states listed in _VAT only)."""
    v = re.sub(r"[\s.-]", "", value).upper()
    m = re.fullmatch(r"([A-Z]{2})([0-9A-Z+*]{2,12})", v)
    if not m:
        return False
    cc, body = m.groups()
    check = _VAT.get(cc)
    try:
        return "vat_" + cc.lower() if check and check(body) else False
    except (ValueError, KeyError):
        return False


# ---------------------------------------------------------------- phone numbers

# Country calling code -> (min, max) national significant number length (ITU numbering plans).
_CALLING = {
    "1": (10, 10), "7": (10, 10), "20": (9, 10), "27": (9, 9), "30": (10, 10), "31": (9, 9), "32": (8, 9),
    "33": (9, 9), "34": (9, 9), "36": (8, 9), "39": (6, 11), "40": (9, 9), "41": (9, 9), "43": (4, 13),
    "44": (9, 10), "45": (8, 8), "46": (7, 13), "47": (8, 8), "48": (9, 9), "49": (6, 13), "51": (8, 9),
    "52": (10, 10), "54": (10, 11), "55": (10, 11), "56": (9, 9), "57": (10, 10), "60": (8, 10), "61": (9, 9),
    "62": (8, 12), "63": (10, 10), "64": (8, 10), "65": (8, 8), "66": (8, 9), "81": (9, 10), "82": (8, 10),
    "84": (9, 10), "86": (10, 11), "90": (10, 10), "91": (10, 10), "92": (10, 10), "212": (9, 9),
    "234": (8, 10), "254": (9, 9), "351": (9, 9), "352": (4, 11), "353": (7, 9), "354": (7, 9), "356": (8, 8),
    "357": (8, 8), "358": (5, 12), "359": (6, 9), "370": (8, 8), "371": (8, 8), "372": (7, 8), "373": (8, 8),
    "375": (9, 9), "380": (9, 9), "381": (8, 9), "385": (8, 9), "386": (8, 8), "387": (8, 8), "389": (8, 8),
    "420": (9, 9), "421": (9, 9), "423": (7, 9), "880": (10, 10), "966": (9, 9), "971": (8, 9), "972": (8, 9),
}


def phone(value: str, local_ok: bool = False):
    """International numbers are checked against their country's length; national ones need local_ok.

    local_ok is the caller's statement that context (a phone label, column or cue) supports a phone reading.
    """
    raw = value.strip()
    if not re.fullmatch(r"(?:\+|00)?[\d ()./-]+", raw) or re.search(r"[./-]{2}|\)\(", raw):
        return False
    d = _digits(raw)
    if raw.startswith("+") or (raw.startswith("00") and not raw.startswith("000")):
        rest = d[2:] if raw.startswith("00") else d
        for n in (1, 2, 3):
            cc = rest[:n]
            if cc in _CALLING:
                lo, hi = _CALLING[cc]
                nsn = rest[n:]
                if nsn.startswith("0") and cc not in ("39", "225"):
                    nsn = nsn[1:]  # "+44 (0)20 ..." trunk prefix written in by habit
                if lo <= len(nsn) <= hi:
                    return "phone_" + cc
                return False
        return "phone_intl" if raw.startswith("+") and 8 <= len(rest) <= 15 else False
    if not local_ok:
        return False
    return "phone_national" if 6 <= len(d) <= 12 else False


# ---------------------------------------------------------------- IP addresses

def ip_address(value: str):
    try:
        ip = ipaddress.ip_address(value.strip("[]"))
    except ValueError:
        return False
    if ip.version == 4 and value.count(".") != 3:
        return False
    if ip.is_unspecified or ip.is_loopback:
        return False  # 0.0.0.0, 127.0.0.1, ::1 identify no one
    return "ipv%d" % ip.version
