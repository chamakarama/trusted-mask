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
