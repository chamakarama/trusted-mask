import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {loadRelease} from '../src/data/release';
import {mapValues,label} from '../src/planner/model';
import {DAY_MOMENTS,DAY_RELEASE} from '../src/planner/dayStory';
afterEach(()=>vi.unstubAllGlobals());
it('retains the five declared story targets while keeping the night interval uncertain',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(readFileSync(join(__dirname,'../public',url.replace(/^\//,''))))));
 const rel=await loadRelease(DAY_RELEASE);
 for(const [band,moment] of Object.entries(DAY_MOMENTS)){
  const values=mapValues(rel,band,moment.direction,null).sort((a,b)=>b.total-a.total);
  expect(values[0].area.id).toBe(moment.area);
  expect(values[0].total).toBeGreaterThan(0);
  expect(values[0].uncertain).toBe(band==='00-06');
 }
 expect(label(rel,'TRK-G08')).toBe('Alko run');
 const incoming=mapValues(rel,'15-18','destinations',null).find(v=>v.area.id==='TRK-G14')!;
 const outgoing=mapValues(rel,'15-18','starts',null).find(v=>v.area.id==='TRK-G14')!;
 expect(outgoing.total).toBeGreaterThan(incoming.total);
});
