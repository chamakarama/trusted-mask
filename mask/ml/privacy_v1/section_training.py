"""Balanced multi-objective DeBERTa training on one frozen manifest, never dev."""
import argparse
import contextlib
import gc
import hashlib
import json
import math
import random
import shutil
import subprocess
import tarfile
import time
from collections import Counter, defaultdict
from pathlib import Path
import torch
from torch import nn
from .annotation.tools import read
from .bundle import write_manifest
from .contracts import ACTIONS, RELEVANCE, Span
from .data import digest, load_records, validate_records
from .encoder import EncoderModel, TAGS, LIMIT
from .policy import allowed_actions
from .sections import section_targets, CLAUSE_MODE

RUNTIME = {'architecture_version':'section-relevance-v1','section_mode':'section-head-v1',
           'entity_semantics':'relevance-is-not-disclosure-v1','alias_resolver':'unambiguous-v1',
           'section_threshold':.9,'section_labels':list(RELEVANCE),'section_markers':['[unused2]','[unused3]'],
           'section_unit_mode':CLAUSE_MODE,'scores_calibrated':False}


def frozen_split(directory):
    directory = Path(directory)
    manifest = json.loads((directory/'split-manifest.json').read_text())
    for name, expected in manifest['files'].items():
        if digest(directory/name) != expected:
            raise ValueError('Frozen split hash mismatch: '+name)
    records = load_records(directory/'train.jsonl')
    authored = validate_records(read(directory/'train.authored.jsonl'))
    assert len(records)==len(authored)==manifest['train_records']
    assert {r['id'] for r in records}==set(manifest['train_ids'])
    assert {r['id'] for r in records}.isdisjoint(manifest['supplemental_dev_ids']+manifest['original_dev_ids'])
    assert all(r['split']=='train' for r in records+authored)
    return records,authored,manifest


def sanity_subset(records, authored):
    """Select train-only switch families before observing any model output."""
    by_source=defaultdict(list)
    for r in authored:
        by_source[r['text']].append(r)
    pairs=[]
    for rows in by_source.values():
        if len(rows)!=2:
            continue
        targets=[{(s['start'],s['end']):s['target'] for s in section_targets(r,CLAUSE_MODE)} for r in rows]
        switches=[key for key in targets[0] if {targets[0][key],targets[1][key]}=={'essential','unnecessary'}]
        if switches and all(100<=len(r['text'].split())<=180 for r in rows):
            pairs.append((min(r['id'] for r in rows),rows,switches))
    pairs.sort()
    chosen=pairs[:2]
    controls=sorted((r for r in authored if r['text']==r['approved_output']),key=lambda r:r['id'])[:2]
    names=sorted((r for r in authored if any(d['action']=='PLACEHOLDER' and d['relevance']=='essential' for d in r['decisions'])),key=lambda r:r['id'])[:2]
    ids={r['id'] for _,rows,_ in chosen for r in rows}|{r['id'] for r in controls+names}
    return [r for r in records if r['id'] in ids],[r for r in authored if r['id'] in ids],chosen


def cohort(record, manifest):
    # Source annotations remain one copy; buckets only determine shuffle order.
    if record['id'] in set(manifest.get('original_pool_ids',[])):
        return 'original'
    return record['id'].split(':')[0]


