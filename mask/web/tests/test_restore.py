import itertools
import pytest
from mask.web.restore import Restorer, restore_text

MAP = {"[PERSON_1]": "Maria Virtanen", "[PERSON_2]": "Jonas", "[PERSON_10]": "Aino"}


def stream(chunks, mapping=MAP):
    r = Restorer(mapping)
    segments = [s for c in chunks for s in r.feed(c)] + r.flush()
    return "".join(s["text"] for s in segments), segments


def test_repeated_names_are_all_restored():
    text = "[PERSON_1] met [PERSON_2]. Later [PERSON_1] called [PERSON_1] again."
    assert restore_text(text, MAP) == "Maria Virtanen met Jonas. Later Maria Virtanen called Maria Virtanen again."


@pytest.mark.parametrize("text", [
    "Dear [PERSON_1], please tell [PERSON_2] and [PERSON_10].",
    "[PERSON_1][PERSON_2][PERSON_1]",
    "[[PERSON_1]] [P [PERSON_ [PERSON_99] [PERSON_1",
])
def test_every_two_and_three_way_split_matches_whole_text(text):
    expected = restore_text(text, MAP)
    for i in range(len(text) + 1):
        assert stream([text[:i], text[i:]])[0] == expected
    for i, j in itertools.combinations(range(len(text) + 1), 2):
        assert stream([text[:i], text[i:j], text[j:]])[0] == expected


def test_single_character_chunks():
    text = "Hi [PERSON_10], [PERSON_1] says hello."
    assert stream(list(text))[0] == "Hi Aino, Maria Virtanen says hello."


def test_unknown_tokens_and_generic_placeholders_stay_verbatim():
    text = "[PERSON_3] wrote to [EMAIL] about [PERSON] and [SECRET]; [person_1] and [PERSON_1 ] too."
    assert restore_text(text, MAP) == text


def test_longer_number_is_not_a_prefix_match():
    assert restore_text("[PERSON_10] [PERSON_100]", MAP) == "Aino [PERSON_100]"


def test_restored_names_are_never_rescanned():
    # A name that itself looks like a token must not trigger a second substitution.
    mapping = {"[PERSON_1]": "[PERSON_2]", "[PERSON_2]": "Bob"}
    assert restore_text("[PERSON_1] and [PERSON_2]", mapping) == "[PERSON_2] and Bob"


def test_literal_collision_from_user_text_is_left_alone():
    # The protector skips aliases already present as literals; the map then only knows the new alias.
    mapping = {"[PERSON_2]": "Jonas"}
    assert restore_text("The form said [PERSON_1]; [PERSON_2] signed it.", mapping) == \
        "The form said [PERSON_1]; Jonas signed it."


def test_html_like_names_are_returned_as_plain_text_segments():
    mapping = {"[PERSON_1]": '<img src=x onerror="alert(1)">'}
    text, segments = stream(["Hello [PERS", "ON_1]!"], mapping)
    assert text == 'Hello <img src=x onerror="alert(1)">!'
    assert {"text": '<img src=x onerror="alert(1)">', "alias": "[PERSON_1]"} in segments


def test_segments_mark_only_restored_names():
    _, segments = stream(["Ask [PERSON_2] and [PERSON_7]"])
    assert [s for s in segments if "alias" in s] == [{"text": "Jonas", "alias": "[PERSON_2]"}]


def test_partial_token_is_held_until_complete_then_flushed_literally():
    r = Restorer(MAP)
    assert "".join(s["text"] for s in r.feed("Hello [PERSON_")) == "Hello "
    assert r.flush() == [{"text": "[PERSON_"}]


def test_malformed_map_entries_are_ignored():
    r = Restorer({"[EMAIL]": "x@example.invalid", "PERSON_1": "Nope", "[PERSON_1]": 5, "[PERSON_2]": "Jonas"})
    assert r.mapping == {"[PERSON_2]": "Jonas"}


def test_counts_distinct_aliases():
    r = Restorer(MAP)
    r.feed("[PERSON_1] [PERSON_1] [PERSON_2]"); r.flush()
    assert r.restored_count == 3 and r.restored_aliases == {"[PERSON_1]", "[PERSON_2]"}
