"""Build public route geometry and a declared shortest-distance assignment.

No raw travel records, truth, release counts or privacy mechanism are read here.
Föli bus shape coordinates are directed edges. Identical coordinates rounded to
five decimals share a node; no straight-line inter-zone edges are manufactured.
The output is a modelling aid, not an observed route or timetable assignment.
"""
import argparse
import csv
import hashlib
import heapq
import io
import json
import math
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile


def distance(a, b):
    return math.hypot((a[0]-b[0])*55500, (a[1]-b[1])*111320)


def build(source, geography):
    with ZipFile(source) as archive:
        def rows(name):
            return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding='utf-8-sig'))
        routes = {r['route_id']: r['route_short_name'] for r in rows('routes.txt') if r['route_type'] == '3'}
        shape_routes = defaultdict(set)
        for trip in rows('trips.txt'):
            if trip['route_id'] in routes:
                shape_routes[trip['shape_id']].add(routes[trip['route_id']])
        shapes = defaultdict(list)
        for point in rows('shapes.txt'):
            if point['shape_id'] in shape_routes:
                p = (round(float(point['shape_pt_lon']), 5), round(float(point['shape_pt_lat']), 5))
                shapes[point['shape_id']].append((int(point['shape_pt_sequence']), p))
        feed = list(rows('feed_info.txt'))
    nodes, ids, adjacency, edge_lines = [], {}, defaultdict(dict), defaultdict(set)
    def node(p):
        if p not in ids:
            ids[p] = len(nodes); nodes.append(p)
        return ids[p]
    def inside(p):
        return 22.16 <= p[0] <= 22.39 and 60.38 <= p[1] <= 60.53
    for shape in sorted(shapes):
        points = [p for _, p in sorted(shapes[shape])]
        for a, b in zip(points, points[1:]):
            if a == b or not inside(a) or not inside(b):
                continue
            x, y = node(a), node(b)
            adjacency[x][y] = distance(a,b)
            edge_lines[tuple(sorted((x,y)))].update(shape_routes[shape])
    # Snap only to the largest connected bus-network component. Disconnected
    # shape fragments must not attract zones and create fictitious connectors.
    undirected = defaultdict(set)
    for a,b in edge_lines:
        undirected[a].add(b);undirected[b].add(a)
    unseen=set(undirected); components=[]
    while unseen:
        stack=[unseen.pop()];component=set(stack)
        while stack:
            for n in undirected[stack.pop()]:
                if n in unseen:
                    unseen.remove(n);component.add(n);stack.append(n)
        components.append(component)
    component=max(components,key=len)
    geo=json.loads(Path(geography).read_text()); zones={}; snaps={}
    for feature in geo['features']:
        ring=feature['geometry']['coordinates'][0]
        centre=((min(p[0] for p in ring)+max(p[0] for p in ring))/2,(min(p[1] for p in ring)+max(p[1] for p in ring))/2)
        near=min(component,key=lambda n:(distance(centre,nodes[n]),n));d=distance(centre,nodes[near])
        if d <= 1500:
            zones[feature['properties']['area_id']]=near
        snaps[feature['properties']['area_id']]={'distance_m':round(d),'node':near if d<=1500 else None}
    edges=sorted(edge_lines);edge_ids={e:i for i,e in enumerate(edges)};paths={}
    for origin,start in zones.items():
        best={start:0};previous={};queue=[(0,start)]
        while queue:
            cost,current=heapq.heappop(queue)
            if cost!=best[current]:continue
            for nxt,length in adjacency[current].items():
                candidate=cost+length
                if candidate<best.get(nxt,math.inf):
                    best[nxt]=candidate;previous[nxt]=current;heapq.heappush(queue,(candidate,nxt))
        for destination,end in zones.items():
            if origin==destination or end not in best or start==end:continue
            current=end;path=[]
            while current!=start:
                prev=previous[current];path.append(edge_ids[tuple(sorted((prev,current)))]);current=prev
            paths[origin+'>'+destination]=list(reversed(path))
    return {'version':1,'release_id':'city-turku-v1','geography_sha256':hashlib.sha256(Path(geography).read_bytes()).hexdigest(),
        'source':{'url':'https://data.foli.fi/gtfs/gtfs.zip','downloaded':'2026-11-07','sha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'license':'CC BY 4.0','attribution':'Turun seudun joukkoliikenne / Föli','feed':feed},
        'method':'Shortest directed distance over public bus-shape coordinates; zone centres snapped within 1500 m; transfer/schedule/capacity constraints not modelled. Geometry snapshot is later than the synthetic 2025 demand period. Segment display combines both travel directions.',
        'nodes':nodes,'edges':[{'a':a,'b':b,'lines':sorted(edge_lines[(a,b)])} for a,b in edges], 'snaps':snaps,'paths':paths}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--gtfs',required=True);parser.add_argument('--geography',default='releases/city-turku-v1/public_areas.geojson');parser.add_argument('--output',default='web/src/planner/data/foli-network.json');args=parser.parse_args()
    result=build(args.gtfs,args.geography)
    Path(args.output).write_text(json.dumps(result,separators=(',',':'))+'\n')
    print(json.dumps({'nodes':len(result['nodes']),'segments':len(result['edges']),'assigned_pairs':len(result['paths']),'snaps':result['snaps'],'bytes':Path(args.output).stat().st_size}))
