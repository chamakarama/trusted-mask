import {useEffect,useRef,useState} from 'react';
import {BoundaryPreview} from './BoundaryPreview';
import './simple-operator.css';

const formatPercent=(value:number)=>`${(value*100).toFixed(1)}%`;
const friendlyError=(message:string)=>{
  if(message.includes('ALREADY_PROTECTED'))return 'This file is already protected. Open it in the planner, or choose 01-RAW.json here.';
  if(message.includes('RAW_JSON_CHANGED')||message.includes('UNREGISTERED')||message.includes('REGISTERED_DEMO_REQUIRED'))return 'Choose the original raw demo file. Changed datasets need a new protection setup.';
  if(message.includes('STALE_REVISION'))return 'This run changed in another window. Please choose the file again.';
  return message;
};

export function WorkflowApp(){
  const input=useRef<HTMLInputElement>(null), running=useRef(false), attemptRun=useRef<string|null>(null);
  const [canRetry,setCanRetry]=useState(false);
  const [state,setState]=useState<any>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [fileName,setFileName]=useState(''),[dragging,setDragging]=useState(false);
  const [recipient,setRecipient]=useState<any>(null),[previewError,setPreviewError]=useState('');
  const ready=state?.completed===6&&!busy&&!error;
  async function refresh(){
    const response=await fetch('/api/state',{cache:'no-store'});
    if(!response.ok)throw Error('The local operator is unavailable.');
    const next=await response.json();setState(next);return next;
  }
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  async function prepare(current:any){
    setBusy('Protecting and checking the result…');
    const response=await fetch('/api/action/prepare-demo',{method:'POST',headers:{'Content-Type':'application/json','X-Workflow-Token':current.csrf},body:JSON.stringify({revision:current.revision})});
    const next=await response.json();
    if(!response.ok){if(next.state)setState({...next.state,csrf:current.csrf});throw Error(next.error??'Processing failed. Try again.');}
    setState(next);
  }
  async function upload(file:File){
    if(!state||running.current)return;
    running.current=true;setBusy('Checking your file…');setError('');setRecipient(null);setFileName(file.name);setCanRetry(false);attemptRun.current=null;
    try{
      if(!file.size||file.size>16*1024*1024)throw Error('Choose a JSON or ZIP file under 16 MB.');
      if(!/\.(json|zip)$/i.test(file.name))throw Error('Choose the raw demo JSON or ZIP.');
      const response=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':/\.json$/i.test(file.name)?'application/json':'application/zip','X-Workflow-Token':state.csrf,'X-Workflow-Revision':String(state.revision)},body:file});
      const next=await response.json();if(!response.ok)throw Error(next.error??'Upload failed.');
      setState(next);attemptRun.current=next.run_id;setCanRetry(true);await prepare(next);
    }catch(e){setError(friendlyError(e instanceof Error?e.message:'Processing failed.'));await refresh().catch(()=>{});}
    finally{running.current=false;setBusy('');if(input.current)input.current.value='';}
  }
  async function retry(){
    if(running.current)return;running.current=true;setError('');setBusy('Checking this run…');
    try{const current=await refresh();if(canRetry){if(current.run_id!==attemptRun.current){setCanRetry(false);throw Error('This run changed. Please choose your raw file again.');}await prepare(current);}}
    catch(e){setError(friendlyError(e instanceof Error?e.message:'Processing failed.'));}
    finally{running.current=false;setBusy('');}
  }
  async function inspect(open:boolean){
    if(!open||!ready||recipient)return;setPreviewError('');
    try{const response=await fetch('/api/recipient-preview',{cache:'no-store'});if(!response.ok)throw Error('Preview unavailable.');const preview=await response.json();if(preview.manifest_sha256!==state.candidate.manifest_sha256)throw Error('Preview belongs to a different result.');setRecipient(preview);}
    catch(e){setPreviewError(e instanceof Error?e.message:'Preview unavailable.');}
  }
  return <div className="simple-operator">
    <header className="simple-header"><a className="product-brand" href="/operator.html"><span className="brand-mark">↗</span>RouteSafe</a><a href={state?.package?.planner_url??state?.planner_url??'http://127.0.0.1:8791/'} target="_blank" rel="noreferrer">Open planner ↗</a></header>
    <main className="simple-main">
      <div className="simple-intro"><span>PROTECT DATA</span><h1>Private journeys.<br/><em>Shareable patterns.</em></h1><p>Upload your raw file. Download protected data.</p></div>
      <div className="transfer-pair" aria-busy={!!busy}>
        <section className={`transfer-card source-card${dragging?' dragging':''}`} onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(busy)return;if(e.dataTransfer.files.length===1)void upload(e.dataTransfer.files[0]);else setError('Choose one raw file.');}}>
          <span className="transfer-kicker">01 · RAW INPUT</span><div className="transfer-symbol" aria-hidden="true">↑</div><h2>Upload raw data</h2><p className="transfer-description">{fileName||'Drop 01-RAW.json here'}</p>
          <input ref={input} className="sr-only" type="file" accept=".json,application/json,.zip,application/zip" aria-label="Raw synthetic JSON or ZIP" disabled={!state||!!busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);}}/>
          <button className="transfer-primary" disabled={!state||!!busy} onClick={()=>input.current?.click()}>{fileName||ready?'Choose another file':'Choose file'}</button><small>JSON or ZIP · up to 16 MB</small>
        </section>
        <div className="transfer-arrow" aria-hidden="true">→</div>
        <section className={`transfer-card result-card${ready?' is-ready':''}`}>
          <span className="transfer-kicker">02 · PROTECTED OUTPUT</span><div className="transfer-symbol" aria-hidden="true">{ready?'✓':'↓'}</div><h2>{ready?'Ready to share':'Your protected file'}</h2><p className="transfer-description" role="status" aria-live="polite">{busy?<><i className="transfer-spinner"/>{busy}</>:ready?'Aggregate patterns. No individual records.':'Ready after your upload.'}</p>
          {ready?<a className="transfer-primary" href="/api/protected-data" download="02-PROTECTED.json">Download protected file ↓</a>:<button className="transfer-primary" disabled>Download protected file ↓</button>}
          <small>{ready?'Opens in the planner or ChatGPT':'Processing runs automatically'}</small>
        </section>
      </div>
      {error&&<div className="simple-error" role="alert"><p>{error}</p><button onClick={()=>state&&!canRetry?input.current?.click():void retry()} disabled={!!busy}>{canRetry?'Retry processing':state?'Choose file':'Reconnect'}</button></div>}
      <div className="protection-strip" aria-label="Protection applied"><span>Group journeys</span><b>→</b><span>Limit contributions</span><b>→</b><span>Add privacy noise</span></div>
      <p className="simple-scope">Synthetic demo · exploratory use{ready&&state.evaluation?.accuracy_pass===false?' · fine-count accuracy target missed':''}</p>
      <details className="simple-details" onToggle={e=>void inspect(e.currentTarget.open)}><summary>Details</summary>
        <p>This demo accepts the registered synthetic input. It validates records, applies the fixed transport-planning policy and verifies the matching protected release. Existing releases are reused; uploading again does not redraw noise.</p>
        <p>Whole-period contribution limits and calibrated noise protect one card’s contribution, not necessarily a person with multiple cards. The implementation remains experimental. Automatic processing does not represent a human review.</p>
        {ready&&<><div className="simple-metrics"><div><strong>{state.validation?.taps?.toLocaleString()}</strong><span>source records</span></div><div><strong>{formatPercent(state.evaluation.metrics.od.wape)}</strong><span>fine-count error · target 20%</span></div><div><strong>ε = 1</strong><span>card-level privacy budget</span></div></div><BoundaryPreview privateRows={state.private_preview?.rows??[]} recipient={recipient} error={previewError}/><p>For an AI comparison, use a separate fresh chat for each file. A model’s inability to retrieve an individual is not a privacy proof.</p><a href="/api/package" download>Download technical bundle</a></>}
        {state?.demo_available&&<p><a href="/api/demo-input" download>Get the raw demo ZIP</a></p>}
      </details>
    </main>
  </div>;
}
