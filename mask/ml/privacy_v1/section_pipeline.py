"""Versioned learned clause relevance, exact edits and conservative identity links.

Only runtime text, task, detections and model scores are accepted. Gold annotation
objects are deliberately absent from this interface.
"""
import re
import math
from .contracts import ALIASED, DIRECT, RULE_ONLY_LABELS, Span, Edit, Result
from .candidates import NON_NAMES, plausible_person
from .sections import section_units, section_drop_bounds, CLAUSE_MODE, MAX_SECTIONS, SECTION_LABELS
from .policy import replacement
from .editing import apply_edits, expand_word, overlaps


def vague_task(task, text):
    value = re.sub(r'[^a-z ]', '', task.lower()).strip()
    return (not value or task.strip() == text.strip() or
            value in {'summarise', 'summarize', 'summarise this', 'summarize this', 'help', 'help me',
                      'please help', 'what should i do', 'give me some advice', 'summarise the information',
                      'summarize the information'})


def protect_segment(protector, text, task, context, aliases, learned, entities, pending, *, allow_section_drop):
    model = protector.model
    units = list(section_units(text, CLAUSE_MODE))
    if len(units) > MAX_SECTIONS:
        raise ValueError('Too many clause sections')
    entities = [Span(s.start,s.end-2,s.label,s.source)
                if s.label=='PERSON' and text[s.start:s.end].endswith(("'s",'’s'))
                and plausible_person(text[s.start:s.end-2]) else s for s in entities]
    # The detector must first identify a full person name. Short-token propagation
    # is permitted only for a unique full-name match, never for ambiguous people.
    values = [text[s.start:s.end] for s in entities if s.label == 'PERSON']
    links = aliases.register_people(values)
    for short in sorted(links):
        if short.lower() in NON_NAMES or not plausible_person(short):
            continue
        for match in re.finditer(r'(?<!\w)' + re.escape(short) + r'(?!\w)', text):
            candidate = Span(*match.span(), 'PERSON', 'unambiguous-name-link')
            if not any(overlaps(candidate, s) for s in entities):
                entities.append(candidate)
    # Contextual value substitutions are separate from whole-clause deletion.
    # Preserve actual detector offsets and never turn a PLACEHOLDER into DROP.
    value_decisions = {}
    for s in learned:
        if s.label not in SECTION_LABELS:
            continue
        s = expand_word(text, s)
        if any(overlaps(s, e) for e in entities) or (s.start,s.end) in units:
            continue
        decision = protector._decision(text, s, task, context)
        if decision[0] == 'PLACEHOLDER':
            entities.append(s)
            value_decisions[(s.start,s.end,s.label)] = decision
    entities.sort(key=lambda s:s.start)
    scores = model.predict_sections(text, units, task, context) if allow_section_drop else []
    edits, retained, diagnostics, dropped = [], [], [], []
    review = ['experimental_model_not_release_validated']
    if pending:
        review.append('unconfirmed_detection_requires_review')
    threshold = model.runtime.get('section_threshold', .9)
    for (a,b), probability in zip(units, scores, strict=allow_section_drop):
        if (set(probability) != {'essential','unnecessary','uncertain'} or
                any(not math.isfinite(v) or v<0 for v in probability.values()) or
                abs(sum(probability.values())-1)>1e-4):
            raise ValueError('Invalid section prediction')
        raw = max(probability, key=probability.get)
        reason = 'section_not_confidently_unnecessary'
        removable = probability['unnecessary'] >= threshold and probability['essential'] < .1 and probability['uncertain'] < .1
        trace = {'start':a,'end':b,'candidate_mode':'section-head-v1','raw_relevance':probability,
                 'raw_class':raw,'threshold':threshold,'outcome':'KEEP','scores_calibrated':False}
        if vague_task(task,text):
            removable,reason = False,'missing_or_vague_task'
        if removable and any(p['label'] not in SECTION_LABELS and p['start'] < b and a < p['end'] for p in pending):
            removable,reason = False,'section_contains_unconfirmed_detection'
        nested = []
        if removable:
            evidence = {(s.start,s.end,s.label):s for s in [*entities,*learned]
                        if s.label not in DIRECT and s.start < b and a < s.end
                        and (s.start,s.end) != (a,b)}
            for s in evidence.values():
                action,score,gate,rel = protector._decision(text,s,task,context)
                nested.append({'start':s.start,'end':s.end,'label':s.label,'action':action,'relevance':rel})
                if s.label in RULE_ONLY_LABELS or rel['uncertain'] >= .5 or rel['essential'] >= .5:
                    removable,reason = False,'section_contains_retained_or_uncertain_evidence'
            trace['nested_evidence'] = nested
        if removable:
            left,right = section_drop_bounds(text,a,b,CLAUSE_MODE)
            if any(s.start < left < s.end or s.start < right < s.end for s in entities):
                removable,reason = False,'section_entity_boundary_conflict'
            else:
                # Label is diagnostic only; model class is generic relevance.
                label = next((s.label for s in learned if s.label in SECTION_LABELS and s.start < b and a < s.end), 'SECTION')
                edits.append(Edit(left,right,label,'DROP','','learned_unnecessary_clause',probability['unnecessary']))
                dropped.append((left,right))
                trace.update(outcome='DROP',edit_start=left,edit_end=right)
                reason = 'dedicated_head_and_safeguards_authorise_drop'
        trace['reason'] = reason
        diagnostics.append(trace)
    for span in entities:
        if any(a <= span.start and span.end <= b for a,b in dropped):
            continue
        value = text[span.start:span.end]
        if span.label in DIRECT:
            action = 'ALIAS' if span.label in ALIASED else 'PLACEHOLDER'
            score,reason = None,'direct_identifier_policy'
        else:
            action,score,reason,_ = value_decisions.get((span.start,span.end,span.label)) or protector._decision(text,span,task,context)
            if action=='DROP':
                action = 'PLACEHOLDER'
            if action=='KEEP':
                retained.append({'start':span.start,'end':span.end,'label':span.label,'reason':reason})
                continue
        edits.append(Edit(span.start,span.end,span.label,action,replacement(span,value,action,aliases),reason,score))
    coherent = []
    for edit in sorted(edits,key=lambda e:(e.start,e.end)):
        if coherent and coherent[-1].action==edit.action=='DROP' and edit.start<=coherent[-1].end:
            coherent[-1].end = max(coherent[-1].end,edit.end)
        else:
            coherent.append(edit)
    return Result('needs_review',apply_edits(text,coherent),model.model_id,coherent,retained,review,
                  {'scanned_characters':len(text),'total_characters':len(text),'complete':True,'offset_unit':'unicode_code_point'},
                  pending_reviews=pending,runtime_versions=protector.runtime_versions(),section_diagnostics=diagnostics)
