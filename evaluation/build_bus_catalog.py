"""Public names/stops for the same recorded Föli feed; no passenger data."""
import csv,hashlib,io,json
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]

def build(source):
    network=json.loads((ROOT/'web/src/planner/data/foli-network.json').read_text())
    known={line for edge in network['edges'] for line in edge['lines']}
    with ZipFile(source) as z:
        def rows(name):return csv.DictReader(io.TextIOWrapper(z.open(name),encoding='utf-8-sig'))
        routes={r['route_id']:r for r in rows('routes.txt') if r['route_type']=='3' and r['route_short_name'] in known}
        trips={r['trip_id']:r['route_id'] for r in rows('trips.txt') if r['route_id'] in routes}
        stops={r['stop_id']:{'id':r['stop_id'],'name':r['stop_name'],'lon':float(r['stop_lon']),'lat':float(r['stop_lat'])} for r in rows('stops.txt') if 22.16<=float(r['stop_lon'])<=22.39 and 60.38<=float(r['stop_lat'])<=60.53}
        members=defaultdict(set)
        for r in rows('stop_times.txt'):
            if r['trip_id'] in trips and r['stop_id'] in stops:members[routes[trips[r['trip_id']]]['route_short_name']].add(r['stop_id'])
    lines={}
    for r in routes.values():
        label=r['route_short_name'];entry=lines.setdefault(label,{'id':label,'names':[],'stops':sorted(members[label]),'color':r['route_color'] or '68a4bf'})
        if r['route_long_name'] not in entry['names']:entry['names'].append(r['route_long_name'])
    return {'source_sha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'snapshot':'2026-11-07','scope':'Public bus lines and stops within the map extent, including route variants. Not live service or passenger observations.','lines':sorted(lines.values(),key=lambda r:r['id']),'stops':list(stops.values())}

if __name__=='__main__':
    result=build(ROOT/'private/public-network/foli-gtfs.zip')
    (ROOT/'web/src/planner/data/foli-catalog.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
    print({'lines':len(result['lines']),'stops':len(result['stops'])})
