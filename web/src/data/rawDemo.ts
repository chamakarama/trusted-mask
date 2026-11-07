import {BANDS} from './derive';
import {importProtectedDocument,loadRelease,type Release,type OdCell} from './release';

/** Explicit local raw-demo path, never accepted by the protected-release verifier. */
export async function importPlannerDocument(text:string):Promise<Release>{
  if(new TextEncoder().encode(text).length>8*1024*1024)throw Error('Choose a data JSON file under 8 MB');
  const doc=JSON.parse(text);
  if(doc?.format!=='routesafe-raw-demo-v1')return importProtectedDocument(text);
  if(doc.scenario_id!=='kupittaa-day-v2'||doc.epoch_local!=='2025-10-06 00:00:00'||doc.timezone!=='Europe/Helsinki')throw Error('Unsupported raw demo');
  if(!Array.isArray(doc.cards)||!doc.cards.length||doc.cards.length>20000||!Array.isArray(doc.stops)||doc.stops.length!==50)throw Error('Invalid raw demo dimensions');
  // A verified public reference supplies geography and the fixed domain. Raw file contents never enter a URL or request.
  const reference=await loadRelease('kupittaa-day-v2');
  const areas=new Set(reference.areas.map(a=>a.id));
  const stopIds=new Set<string>();
  for(const s of doc.stops){
    if(typeof s.stop_id!=='string'||!/^SYN-TRK-G\d{2}-[12]$/.test(s.stop_id)||stopIds.has(s.stop_id)||!areas.has(s.area))throw Error('Invalid raw stop');
    stopIds.add(s.stop_id);
    if(s.stop_id.slice(4,-2)!==s.area)throw Error('Raw stop area mismatch');
  }
  const counts=new Map<string,number>();let records=0;
  const seen=new Set<string>();
  for(const card of doc.cards){
    if(!/^DAY-C\d{6}$/.test(card.card_id)||seen.has(card.card_id)||card.line!=='SYN-NET'||!['fictional_day','synthetic_season'].includes(card.fare_product)||!Array.isArray(card.events)||card.events.length%2||card.events.length>1000)throw Error('Invalid raw card');
    seen.add(card.card_id);
    const days=new Map<number,{minute:number;stop:number}[]>();
    for(let i=0;i<card.events.length;i+=2){
      const minute=card.events[i],stop=card.events[i+1];
      if(!Number.isInteger(minute)||minute<0||minute>=40320||!Number.isInteger(stop)||stop<0||stop>=50)throw Error('Invalid raw boarding');
      records++;if(records>300000)throw Error('Too many raw records');
      const day=Math.floor(minute/1440);
      if(day%7>=5)continue;
      const events=days.get(day)??[];events.push({minute,stop});days.set(day,events);
    }
    for(const events of days.values()){
      events.sort((a,b)=>a.minute-b.minute||doc.stops[a.stop].stop_id.localeCompare(doc.stops[b.stop].stop_id));
      // Match the pipeline: gaps use the previous original boarding, before filtering.
      const kept=events.filter((e,i)=>!i||e.minute-events[i-1].minute>60);
      kept.forEach((event,i)=>{
        const hour=Math.floor(event.minute%1440/60);
        const band=hour<6?BANDS[0]:hour<9?BANDS[1]:hour<15?BANDS[2]:hour<18?BANDS[3]:BANDS[4];
        const key=[doc.stops[event.stop].area,doc.stops[kept[(i+1)%kept.length].stop].area,band].join('|');
        counts.set(key,(counts.get(key)??0)+1);
      });
    }
  }
  if(!Number.isSafeInteger(doc.record_count)||records!==doc.record_count)throw Error('Raw record count mismatch');
  const od:OdCell[]=reference.od.map(c=>{const n=counts.get([c.origin_area,c.destination_area,c.hour_band].join('|'))??0;return {...c,trips:n,noisy_value:n,noise_lower:null,noise_upper:null,evidence_status:'not_supported'};});
  return {...reference,id:'kupittaa-day-v2-raw',rawPreview:true,scenarioId:'kupittaa-day-v2',manifestHash:undefined,localFiles:undefined,
    manifest:{...reference.manifest,release_id:'kupittaa-day-v2-raw',fixture:true,purpose:'Local raw synthetic data preview. No privacy protection.',privacy:{epsilon_release:null,guarantee_status:'not_applicable'},limitations:['Unprotected individual source records. No clipping or noise.','Destinations and street paths are inferred; not observed passenger trajectories.']},
    od,lineHour:[],daily:[],bytes:{},readme:doc.read_me?.contents??'',validation:{ok:true,errors:[],warnings:['Raw format checked, not a protected release.']}};
}
