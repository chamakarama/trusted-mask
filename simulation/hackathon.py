"""Frozen fictional Kupittaa scenario; never calls the privacy mechanism."""
import csv,hashlib,json,random,shutil
from datetime import date,timedelta
from pathlib import Path
from simulation.generate import load_config,public_domain,canonical_bytes
ROOT=Path(__file__).resolve().parents[1]
SEED=2026110701

def generate(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    config=load_config();config.update(configuration_version='kupittaa-hackathon-v1',label='Since AI at Kupittaa — fictional scale-test scenario',cards=12000)
    config['hackathon']={'seed':SEED,'background_cards':2000,'attendee_cards':10000,'event_dates':['2025-10-30','2025-10-31'],'destination':'TRK-G14','claim':'Invented dates and exaggerated attendance; not actual event data.'}
    geo,stops=public_domain(config);rng=random.Random(SEED)
    (output/'public-zones.geojson').write_bytes(canonical_bytes(geo))
    with (output/'stops.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['stop_id','area','municipality','lat','lon','lines']);w.writeheader();w.writerows(stops)
    by_area={a:[s for s in stops if s['area']==a] for a in sorted({s['area'] for s in stops})}
    origins=[a for a in by_area if a!='TRK-G14'];count=0
    weekdays=[date(2025,10,6)+timedelta(days=i) for i in range(28) if (date(2025,10,6)+timedelta(days=i)).weekday()<5]
    with (output/'taps.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['card_id','ts','stop_id','line','fare_product']);w.writeheader()
        for i in range(12000):
            home=rng.choice(by_area[rng.choice(origins)]);attendee=i>=2000
            dest=rng.choice(by_area['TRK-G14' if attendee else rng.choice([a for a in origins if a!=home['area']])])
            dates=[date(2025,10,30),date(2025,10,31)] if attendee else weekdays
            for day in dates:
                if not attendee and rng.random()>.8:continue
                for stop,minutes in ((home,450+rng.randrange(-20,21)),(dest,990+rng.randrange(-20,21))):
                    w.writerow({'card_id':f'HACK-C{i+1:06d}','ts':f'{day} {minutes//60:02d}:{minutes%60:02d}:00','stop_id':stop['stop_id'],'line':'SYN-NET','fare_product':'fictional_hackathon' if attendee else 'synthetic_season'});count+=1
    metadata={'dataset_class':'team-generated-synthetic','generator_version':'kupittaa-hackathon-1','generator_source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'population_seed':SEED,'period':config['period'],'geography_provenance':config['geography'],'configuration':config,'configuration_sha256':hashlib.sha256(canonical_bytes(config)).hexdigest(),'configured_cards':12000,'counts':{'cards':12000,'taps':count},'files':{name:{'bytes':(output/name).stat().st_size,'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()} for name in ('taps.csv','stops.csv','public-zones.geojson')}}
    (output/'metadata.json').write_bytes(canonical_bytes(metadata));return metadata

if __name__=='__main__':
    out=ROOT/'simulation/private/kupittaa-hackathon-v1'
    print(json.dumps({'path':str(out),'counts':generate(out)['counts']}))
