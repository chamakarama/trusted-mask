// Astra review: copy into an isolated web/tests directory and run npm test. Never patch Opus active working files.
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {validateRelease} from '../src/contract/validate';
const dir=join(__dirname,'../public/releases/fixture-only-001');
const schema=JSON.parse(readFileSync(join(__dirname,'../public/contract/manifest.schema.json'),'utf8'));
const enc=new TextEncoder();const dec=new TextDecoder();
const sha=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const load=()=>new Map(readdirSync(dir).map(f=>[f,new Uint8Array(readFileSync(join(dir,f)))]));
async function rehash(files:Map<string,Uint8Array>){
 const m=JSON.parse(dec.decode(files.get('manifest.json')));
 for(const r of m.resources)r.sha256=await sha(files.get(r.path)!);
 files.set('manifest.json',enc.encode(JSON.stringify(m)));
 const lines=await Promise.all([...files.entries()].filter(([k])=>k!=='checksums.sha256').sort(([a],[b])=>a.localeCompare(b)).map(async([k,v])=>`${await sha(v)}  ${k}`));
 files.set('checksums.sha256',enc.encode(lines.join('\n')+'\n'));
}
it('rejects private canary in public geometry even with valid hashes',async()=>{
 const f=load();const g=JSON.parse(dec.decode(f.get('public_areas.geojson')));g.features[0].properties.card_id='CANARY-PRIVATE-123';f.set('public_areas.geojson',enc.encode(JSON.stringify(g)));await rehash(f);
 expect((await validateRelease(f,schema,sha)).ok).toBe(false);
});
it('rejects missing CSV header and values even with valid hashes',async()=>{
 const f=load();let rows=dec.decode(f.get('od_matrix.csv')).trimEnd().split('\n').map(r=>r.split(','));rows=rows.map(r=>r.slice(0,-1));f.set('od_matrix.csv',enc.encode(rows.map(r=>r.join(',')).join('\n')+'\n'));await rehash(f);
 expect((await validateRelease(f,schema,sha)).ok).toBe(false);
});
it('rejects arbitrary manifest dimension granting private column permission',async()=>{
 const f=load();const m=JSON.parse(dec.decode(f.get('manifest.json')));m.families.od.dimensions.push('card_id');f.set('manifest.json',enc.encode(JSON.stringify(m)));
 const s=JSON.parse(dec.decode(f.get('statistics.json')));for(const r of s.od)r.card_id='CANARY-PRIVATE-123';f.set('statistics.json',enc.encode(JSON.stringify(s)));
 const rows=dec.decode(f.get('od_matrix.csv')).trimEnd().split('\n');f.set('od_matrix.csv',enc.encode(rows.map((r,i)=>r+','+(i===0?'card_id':'CANARY-PRIVATE-123')).join('\n')+'\n'));await rehash(f);
 expect((await validateRelease(f,schema,sha)).ok).toBe(false);
});