def prepare_jobs(model, records, authored):
    if not records or any(r['split']!='train' for r in records+authored):
        raise ValueError('Optimizer jobs require only train records')
    jobs={'tag':[],'action':[],'section':[]}
    seen=set(); lengths=Counter(); section_counts=Counter(); auxiliary=0
    for record in records:
        text=record['text']
        if text not in seen:
            encoded=model.tokenizer(text,return_offsets_mapping=True)
            offsets=encoded.pop('offset_mapping');targets=[]
            for a,b in offsets:
                a,b=model._offset(text,a,b)
                overlaps=[s for s in record['detection_spans'] if s['start']<b and a<s['end']] if a<b else []
                if len(overlaps)>1:
                    raise ValueError('Multiple gold entities share tokenizer boundary: '+record['id'])
                label='O' if not overlaps else ('B-' if a<=overlaps[0]['start'] else 'I-')+overlaps[0]['label']
                targets.append(TAGS.index(label) if a<b else -100)
            jobs['tag'].append({'input':encoded,'target':targets,'id':record['id'],'family':record['family_id']})
            seen.add(text)
        for entry in record['spans']:
            span=Span(entry['start'],entry['end'],entry['label'])
            encoded=model._action_input(text,span,record['task'],record.get('context',''))
            encoded={k:v[0].cpu().tolist() for k,v in encoded.items()}
            allowed=allowed_actions(span,text[span.start:span.end])
            jobs['action'].append({'input':encoded,'target':(ACTIONS.index(entry['action']),RELEVANCE.index(entry['relevance'])),
                                   'allowed':[a in allowed for a in ACTIONS], 'id':record['id'],'family':record['family_id']})
        # Runtime vetoes use detected contextual fragments as well as complete
        # clauses. A fragment wholly inside an explicit gold DROP clause needs
        # task-matched supervision too; otherwise it only learns essential KEEP
        # from the paired retained task and incorrectly vetoes the section head.
        explicit={(e['start'],e['end'],e['label']) for e in record['spans']}
        for section in section_targets(record,CLAUSE_MODE):
            if section['target']!='unnecessary':continue
            for entry in record['detection_spans']:
                if (entry['label'] not in ('HEALTH','FINANCIAL','EMPLOYMENT','FAMILY') or
                    (entry['start'],entry['end'],entry['label']) in explicit or
                    not section['start']<=entry['start']<entry['end']<=section['end']):continue
                span=Span(entry['start'],entry['end'],entry['label'])
                encoded=model._action_input(text,span,record['task'],record.get('context',''))
                encoded={k:v[0].cpu().tolist() for k,v in encoded.items()}
                allowed=allowed_actions(span,text[span.start:span.end])
                jobs['action'].append({'input':encoded,'target':(ACTIONS.index('DROP'),RELEVANCE.index('unnecessary')),
                                      'allowed':[a in allowed for a in ACTIONS], 'id':record['id'],
                                      'family':record['family_id'],'derived_from':'fully_covering_explicit_unnecessary_clause'})
                auxiliary+=1
    for record in authored:
        for section in section_targets(record,CLAUSE_MODE):
            target=section['target']
            unchanged=record['text'][section['start']:section['end']] in record['approved_output']
            if target is None and not unchanged:
                section_counts['unlabelled_excluded']+=1
                continue
            # Approved unchanged controls penalise deletion, without falsely
            # treating every unlabelled clause as an essential gold target.
            label=RELEVANCE.index(target) if target else -1
            encoded=model.section_input(record['text'],section['start'],section['end'],record['task'])
            section_counts[target or 'unchanged_preservation_constraint']+=1
            jobs['section'].append({'input':encoded,'target':label,'id':record['id'],'family':record['family_id'],
                                    'pair':(record['source_id'],section['start'],section['end'])})
    for mode,items in jobs.items():
        for item in items:
            size=len(item['input']['input_ids'])
            if size>LIMIT:
                raise ValueError('No silent truncation: '+mode+' '+item['id'])
            lengths[mode]=max(lengths[mode],size)
    return jobs,{'jobs':{k:len(v) for k,v in jobs.items()},'max_tokens':dict(lengths),'section_targets':dict(section_counts),
                 'auxiliary_context_fragment_drop_jobs':auxiliary,
                 'unique_detection_sources':len(seen),'optimizer_record_ids':sorted({j['id'] for xs in jobs.values() for j in xs})}


def grouped_batches(items, mode, size, randomizer):
    groups=defaultdict(list)
    for item in items:
        key=item.get('pair') if mode=='section' else (item['family'],item['id'])
        groups[key].append(item)
    # Shuffle within family, interleave source-shard cohorts. Paired section
    # targets remain consecutive and in one effective batch whenever size allows.
    buckets=defaultdict(list)
    for rows in groups.values():
        randomizer.shuffle(rows)
        buckets[rows[0]['id'].split(':')[0]].append(rows)
    for bucket in buckets.values():randomizer.shuffle(bucket)
    batches=[];batch=[]
    while any(buckets.values()):
        keys=list(buckets);randomizer.shuffle(keys)
        for key in keys:
            if not buckets[key]:continue
            rows=buckets[key].pop()
            while rows:
                chunk,rows=rows[:size],rows[size:]
                if len(batch)+len(chunk)>size:
                    batches.append(batch);batch=[]
                batch.extend(chunk)
    if batch:batches.append(batch)
    return batches


