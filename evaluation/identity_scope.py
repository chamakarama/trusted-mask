"""Evaluation-only identity truth analysis. Never used by production grouping/capping."""
from pathlib import Path
import json
import pandas as pd
from pipeline.artifact import encode

def main():
    root=Path('TRUSTED_SinceAI2026_FINAL/TRUSTED_PETS_PROVING_GROUND_2026')
    truth=pd.read_csv(root/'truth/mobility__cards.csv',dtype=str)
    if truth.record_id.duplicated().any():raise ValueError('Ambiguous card identity truth')
    active=set(pd.read_csv(root/'data/mobility/taps.csv',usecols=['card_id'],dtype=str).card_id.dropna())
    all_truth_records=len(truth)
    truth=truth[truth.record_id.isin(active)].copy()
    if set(truth.record_id)!=active: raise ValueError('Identity truth does not cover active input cards')
    known=truth.dropna(subset=['person_id']);counts=known.groupby('person_id').record_id.nunique()
    result={'experiment':'multiple-card limitation','data_class':'supplied_synthetic','source':'evaluation-only truth/mobility__cards.csv','scope':'Only cards occurring in supplied production taps; extra truth rows excluded (may cover other package partitions).','all_truth_records':all_truth_records,'active_input_cards':len(active),'cards':len(truth),'cards_with_person_truth':len(known),'people_in_truth':len(counts),'people_with_multiple_cards':int((counts>1).sum()),'cards_per_person_histogram':{str(k):int(v) for k,v in counts.value_counts().sort_index().items()},'observed_max_cards_per_person':int(counts.max()),'interpretation':'For m cards conservative group epsilon is m times card epsilon. Observed synthetic maximum is not a production bound or identity-resolution capability. Registry/truth is not joined by the publisher.','limitations':['Shared/replacement cards need separate identity semantics.','Synthetic truth describes this supplied benchmark only; real people remain unbounded without an authorised reliable mapping.']}
    out=Path('evidence/identity');out.mkdir(parents=True,exist_ok=True);(out/'multiple-cards.json').write_bytes(encode(result));print(json.dumps(result,indent=2))
if __name__=='__main__':main()
