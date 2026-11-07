import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {compatibleNetwork,routeSegments,segmentProfile,pairGeometry,type RouteNetwork} from '../src/planner/routes';
import type {Release} from '../src/data/release';
const network=JSON.parse(readFileSync(join(__dirname,'../src/planner/data/foli-network.json'),'utf8')) as RouteNetwork;
const dir=join(__dirname,'../../releases/city-turku-v1');
const json=(f:string)=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const stats=json('statistics.json');
const rel={id:'city-turku-v1',manifest:json('manifest.json'),od:stats.od} as Release;
it('binds the geometry model to the released city domain',()=>{
 expect(compatibleNetwork(rel,network)).toBe(true);
 expect(compatibleNetwork({...rel,id:'kupittaa-hackathon-v1'},network)).toBe(true);
 expect(compatibleNetwork({...rel,manifest:{resources:[]}},network)).toBe(false);
 expect(compatibleNetwork(rel,{...network,geography_sha256:'wrong'})).toBe(false);
 expect(Object.keys(network.paths)).toHaveLength(600);
 expect(Math.max(...Object.values(network.snaps).map(s=>s.distance_m))).toBeLessThanOrEqual(1500);
});
it('uses continuous public shape edges with no inter-zone connector',()=>{
 for(const [pair,path] of Object.entries(network.paths)){
  const [origin,destination]=pair.split('>');let at=network.snaps[origin].node;
  expect(path.length).toBeGreaterThan(0);
  for(const id of path){const e=network.edges[id];expect([e.a,e.b]).toContain(at);at=e.a===at?e.b:e.a;}
  expect(at).toBe(network.snaps[destination].node);
  expect(pairGeometry(network,origin,destination)).toHaveLength(path.length);
 }
});
it('sums signed cells once on shared segments and excludes unassigned/self trips',()=>{
 const base=rel.od[0];const n={...network,nodes:[[22.2,60.4],[22.3,60.4]],edges:[{a:0,b:1,lines:['test']}],paths:{'A>B':[0],'C>D':[0]}};
 const r={...rel,od:[{...base,origin_area:'A',destination_area:'B',hour_band:'06-09',noisy_value:100},{...base,origin_area:'C',destination_area:'D',hour_band:'06-09',noisy_value:-80},{...base,origin_area:'A',destination_area:'A',hour_band:'06-09',noisy_value:9000}]};
 const s=routeSegments(r,n,'06-09','starts',null)[0];expect(s.total).toBe(20);expect(s.members).toHaveLength(2);expect(s.rate).toBeCloseTo(20/20/3);
 expect(routeSegments(r,n,'06-09','starts','A')[0].total).toBe(100);
 expect(segmentProfile(r,n,0,'starts',null).find(s=>s.band==='06-09')?.rate).toBe(s.rate);
});
it('assigns a cell at most once to a shared segment and retains missing-path gaps',()=>{
 const c={...rel.od[0],origin_area:'A',destination_area:'B',hour_band:'06-09',noisy_value:100};
 const n={...network,nodes:[[22.2,60.4],[22.3,60.4]],edges:[{a:0,b:1,lines:[]}],paths:{'A>B':[0,0]}};
 expect(routeSegments({...rel,od:[c]},n,'06-09','starts',null)[0].total).toBe(100);
 expect(routeSegments({...rel,od:[{...c,destination_area:'C'}]},n,'06-09','starts',null)).toEqual([]);
});

it('public bus catalog is bound to the same geometry source and valid stops',async()=>{
 const catalog=JSON.parse(readFileSync(join(__dirname,'../src/planner/data/foli-catalog.json'),'utf8'));
 expect(catalog.source_sha256).toBe(network.source.sha256);
 const stops=new Set(catalog.stops.map((s:any)=>s.id));
 for(const line of catalog.lines){expect(network.edges.some(e=>e.lines.includes(line.id))).toBe(true);for(const id of line.stops)expect(stops.has(id)).toBe(true);}
 expect(catalog.stops.some((s:any)=>s.name==='Kupittaan asema')).toBe(true);
});