def batch_loss(model, mode, rows):
    inputs=[{k:v for k,v in r['input'].items() if k!='section_mask'} for r in rows]
    batch=model.tokenizer.pad(inputs,return_tensors='pt')
    width=batch['input_ids'].shape[1]
    if mode=='section':
        batch['section_mask']=torch.tensor([r['input']['section_mask']+[0]*(width-len(r['input']['section_mask'])) for r in rows])
    batch={k:v.to(model.device) for k,v in batch.items()}
    prediction=model.net(batch,mode)
    if mode=='tag':
        targets=torch.tensor([r['target']+[-100]*(width-len(r['target'])) for r in rows],device=model.device)
        weights=torch.ones(len(TAGS),device=model.device);weights[0]=.3
        return nn.functional.cross_entropy(prediction.flatten(0,1).float(),targets.flatten(),weight=weights)
    if mode=='action':
        action,relevance=prediction
        allowed=torch.tensor([r['allowed'] for r in rows],device=model.device)
        targets=torch.tensor([r['target'] for r in rows],device=model.device)
        return (nn.functional.cross_entropy(action.float().masked_fill(~allowed,-1e4),targets[:,0])+
                nn.functional.cross_entropy(relevance.float(),targets[:,1]))/2
    targets=torch.tensor([r['target'] for r in rows],device=model.device)
    labelled=targets>=0
    # Class weights chosen in advance, not from dev outcomes. Loss remains a
    # per-objective mean and section jobs get one third of optimizer updates.
    losses=torch.zeros(len(rows),device=model.device)
    if labelled.any():
        losses[labelled]=nn.functional.cross_entropy(prediction[labelled].float(),targets[labelled],
                            weight=torch.tensor([1.,4.,6.],device=model.device),reduction='none')
        losses[labelled]/=torch.tensor([1.,4.,6.],device=model.device)[targets[labelled]].mean()
    if (~labelled).any():
        losses[~labelled]=-torch.log1p(-prediction[~labelled].float().softmax(-1)[:,1].clamp(max=1-1e-6))
    return losses.mean()


def fit(model,jobs,output,epochs=2,steps_per_epoch=None,learning_rate=1e-5,head_lr=2e-4,warmup=100,batch_size=8,microbatch=4):
    randomizer=random.Random(17);torch.manual_seed(17)
    heads=list(model.net.tag.parameters())+list(model.net.action.parameters())+list(model.net.relevance.parameters())+list(model.net.section.parameters())
    optimizer=torch.optim.AdamW([{'params':model.net.backbone.parameters(),'lr':learning_rate},
                                  {'params':heads,'lr':head_lr}],weight_decay=.01)
    if model.model_id.startswith('deberta-v3-large'):
        model.net.backbone.gradient_checkpointing_enable()
    step=0;started=time.time();seen=defaultdict(set);metrics=[]
    autocast=(lambda:torch.autocast('cuda',dtype=torch.bfloat16)) if model.device.startswith('cuda') else contextlib.nullcontext
    for epoch in range(epochs):
        batches={mode:grouped_batches(rows,mode,batch_size,randomizer) for mode,rows in jobs.items()}
        cycles=max(map(len,batches.values())) if steps_per_epoch is None else math.ceil(steps_per_epoch/3)
        totals=defaultdict(float);counts=Counter()
        for cycle in range(cycles):
            for mode in ('tag','action','section'):
                if steps_per_epoch is not None and sum(counts.values())>=steps_per_epoch:break
                frozen=step<warmup
                for p in model.net.backbone.parameters():p.requires_grad_(not frozen)
                model.net.train()
                if frozen:model.net.backbone.eval()
                rows=batches[mode][cycle%len(batches[mode])]
                optimizer.zero_grad(set_to_none=True)
                value=0.
                for offset in range(0,len(rows),microbatch):
                    chunk=rows[offset:offset+microbatch]
                    with autocast():loss=batch_loss(model,mode,chunk)*len(chunk)/len(rows)
                    if not torch.isfinite(loss):raise ValueError('Non-finite loss')
                    loss.backward();value+=float(loss.detach())
                nn.utils.clip_grad_norm_(model.net.parameters(),1.)
                optimizer.step();step+=1;counts[mode]+=1;totals[mode]+=value
                seen[mode].update(r['id'] for r in rows)
                if step%50==0:
                    print(json.dumps({'epoch':epoch+1,'step':step,'loss':{m:totals[m]/counts[m] for m in counts},
                                      'elapsed_seconds':time.time()-started,'frozen_backbone':frozen}),flush=True)
        model.net.eval()
        state={'epoch':epoch+1,'steps':step,'loss':{m:totals[m]/counts[m] for m in counts},
               'objective_steps':dict(counts),'unique_ids_seen':{m:len(ids) for m,ids in seen.items()},
               'elapsed_seconds':time.time()-started,'learning_rate':learning_rate,'head_learning_rate':head_lr,
               'warmup_steps':warmup,'effective_batch_size':batch_size,'microbatch':microbatch,
               'precision':'bf16_autocast_fp32_parameters' if model.device.startswith('cuda') else 'fp32'}
        metrics.append(state)
        checkpoint=Path(output)/f'epoch-{epoch+1}'
        model.save(checkpoint)
        write_manifest(checkpoint,{'track':model.source['repository'].split('/')[-1],'architecture_version':'section-relevance-v1',
                                  'training':state,'evaluation_status':'pending','source':model.source})
        torch.save({'optimizer':optimizer.state_dict(),'epoch':epoch+1,'steps':step,'torch_rng':torch.get_rng_state(),
                    'python_rng':randomizer.getstate()},Path(output)/f'epoch-{epoch+1}.optimizer.pt')
        (Path(output)/'training-progress.json').write_text(json.dumps(metrics,indent=2)+'\n')
    for p in model.net.parameters():p.requires_grad_(True)
    model.net.eval();del optimizer;gc.collect()
    if torch.cuda.is_available():torch.cuda.empty_cache()
    return checkpoint,metrics


