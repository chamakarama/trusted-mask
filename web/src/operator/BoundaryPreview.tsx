interface Props {privateRows:Record<string,string>[];recipient:any;error:string}
export function BoundaryPreview({privateRows,recipient,error}:Props){
 return <section className="boundary-comparison" aria-label="Private data and actual recipient output">
  <article className="boundary-private"><div className="boundary-label">STAYS WITH THE DATA OWNER</div><h2>Individual journeys</h2><p className="boundary-caption">Three source rows · private local view</p>
   {privateRows.length?<div className="boundary-table"><table><thead><tr><th>Card</th><th>Exact time</th><th>Stop</th></tr></thead><tbody>{privateRows.map((r,i)=><tr key={i}><td><mark>{r.card_id}</mark></td><td>{r.ts}</td><td>{r.stop_id}</td></tr>)}</tbody></table></div>:<p>Validate the dataset to inspect its source rows.</p>}
   <p className="boundary-caption">Card identifiers and individual records stay inside this workbench.</p>
  </article><div className="boundary-arrow" aria-hidden="true">→</div>
  <article className="boundary-recipient"><div className="boundary-label">RECIPIENT OUTPUT</div><h2>Protected patterns</h2><p className="boundary-caption">Actual rows from the verified release</p>
   {recipient?<><div className="boundary-table"><table><thead><tr><th>Connection</th><th>Time band</th><th>Period trips</th></tr></thead><tbody>{recipient.records.map((r:any,i:number)=><tr key={i}><td>{r.origin_area} → {r.destination_area}</td><td>{r.hour_band}</td><td>{r.trips.toLocaleString()}</td></tr>)}</tbody></table></div><p className="boundary-caption">{recipient.release_id} · {recipient.source_file}</p><details><summary>Inspect the exact recipient JSON</summary><pre>{JSON.stringify(recipient,null,2)}</pre></details></>:<p className="boundary-empty">{error||'Create or verify the protected result to see the actual shared data.'}</p>}
   <div className="boundary-proof">No card IDs · no individual timestamps · no passenger histories</div>
  </article>
 </section>;
}
export function DecisionComparison({score}:{score:any}){
 if(!score)return null;
 return <section className="decision-comparison" aria-label="Before and after planning task"><div className="panel-eyebrow">PRIVATE UTILITY CHECK · SYNTHETIC DATA</div><h2>Which three destinations deserve a closer look?</h2><p>Weekday mornings · 06–09 · inferred journeys over the release period</p><div className="decision-columns">{[['Before protection',score.exact_top3],['From the protected release',score.protected_top3]].map(([title,rows]:any)=><article key={title}><h3>{title}</h3><ol>{rows.map((r:any)=><li key={r.area}><span>{r.area.replace('TRK-G','Zone ')}</span><b>{r.period_trips.toLocaleString()}</b></li>)}</ol></article>)}</div><div className="decision-result"><strong>{score.top3_overlap??'—'} / 3 destinations retained</strong><span>{score.regret===null?'No reference demand':`${(score.regret*100).toFixed(1)}% selection regret`}</span></div><p className="boundary-caption">This compares one artifact with its private reference. It does not prove general reliability, true destinations or a need for extra buses.</p></section>;
}
