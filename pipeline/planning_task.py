"""Coarse exploratory planning scores. Exact inputs stay in private evaluation."""
import numpy as np
from pipeline.mobility import BANDS


def area_counts(values, domain, band, direction='destinations'):
    axis=1 if direction=='destinations' else 0
    areas=sorted({c[axis] for c in domain})
    return areas,np.array([sum(int(values[i]) for i,c in enumerate(domain) if c[2]==band and c[axis]==area) for area in areas],dtype=np.int64)


def task_score(raw,signed,areas):
    shown=np.maximum(0,signed)
    if not raw.sum():return {'wape':None,'top3_overlap':None,'regret':None,'pass':False,'status':'no_reference_demand','exact_top3':[],'protected_top3':[]}
    best=sorted(range(len(areas)),key=lambda i:(-int(raw[i]),areas[i]))[:3]
    selected=sorted(range(len(areas)),key=lambda i:(-int(shown[i]),areas[i]))[:3]
    overlap=len(set(best)&set(selected));regret=1-float(raw[selected].sum())/float(raw[best].sum())
    return {'wape':float(np.abs(shown-raw).sum()/raw.sum()),'top3_overlap':overlap,'regret':regret,'pass':overlap>=2 and regret<=.1,'status':'evaluated',
            'exact_top3':[{'area':areas[i],'period_trips':int(raw[i])} for i in best],
            'protected_top3':[{'area':areas[i],'period_trips':int(shown[i])} for i in selected]}


def evaluate_areas(raw,signed,domain):
    result={}
    for direction in ('destinations','starts'):
        result[direction]={}
        for band in BANDS:
            areas,r=area_counts(raw,domain,band,direction);_,s=area_counts(signed,domain,band,direction)
            result[direction][band]=task_score(r,s,areas)
    return result
