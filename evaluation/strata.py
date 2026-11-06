"""Synthetic-only stage losses and low-volume error; no private diagnostic is exported by publisher."""
from pathlib import Path
import json
import numpy as np
from pipeline.mobility import load,prepare,VALUES,BANDS
from pipeline.artifact import encode

def main():
    t,s=load(Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026/data/mobility'))
    domains,raw,bounded,geo=prepare(t,s)
    stats=json.loads(Path('releases/e1-aura-001/statistics.json').read_text())
    families={}
    for f,reference in raw.items():
        noisy=np.array([r['noisy_value'] for r in stats[f]]);display=np.array([r[VALUES[f]] for r in stats[f]])
        ranges=[('zero',0,1),('1-19',1,20),('20-99',20,100),('100-999',100,1000),('1000+',1000,float('inf'))];groups=[]
        for label,lo,hi in ranges:
            mask=(reference>=lo)&(reference<hi);n=int(mask.sum());denom=int(reference[mask].sum())
            groups.append({'reference_volume':label,'cells':n,'reference_total':denom,'bounded_total':int(bounded[f][mask].sum()),'display_total':int(display[mask].sum()),'wape':float(np.abs(display[mask]-reference[mask]).sum()/denom) if denom else None,'mae':float(np.abs(display[mask]-reference[mask]).mean()) if n else None,'mean_signed_noise_error':float((noisy[mask]-bounded[f][mask]).mean()) if n else None,'clamp_added_count':int((display[mask]-noisy[mask]).sum())})
        families[f]=groups
    bands=[]
    for band in BANDS:
        mask=np.array([cell[2]==band for cell in domains['od']]);denom=int(raw['od'][mask].sum())
        bands.append({'band':band,'inferred_before_cap':denom,'after_cap':int(bounded['od'][mask].sum()),'clipping_loss_fraction':float(1-bounded['od'][mask].sum()/denom) if denom else None})
    dates=[{'date':key[0],'recorded_taps':int(r),'after_cap':int(b),'clipping_loss_fraction':float(1-b/r) if r else None} for key,r,b in zip(domains['daily'],raw['daily'],bounded['daily'])]
    result={'experiment':'stage and volume-stratum diagnostics','data_class':'supplied_synthetic','release_id':'e1-aura-001','input_rows':len(t),'missing_stop_events':int(t.stop_id.isna().sum()),'definitions':{'wape':'sum absolute displayed-minus-reference error divided by reference sum; null at zero denominator','mae':'mean absolute displayed-minus-reference error, null for empty stratum','zero_cells':'Private reference-zero cells evaluated only because supplied data is synthetic; do not publish such labels on real data.','clipping':'R1 to R2 only; not noise, inference or display error'},'families':families,'od_clipping_by_band':bands,'daily_clipping':dates,'limitations':['Conditional reference-volume groups are evaluation-only, not public release selection.','These are one actual artifact results, not independent test-set guarantees.','Relative errors do not add across stages.']}
    Path('evidence/e3/strata.json').write_bytes(encode(result));print('Saved volume, time-band and daily clipping diagnostics')
if __name__=='__main__':main()
