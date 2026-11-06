"""Small invented traces specify heuristic behavior; they are not destination validation."""
from pathlib import Path
import pandas as pd
from pipeline.mobility import prepare
from pipeline.artifact import encode

def run():
    stops=pd.DataFrame({'stop_id':['s1','s2','s3'],'area':['a','b','c'],'municipality':['town']*3,'lat':['60','60.1','60.2'],'lon':['22','22.1','22.2'],'lines':['1']*3})
    cases=[
      ('transfer', [('2025-10-06 07:00:00','s1','season'),('2025-10-06 07:30:00','s2','season'),('2025-10-06 09:00:00','s3','season')], [('a','c','06-09',1),('c','a','09-15',1)],3),
      ('exact_sixty_minute_gap', [('2025-10-06 07:00:00','s1','season'),('2025-10-06 08:00:00','s2','season'),('2025-10-06 09:01:00','s3','season')], [('a','c','06-09',1),('c','a','09-15',1)],3),
      ('midnight_day_reset', [('2025-10-06 23:00:00','s1','season'),('2025-10-07 00:00:00','s2','season')], [('a','a','18-24',1),('b','b','00-06',1)],2),
      ('duplicate', [('2025-10-06 07:00:00','s1','season'),('2025-10-06 07:00:00','s1','season'),('2025-10-06 09:00:00','s2','season')], [('a','b','06-09',1),('b','a','09-15',1)],3),
      ('dst_sunday_naive_local_time', [('2025-10-26 03:00:00','s1','season'),('2025-10-26 03:00:00','s2','season')], [],0),
      ('missing_origin', [('2025-10-06 07:00:00',None,'season'),('2025-10-06 09:00:00','s2','season')], [('b','b','09-15',1)],2),
      ('double_tap', [('2025-10-06 07:00:00','s1','season'),('2025-10-06 09:00:00','s2','double_tap')], [('a','a','06-09',1)],1),
      ('same_origin_does_not_reveal_actual_destination', [('2025-10-06 07:00:00','s1','season'),('2025-10-06 17:00:00','s1','season')], [('a','a','06-09',1),('a','a','15-18',1)],2),
    ]
    rows=[]
    for name,events,expected,line_count in cases:
        taps=pd.DataFrame([dict(card_id='invented',ts=ts,stop_id=stop,line='1',fare_product=fare) for ts,stop,fare in events])
        dom,raw,_,_=prepare(taps,stops)
        actual=[(*key,int(count)) for key,count in zip(dom['od'],raw['od']) if count]
        assert sorted(actual)==sorted(expected),(name,actual)
        assert int(raw['daily'].sum())==len(events)
        assert int(raw['line_hour'].sum())==line_count
        rows.append({'case':name,'expected_od':expected,'actual_od':actual,'daily_taps':int(raw['daily'].sum()),'weekday_non_doubletap_boardings':line_count,'passed':True})
    result={'data_class':'team_invented','experiment':'E2 edge specification','cases':rows,'limitations':['Timestamps follow supplied naive local-time convention; repeated DST hours cannot be disambiguated. Sunday is excluded from OD/line-hour but retained in daily taps.','The last case intentionally specifies a first actual destination b outside the observed boardings. Inferred destination a is wrong: exact heuristic parity cannot establish destination truth.','Missing-origin events are excluded before gap calculation; daily and line counts retain them.','Sixty-minute threshold compares adjacent retained-input boardings before filtering, not time since the last accepted journey.']}
    Path('evidence/e2/inference-edges.json').write_bytes(encode(result));print(f'{len(rows)} invented edge cases passed')
if __name__=='__main__':run()
