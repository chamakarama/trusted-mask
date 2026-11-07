import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {validateRelease} from '../src/contract/validate';
const schema=JSON.parse(readFileSync(join(__dirname,'../../contracts/manifest-city.schema.json'),'utf8'));
const sha=async(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const enc=new TextEncoder(),dec=new TextDecoder();
async function rehash(files:Map<string,Uint8Array>){
 const m=JSON.parse(dec.decode(files.get('manifest.json')));
 for(const r of m.resources)r.sha256=await sha(files.get(r.path)!);
 files.set('manifest.json',enc.encode(JSON.stringify(m)));
 files.set('checksums.sha256',enc.encode((await Promise.all([...files.entries()].filter(([n])=>n!=='checksums.sha256').sort(([a],[b])=>a.localeCompare(b)).map(async([n,b])=>`${await sha(b)}  ${n}`))).join('\n')+'\n'));
 return files;
}
// In-memory validator fixture only. Never a published mechanism result.
async function cityFiles(){
 const dir=join(__dirname,'../public/releases/fixture-only-001');
 const files=new Map(readdirSync(dir).map(f=>[f,new Uint8Array(readFileSync(join(dir,f)))]));
 const m=JSON.parse(dec.decode(files.get('manifest.json')));
 Object.assign(m,{schema_version:'1.1',fixture:false,policy_version:'city-grid-32-64-64-epsilon1-v1',public_domain_version:'turku-analysis-grid-v1',synthetic_provenance:{generator_version:'test',population_seed:1,generator_source_sha256:'a'.repeat(64),configuration_sha256:'b'.repeat(64),geography_sha256:'c'.repeat(64)}});
 files.set('manifest.json',enc.encode(JSON.stringify(m)));
 const geo:{type:string,features:any[]}={type:'FeatureCollection',features:[]};
 const round=(x:number)=>Math.round(x*1e8)/1e8;
 for(let row=0;row<5;row++)for(let col=0;col<5;col++){
   const id=`TRK-G${String(row*5+col+1).padStart(2,'0')}`,x=round(22.20+.03*col),x1=round(x+.03),y=round(60.40+.02*row),y1=round(y+.02);
   geo.features.push({type:'Feature',properties:{area_id:id,name:id,municipality:'Turku',source:'In-memory contract test'},geometry:{type:'Polygon',coordinates:[[[x,y],[x1,y],[x1,y1],[x,y1],[x,y]]]}});
 }
 const stats=JSON.parse(dec.decode(files.get('statistics.json'))), sample=stats.od[0];
 stats.od=geo.features.flatMap(a=>geo.features.flatMap(b=>['00-06','06-09','09-15','15-18','18-24'].map(hour_band=>({...sample,origin_area:a.properties.area_id,destination_area:b.properties.area_id,hour_band}))));
 files.set('statistics.json',enc.encode(JSON.stringify(stats)));
 const columns=['origin_area','destination_area','hour_band','trips','noisy_value','noise_lower','noise_upper','evidence_status'];
 files.set('od_matrix.csv',enc.encode(columns.join(',')+'\n'+stats.od.map((r:any)=>columns.map(k=>r[k]??'').join(',')).join('\n')+'\n'));
 files.set('public_areas.geojson',enc.encode(JSON.stringify(geo)));return rehash(files);
}
it('independent browser verifier accepts the strict city version',async()=>{
 expect((await validateRelease(await cityFiles(),schema,sha)).errors).toEqual([]);
});
it('rejects overlapping rectangles despite valid checksums',async()=>{
 const files=await cityFiles();const geo=JSON.parse(dec.decode(files.get('public_areas.geojson')));geo.features[1].geometry=geo.features[0].geometry;
 files.set('public_areas.geojson',enc.encode(JSON.stringify(geo)));
 expect((await validateRelease(await rehash(files),schema,sha)).ok).toBe(false);
});
it('rejects null signed counts and traversal release IDs after rehash',async()=>{
 const files=await cityFiles(),stats=JSON.parse(dec.decode(files.get('statistics.json')));stats.od[0].noisy_value=null;
 files.set('statistics.json',enc.encode(JSON.stringify(stats)));
 expect((await validateRelease(await rehash(files),schema,sha)).errors.join()).toMatch(/integer/);
 const clean=await cityFiles(),m=JSON.parse(dec.decode(clean.get('manifest.json')));m.release_id='../escaped';clean.set('manifest.json',enc.encode(JSON.stringify(m)));
 expect((await validateRelease(await rehash(clean),schema,sha)).ok).toBe(false);
});
