import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import type {Release} from '../src/data/release';
import {estimate,selectedCells,profile,stableMaximum,exportRows,summaryHtml} from '../src/planner/model';
import {geometryCentre} from '../src/contract/geography';
const dir=join(__dirname,'../public/releases/e1-aura-001');
const j=(f:string)=>JSON.parse(readFileSync(join(dir,f),'utf8'));
const stats=j('statistics.json');
const rel:Release={id:'e1-aura-001',manifest:j('manifest.json'),definitions:j('definitions.json'),od:stats.od,lineHour:stats.line_hour,daily:stats.daily,areas:j('public_areas.geojson').features.map((f:any)=>({id:f.properties.area_id,name:f.properties.name,municipality:f.properties.municipality,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]})),validation:{ok:true,errors:[],warnings:[]},bytes:{},readme:''};
it('clamps only after the signed sum and normalises by weekday and band duration',()=>{
 const cells=[{...rel.od[0],noisy_value:100,trips:100},{...rel.od[1],noisy_value:-80,trips:0}];
 expect(estimate(rel,cells,'06-09').perDay).toBe(1);
 expect(estimate(rel,cells,'09-15').rate).toBeCloseTo(1/6);
 expect(estimate(rel,cells,'06-09').rate).toBeCloseTo(1/3);
});
it('keeps direction, self-zone and selected connection semantics consistent',()=>{
 const a=rel.areas[0].id,b=rel.areas[1].id;
 expect(selectedCells(rel,'06-09','starts',a).every(x=>x.origin_area===a)).toBe(true);
 expect(selectedCells(rel,'06-09','destinations',a,b).every(x=>x.destination_area===a&&x.origin_area===b)).toBe(true);
 expect(selectedCells(rel,'06-09','starts',a,a)).toHaveLength(1);
 expect(profile(rel,'starts',a,null)).toHaveLength(5);
 expect(stableMaximum(rel,'starts',a)).toBeGreaterThan(0);
});
it('uses a fixed simultaneous domain for uncertainty and suppresses fixture claims',()=>{
 const cells=rel.od.slice(0,2);expect(estimate(rel,cells,'06-09').radius).toBe(1142);
 const fixture={...rel,manifest:{...rel.manifest,fixture:true}};
 expect(Number.isNaN(estimate(fixture,cells,'06-09').radius)).toBe(true);
 const items=[{release:rel.id,direction:'starts' as const,anchor:rel.areas[0].id,peer:null}];
 expect(exportRows(fixture,items)).toContain('Illustrative fixture; no privacy or uncertainty claim');
 expect(summaryHtml(fixture,items)).not.toContain('NaN');
 expect(summaryHtml(fixture,items)).toContain('no privacy claim');
});
it('accepts only finite non-crossing single-ring rectangular geometry',()=>{
 const polygon={type:'Polygon',coordinates:[[[22,60],[23,60],[23,61],[22,61],[22,60]]]};
 expect(geometryCentre(polygon,true)).toEqual([22.5,60.5]);
 expect(()=>geometryCentre({...polygon,coordinates:[[[22,60],[23,61],[23,60],[22,61],[22,60]]]},true)).toThrow();
 expect(()=>geometryCentre({...polygon,coordinates:[...polygon.coordinates,...polygon.coordinates]},true)).toThrow();
 expect(()=>geometryCentre({type:'Point',coordinates:[NaN,60]},false)).toThrow();
});

it('flow layer uses released nonself pairs with a fixed scale and schematic endpoints',async()=>{
 const {flowValues,flowMaximum,flowCurve}=await import('../src/planner/model');
 const flows=flowValues(rel,'06-09','starts',null);
 expect(flows).toHaveLength(30);
 expect(flows.every(f=>f.origin!==f.destination)).toBe(true);
 expect(flows.every(f=>f.rate<=flowMaximum(rel))).toBe(true);
 const a:[number,number]=[22.2,60.4],b:[number,number]=[22.3,60.5];
 const curve=flowCurve(a,b);expect(curve[0]).toEqual(a);expect(curve.at(-1)).toEqual(b);
 expect(flowCurve(b,a)[12]).not.toEqual(curve[12]);
});
