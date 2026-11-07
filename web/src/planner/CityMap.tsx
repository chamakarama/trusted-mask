import {useEffect,useRef,useState} from 'react';
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import {type Map as MLMap, type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Release} from '../data/release';
import {label,number,flowCurve,type Estimate} from './model';

interface Props {rel:Release; values:({area:Release['areas'][number]}&Estimate)[]; maximum:number; anchor:string|null; selected:string|null; onSelect:(id:string)=>void; onUnavailable:()=>void;layer:'areas'|'flows';flows:({origin:string;destination:string}&Estimate)[];flowMaximum:number;onFlowSelect:(origin:string,destination:string)=>void}
export default function CityMap({rel,values,maximum,anchor,selected,onSelect,onUnavailable,layer,flows,flowMaximum,onFlowSelect}:Props) {
  const box=useRef<HTMLDivElement>(null), map=useRef<MLMap|null>(null), callback=useRef(onSelect), failCallback=useRef(onUnavailable);
  const flowCallback=useRef(onFlowSelect);flowCallback.current=onFlowSelect;
  const [ready,setReady]=useState(false), [failed,setFailed]=useState(false);
  callback.current=onSelect;failCallback.current=onUnavailable;
  useEffect(()=>{
    if(!box.current)return;
    let alive=true, loaded=false;
    const fail=()=>{if(alive){setFailed(true);failCallback.current();}};
    const timer=window.setTimeout(()=>{if(!loaded)fail();},18000);
    let m:MLMap;
    try {m=new maplibregl.Map({container:box.current,style:'https://tiles.openfreemap.org/styles/positron',center:[22.27,60.45],zoom:11,attributionControl:false});} catch(error){console.warn('City map initialisation failed',error);fail();return()=>clearTimeout(timer);}
    map.current=m;
    const observer=new ResizeObserver(()=>m.resize());observer.observe(box.current);
    m.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
    m.on('error',event=>{console.warn('City map resource failed',event.error?.message);if(!loaded)fail();});
    m.on('load',()=>{
      if(!alive)return;loaded=true;clearTimeout(timer);setFailed(false);
      const empty:any={type:'FeatureCollection',features:[]};
      m.addSource('flows',{type:'geojson',data:empty});
      m.addSource('zones',{type:'geojson',data:empty});m.addSource('centres',{type:'geojson',data:empty});m.addSource('connection',{type:'geojson',data:empty});
      const colour:any=['interpolate',['linear'],['get','intensity'],0,'#edf3f2',.2,'#b9d9d1',.5,'#6eafa2',.8,'#267d71',1,'#07574d'];
      m.addLayer({id:'zone-fill',type:'fill',source:'zones',paint:{'fill-color':colour,'fill-opacity':['case',['get','uncertain'],.28,.65]}});
      m.addLayer({id:'zone-edge',type:'line',source:'zones',paint:{'line-color':['case',['get','selected'],'#172f2b','#6c8d85'],'line-width':['case',['get','selected'],3,.7],'line-opacity':.9}});
      m.addLayer({id:'zone-uncertain',type:'line',source:'zones',filter:['==',['get','uncertain'],true],paint:{'line-color':'#6b7d78','line-width':1,'line-dasharray':[2,3]}});
      m.addLayer({id:'zone-points',type:'circle',source:'centres',filter:['==',['get','marker'],true],paint:{'circle-radius':['+',8,['*',20,['sqrt',['get','intensity']]]],'circle-color':colour,'circle-opacity':['case',['get','uncertain'],.35,.8],'circle-stroke-color':['case',['get','selected'],'#172f2b','#ffffff'],'circle-stroke-width':['case',['get','selected'],3,1.5]}});
      const flowColor:any=['interpolate',['linear'],['get','intensity'],0,'#ffbf80',.45,'#f37d35',1,'#d94317'];
      m.addLayer({id:'flow-glow',type:'line',source:'flows',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff9b48','line-width':['+',8,['*',12,['sqrt',['get','intensity']]]],'line-blur':5,'line-opacity':.25}});
      m.addLayer({id:'flow-lines',type:'line',source:'flows',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':flowColor,'line-width':['+',1,['*',7,['sqrt',['get','intensity']]]],'line-opacity':['case',['get','uncertain'],.22,.85]}});
      m.addLayer({id:'flow-hit',type:'line',source:'flows',paint:{'line-width':16,'line-opacity':0}});
      m.addLayer({id:'zone-label',type:'symbol',source:'centres',filter:['==',['get','marker'],false],layout:{'text-field':['get','caption'],'text-size':12,'text-font':['Noto Sans Regular'],'text-allow-overlap':false},paint:{'text-color':'#173d35','text-halo-color':'#ffffff','text-halo-width':1.5}});
      m.addLayer({id:'connection-line',type:'line',source:'connection',paint:{'line-color':'#173d35','line-width':3,'line-dasharray':[2,2]}});
      m.on('click',event=>{
        const flow=m.queryRenderedFeatures(event.point,{layers:['flow-hit']})[0]?.properties;
        if(flow&&typeof flow.origin==='string'&&typeof flow.destination==='string'){flowCallback.current(flow.origin,flow.destination);return;}
        const feature=m.queryRenderedFeatures(event.point,{layers:['zone-fill','zone-points']})[0]?.properties;
        if(typeof feature?.id==='string')callback.current(feature.id);
      });
      for(const id of ['zone-fill','zone-points','flow-hit']){m.on('mouseenter',id,()=>m.getCanvas().style.cursor='pointer');m.on('mouseleave',id,()=>m.getCanvas().style.cursor='');}
      const bounds=new maplibregl.LngLatBounds();rel.areas.forEach(a=>{bounds.extend([a.lon,a.lat]);if(a.geometry?.type==='Polygon')a.geometry.coordinates[0].forEach((p:[number,number])=>bounds.extend(p));});
      if(!bounds.isEmpty())m.fitBounds(bounds,{padding:{left:box.current&&box.current.clientWidth>=800?340:30,right:55,top:70,bottom:100},duration:0,maxZoom:13});
      setReady(true);
    });
    return()=>{alive=false;clearTimeout(timer);setReady(false);observer.disconnect();m.remove();map.current=null;};
  },[rel.id]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    const features=values.map(v=>({type:'Feature',properties:{id:v.area.id,caption:layer==='flows'?label(rel,v.area.id):`${label(rel,v.area.id)}\n${number(v.rate)}/h`,intensity:Math.min(1,v.rate/maximum),uncertain:v.uncertain,selected:v.area.id===anchor||v.area.id===selected,marker:v.area.geometry?.type!=='Polygon'},geometry:v.area.geometry??{type:'Point',coordinates:[v.area.lon,v.area.lat]}}));
    (m.getSource('zones') as GeoJSONSource).setData({type:'FeatureCollection',features:features.filter(f=>f.geometry.type==='Polygon')} as any);
    (m.getSource('centres') as GeoJSONSource).setData({type:'FeatureCollection',features:features.map((f,i)=>({...f,geometry:{type:'Point',coordinates:[values[i].area.lon,values[i].area.lat]}}))} as any);
    const byId=new Map(rel.areas.map(a=>[a.id,a]));
    (m.getSource('flows') as GeoJSONSource).setData({type:'FeatureCollection',features:flows.map(f=>{
      const a=byId.get(f.origin)!,b=byId.get(f.destination)!;
      return {type:'Feature',properties:{origin:f.origin,destination:f.destination,intensity:Math.min(1,f.rate/flowMaximum),uncertain:f.uncertain},geometry:{type:'LineString',coordinates:flowCurve([a.lon,a.lat],[b.lon,b.lat])}};
    })} as any);
    for(const id of ['flow-glow','flow-lines','flow-hit'])m.setLayoutProperty(id,'visibility',layer==='flows'?'visible':'none');
    m.setPaintProperty('zone-fill','fill-opacity',layer==='flows'?.07:['case',['get','uncertain'],.28,.65]);
    const a=rel.areas.find(x=>x.id===anchor),b=rel.areas.find(x=>x.id===selected);
    (m.getSource('connection') as GeoJSONSource).setData({type:'FeatureCollection',features:a&&b&&a.id!==b.id?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[[a.lon,a.lat],[b.lon,b.lat]]}}]:[]} as any);
  },[ready,values,maximum,anchor,selected,rel,layer,flows,flowMaximum]);
  return <><div ref={box} className="city-map" aria-label="City map with protected demand by analysis area" role="region"/>{failed&&<div className="map-failure" role="status"><strong>City map unavailable</strong><p>Use the area list to continue. Map tiles need an internet connection.</p><button onClick={()=>window.location.reload()}>Retry map</button></div>}<div className="map-credit">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a></div></>;
}
