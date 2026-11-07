import csv,json
from simulation.hackathon_day import generate,SEED
from pipeline.city import validate_metadata

def test_full_day_generation_is_registered_synthetic_and_populates_every_band(tmp_path):
    folder=tmp_path/'day';meta=generate(folder)
    assert meta['population_seed']==SEED
    assert all(v>0 for v in meta['counts']['boarding_bands'].values())
    assert validate_metadata(folder)['configuration']['day_scenario']['shopping_fraction']==.8
    with (folder/'taps.csv').open() as f:
        rows=list(csv.DictReader(f))
    assert len({r['card_id'] for r in rows})==12000
    assert all(r['card_id'].startswith('DAY-') for r in rows)
    assert sum(meta['counts']['boarding_bands'].values())==len(rows)
    # Compact raw JSON must preserve every source field and boarding, not a sample.
    from collections import Counter
    from datetime import datetime,timedelta
    from demo.package_files import raw_document
    doc=raw_document(folder)
    decoded=[]
    for card in doc['cards']:
        for minute,stop in zip(card['events'][::2],card['events'][1::2]):
            decoded.append((card['card_id'],str(datetime(2025,10,6)+timedelta(minutes=minute)),doc['stops'][stop]['stop_id'],card['line'],card['fare_product']))
    assert Counter(decoded)==Counter((r['card_id'],r['ts'],r['stop_id'],r['line'],r['fare_product']) for r in rows)
    assert doc['record_count']==len(rows)
