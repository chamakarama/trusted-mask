import pytest
from mask.ml.privacy_v1.contracts import ACTIONS, RELEVANCE, Span, Prediction
from mask.ml.privacy_v1.engine import Protector
from mask.ml.privacy_v1.policy import Aliases


class SectionModel:
    model_id='test-section-model'
    default_section_mode='section-head-v1'
    entity_semantics='relevance-is-not-disclosure-v1'
    runtime={'section_threshold':.9}
    def detect(self,text):
        result=[]
        for name in ('Alina Birch','Marek Wolf','Alina Stone','Alina','Marek'):
            start=text.find(name)
            if start>=0:result.append(Span(start,start+len(name),'PERSON','model'))
        if '3120 euros' in text:
            start=text.index('3120 euros');result.append(Span(start,start+10,'FINANCIAL','model'))
        return result
    def predict(self,text,span,task,context=''):
        action='PLACEHOLDER' if span.label in ('FINANCIAL','ORG') else 'KEEP'
        return Prediction({a:float(a==action) for a in ACTIONS},{r:float(r=='essential') for r in RELEVANCE})
    def predict_sections(self,text,units,task,context=''):
        return [{'essential':.005,'unnecessary':.99,'uncertain':.005} if 'asthma' in text[a:b] and task=='Draft the shipping request' else
                {'essential':.99,'unnecessary':.005,'uncertain':.005} for a,b in units]


def test_actual_pipeline_switches_task_and_protects_retained_names():
    text='My name is Alina Birch. I have asthma. Please send the box by Friday.'
    engine=Protector(SectionModel())
    removed=engine.protect_text(text,'Draft the shipping request')
    kept=engine.protect_text(text,'Explain the asthma symptoms')
    assert 'asthma' not in removed.protected_text
    assert 'asthma' in kept.protected_text
    assert all('Alina Birch' not in r.protected_text and '[PERSON_1]' in r.protected_text for r in (removed,kept))
    assert 'Friday' in removed.protected_text
    assert any(t['outcome']=='DROP' and t['raw_class']=='unnecessary' for t in removed.section_diagnostics)


def test_essential_context_still_substitutes_private_value():
    result=Protector(SectionModel()).protect_text('My salary is 3120 euros. Keep the deadline Friday.','Explain my budget')
    assert '3120 euros' not in result.protected_text
    assert '[FINANCIAL]' in result.protected_text
    assert 'Friday' in result.protected_text


def test_essential_placeholder_vetoes_section_drop_but_value_stays_masked():
    model=SectionModel()
    model.predict_sections=lambda text,units,task,context='':[dict(essential=.001,unnecessary=.998,uncertain=.001) for _ in units]
    result=Protector(model).protect_text('My salary is 3120 euros.','Explain my budget')
    assert result.protected_text=='My salary is [FINANCIAL].'
    assert result.section_diagnostics[0]['reason']=='section_contains_retained_or_uncertain_evidence'


def test_full_short_aliases_and_distinct_people():
    text='Alina Birch met Marek Wolf. Alina thanked Marek.'
    result=Protector(SectionModel()).protect_text(text,'Draft the shipping request')
    assert result.protected_text=='[PERSON_1] met [PERSON_2]. [PERSON_1] thanked [PERSON_2].'
    aliases=Aliases();aliases.register_people(['Alina Birch','Alina Stone','Alina'])
    assert len({aliases.get('PERSON',v) for v in ('Alina Birch','Alina Stone','Alina')})==3


def test_person_possessive_is_preserved_with_stable_short_alias():
    text="Alina Birch's account is closed. Alina's brother confirmed it."
    result=Protector(SectionModel()).protect_text(text,'Draft the shipping request')
    assert result.protected_text=="[PERSON_1]'s account is closed. [PERSON_1]'s brother confirmed it."


@pytest.mark.parametrize('task',['','Help me','Summarise the information.'])
def test_missing_and_vague_task_never_deletes(task):
    model=SectionModel()
    model.predict_sections=lambda text,units,task,context='':[dict(essential=.001,unnecessary=.998,uncertain=.001) for _ in units]
    result=Protector(model).protect_text('I have asthma. The box is due Friday.',task)
    assert not any(e.action=='DROP' for e in result.edits)


def test_legacy_models_still_default_to_legacy():
    assert Protector().section_mode=='legacy'


def test_invalid_section_scores_fail_closed():
    model=SectionModel()
    model.predict_sections=lambda text,units,task,context='':[dict(essential=float('nan'),unnecessary=.99,uncertain=.01) for _ in units]
    result=Protector(model).protect_text('I have asthma.','Draft the shipping request')
    assert result.status=='unsupported' and result.protected_text is None


def test_local_restoration_uses_generated_aliases_only():
    from mask.web.server import _alias_map
    from mask.web.restore import restore_text
    text='Alina Birch met Marek Wolf. Alina thanked Marek.'
    result=Protector(SectionModel()).protect_text(text,'Draft the shipping request')
    mapping=_alias_map(text,[vars(e) for e in result.edits],result.protected_text)
    restored=restore_text('[PERSON_1] thanked [PERSON_2]. [PERSON_99]',mapping)
    assert 'Alina Birch' in str(restored) and 'Marek Wolf' in str(restored)
    assert '[PERSON_99]' in str(restored)
