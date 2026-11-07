"""Campaign safeguards; no pilot or authored data enters these checks."""
import pytest
from mask.ml.privacy_v1.experiment import canonical, selection_key
from mask.ml.privacy_v1.custom import CustomModel


def test_canonical_counts_and_cross_split_validation():
    train, dev = canonical()
    assert len(train) == 516 and len(dev) == 50
    assert not {r['text'] for r in train} & {r['text'] for r in dev}


def test_dev_is_rejected_by_custom_trainer():
    _, dev = canonical()
    with pytest.raises(ValueError, match='only nonempty train'):
        CustomModel.train(dev)


def test_dev_is_rejected_by_encoder_trainer():
    from mask.ml.privacy_v1.encoder import EncoderModel
    _, dev = canonical()
    # Guard must run before touching a network or optimizer.
    with pytest.raises(ValueError, match='only nonempty train'):
        EncoderModel.train_records(None, dev)


def test_sentencepiece_whitespace_offsets_remain_source_offsets():
    from mask.ml.privacy_v1.encoder import EncoderModel
    text = 'Zoë  Bennett'
    a, b = EncoderModel._offset(text, 3, len(text))
    assert (a, b, text[a:b]) == (5, 12, 'Bennett')


def test_selection_does_not_reward_abstaining_on_every_record():
    base = dict(unsupported=0, required_removal=10, required_removed=8,
                required_facts=5, facts_retained=5, gold_keep_characters_changed=0,
                benign_characters_changed=0, required_section_drops=2, sections_dropped=1)
    good = selection_key({'counts': base})
    bad = selection_key({'counts': base | {'unsupported': 50, 'required_removed': 10}})
    assert good < bad
