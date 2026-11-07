import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {importProtectedDocument} from '../src/data/release';
const root=join(__dirname,'../..');
function document(){const dir=join(root,'releases/kupittaa-hackathon-v1');const files=Object.fromEntries(readdirSync(dir).map(n=>[n,readFileSync(join(dir,n),'utf8')]));return {format:'routesafe-protected-v1',release_id:'kupittaa-hackathon-v1',manifest_sha256:createHash('sha256').update(files['manifest.json']).digest('hex'),files,aggregate_destinations:[]};}
function mockSchema(){const fetcher=vi.fn(async(url:string)=>{if(!url.endsWith('/contract/manifest-city.schema.json'))throw Error('Unexpected network read');return new Response(readFileSync(join(root,'contracts/manifest-city.schema.json')));});vi.stubGlobal('fetch',fetcher);return fetcher;}
afterEach(()=>vi.unstubAllGlobals());
it('opens the downloaded event release locally and derives its actual spike',async()=>{const fetcher=mockSchema();const doc=document();const rel=await importProtectedDocument(JSON.stringify(doc));expect(rel.localFiles).toEqual(doc.files);expect(rel.od.filter(r=>r.hour_band==='06-09'&&r.destination_area==='TRK-G14').reduce((n,r)=>n+r.noisy_value,0)).toBe(20488);expect(fetcher).toHaveBeenCalledTimes(1);});
it('rejects corrupt counts, unexpected members and a mismatched wrapper identity',async()=>{mockSchema();const corrupt=document();corrupt.files['od_matrix.csv']+='changed';await expect(importProtectedDocument(JSON.stringify(corrupt))).rejects.toThrow();const extra=document();extra.files['taps.csv']='private';await expect(importProtectedDocument(JSON.stringify(extra))).rejects.toThrow('unexpected');const mismatch=document();mismatch.release_id='another-release';await expect(importProtectedDocument(JSON.stringify(mismatch))).rejects.toThrow('identity');});
it('ignores unverified convenience summaries and refuses raw input',async()=>{mockSchema();const doc=document();(doc as any).aggregate_destinations=[{destination_area:'TRK-G01',protected_period_trips:99999999}];const rel=await importProtectedDocument(JSON.stringify(doc));expect(rel.od.some(r=>r.trips===99999999)).toBe(false);await expect(importProtectedDocument('{"card_id":"private"}')).rejects.toThrow('protected JSON');});
