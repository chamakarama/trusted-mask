import type {OdCell,Release} from '../data/release';
import {BANDS} from '../data/derive';
import {estimate,selectedCells,type Direction,type Estimate} from './model';
export interface RouteNetwork {
 version:number;release_id:string;geography_sha256:string;
 source:{url:string;downloaded:string;sha256:string;license:string;attribution:string};
 method:string;nodes:number[][];edges:{a:number;b:number;lines:string[]}[];
 paths:Record<string,number[]>;snaps:Record<string,{distance_m:number;node:number|null}>;
}
export interface RouteSegment extends Estimate {id:number;coordinates:number[][];lines:string[];members:OdCell[]}
export function compatibleNetwork(rel:Release,n:RouteNetwork){
 return n.version===1&&n.release_id===rel.id&&rel.manifest.resources.some((r:any)=>r.path==='public_areas.geojson'&&r.sha256===n.geography_sha256);
}
export function routeSegments(rel:Release,n:RouteNetwork,band:string,direction:Direction,anchor:string|null):RouteSegment[]{
 const groups=new Map<number,OdCell[]>();
 for(const c of selectedCells(rel,band,direction,anchor)) {
  if(c.origin_area===c.destination_area)continue;
  for(const id of new Set(n.paths[c.origin_area+'>'+c.destination_area]??[])) {
   if(!n.edges[id])continue;
   const cells=groups.get(id)??[];cells.push(c);groups.set(id,cells);
  }
 }
 return [...groups].map(([id,members])=>{const edge=n.edges[id];return {id,coordinates:[n.nodes[edge.a],n.nodes[edge.b]],lines:edge.lines,members,...estimate(rel,members,band)};});
}
export function routeMaximum(rel:Release,n:RouteNetwork){
 return Math.max(1,...BANDS.flatMap(b=>routeSegments(rel,n,b,'starts',null).map(s=>s.rate)));
}
export function segmentProfile(rel:Release,n:RouteNetwork,id:number,direction:Direction,anchor:string|null){
 return BANDS.map(band=>({band,...estimate(rel,selectedCells(rel,band,direction,anchor).filter(c=>(n.paths[c.origin_area+'>'+c.destination_area]??[]).includes(id)),band)}));
}
export function pairGeometry(n:RouteNetwork,origin:string,destination:string){
 return (n.paths[origin+'>'+destination]??[]).map(id=>{const e=n.edges[id];return [n.nodes[e.a],n.nodes[e.b]];});
}
