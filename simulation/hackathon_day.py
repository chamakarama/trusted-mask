"""Independent fictional full-day population, frozen before its single release."""
import csv,hashlib,json,random
from datetime import date,timedelta
from pathlib import Path
from simulation.generate import load_config,public_domain,canonical_bytes
ROOT=Path(__file__).resolve().parents[1]
SEED=2026110702
MOMENTS=[('00-06','starts','TRK-G13'),('06-09','destinations','TRK-G14'),('09-15','destinations','TRK-G12'),('15-18','starts','TRK-G14'),('18-24','destinations','TRK-G08')]

def generate(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    config=load_config();config.update(configuration_version='kupittaa-day-v2',label='Since AI full fictional day — scale test',cards=12000)
    config['day_scenario']={'seed':SEED,'background_cards':2000,'attendee_cards':10000,'event_dates':['2025-10-30','2025-10-31'],'night_fraction':.6,'shopping_fraction':.8,'background_activity':.45,'moments':MOMENTS,'claim':'Independent invented population, exaggerated attendance, invented 2025 dates. Alko run is a fictional shopping-area scenario, not an actual shop or customers.'}
    geo,stops=public_domain(config);rng=random.Random(SEED)
    (output/'public-zones.geojson').write_bytes(canonical_bytes(geo))
    with (output/'stops.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['stop_id','area','municipality','lat','lon','lines']);w.writeheader();w.writerows(stops)
    by_area={a:[s for s in stops if s['area']==a] for a in sorted({s['area'] for s in stops})}
    home_areas=[a for a in by_area if a not in {'TRK-G08','TRK-G09','TRK-G12','TRK-G13','TRK-G14'}]
    count=0;bands={k:0 for k in ('00-06','06-09','09-15','15-18','18-24')}
    weekdays=[date(2025,10,6)+timedelta(days=i) for i in range(28) if (date(2025,10,6)+timedelta(days=i)).weekday()<5]
    with (output/'taps.csv').open('w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=['card_id','ts','stop_id','line','fare_product']);w.writeheader()
        for i in range(12000):
            home=rng.choice(by_area[rng.choice(home_areas)]);attendee=i>=2000
            work=rng.choice(by_area['TRK-G14' if attendee else rng.choice([a for a in home_areas if a!=home['area']])])
            lunch=rng.choice(by_area['TRK-G12' if attendee else rng.choice(home_areas)])
            party=rng.choice(by_area['TRK-G13']);shop=rng.choice(by_area['TRK-G08' if (i-2000)%10<8 else 'TRK-G09'])
            night=attendee and (i-2000)%10<6
            dates=[date(2025,10,30),date(2025,10,31)] if attendee else weekdays
            for day in dates:
                if not attendee and rng.random()>.45:continue
                # Boarding origins in a closed daily chain. Every gap exceeds 60min.
                events=([(party,75)] if night else [])+[(home,450),(work,735),(lunch,840),(work,990)]
                if attendee:events += [(home,1090),(shop,1190)]
                for stop,minute in events:
                    minute+=rng.randrange(-10,11)
                    band='00-06' if minute<360 else '06-09' if minute<540 else '09-15' if minute<900 else '15-18' if minute<1080 else '18-24'
                    w.writerow({'card_id':f'DAY-C{i+1:06d}','ts':f'{day} {minute//60:02d}:{minute%60:02d}:00','stop_id':stop['stop_id'],'line':'SYN-NET','fare_product':'fictional_day' if attendee else 'synthetic_season'})
                    count+=1;bands[band]+=1
    metadata={'dataset_class':'team-generated-synthetic','generator_version':'kupittaa-day-2','generator_source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'population_seed':SEED,'period':config['period'],'geography_provenance':config['geography'],'configuration':config,'configuration_sha256':hashlib.sha256(canonical_bytes(config)).hexdigest(),'configured_cards':12000,'counts':{'cards':12000,'taps':count,'boarding_bands':bands},'files':{name:{'bytes':(output/name).stat().st_size,'sha256':hashlib.sha256((output/name).read_bytes()).hexdigest()} for name in ('taps.csv','stops.csv','public-zones.geojson')}}
    (output/'metadata.json').write_bytes(canonical_bytes(metadata));return metadata

if __name__=='__main__':
    out=ROOT/'simulation/private/kupittaa-day-v2';print(json.dumps({'path':str(out),'counts':generate(out)['counts']}))