def package(checkpoint,output,track,metadata,pretrained):
    """Package immediately after fitting; full evaluation is deliberately later."""
    destination=Path(output)/track
    shutil.copytree(checkpoint,destination)
    notices=destination/'third_party';notices.mkdir()
    shutil.copyfile(Path(__file__).parent/'licenses/deberta-v3-base/LICENSE',notices/'LICENSE')
    shutil.copyfile(Path(pretrained)/'README.md',notices/'UPSTREAM_MODEL_CARD.md')
    write_manifest(destination,metadata)
    archive=Path(output)/(track+'.tar.gz')
    with tarfile.open(archive,'w:gz',compresslevel=1) as tar:
        tar.add(destination,arcname=track)
    ready={'track':track,'archive':str(archive),'sha256':digest(archive),'bytes':archive.stat().st_size,
           'bundle':str(destination),'evaluation_status':'pending','saved_at_unix':time.time()}
    (Path(output)/'publish-ready.json').write_text(json.dumps(ready,indent=2)+'\n')
    print(json.dumps({'publish_ready':ready}),flush=True)


def main():
    p=argparse.ArgumentParser();p.add_argument('--split',type=Path,required=True);p.add_argument('--base',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True);p.add_argument('--device',default='cuda');p.add_argument('--epochs',type=int,default=2)
    p.add_argument('--smoke',action='store_true');p.add_argument('--steps',type=int);p.add_argument('--microbatch',type=int,default=4)
    args=p.parse_args()
    if not 1<=args.epochs<=3: p.error('Bounded schedule requires 1–3 epochs')
    args.output.mkdir(parents=True,exist_ok=False);torch.set_num_threads(4)
    records,authored,manifest=frozen_split(args.split)
    if args.smoke:records,authored,pairs=sanity_subset(records,authored)
    model=EncoderModel.from_pretrained(args.base,args.device,runtime=dict(RUNTIME))
    jobs,audit=prepare_jobs(model,records,authored)
    audit['architecture']={'model_type':model.net.backbone.config.model_type,
                           'layers':model.net.backbone.config.num_hidden_layers,
                           'hidden_size':model.net.backbone.config.hidden_size,
                           'tokenizer_size':len(model.tokenizer),
                           'embedding_rows':model.net.backbone.get_input_embeddings().num_embeddings,
                           'marker_ids':model.tokenizer.convert_tokens_to_ids(['[unused0]','[unused1]','[unused2]','[unused3]']),
                           'section_head_shapes':{k:list(v.shape) for k,v in model.net.section.state_dict().items()}}
    (args.output/'input-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    metadata={'track':model.source['repository'].split('/')[-1],'source':model.source,
              'architecture_version':'section-relevance-v1','split_manifest_sha256':digest(args.split/'split-manifest.json'),
              'train_records':len(records),'optimizer_train_sha256':manifest['files']['train.jsonl'],
              'seed':17,'evaluation_status':'pending','smoke_only':args.smoke,
              'architecture':audit['architecture'],
              'source_commit':Path('SOURCE_COMMIT').read_text().strip() if Path('SOURCE_COMMIT').exists() else subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()}
    (args.output/'run.json').write_text(json.dumps(metadata,indent=2)+'\n')
    checkpoint,metrics=fit(model,jobs,args.output,epochs=args.epochs,steps_per_epoch=args.steps,
                          learning_rate=5e-5 if args.smoke else 1e-5,head_lr=5e-4 if args.smoke else 2e-4,
                          warmup=0 if args.smoke else 100,microbatch=args.microbatch)
    metadata['training']=metrics
    if args.smoke:
        from .section_evaluation import sanity_report
        report=sanity_report(model,authored,pairs)
        (args.output/'sanity.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({'sanity':{k:v for k,v in report.items() if k!='outputs'}}),flush=True)
        if not report['passed']:raise RuntimeError('Train-only pipeline sanity gate failed; do not scale training')
    else:
        package(checkpoint,args.output,metadata['track'],metadata,args.base)


if __name__=='__main__':main()
