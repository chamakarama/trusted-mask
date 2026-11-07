import {DAY_RELEASE,DAY_LABELS} from './dayStory';
import type { Release, OdCell } from '../data/release';
import { BANDS, weekdaysInPeriod, noiseRadius, familyScale } from '../data/derive';

export type Direction = 'starts' | 'destinations';
export const HOURS: Record<string, number> = {'00-06':6,'06-09':3,'09-15':6,'15-18':3,'18-24':6};
export interface Estimate { signed: number; total: number; perDay: number; rate: number; radius: number; lower: number; upper: number; uncertain: boolean; cells: number }
export interface SavedItem { release: string; direction: Direction; anchor: string; peer: string | null }

/** One simultaneous per-cell bound covers all subsequent public sums and selections. */
export function estimate(rel: Release, cells: OdCell[], band: string): Estimate {
  const signed = cells.reduce((n,c)=>n+c.noisy_value,0), total = Math.max(0,signed);
  const days = weekdaysInPeriod(rel);
  const radius = rel.manifest.fixture ? Number.NaN : cells.length * noiseRadius(familyScale(rel,'od'),.05/Math.max(1,rel.od.length));
  return {signed,total,perDay:total/days,rate:total/days/HOURS[band],radius,lower:Math.max(0,signed-radius)/days,upper:Math.max(0,signed+radius)/days,uncertain:!rel.manifest.fixture && signed<=radius,cells:cells.length};
}
export function selectedCells(rel: Release, band: string, direction: Direction, anchor: string|null, peer: string|null = null) {
  return rel.od.filter(c=>c.hour_band===band && (!anchor || (direction==='starts'?c.origin_area:c.destination_area)===anchor) && (!peer || (direction==='starts'?c.destination_area:c.origin_area)===peer));
}
export function mapValues(rel: Release, band: string, direction: Direction, anchor: string|null) {
  const cells=selectedCells(rel,band,direction,anchor);
  return rel.areas.map(area=>({area,...estimate(rel,cells.filter(c=>(anchor ? direction==='starts'?c.destination_area:c.origin_area : direction==='starts'?c.origin_area:c.destination_area)===area.id),band)}));
}
export function stableMaximum(rel: Release, direction: Direction, anchor: string|null) {
  return Math.max(1,...BANDS.flatMap(b=>mapValues(rel,b,direction,anchor).map(x=>x.rate)));
}
export function profile(rel: Release, direction: Direction, anchor: string, peer: string|null) {
  return BANDS.map(band=>({band,...estimate(rel,selectedCells(rel,band,direction,anchor,peer),band)}));
}
export function label(rel: Release,id: string) {if(rel.id===DAY_RELEASE&&DAY_LABELS[id])return DAY_LABELS[id];if(rel.id==='kupittaa-hackathon-v1'&&id==='TRK-G14')return 'Kupittaa';return /^TRK-G\d{2}$/.test(id)?`Zone ${id.slice(-2)}`:rel.areas.find(a=>a.id===id)?.name ?? id;}
export const number = (x: number) => new Intl.NumberFormat('en-GB',{maximumFractionDigits:0}).format(x);
export const itemKey = (x:SavedItem)=>[x.release,x.direction,x.anchor,x.peer??''].join('|');
export function itemLabel(rel:Release,x:SavedItem) {return x.peer ? x.direction==='starts' ? `${label(rel,x.anchor)} → ${label(rel,x.peer)}` : `${label(rel,x.peer)} → ${label(rel,x.anchor)}` : `${label(rel,x.anchor)} · trip ${x.direction}`;}
export function download(name:string,body:string,type:string) {const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function exportRows(rel:Release,items:SavedItem[]) {
  const rows=[['release_id','manifest_sha256','selection','departure_band','protected_period_trips','weekdays','trips_per_weekday','trips_per_weekday_hour','noise_lower_per_weekday','noise_upper_per_weekday','interpretation']];
  for(const item of items)for(const e of profile(rel,item.direction,item.anchor,item.peer)) rows.push([rel.id,rel.manifestHash??'',itemLabel(rel,item),e.band,String(e.total),String(weekdaysInPeriod(rel)),String(e.perDay),String(e.rate),rel.manifest.fixture?'':String(e.lower),rel.manifest.fixture?'':String(e.upper),rel.manifest.fixture?'Illustrative fixture; no privacy or uncertainty claim':e.uncertain?'Too uncertain to distinguish from zero; noise-only bound':'Noise-only range; capped counts; inferred destinations']);
  return rows.map(row=>row.map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\r\n');
}
export function summaryHtml(rel:Release,items:SavedItem[]) {
  const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>RouteSafe planning shortlist</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}small{color:#555}@media print{body{margin:0}}</style><h1>RouteSafe planning shortlist</h1><p>${esc(rel.manifest.fixture?'Illustrative fixture — no privacy claim':rel.manifest.data_class==='team_synthetic'?'Team-generated synthetic city scenario':'Supplied synthetic benchmark')} · ${esc(rel.manifest.period.start_date)} – ${esc(rel.manifest.period.end_date_inclusive)}</p><p>Estimated trips per weekday in each departure band. For further investigation, not a service recommendation.</p><table><thead><tr><th>Selection</th>${BANDS.map(b=>`<th>${b}</th>`).join('')}</tr></thead><tbody>${items.map(x=>`<tr><th>${esc(itemLabel(rel,x))}</th>${profile(rel,x.direction,x.anchor,x.peer).map(e=>`<td>${number(e.perDay)}${e.uncertain?' *':''}${rel.manifest.fixture?'':`<br><small>${number(e.lower)}–${number(e.upper)}</small>`}</td>`).join('')}</tr>`).join('')}</tbody></table><p>${rel.manifest.fixture?'Illustrative fixture values. No privacy or accuracy claim.':'* Too uncertain to distinguish from zero. Ranges cover noise around capped counts only; they exclude cap loss and inference error.'} Destinations are estimated; counts are trips, not people. Synthetic activity is not actual Turku demand.</p><p>Release ${esc(rel.id)}<br>Manifest SHA-256: ${esc(rel.manifestHash??'')}</p></html>`;
}

/** Schematic OD flows only: no street geometry or congestion is inferred. */
export function flowValues(rel:Release,band:string,direction:Direction,anchor:string|null){
  return selectedCells(rel,band,direction,anchor).filter(c=>c.origin_area!==c.destination_area)
    .map(c=>({origin:c.origin_area,destination:c.destination_area,...estimate(rel,[c],band)}))
    .filter(f=>f.total>0).sort((a,b)=>b.rate-a.rate||a.origin.localeCompare(b.origin)||a.destination.localeCompare(b.destination)).slice(0,30);
}
export function flowMaximum(rel:Release){return Math.max(1,...BANDS.flatMap(b=>flowValues(rel,b,'starts',null).map(x=>x.rate)));}
export function flowCurve(a:[number,number],b:[number,number]):[number,number][]{
  const dx=b[0]-a[0],dy=b[1]-a[1],mid:[number,number]=[(a[0]+b[0])/2-dy*.18,(a[1]+b[1])/2+dx*.18];
  return Array.from({length:25},(_,i)=>{const t=i/24,q=1-t;return [q*q*a[0]+2*q*t*mid[0]+t*t*b[0],q*q*a[1]+2*q*t*mid[1]+t*t*b[1]];});
}
