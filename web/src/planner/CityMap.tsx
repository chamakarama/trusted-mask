import {useEffect,useRef,useState} from 'react';
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
maplibregl.setWorkerUrl(workerUrl);
import {type Map as MLMap, type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type {Release} from '../data/release';
import {label,number,type Estimate} from './model';
import {pairGeometry,type RouteNetwork,type RouteSegment} from './routes';

type BusStop={id:string;name:string;lon:number;lat:number};
interface Props {busLine:string|null;busStops:BusStop[];focusStop:BusStop|null;rel:Release; values:({area:Release['areas'][number]}&Estimate)[]; maximum:number; anchor:string|null; selected:string|null; onSelect:(id:string)=>void; onUnavailable:()=>void;layer:'areas'|'flows';network:RouteNetwork|null;segments:RouteSegment[];segmentMaximum:number;selectedSegment:number|null;onSegmentSelect:(id:number)=>void;direction:'starts'|'destinations'}
export default function CityMap({busLine,busStops,focusStop,rel,values,maximum,anchor,selected,onSelect,onUnavailable,layer,network,segments,segmentMaximum,selectedSegment,onSegmentSelect,direction}:Props) {
  const box=useRef<HTMLDivElement>(null), map=useRef<MLMap|null>(null), callback=useRef(onSelect), failCallback=useRef(onUnavailable);
  const segmentCallback=useRef(onSegmentSelect);segmentCallback.current=onSegmentSelect;
  const layerRef=useRef(layer);layerRef.current=layer;
  const [ready,setReady]=useState(false), [failed,setFailed]=useState(false);
  callback.current=onSelect;failCallback.current=onUnavailable;
  useEffect(()=>{
    if(!box.current)return;
    let alive=true, loaded=false;
    const fail=()=>{if(alive){setFailed(true);failCallback.current();}};
    const timer=window.setTimeout(()=>{if(!loaded)fail();},18000);
    let m:MLMap;
    try {m=new maplibregl.Map({container:box.current,style:'https://tiles.openfreemap.org/styles/dark',center:[22.27,60.45],zoom:11,attributionControl:false});} catch(error){console.warn('City map initialisation failed',error);fail();return()=>clearTimeout(timer);}
    map.current=m;
    const observer=new ResizeObserver(()=>m.resize());observer.observe(box.current);
    m.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
    m.on('error',event=>{console.warn('City map resource failed',event.error?.message);if(!loaded)fail();});
    m.on('load',()=>{
      if(!alive)return;loaded=true;clearTimeout(timer);setFailed(false);
      const empty:any={type:'FeatureCollection',features:[]};
      m.addSource('bus-track',{type:'geojson',data:empty});
      m.addSource('bus-stops',{type:'geojson',data:empty});
      m.addSource('flows',{type:'geojson',data:empty});
      m.addSource('zones',{type:'geojson',data:empty});m.addSource('centres',{type:'geojson',data:empty});m.addSource('connection',{type:'geojson',data:empty});
      const colour:any=['interpolate',['linear'],['get','intensity'],0,'#edf3f2',.2,'#b9d9d1',.5,'#6eafa2',.8,'#267d71',1,'#07574d'];
      m.addLayer({id:'zone-fill',type:'fill',source:'zones',paint:{'fill-color':colour,'fill-opacity':['case',['get','uncertain'],.28,.65]}});
      m.addLayer({id:'zone-edge',type:'line',source:'zones',paint:{'line-color':['case',['get','selected'],'#172f2b','#6c8d85'],'line-width':['case',['get','selected'],3,.7],'line-opacity':.9}});
      m.addLayer({id:'zone-uncertain',type:'line',source:'zones',filter:['==',['get','uncertain'],true],paint:{'line-color':'#6b7d78','line-width':1,'line-dasharray':[2,3]}});
      m.addLayer({id:'zone-points',type:'circle',source:'centres',filter:['==',['get','marker'],true],paint:{'circle-radius':['+',8,['*',20,['sqrt',['get','intensity']]]],'circle-color':colour,'circle-opacity':['case',['get','uncertain'],.35,.8],'circle-stroke-color':['case',['get','selected'],'#172f2b','#ffffff'],'circle-stroke-width':['case',['get','selected'],3,1.5]}});
      const flowColor:any=['interpolate',['linear'],['get','intensity'],0,'#9192c9',.15,'#aa6dc9',.4,'#e55775',.7,'#f58436',1,'#ffcf54'];
      m.addLayer({id:'bus-track',type:'line',source:'bus-track',paint:{'line-color':'#c5d6e4','line-width':3,'line-opacity':.45}});
      m.addLayer({id:'flow-glow',type:'line',source:'flows',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':flowColor,'line-width':['+',5,['*',12,['sqrt',['get','intensity']]]],'line-blur':4,'line-opacity':['case',['get','uncertain'],.15,.45]}});
      m.addLayer({id:'flow-lines',type:'line',source:'flows',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':flowColor,'line-width':['+',1,['*',5,['sqrt',['get','intensity']]]],'line-opacity':['case',['get','uncertain'],.3,.95]}});
      m.addLayer({id:'flow-hit',type:'line',source:'flows',paint:{'line-width':16,'line-opacity':0}});
      m.addLayer({id:'zone-label',type:'symbol',source:'centres',filter:['==',['get','marker'],false],layout:{'text-field':['get','caption'],'text-size':12,'text-font':['Noto Sans Regular'],'text-allow-overlap':false},paint:{'text-color':'#173d35','text-halo-color':'#ffffff','text-halo-width':1.5}});
      m.addLayer({id:'connection-line',type:'line',source:'connection',paint:{'line-color':'#ffffff','line-width':4,'line-opacity':.9}});
      m.addLayer({id:'bus-stop-dots',type:'circle',source:'bus-stops',paint:{'circle-radius':['case',['get','focused'],7,4],'circle-color':'#ffffff','circle-stroke-width':2,'circle-stroke-color':'#387a98'}});
      m.addLayer({id:'bus-stop-names',type:'symbol',source:'bus-stops',minzoom:13,layout:{'text-field':['get','name'],'text-size':11,'text-font':['Noto Sans Regular'],'text-offset':[0,1.4],'text-anchor':'top'},paint:{'text-color':'#ffffff','text-halo-color':'#13232d','text-halo-width':2}});
      m.on('click',event=>{
        const flow=m.queryRenderedFeatures(event.point,{layers:['flow-hit']})[0]?.properties;
        if(flow&&Number.isInteger(Number(flow.id))){segmentCallback.current(Number(flow.id));return;}
        if(layerRef.current==='flows')return;
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
    (m.getSource('flows') as GeoJSONSource).setData({type:'FeatureCollection',features:segments.filter(s=>s.total>0).sort((a,b)=>a.rate-b.rate).map(s=>({type:'Feature',properties:{id:s.id,intensity:Math.min(1,s.rate/segmentMaximum),uncertain:s.uncertain},geometry:{type:'LineString',coordinates:s.coordinates}}))} as any);
    for(const id of ['flow-glow','flow-lines','flow-hit'])m.setLayoutProperty(id,'visibility',layer==='flows'&&network?'visible':'none');
    m.setPaintProperty('zone-fill','fill-opacity',layer==='flows'?0:['case',['get','uncertain'],.28,.65]);
    m.setPaintProperty('zone-edge','line-opacity',layer==='flows'?0:.9);
    m.setLayoutProperty('zone-uncertain','visibility',layer==='flows'?'none':'visible');
    m.setLayoutProperty('zone-points','visibility',layer==='flows'?'none':'visible');
    m.setLayoutProperty('zone-label','visibility',layer==='flows'?'none':'visible');
    const lines = layer==='flows'&&network ? selectedSegment!==null&&network.edges[selectedSegment] ? [segments.find(s=>s.id===selectedSegment)?.coordinates].filter(Boolean) : anchor&&selected ? pairGeometry(network,direction==='starts'?anchor:selected,direction==='starts'?selected:anchor) : [] : [];
    (m.getSource('connection') as GeoJSONSource).setData({type:'FeatureCollection',features:lines.map(coordinates=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates}}))} as any);
  },[ready,values,maximum,anchor,selected,rel,layer,segments,segmentMaximum,network,selectedSegment,direction]);
  useEffect(()=>{
    const m=map.current;if(!ready||!m)return;
    const edges=network&&busLine?network.edges.filter(e=>e.lines.includes(busLine)):[];
    (m.getSource('bus-track') as GeoJSONSource).setData({type:'FeatureCollection',features:edges.map(e=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[network!.nodes[e.a],network!.nodes[e.b]]}}))} as any);
    (m.getSource('bus-stops') as GeoJSONSource).setData({type:'FeatureCollection',features:busStops.map(s=>({type:'Feature',properties:{name:s.name,focused:s.id===focusStop?.id},geometry:{type:'Point',coordinates:[s.lon,s.lat]}}))} as any);
  },[ready,network,busLine,busStops,focusStop,rel]);
  useEffect(()=>{if(ready&&map.current&&focusStop)map.current.flyTo({center:[focusStop.lon,focusStop.lat],zoom:14,duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:650});},[ready,focusStop]);
  useEffect(()=>{if(!ready||!map.current||!network||!busLine)return;const coords=network.edges.filter(e=>e.lines.includes(busLine)).flatMap(e=>[network.nodes[e.a],network.nodes[e.b]]);if(!coords.length)return;map.current.fitBounds([[Math.min(...coords.map(p=>p[0])),Math.min(...coords.map(p=>p[1]))],[Math.max(...coords.map(p=>p[0])),Math.max(...coords.map(p=>p[1]))]],{padding:70,maxZoom:13,duration:0});},[ready,network,busLine]);
  return <><div ref={box} className="city-map" aria-label={rel.rawPreview?"City map with raw unprotected demand":"City map with protected demand by analysis area"} role="region"/>{failed&&<div className="map-failure" role="status"><strong>City map unavailable</strong><p>Use the area list to continue. Map tiles need an internet connection.</p><button onClick={()=>window.location.reload()}>Retry map</button></div>}<div className="map-credit">Routes: <a href="https://data.foli.fi" target="_blank" rel="noreferrer">Föli · CC BY 4.0</a> · Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a></div></>;
}
