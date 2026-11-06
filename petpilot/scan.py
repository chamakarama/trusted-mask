"""Scan step: work out what every column of a table contains, with a written reason.

Runs fully locally (no AI, no network). Signals, strongest first:
  1. value validators with checksums (HETU, IBAN, Luhn cards) and strict formats (email, phone, plate, IP, MAC...)
  2. cross-column checks (a column that is a reversible hash of another, a birth date already inside the HETU)
  3. column-name keywords in English, Finnish and Swedish
  4. category values that reveal an age group or a special category (e.g. a disability discount)
  5. table context (a reference table of bus stops) and column statistics

Every finding carries the ids of the rules that produced it (`rule_ids`). Absence of evidence is never treated as
evidence of safety: fallbacks, reference-table downgrades and unlinked hashes are flagged `needs_review`.

Output vocabulary follows metadata/taxonomy.md so `pets-eval detect` can score the best-guess roles.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from . import validators as V

SAMPLE_ROWS = 5000   # rows read per table: the scanner sees the first SAMPLE_ROWS rows only
MATCH = 0.6          # share of non-empty values that must match a validator
ROLE_ABBR = {"direct_identifier": "di", "quasi_identifier": "qi", "sensitive_attribute": "sa",
             "technical_identifier": "ti", "free_text": "ft", "record_key": "rk", "non_sensitive": "ns"}


@dataclass
class ColumnResult:
    table: str
    column: str
    privacy_role: str            # best guess in the 7-role taxonomy (used for pets-eval scoring)
    subtype: str
    reason: str
    confidence: float = 0.8      # heuristic, not a calibrated probability
    art9: bool = False
    links: list = field(default_factory=list)
    rule_ids: list = field(default_factory=list)
    fallback: bool = False       # nothing positive was found: the inventory reports role "unknown"
    review: bool = False         # explicit reasons to review, set by rules

    @property
    def certainty(self) -> str:
        if self.fallback:
            return "unknown"
        if self.confidence >= .9:
            return "high"
        if self.confidence >= .7:
            return "medium"
        return "low"

    @property
    def needs_review(self) -> bool:
        return self.fallback or self.review or self.art9 or self.certainty in ("low", "unknown")

    @property
    def inventory_role(self) -> str:
        return "unknown" if self.fallback else self.privacy_role


# ------------------------------------------------------------------ column-name keywords
def _norm_name(col: str) -> str:
    s = re.sub(r"([a-z])([A-Z])", r"\1_\2", str(col)).lower()
    return re.sub(r"[^a-z0-9åäö]+", "_", s).strip("_")


# (regex on normalised name, role, subtype, art9, reason)
NAME_RULES: list[tuple[str, str, str, bool, str]] = [
    # direct identifiers
    (r"hetu|ssn|personal_?id|henkilotunnus|henkilötunnus|national_id|personnummer|sotu", "direct_identifier", "NATIONAL_ID", False, "name says national ID"),
    (r"(^|_)e_?mail|sahkoposti|sähköposti|(^|_)upn$|_upn$", "direct_identifier", "EMAIL", False, "name says e-mail / login e-mail"),
    (r"phone|mobile|puhelin|gsm|telefon|(^|_)tel($|_)", "direct_identifier", "PHONE", False, "name says phone"),
    (r"iban|bank_?account|tilinumero|kontonummer", "direct_identifier", "IBAN", False, "name says bank account"),
    (r"card_?pan|(^|_)pan$|card_?number|card_?masked|kortti_?nro", "direct_identifier", "PAYMENT_CARD", False, "name says payment card"),
    (r"plate|rekisteri_?nro|rekisterinumero|reg_?no", "direct_identifier", "LICENSE_PLATE", False, "name says licence plate"),
    (r"property_?id|kiinteisto", "direct_identifier", "PROPERTY_ID", False, "name says property identifier"),
    (r"(street_?)?address|osoite|adress|home_addr", "direct_identifier", "STREET_ADDRESS", False, "name says street address"),
    (r"customer_?number|asiakasnumero|client_?no", "direct_identifier", "CUSTOMER_ID", False, "name says customer number"),
    (r"contract_?(number|no)|sopimusnumero|invoice_?no", "direct_identifier", "ACCOUNT_ID", False, "name says contract/invoice number"),
    (r"learner_?id|oppijanumero", "direct_identifier", "STUDENT_ID", False, "name says national learner number"),
    (r"(^|_)(full_?)?name$|first_?names?|last_?name|surname|given_?name|display_?name|(^|_)nimi$|sukunimi|etunimi|"
     r"holder_?name|guardian\d?_?name|physician_?name|author_?name|teacher_?name|agent_?name|handler_?name|"
     r"reporter_?name|applicant_?name|case_?officer|sender_?display|from_name|patient_?name", "direct_identifier",
     "PERSON_NAME", False, "name says person name"),
    # technical identifiers
    (r"(^|_)ip($|_)|ip_?addr|src_?ip|dst_?ip|client_?ip|device_?ip|assigned_?ip", "technical_identifier", "IP_ADDRESS", False, "name says IP address"),
    (r"(^|_)mac($|_)", "technical_identifier", "MAC_ADDRESS", False, "name says MAC address"),
    (r"hostname|device_?name|(^|_)host$", "technical_identifier", "HOSTNAME", False, "name says device host name"),
    (r"user_?agent", "technical_identifier", "USER_AGENT", False, "name says user agent"),
    (r"imei|iccid|device_?id|serial", "technical_identifier", "DEVICE_ID", False, "name says device identifier"),
    (r"metering_?point|meter_?id|gsrn|kayttopaikka", "technical_identifier", "METER_ID", False, "name says metering point"),
    (r"(^|_)user(name)?$|login|user_?account|username|tunnus$", "technical_identifier", "USERNAME", False, "name says user account"),
    (r"reference_?(number|no)|viitenumero|account_?id", "technical_identifier", "ACCOUNT_ID", False, "name says account / reference"),
    # quasi-identifiers
    (r"birth|dob|syntym|fodelse|födelse", "quasi_identifier", "BIRTH_DATE", False, "name says birth date"),
    (r"(^|_)age($|_)|age_?band|(^|_)ika($|_)|ikä", "quasi_identifier", "AGE", False, "name says age"),
    (r"(^|_)sex$|gender|sukupuoli|kon$|kön", "quasi_identifier", "SEX", False, "name says sex/gender"),
    (r"postcode|zip|postal|postinumero|postnummer|(^|_)pc\d?$", "quasi_identifier", "POSTCODE", False, "name says postcode"),
    (r"municipality|kunta|kommun|(^|_)city$|(^|_)town$", "quasi_identifier", "MUNICIPALITY", False, "name says municipality"),
    (r"(^|_)lat($|_|itude)|(^|_)lon($|_|gitude)|(^|_)lng$", "quasi_identifier", "GPS_COORDINATE", False, "name says coordinate"),
    (r"language|kieli|språk|sprak|(^|_)lang$", "quasi_identifier", "LANGUAGE", False, "name says language (proxy for ethnicity/region)"),
    (r"nationality|citizenship|kansalaisuus", "quasi_identifier", "NATIONALITY", False, "name says nationality"),
    (r"occupation|job_?title|ammatti|tehtava|tehtävä|titel|profession", "quasi_identifier", "OCCUPATION", False, "name says occupation"),
    (r"employer|department|osasto|school_?(code|name)|workplace|tyopaikka|työpaikka|office|unit$|yksikko", "quasi_identifier", "ORG_NAME", False, "name says employer/department/school"),
    (r"station|(^|_)stop(_id)?$|car_?park|location|place|(^|_)site$|geo_?(city|country)|merchant_?(city|country)", "quasi_identifier", "LOCATION_NAME", False, "name says a place where a person was"),
    (r"(^|_)(line|route|linja|reitti)$", "quasi_identifier", "CATEGORY", False, "name says the line/route used: narrows down where a person travelled"),
    # sensitive attributes (incl. GDPR Art. 9)
    (r"icd|diagnos|(^|_)dx($|_)|disease|sairaus|diagnoosi", "sensitive_attribute", "DIAGNOSIS_CODE", True, "name says diagnosis (Art. 9 health)"),
    (r"triage|disposition|readmit|admission|los_?min|length_?of_?stay|abnormal|symptom|medication|allerg|"
     r"disab|medical|health|terveys|sick|sairaus|illness|special_?support|accessibility|excused|pain|hoito",
     "sensitive_attribute", "HEALTH_DATA", True, "name says health information (Art. 9)"),
    (r"systolic|diastolic|heart_?rate|pulse|resp_?rate|spo2|(^|_)temp_?c$|blood_?pressure|bmi|glucose",
     "sensitive_attribute", "MEASUREMENT", True, "name says clinical measurement (Art. 9 health)"),
    (r"religion|uskonto|union|(^|_)ay_|ammattiliitto|ethnic|migrant|second_?language|s2|sexual|political|"
     r"belief|criminal|rikos", "sensitive_attribute", "SOCIAL_DATA", True, "name says a special category (Art. 9)"),
    (r"income|salary|wage|palkka|(^|_)pay(_|$)|late_?payment|payment_?(plan|default)|debt|velka|kyc|(^|_)pep|"
     r"credit|cost_?estimate|balance|bonus", "sensitive_attribute", "FINANCIAL_DATA", False, "name says personal financial data"),
    (r"grade|points|arvosana|unexcused|late_?arrival", "sensitive_attribute", "EDUCATION_DATA", False, "name says assessment results"),
    # free text
    (r"note|text|description|message|comment|reason|subject|complaint|body|kuvaus|viesti|muistiinpano|"
     r"selite|lisatieto|command_?line|file_?path|attachment|resolution|title|vapaa", "free_text", "FREE_TEXT", False, "name says free text"),
    # non-sensitive helpers (aggregates, measures)
    (r"(^|_)(count|visits|n|total|sum|device_?count)$|_count$", "non_sensitive", "AGGREGATE", False, "name says an aggregate count"),
]
_NAME_RULES_RX = [(re.compile(rx), role, st, a9, why, f"name.{ROLE_ABBR[role]}.{st.lower()}")
                  for rx, role, st, a9, why in NAME_RULES]

ENTITY_SUBTYPE = [
    (r"student|learner|oppilas|opiskelija", "STUDENT_ID"),
    (r"customer|asiakas|client", "CUSTOMER_ID"),
    (r"employee|staff|physician|doctor|agent|author|teacher|nurse|handler|tyontekija|henkilo", "EMPLOYEE_ID"),
    (r"patient|potilas", "PATIENT_ID"),
    (r"card", "CARD_ID"),
    (r"account|user|reporter", "ACCOUNT_ID"),
    (r"device|bike|vehicle|ambulance", "DEVICE_ID"),
]
PERSONAL_ENTITIES = re.compile(r"student|learner|customer|asiakas|client|employee|staff|physician|doctor|agent|author|"
                               r"teacher|patient|potilas|card|account|user|reporter|holder|person|member|upn|mac|plate|"
                               r"meter|metering|hetu|visit|conversation|applicant")

# category values that reveal a special category (GDPR Art. 9) or an age group
ART9_VALUE_RX = re.compile(r"disab|invalid|handicap|wheelchair|blind|deaf|medical|health|illness|sick|pregnan|"
                           r"religio|church|union|ethnic|migrant|refugee|asylum|prison|criminal|hiv|mental|psych|"
                           r"therap|rehab|welfare|unemploy|reduced")
AGE_VALUE_RX = re.compile(r"(?:^|_|\b)(?:child|children|kid|youth|junior|student|senior|pensioner|elder|elderly|"
                          r"adult|lapsi|nuori|opiskelija|eläke|elake)(?:_|\b|$)")


def _person_name_confirmed(p) -> bool:
    """A name-like column only counts as person names if the values look like people. A bare "name" column with
    few distinct values (stops, stations, sensors) is not confirmed, whatever its shape. A specific column such as
    `surname` or `given_name` may hold single capitalised words ("Virtanen"), which still identify people."""
    bare = p.norm in ("name", "nimi", "namn", "name_fi", "name_sv")
    if bare:
        return p.rates["person"] >= .3 and p.nunique > 20
    single_word = float(p.values.head(2000).str.match(r"^[A-ZÅÄÖÉÜ][a-zåäöéüš'-]+$").mean()) if p.nonnull else 0.0
    return p.rates["person"] >= .3 or single_word >= .6


def _entity_subtype(name: str, default: str = "RECORD_ID") -> str:
    for rx, st in ENTITY_SUBTYPE:
        if re.search(rx, name):
            return st
    return default


# ------------------------------------------------------------------ profiling
@dataclass
class Profile:
    name: str
    norm: str
    n: int
    nonnull: int
    nunique: int
    uniq_ratio: float
    values: pd.Series          # non-empty sample values as str
    mean_len: float
    space_share: float
    num_share: float
    rates: dict


def _rate(vals: pd.Series, fn) -> float:
    if not len(vals):
        return 0.0
    return float(vals.map(lambda v: bool(fn(v))).mean())


def profile(col: str, s: pd.Series) -> Profile:
    s = s.astype("string")
    vals = s.dropna().str.strip()
    vals = vals[vals != ""]
    test = vals.head(2000)
    num = pd.to_numeric(test.str.replace(",", ".", regex=False).str.replace(r"\s", "", regex=True), errors="coerce")
    rates = {
        "hetu": _rate(test, V.is_hetu),
        "iban": _rate(test, V.is_iban),
        "card": _rate(test, V.is_payment_card),
        "email": _rate(test, V.is_email),
        "phone": _rate(test, V.is_phone),
        "plate": _rate(test, V.is_plate),
        "mac": _rate(test, V.is_mac),
        "ip": _rate(test, lambda v: V.ip_kind(v) == "ip"),
        "net": _rate(test, lambda v: V.ip_kind(v) == "net"),
        "hash": _rate(test, V.hash_kind),
        "url": _rate(test, V.is_url),
        "domain": _rate(test, V.is_domain),
        "ua": _rate(test, V.is_user_agent),
        "hostname": _rate(test, V.is_hostname),
        "ts": _rate(test, V.is_timestamp),
        "date": _rate(test, V.is_date),
        "period": _rate(test, V.is_period),
        "postcode": _rate(test, V.is_postcode),
        "address": _rate(test, V.is_street_address),
        "person": _rate(test, V.is_person_name),
        "org": _rate(test, V.is_org_name),
        "lat": float(num.dropna().map(V.is_lat_fi).mean()) if num.notna().mean() > .9 else 0.0,
        "lon": float(num.dropna().map(V.is_lon_fi).mean()) if num.notna().mean() > .9 else 0.0,
        "decimals": float(test.str.contains(r"[.,]\d{4,}$", regex=True).mean()) if len(test) else 0.0,
    }
    return Profile(
        name=col, norm=_norm_name(col), n=len(s), nonnull=len(vals), nunique=int(vals.nunique()),
        uniq_ratio=float(vals.nunique() / max(len(vals), 1)), values=vals,
        mean_len=float(test.str.len().mean()) if len(test) else 0.0,
        space_share=float(test.str.contains(" ").mean()) if len(test) else 0.0,
        num_share=float(num.notna().mean()) if len(test) else 0.0, rates=rates,
    )


# ------------------------------------------------------------------ classification of one column
def _by_values(p: Profile):
    """Strong evidence from the values themselves. Returns (role, subtype, reason, confidence, rule_id) or None."""
    r = p.rates
    pct = lambda k: f"{r[k]:.0%}"
    if r["hetu"] >= MATCH:
        return "direct_identifier", "NATIONAL_ID", f"{pct('hetu')} of values are valid Finnish ID codes (checksum verified)", .99, "val.hetu"
    if r["iban"] >= MATCH:
        return "direct_identifier", "IBAN", f"{pct('iban')} of values are IBANs with a valid mod-97 check", .99, "val.iban"
    if r["card"] >= MATCH and r["phone"] < .3:
        return "direct_identifier", "PAYMENT_CARD", f"{pct('card')} of values are payment card numbers (Luhn-valid or masked)", .95, "val.payment_card"
    if r["email"] >= MATCH:
        return "direct_identifier", "EMAIL", f"{pct('email')} of values are e-mail addresses", .97, "val.email"
    if r["mac"] >= MATCH:
        return "technical_identifier", "MAC_ADDRESS", f"{pct('mac')} of values are MAC addresses", .97, "val.mac"
    if r["net"] >= MATCH:
        return "non_sensitive", "IP_ADDRESS", "values are network ranges (CIDR), not a person's device", .7, "val.ip_network"
    if r["ip"] >= MATCH:
        return "technical_identifier", "IP_ADDRESS", f"{pct('ip')} of values are IP addresses", .95, "val.ip"
    if r["plate"] >= MATCH:
        return "direct_identifier", "LICENSE_PLATE", f"{pct('plate')} of values look like Finnish licence plates", .9, "val.plate"
    if r["phone"] >= MATCH and p.num_share < .95 or (r["phone"] >= .8):
        return "direct_identifier", "PHONE", f"{pct('phone')} of values are phone numbers", .9, "val.phone"
    if r["ua"] >= MATCH:
        return "technical_identifier", "USER_AGENT", f"{pct('ua')} of values are browser user-agent strings", .9, "val.user_agent"
    if r["url"] >= MATCH:
        return "free_text", "URL", "full URLs: paths and query strings can carry e-mails, tokens and names", .85, "val.url"
    if r["hash"] >= MATCH:
        return "technical_identifier", "OTHER", f"{pct('hash')} of values look like hash digests", .6, "val.hash"
    if r["ts"] >= MATCH:
        return "quasi_identifier", "TIMESTAMP", f"{pct('ts')} of values are timestamps (exact times link to sightings, posts, receipts)", .9, "val.timestamp"
    if r["address"] >= MATCH:
        return "direct_identifier", "STREET_ADDRESS", f"{pct('address')} of values are street addresses", .85, "val.street_address"
    if r["person"] >= MATCH and p.uniq_ratio > .05 and p.nunique > 20:
        return "direct_identifier", "PERSON_NAME", f"{pct('person')} of values are shaped like person names", .8, "val.person_name"
    if r["date"] >= MATCH:
        return "quasi_identifier", "DATE", f"{pct('date')} of values are calendar dates", .8, "val.date"
    if r["domain"] >= MATCH:
        return "quasi_identifier", "URL", f"{pct('domain')} of values are domain names (browsing behaviour)", .75, "val.domain"
    if r["hostname"] >= MATCH and p.uniq_ratio > .01:
        return "technical_identifier", "HOSTNAME", f"{pct('hostname')} of values look like device host names", .7, "val.hostname"
    if r["lat"] >= .95 and r["decimals"] > .5:
        return "quasi_identifier", "GPS_COORDINATE", "values are latitudes inside Finland with fine precision", .85, "val.latitude"
    if r["lon"] >= .95 and r["decimals"] > .5 and r["lat"] < .5:
        return "quasi_identifier", "GPS_COORDINATE", "values are longitudes inside Finland with fine precision", .85, "val.longitude"
    if r["org"] >= MATCH:
        return "quasi_identifier", "ORG_NAME", f"{pct('org')} of values are organisation names (employer/bank reveals affiliation)", .7, "val.org_name"
    if p.mean_len >= 30 and p.space_share >= .7 and p.uniq_ratio >= .2:
        return "free_text", "FREE_TEXT", f"long free text (avg {p.mean_len:.0f} chars) can contain anything", .85, "val.free_text"
    return None


def _by_name(p: Profile):
    for rx, role, st, a9, why, rid in _NAME_RULES_RX:
        if rx.search(p.norm):
            return role, st, why, a9, rid
    return None


def _category_semantics(p: Profile):
    """Low-cardinality text categories whose values reveal a special category or an age group."""
    if p.nonnull == 0 or p.nunique > 60 or p.num_share > .5:
        return None
    vocab = pd.Series(p.values.str.lower().unique())
    art9 = vocab[vocab.str.contains(ART9_VALUE_RX)]
    age = vocab[vocab.str.contains(AGE_VALUE_RX)]
    if len(art9):
        return ("quasi_identifier", "CATEGORY", True, "val.category_art9_hint",
                f"{len(art9)} of {len(vocab)} category values name a special-category trait (e.g. disability/health) "
                f"or a proxy for one; review before any use")
    if len(age):
        return ("quasi_identifier", "CATEGORY", False, "val.category_age_proxy",
                f"{len(age)} of {len(vocab)} category values encode an age group (child/student/senior...)")
    return None


def _small_vocab(p: Profile, vocab: set[str], share: float = .9) -> bool:
    if not p.nonnull:
        return False
    return float(p.values.str.lower().isin(vocab).mean()) >= share


SEX_VOCAB = {"m", "f", "n", "x", "male", "female", "mies", "nainen", "man", "kvinna", "muu", "other", "u"}
LANG_VOCAB = {"fi", "sv", "en", "ru", "et", "ar", "so", "fa", "de", "fr", "es", "uk", "fin", "swe", "eng", "suomi",
              "ruotsi", "englanti", "finnish", "swedish", "english", "other", "muu"}


def _res(ctx, p, role, st, why, conf, rules, **kw) -> ColumnResult:
    return ColumnResult(ctx["table"], p.name, role, st, why, conf, rule_ids=list(rules), **kw)


def classify(p: Profile, ctx: dict) -> ColumnResult:
    name = p.norm
    is_first = ctx["first_col"] == p.name
    vres = _by_values(p)
    nres = _by_name(p)

    # 1) record key: first column, unique, named like an id
    if is_first and p.uniq_ratio > .98 and re.search(r"(^|_)(id|nro|no|key|ref)$|_id$", name):
        st = _entity_subtype(name) if re.search(r"customer|card|student", name) else "RECORD_ID"
        return _res(ctx, p, "record_key", st, "first column, unique per row: a row key", .9, ["ctx.record_key"])

    # 2) strong value evidence wins for identifiers (works even with obfuscated headers)
    if vres and vres[0] in ("direct_identifier", "technical_identifier") and vres[3] >= .9:
        role, st, why, conf, rid = vres
        rules = [rid]
        if nres and nres[1] == "USERNAME" and st == "EMAIL":
            st, rules = "USERNAME", rules + [nres[4]]
        return _res(ctx, p, role, st, why, conf, rules)

    # 3) other id-like columns: foreign keys to people/records
    if re.search(r"(_id|_ref|_key|_no|_nro)$|^id_", name) and not (nres and nres[0] in ("direct_identifier",)):
        if re.search(r"campaign", name):
            return _res(ctx, p, "non_sensitive", "CATEGORY", "campaign label, not about a person", .6,
                        ["ctx.id_column.campaign"])
        if re.search(r"correlation|session|smtp|message", name):
            return _res(ctx, p, "technical_identifier", "RECORD_ID", "event/session id links events together", .6,
                        ["ctx.id_column.session"])
        if re.search(r"stop|station|sensor|car_?park|zone", name):
            return _res(ctx, p, "quasi_identifier", "LOCATION_NAME", "place id: where a person was", .7,
                        ["ctx.id_column.place"])
        if re.search(r"vehicle|bike|ambulance", name):
            return _res(ctx, p, "non_sensitive", "DEVICE_ID", "shared vehicle id, not a person's device", .5,
                        ["ctx.id_column.shared_vehicle"])
        if re.search(r"business|y_?tunnus|org", name):
            return _res(ctx, p, "technical_identifier", "ORG_NAME", "business id (sole traders are people)", .5,
                        ["ctx.id_column.business"])
        st = _entity_subtype(name)
        why = ("persistent id that links all records of one card/account: joins reveal a history"
               if st in ("CARD_ID", "ACCOUNT_ID", "CUSTOMER_ID", "STUDENT_ID", "PATIENT_ID", "EMPLOYEE_ID")
               else "id that points to another record: joins reveal who did what")
        return _res(ctx, p, "technical_identifier", st, why, .75, ["ctx.id_column.entity"])

    # 4) column-name semantics when values are not decisive
    if nres:
        role, st, why, a9, rid = nres
        rules = [rid]
        review = False
        if st == "PERSON_NAME" and not _person_name_confirmed(p):
            # a column called "name" whose values do not look like people (e.g. stop names): do not guess
            return _res(ctx, p, "non_sensitive", "CATEGORY",
                        "name-like column whose values are not confirmed as person names (few distinct values or wrong shape); review", .4,
                        rules + ["val.person_name.unconfirmed"], fallback=True)
        if vres and vres[0] == "free_text" and role not in ("free_text", "sensitive_attribute"):
            role, st, why = vres[0], vres[1], vres[2]
            rules.append(vres[4])
        elif vres and vres[0] == role:
            rules.append(vres[4])                 # name and values agree
        elif role in ("sensitive_attribute", "quasi_identifier"):
            review = True                         # name-only evidence for a sensitive or linking column
        if role == "quasi_identifier" and st in ("MUNICIPALITY", "POSTCODE", "LOCATION_NAME", "GPS_COORDINATE") and \
                ctx["reference"]:
            role, why, review = "non_sensitive", why + "; but this is a reference table about places, not people", True
            rules.append("ctx.reference_table")
        if st == "AGE" and p.rates["date"] >= MATCH:
            st = "BIRTH_DATE"
        return _res(ctx, p, role, st, why, .75, rules, art9=a9, review=review)

    # 5) category values that reveal a special category or an age group
    cat = _category_semantics(p)
    if cat:
        role, st, a9, rid, why = cat
        return _res(ctx, p, role, st, why, .7, [rid], art9=a9, review=True)

    # 6) remaining value evidence (QIs, text, coordinates, dates)
    if vres:
        role, st, why, conf, rid = vres
        rules = [rid]
        if st == "DATE" and ctx["birthlike"].get(p.name):
            st, why = "BIRTH_DATE", why + "; spread like birth dates"
            rules.append("val.date.birthlike_spread")
        return _res(ctx, p, role, st, why, conf, rules)

    # 7) small vocabularies
    if _small_vocab(p, SEX_VOCAB) and p.nunique <= 4:
        return _res(ctx, p, "quasi_identifier", "SEX", "values are a sex/gender code", .7, ["vocab.sex"])
    if _small_vocab(p, LANG_VOCAB) and p.nunique <= 12:
        return _res(ctx, p, "quasi_identifier", "LANGUAGE", "values are language codes", .7, ["vocab.language"])
    if p.rates["postcode"] >= MATCH and p.nunique > 5:
        return _res(ctx, p, "quasi_identifier", "POSTCODE", "values are 5-digit postcodes", .7, ["val.postcode"])
    if p.rates["period"] >= MATCH:
        return _res(ctx, p, "non_sensitive", "DATE", "values are periods (month/term/year)", .5, ["val.period"])

    # 8) fallback by shape: nothing positive found. Reported as role "unknown" in the inventory, never as safe.
    if p.num_share > .95:
        return _res(ctx, p, "non_sensitive", "MEASUREMENT",
                    "numbers with no recognised meaning; review (could still be salary, a health score...)", .4,
                    ["fallback.numeric"], fallback=True)
    return _res(ctx, p, "non_sensitive", "CATEGORY",
                "values with no recognised meaning; review (short codes can still encode sensitive traits)", .4,
                ["fallback.category"], fallback=True)


# ------------------------------------------------------------------ table level
def _birthlike(p: Profile) -> bool:
    if p.rates["date"] < MATCH:
        return False
    years = p.values.head(2000).map(lambda v: (V.parse_date(v) or None))
    years = years.dropna().map(lambda d: d.year)
    if len(years) < 10:
        return False
    return years.min() < 1975 and years.max() < 2012 and (years.max() - years.min()) > 30


def _person_signal(df: pd.DataFrame, profiles: dict) -> bool:
    """Does anything in the table point at a person? (If not, it is treated as a reference table, with review.)"""
    for c, p in profiles.items():
        v = _by_values(p)
        n = _by_name(p)
        if v and v[0] in ("direct_identifier",) or (v and v[0] == "technical_identifier" and v[1] != "OTHER"):
            return True
        if n and n[1] == "PERSON_NAME" and not _person_name_confirmed(p):
            n = None                                   # "name" of a stop/station, not of a person
        if n and n[0] in ("direct_identifier", "technical_identifier", "sensitive_attribute", "free_text"):
            return True
        if n and n[1] in ("BIRTH_DATE", "AGE", "SEX", "LANGUAGE"):
            return True
        if c != df.columns[0] and re.search(r"_id$", p.norm) and PERSONAL_ENTITIES.search(p.norm):
            return True
        if p.rates["ts"] >= MATCH and c != df.columns[0] and any(
                re.search(r"_id$", q.norm) and PERSONAL_ENTITIES.search(q.norm) for q in profiles.values()):
            return True
        if _category_semantics(p):
            return True
    return False


def scan_table(df: pd.DataFrame, table: str) -> list[ColumnResult]:
    profiles = {c: profile(c, df[c]) for c in df.columns}
    ctx = {"table": table, "first_col": df.columns[0], "reference": not _person_signal(df, profiles),
           "birthlike": {c: _birthlike(p) for c, p in profiles.items()}}
    results = [classify(p, ctx) for p in profiles.values()]
    if ctx["reference"]:
        for r in results:
            if r.privacy_role != "record_key":
                r.privacy_role = "non_sensitive"
                r.reason += " (reference table: no column points at a person; review)"
                r.review = True
                if "ctx.reference_table" not in r.rule_ids:
                    r.rule_ids.append("ctx.reference_table")
    _cross_column(df, profiles, results)
    return results


def _cross_column(df: pd.DataFrame, profiles: dict, results: list[ColumnResult]) -> None:
    """Links between columns: reversible hashes and data already encoded in a HETU."""
    by_col = {r.column: r for r in results}
    hetu_cols = [r.column for r in results if r.subtype == "NATIONAL_ID" and r.privacy_role == "direct_identifier"]
    # (a) a hash column that is just hash(another column): an attacker reverses it in seconds
    for r in results:
        p = profiles[r.column]
        if p.rates["hash"] < MATCH:
            continue
        sample = df[[r.column] + [c for c in df.columns if c != r.column]].dropna(subset=[r.column]).head(300)
        target = sample[r.column].astype(str).str.strip().str.lower()
        best = (0.0, None, None)
        for other in df.columns:
            if other == r.column or profiles[other].rates["hash"] >= MATCH:
                continue
            hits = 0
            for t, v in zip(target, sample[other]):
                if pd.isna(v) or str(v).strip() == "":
                    continue
                cands = set(V.hetu_canonical_variants(str(v))) or {str(v).strip()}
                cands |= {c.lower() for c in cands}
                for c in cands:
                    if any(getattr(hashlib, a)(c.encode()).hexdigest() == t for a in ("sha256", "sha1", "md5")):
                        hits += 1
                        break
            rate = hits / max(len(target), 1)
            if rate > best[0]:
                best = (rate, other, by_col[other])
        if best[0] >= .2:
            rate, other, orow = best
            r.privacy_role = orow.privacy_role if orow.privacy_role in ("direct_identifier", "technical_identifier") \
                else "technical_identifier"
            r.subtype = orow.subtype
            r.reason = (f"reversible: {rate:.0%} of the first {len(target)} values are an unsalted hash of '{other}' "
                        f"(an attacker hashes candidate values and matches them)")
            r.confidence, r.fallback = .95, False
            r.rule_ids.append("xcol.hash_of")
            r.links.append(("hash_of", other, round(rate, 3)))
        else:
            # no link found is not evidence of safety: keep it as an identifier-like column and ask for review
            r.privacy_role, r.subtype = "technical_identifier", "OTHER"
            r.reason = "hash-like digests; no link to another column found in the sample (that does not make them safe); review"
            r.review = True
            r.rule_ids.append("xcol.hash_unlinked")
    # (b) a date column that equals the birth date inside a HETU column (redundant, still a QI)
    for h in hetu_cols:
        births = df[h].astype("string").map(lambda v: V.hetu_birthdate(v) if isinstance(v, str) else None)
        for r in results:
            if r.column == h or profiles[r.column].rates["date"] < MATCH:
                continue
            dates = df[r.column].astype("string").map(lambda v: V.parse_date(v) if isinstance(v, str) else None)
            both = pd.DataFrame({"a": births, "b": dates}).dropna().head(2000)
            if len(both) >= 20 and (both.a == both.b).mean() > .8:
                r.privacy_role, r.subtype = "quasi_identifier", "BIRTH_DATE"
                r.reason = f"same as the birth date encoded in '{h}' ({(both.a == both.b).mean():.0%} match)"
                r.rule_ids.append("xcol.encoded_in_hetu")
                r.links.append(("encoded_in", h, round(float((both.a == both.b).mean()), 3)))


# ------------------------------------------------------------------ files and folders
def read_csv(path: Path, nrows: int | None = SAMPLE_ROWS) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, nrows=nrows, keep_default_na=False, na_values=[""], encoding="utf-8")


def scan_folder(data_dir: Path, only: list[str] | None = None) -> pd.DataFrame:
    """Scan every <dataset>/<table>.csv under data_dir; returns one row per column (best-guess roles)."""
    rows = []
    for d in sorted(p for p in Path(data_dir).iterdir() if p.is_dir()):
        if only and d.name not in only:
            continue
        for f in sorted(d.glob("*.csv")):
            df = read_csv(f)
            for r in scan_table(df, f.stem):
                rows.append(dict(dataset=d.name, table=f.stem, column=r.column, privacy_role=r.privacy_role,
                                 subtype=r.subtype, art9=r.art9, confidence=r.confidence, reason=r.reason,
                                 links=";".join(f"{a}:{b}" for a, b, _ in r.links),
                                 rule_ids="|".join(r.rule_ids), certainty=r.certainty,
                                 needs_review=r.needs_review, inventory_role=r.inventory_role))
    return pd.DataFrame(rows)
