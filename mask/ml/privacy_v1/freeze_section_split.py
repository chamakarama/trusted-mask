"""Freeze family-connected supplemental development data before any fitting."""
import argparse
import copy
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from .annotation.tools import read, compile_records
from .data import _source_signature, digest, validate_records

EXPECTED = {
    'train.jsonl': '3787b15a4594ae9a023a49480d3ec76d41c410301e9ea0da18c5c8e6e3b7b226',
    'train.authored.jsonl': '39ac0e6b3dd3e4af8da5d9838ca5ac5e49e85fd68a659ba85d3b0c621c97e4c9',
    'dev.jsonl': 'f9ad0954b8904e8d8725095cfe2f409bef3992c8895bc11855ee163a1a0e857b',
    'dev.authored.jsonl': '21771b5163abea0758d5405ae9efc463bcdc98bc4edaa932cf74e4dba1616436',
}


def freeze(source, output, seed=20261108):
    source, output = Path(source), Path(output)
    for name, expected in EXPECTED.items():
        if digest(source / name) != expected:
            raise ValueError('Canonical release mismatch: ' + name)
    authored = validate_records(read(source / 'train.authored.jsonl'))
    compiled = validate_records(read(source / 'train.jsonl'))
    assert len(authored) == len(compiled) == 1316
    assert [r['id'] for r in authored] == [r['id'] for r in compiled]
    parent = list(range(len(authored)))
    def find(i):
        while i != parent[i]:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    def union(a, b):
        parent[find(b)] = find(a)
    registries, signatures, index, shingles = defaultdict(dict), {}, defaultdict(list), []
    for i, r in enumerate(authored):
        for key in ('family_id', 'persona_id', 'source_id', 'template_id', 'text'):
            old = registries[key].setdefault(r[key], i)
            union(i, old)
        signature = _source_signature(r)
        union(i, signatures.setdefault(signature, i))
        words = {signature[j:j+5] for j in range(max(0, len(signature)-4))}
        for j in {j for w in words for j in index[w]}:
            common = len(words & shingles[j])
            if common >= 10 and common / max(1, len(words | shingles[j])) >= .9:
                union(i, j)
        shingles.append(words)
        for w in words:
            index[w].append(i)
    groups = defaultdict(list)
    for i in range(len(authored)):
        groups[find(i)].append(i)
    def cohort(indices):
        if any(i < 516 for i in indices):
            return 'original-connected'
        if any(i < 816 for i in indices):
            return 'placeholder-preservation'
        rows = [authored[i] for i in indices]
        if len({r['task'] for r in rows}) > 1:
            return 'task-pair'
        if not any(r['decisions'] for r in rows):
            return 'benign'
        if any(d['relevance'] == 'uncertain' for r in rows for d in r['decisions']):
            return 'vague-task'
        return 'relevant-sensitive'
    strata = defaultdict(list)
    for indices in groups.values():
        strata[cohort(indices)].append(indices)
    reserved = set()
    for name, members in sorted(strata.items()):
        if name == 'original-connected':
            continue
        members.sort(key=lambda g: hashlib.sha256((str(seed)+':'+min(authored[i]['id'] for i in g)).encode()).hexdigest())
        count = max(1, round(len(members) * .1))
        reserved.update(i for group in members[:count] for i in group)
    train = [copy.deepcopy(r) for i,r in enumerate(compiled) if i not in reserved]
    supplemental = [dict(r, split='dev') for i,r in enumerate(compiled) if i in reserved]
    train_authored = [r for i,r in enumerate(authored) if i not in reserved]
    supplemental_authored = []
    for i in sorted(reserved):
        r = copy.deepcopy(authored[i])
        r['split'] = 'dev'
        # Never forge a new reviewer attestation after changing split metadata.
        r['review'] = {'status':'pending', 'source_review':r['review'],
                       'notes':'Split-only derivative; original annotation review preserved in source_review. No annotation changed.'}
        supplemental_authored.append(r)
    supplemental = compile_records(supplemental_authored, allow_unreviewed=True)
    original_dev = read(source / 'dev.jsonl')
    validate_records(train + supplemental + original_dev)
    validate_records(train_authored + supplemental_authored + read(source / 'dev.authored.jsonl'))
    output.mkdir(parents=True, exist_ok=False)
    outputs = {'train.jsonl':train, 'train.authored.jsonl':train_authored,
               'supplemental-dev.jsonl':supplemental, 'supplemental-dev.authored.jsonl':supplemental_authored}
    for name, rows in outputs.items():
        (output/name).write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
    for name in ('dev.jsonl','dev.authored.jsonl'):
        (output/name).write_bytes((source/name).read_bytes())
    manifest = {'version':'section-split-20261108-v1','seed':seed,'source_release':'training-2026-11-07c',
                'source_sha256':EXPECTED,'pool_records':1316,'train_records':len(train),
                'dev_records':len(original_dev),'supplemental_dev_records':len(supplemental),
                'train_ids':[r['id'] for r in train], 'supplemental_dev_ids':[r['id'] for r in supplemental],
                'original_dev_ids':[r['id'] for r in original_dev],
                'connected_groups':len(groups),'grouping':'family/source/persona/template, exact text, normalized source, 5-shingle Jaccard >= .9 with >=10 common shingles',
                'strata':{name:{'groups':len(gs),'records':sum(map(len,gs)),
                                'reserved_groups':sum(any(i in reserved for i in g) for g in gs),
                                'reserved_records':sum(i in reserved for g in gs for i in g)} for name,gs in strata.items()},
                'files':{p.name:digest(p) for p in sorted(output.glob('*.jsonl'))},
                'independent_final_test':False,'selection':'fixed seed hash order, before fitting or performance inspection'}
    (output/'split-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({k:v for k,v in manifest.items() if not k.endswith('_ids')}))


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True)
    args=p.parse_args();freeze(args.source,args.output)
