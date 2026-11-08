"""Validated identifiers, field context and the gate on learned identifier guesses."""
import pytest

from mask.ml.privacy_v1 import validators as v
from mask.ml.privacy_v1.contracts import Span
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.identifiers import context, detect_structured, gate_learned, lookalike


@pytest.mark.parametrize("value,scheme", [
    ("131052-308T", "fi_hetu"), ("811228-9874", "se_personnummer"), ("44051401359", "pl_pesel"),
    ("111222333", "nl_bsn"), ("12345678Z", "es_dni_nie"), ("RSSMRA85T10A562S", "it_codice_fiscale"),
    ("37605030299", "ee_isikukood"), ("36574261809", "de_steuer_id"), ("295109912611193", "fr_nir"),
    ("1234567T", "ie_ppsn"), ("1800101221144", "ro_cnp"),
])
def test_national_ids_validate(value, scheme):
    assert scheme in {name for name, _ in v.national_id(value)}


@pytest.mark.parametrize("value", ["131052-308U", "44051401358", "12345678A", "RSSMRA85T10A562T"])
def test_wrong_check_characters_fail(value):
    assert not v.national_id(value)


def test_scheme_specific_failure():
    # 111222334 fails the Dutch 11-check but is a valid pre-1954 Czech birth number (no check digit then).
    assert not v.national_id("111222334", schemes={"nl_bsn"})


def test_financial_validators():
    assert v.iban("GB82 WEST 1234 5698 7654 32") and v.iban("DE89370400440532013000")
    assert not v.iban("DE89370400440532013001")
    assert v.card("4111 1111 1111 1111") == "visa"
    assert not v.card("4111 1111 1111 1112")
    assert not v.card("3425959039592")  # EAN-13 that happens to pass Luhn has no card issuer prefix
    assert v.vat("FI20774740") and v.vat("DE 136 695 976") and not v.vat("FI20774741")


def test_phone_and_ip():
    assert v.phone("+358 40 123 4567") and v.phone("0049 30 1234567")
    assert not v.phone("+358 4")
    assert not v.phone("040 123 4567") and v.phone("040 123 4567", local_ok=True)
    assert v.ip_address("203.0.113.89") and v.ip_address("2001:db8::1")
    assert not v.ip_address("127.0.0.1") and not v.ip_address("1.2.3")


def labels(text):
    return [(text[s.start:s.end], s.label) for s in detect_structured(text)]


def test_label_decides_between_order_number_and_identifier():
    # The same checksum-valid digits: kept after "order", detected after "PESEL".
    assert labels("Order 44051401359 shipped.") == []
    assert labels("PESEL: 44051401359") == [("44051401359", "NATIONAL_ID")]
    assert labels("Their number is 44051401359.") == [("44051401359", "NATIONAL_ID")]
    # Weak schemes (checksum only) need a label.
    assert labels("Reference 111222333 attached.") == []
    assert labels("bsn: 111222333") == [("111222333", "NATIONAL_ID")]


def test_column_headers_label_values():
    text = "name;email;phone;pesel\nAnna Nowak;anna@example.org;512 345 678;44051401359\n"
    found = labels(text)
    assert ("Anna Nowak", "PERSON") in found
    assert ("512 345 678", "PHONE") in found
    assert ("44051401359", "NATIONAL_ID") in found
    assert context(text, text.index("512"))[0] == "PHONE"


def test_secrets_and_placeholders():
    text = ("DATABASE_URL=postgres://app:Summer4285!@db:5432/x\nSMTP_PASSWORD=Summer6765?\n"
            "ADMIN_PASSWORD=<YOUR_API_KEY>\nRELEASE_SHA=1ed011c583d498263e1b89abbeed7306ed1a83db\n")
    assert labels(text) == [("Summer4285!", "SECRET"), ("Summer6765?", "SECRET")]


def test_lookalikes():
    for value in ("844e78fa-1b47-4696-a3f1-258572fbb060", "183b2bbae9797506", "2026-07-24T05:28:34Z",
                  "4.3.98", "82 965,91", "47.8621"):
        assert lookalike(value), value
    for value in ("Summer4285!", "C-1042", "+358 40 123 4567"):
        assert not lookalike(value), value


def test_gate_sends_unvalidated_model_guesses_to_review():
    text = "trace=183b2bbae9797506 order 305439947696 call 040 123 4567 key sk_live_abcdefghij1234567890ABC"
    def gate(value, label):
        start = text.index(value)
        return gate_learned(text, Span(start, start + len(value), label, "model"))
    assert gate("183b2bbae9797506", "SECRET") == "lookalike_identifier_shape"
    assert gate("305439947696", "PHONE") == "business_number_context"
    assert gate("040 123 4567", "PHONE") is None
    assert gate("sk_live_abcdefghij1234567890ABC", "SECRET") is None
    name_text = "Tilinumero: FI21 1234 5600 0007 85"
    assert gate_learned(name_text, Span(0, 10, "PERSON", "model")) == "field_label_not_name"


def test_pipeline_replaces_validated_values_and_keeps_lookalikes():
    text = ("Why does this insert fail?\nINSERT INTO customers (id, full_name, personnummer, iban) VALUES\n"
            "  (456677939764, 'Anna Andersson', '811228-9874', 'GB82WEST12345698765432');\n"
            "Log: 2026-03-03T06:17:00Z login from 203.0.113.89 req=844e78fa-1b47-4696-a3f1-258572fbb060")
    out = Protector().protect_text(text, text).protected_text
    assert "'[PERSON_1]', '[NATIONAL_ID]', '[IBAN]'" in out  # quotes kept, SQL stays valid
    assert "456677939764" in out and "844e78fa-1b47-4696-a3f1-258572fbb060" in out


def test_ip_and_vat_are_detected_but_kept_for_review():
    text = "Why is 203.0.113.89 blocked? Our VAT number is FI20774740, email ops@example.org."
    result = Protector().protect_text(text, text)
    assert "203.0.113.89" in result.protected_text and "FI20774740" in result.protected_text
    assert "[EMAIL_1]" in result.protected_text
    kept = {(x["label"], x["reason"]) for x in result.retained_sensitive}
    assert ("IP_ADDRESS", "detected_kept_for_review") in kept and ("VAT_ID", "detected_kept_for_review") in kept
    assert "detected_kept_for_review" in result.review_reasons


def test_code_references_are_not_secrets():
    text = 'password = os.environ["DB_PASSWORD"]\napiKey: process.env.API_KEY,\npassword: "Summer4285!"'
    out = Protector().protect_text(text, text).protected_text
    assert 'os.environ["DB_PASSWORD"]' in out and "process.env.API_KEY" in out
    assert "Summer4285!" not in out


def test_email_addresses_get_stable_numbered_aliases():
    task = "Draft a reply to anna@example.org and copy Ben@Example.org."
    text = "From: Anna@Example.org\nCc: ben@example.org\nCan we move the meeting? Reply to anna@example.org."
    result = Protector().protect_text(text, task)
    assert result.protected_text == ("From: [EMAIL_1]\nCc: [EMAIL_2]\n"
                                     "Can we move the meeting? Reply to [EMAIL_1].")
    assert result.protected_task == "Draft a reply to [EMAIL_1] and copy [EMAIL_2]."
