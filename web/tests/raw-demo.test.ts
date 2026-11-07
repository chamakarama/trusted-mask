import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {importPlannerDocument} from '../src/data/rawDemo';
import {importProtectedDocument} from '../src/data/release';
import {estimate} from '../src/planner/model';

function raw(){return {format:'routesafe-raw-demo-v1',scenario_id:'kupittaa-day-v2',epoch_local:'2025-10-06 00:00:00',timezone:'Europe/Helsinki',record_count:6,
  stops:Array.from({length:50},(_,i)=>({stop_id:`SYN-TRK-G${String(Math.floor(i/2)+1).padStart(2,'0')}-${i%2+1}`,area:`TRK-G${String(Math.floor(i/2)+1).padStart(2,'0')}`})),
  cards:[{card_id:'DAY-C002001',line:'SYN-NET',fare_product:'fictional_day',events:[35010,0,35295,26,35400,22,35550,26,35650,0,35750,14]}]};}
function mockPublic(){const f=vi.fn(async(url:string)=>new Response(readFileSync(join(__dirname,'../public',url.replace(/^\//,'')))));vi.stubGlobal('fetch',f);return f;}
afterEach(()=>vi.unstubAllGlobals());
it('derives uncapped raw demand locally and never labels it a protected release',async()=>{
 const fetcher=mockPublic(),doc=raw();const r=await importPlannerDocument(JSON.stringify(doc));
 expect(r.rawPreview).toBe(true);expect(r.manifestHash).toBeUndefined();expect(r.manifest.privacy.epsilon_release).toBeNull();expect(r.localFiles).toBeUndefined();
 const nonzero=r.od.filter(c=>c.trips>0);
 expect(nonzero.map(c=>[c.origin_area,c.destination_area,c.hour_band])).toEqual([
  ['TRK-G01','TRK-G08','18-24'],['TRK-G01','TRK-G14','06-09'],['TRK-G08','TRK-G01','18-24'],
  ['TRK-G12','TRK-G14','09-15'],['TRK-G14','TRK-G01','15-18'],['TRK-G14','TRK-G12','09-15']]);
 expect(nonzero.reduce((n,c)=>n+c.trips,0)).toBe(6);
 expect(estimate(r,nonzero,'06-09').uncertain).toBe(false);
 for(const [url,...args] of fetcher.mock.calls){expect(url).toMatch(/^\/(releases\/kupittaa-day-v2\/|contract\/)/);expect(JSON.stringify(args)).not.toContain('DAY-C');}
 await expect(importProtectedDocument(JSON.stringify(doc))).rejects.toThrow('protected JSON');
});
it('rejects malformed raw event indices, record totals and duplicate card identities',async()=>{
 mockPublic();const badStop=raw();badStop.cards[0].events[1]=50;
 await expect(importPlannerDocument(JSON.stringify(badStop))).rejects.toThrow('boarding');
 const badCount=raw();badCount.record_count=8;
 await expect(importPlannerDocument(JSON.stringify(badCount))).rejects.toThrow('count mismatch');
 const duplicate=raw();duplicate.cards.push(duplicate.cards[0]);
 await expect(importPlannerDocument(JSON.stringify(duplicate))).rejects.toThrow('raw card');
});
