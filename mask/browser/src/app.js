import './browser.css';
import { validText } from './manifest.js';
import { CACHE_NAME } from './model-cache.js';
import { makePreview, restoredSegments, readSSE } from './preview.js';
const $=id=>document.getElementById(id);
const message=$('message'),output=$('output'),filter=$('filter');
const modelNames={mask1:'Original DeBERTa Base',mask2:'New DeBERTa Base · experimental',maskmini:'MiniLM'};
let selectedModel='mask2';
let worker,ready=false,working=false,revision=0,sequence=0,preview=null,sendController=null,replyRaw='',replyDone=false,examples=[],exampleIndex=0,config;
// Background filtering: the text in the box is filtered on this device while the user reads or types,
// so Filter usually only reveals a finished result. The worker runs one message at a time; finished
// results stay in memory, keyed by model and exact text, and never leave the page.
let inflight=null,waiting=null,debounce=null;
const results=new Map(),TIME_LIMIT=180000,TYPING_PAUSE=600;
const keyOf=text=>`${selectedModel}\u0000${text}`;
function remember(key,entry){results.delete(key);results.set(key,entry);while(results.size>8)results.delete(results.keys().next().value);}
function schedule(delay){clearTimeout(debounce);debounce=setTimeout(()=>{debounce=null;pump();},delay);}
function pump(){
  if(!ready||inflight||debounce)return;
  const text=message.value,key=keyOf(text);
  if(!validText(text)||results.has(key))return;
  const id=++sequence,task=text.split('\n')[0].trim()||text;
  const timer=setTimeout(()=>{
    if(inflight?.id!==id)return;
    const wasWaiting=waiting===key,error='Filtering exceeded the time limit. Try a shorter message. Nothing was sent.';
    remember(key,{error});startWorker();
    if(wasWaiting)notice(error,true);
  },TIME_LIMIT);
  inflight={id,key,text,task,timer,discard:false};
  worker.postMessage({id,type:'protect',text,task});
}
function reveal(key){
  const entry=results.get(key);
  invalidate();notice('');
  if(entry.error){notice(entry.error,true);return;}
  try{
    preview=makePreview(entry.text,entry.task,entry.result,revision);
    message.hidden=true;output.hidden=false;renderTokens(entry.result.protected_text,output);
    if(motion())output.animate([{opacity:.4},{opacity:1}],{duration:350});
    $('review').hidden=!config.relayURL;
    $('send').hidden=!config.relayURL;$('send').disabled=false;
    $('payload').textContent=`System instruction\n${preview.request.system}\n\nMessage\n${preview.request.user}`;
    filter.title=`${entry.result.edits.length} edits in ${(entry.elapsed/1000).toFixed(1)} seconds, processed on this device.`;
    if(!config.relayURL)notice('Claude is not connected. You can copy the filtered text.',true);
  }catch{preview=null;notice('The model could not produce a complete preview. Try a shorter message. Nothing was sent.',true);}
  controls();
}
const motion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
function notice(text,error=false){$('notice').textContent=error?text:'';$('notice').hidden=!error;$('notice').classList.toggle('error',error);}
function controls(){
  filter.disabled=!ready||working||!validText(message.value)||!!preview;
  filter.textContent=working?'Filtering…':ready?'Filter':'Filter unlocks when the model is ready';
  $('stop').hidden=!working&&!sendController;
  $('example').classList.toggle('nudge',!message.value.trim()&&!working);
}
let downloadStart=null;
function waitNote(title,detail){
  const strong=document.createElement('strong');strong.textContent=title;
  $('model-wait').replaceChildren(strong,document.createTextNode(` ${detail}`));$('model-wait').hidden=false;
}
function timeLeft(loaded,total){
  const now=performance.now();
  if(!downloadStart){downloadStart={time:now,loaded};return '';}
  const seconds=(now-downloadStart.time)/1000,rate=(loaded-downloadStart.loaded)/seconds;
  if(seconds<3||rate<=0)return '';
  const left=(total-loaded)/rate;
  return left<45?' (less than a minute left)':left<90?' (about a minute left)':` (about ${Math.round(left/60)} minutes left)`;
}
function renderTokens(text,target){
  target.replaceChildren();let cursor=0;
  for(const m of text.matchAll(/\[[A-Z]+(?:_[A-Z]+)*(?:_\d+)?\]/g)){
    target.append(document.createTextNode(text.slice(cursor,m.index)));
    const span=document.createElement('span');span.className='token';span.textContent=m[0];target.append(span);cursor=m.index+m[0].length;
  }
  target.append(document.createTextNode(text.slice(cursor)));
}
function invalidate(){
  revision++;preview=null;replyRaw='';replyDone=false;
  sendController?.abort();sendController=null;
  for(const id of ['output','send','review','reply-section'])$(id).hidden=true;
  message.hidden=false;output.replaceChildren();$('payload').textContent='';$('reply').replaceChildren();$('revert').disabled=true;
  controls();
}
function startWorker(){
  worker?.terminate();ready=false;working=false;waiting=null;clearTimeout(inflight?.timer);inflight=null;
  notice('');
  $('model-select').title=modelNames[selectedModel];
  $('model-state').hidden=false;
  $('retry').hidden=true;$('model-progress').hidden=false;$('model-progress').removeAttribute('value');
  $('model-wait').hidden=true;downloadStart=null;
  $('model-status').textContent='Loading the local model…';$('status-dot').className='status-dot';
  worker=new Worker(new URL('./pipeline.worker.js',import.meta.url),{type:'module'});
  const currentWorker=worker;
  worker.onmessage=({data})=>{
    if(worker!==currentWorker)return;
    if(data.type==='status'){
      if(data.phase==='download'){
        if(data.total){
          const loaded=data.loaded||0,total=Math.round(data.total/1e6);
          $('model-progress').value=loaded/data.total*100;
          $('model-status').textContent=`${data.cached?'Reading saved model':'Downloading model'} · ${Math.round(loaded/1e6)} / ${total} MB · ${Math.floor(loaded/data.total*100)}%`;
          if(data.cached===false)waitNote('Please wait for the local model to download.',`This one-time ${total} MB download runs in this tab${timeLeft(loaded,data.total)}. Keep the tab open: Filter unlocks automatically when the model is ready.`);
        }
        if(data.cacheUnavailable)$('model-version').title='Browser storage is unavailable; the model may download again next time.';
      }else if(data.phase==='initializing'){$('model-progress').removeAttribute('value');$('model-status').textContent='Starting the model on your device…';waitNote('Almost ready.','Starting the model on your device. This takes a few more seconds.');}
      else if(data.phase==='ready'){
        ready=true;$('model-progress').hidden=true;$('model-wait').hidden=true;$('status-dot').className='status-dot ready';$('model-status').textContent='Ready · filtering stays on your device';
        $('model-state').hidden=true;
        $('model-version').textContent=`${modelNames[selectedModel]} · English · ${data.modelId.slice(-12)}`;controls();pump();
      }
    }else if((data.type==='result'||data.type==='error')&&inflight&&data.id===inflight.id){
      const run=inflight;clearTimeout(run.timer);inflight=null;
      if(!run.discard)remember(run.key,data.type==='result'?{text:run.text,task:run.task,result:data.result,elapsed:data.elapsed}:{error:data.message});
      if(waiting===run.key){waiting=null;working=false;reveal(run.key);}
      pump();controls();
    }else if(data.type==='error'){
      if(!ready){$('model-state').hidden=false;$('model-status').textContent=data.message;$('model-progress').hidden=true;$('model-wait').hidden=true;$('retry').hidden=false;$('status-dot').className='status-dot error';}
    }
  };
  worker.onerror=()=>{if(worker!==currentWorker)return;ready=false;working=false;waiting=null;clearTimeout(inflight?.timer);inflight=null;$('model-state').hidden=false;$('model-wait').hidden=true;$('model-status').textContent='This browser could not start the local model.';$('retry').hidden=false;$('model-progress').hidden=true;notice('Nothing was sent. Close unused tabs and retry, or try another current desktop browser.',true);controls();};
  worker.postMessage({id:++sequence,type:'init',pointer:config.models[selectedModel]});controls();
}
function protect(){
  if(filter.disabled)return;
  const key=keyOf(message.value);
  clearTimeout(debounce);debounce=null;
  if(results.get(key)?.stopped)results.delete(key);
  if(results.has(key)){reveal(key);return;}  // already filtered in the background
  waiting=key;working=true;notice('');controls();pump();  // reveal as soon as the run for this text finishes
}
message.addEventListener('input',()=>{waiting=null;working=false;invalidate();notice('');schedule(TYPING_PAUSE);});
filter.addEventListener('click',protect);
$('retry').addEventListener('click',()=>{invalidate();startWorker();});
$('example').addEventListener('click',()=>{if(!examples.length)return;waiting=null;working=false;invalidate();message.value=examples[exampleIndex++%examples.length].text;message.scrollTop=0;controls();notice('');schedule(0);});
function edit(){if(working)return;invalidate();message.focus();}
output.addEventListener('click',edit);
output.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();edit();}});
$('clear').addEventListener('click',()=>{
  clearTimeout(debounce);debounce=null;waiting=null;working=false;
  if(inflight)inflight.discard=true;results.clear();
  invalidate();message.value='';$('settings').open=false;controls();notice('');
});
$('stop').addEventListener('click',()=>{
  const stopped=working&&waiting;invalidate();
  if(stopped){startWorker();remember(stopped,{stopped:true});}  // no automatic re-run; Filter starts it again
  notice('Stopped. Nothing further will be sent.');
});
$('forget-model').addEventListener('click',async()=>{
  invalidate();worker?.terminate();ready=false;working=false;waiting=null;clearTimeout(inflight?.timer);inflight=null;results.clear();
  $('settings').open=false;
  $('model-state').hidden=false;$('model-progress').hidden=true;$('model-wait').hidden=true;
  try{await caches.delete(CACHE_NAME);$('model-status').textContent='Downloaded model removed.';}catch{$('model-status').textContent='Browser storage could not be cleared.';}
  $('retry').textContent='Load model';$('retry').hidden=false;controls();
});
$('model-select').addEventListener('change',()=>{
  selectedModel=$('model-select').value;results.clear();
  invalidate();filter.removeAttribute('title');startWorker();
});
$('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';});
$('send').addEventListener('click',async()=>{
  if(!preview||preview.revision!==revision||sendController||!config.relayURL)return;
  const approved=preview,version=revision,controller=new AbortController();sendController=controller;
  $('send').disabled=true;$('reply-section').hidden=false;$('reply-label').textContent='Claude is replying…';$('reply').replaceChildren();$('revert').disabled=true;replyRaw='';replyDone=false;controls();
  const timeout=setTimeout(()=>controller.abort(),95000);
  if(motion())$('reply-section').scrollIntoView({behavior:'smooth',block:'start'});
  try{
    const response=await fetch(config.relayURL,{method:'POST',headers:{'Content-Type':'application/json','X-Mask-Request':'send'},credentials:'omit',cache:'no-store',signal:controller.signal,body:JSON.stringify({preview_id:approved.id,...approved.request})});
    if(!response.ok)throw new Error('The AI service is unavailable. Please retry later.');
    await readSSE(response.body,(name,data)=>{
      if(version!==revision)return;
      if(name==='delta'&&typeof data.text==='string'){
        replyRaw+=data.text;
        if(replyRaw.length>64000)throw new Error('The reply exceeded the supported length.');
        const partial=/\[[A-Z][A-Z_0-9]*$|\[$/.exec(replyRaw);
        renderTokens(partial?replyRaw.slice(0,partial.index):replyRaw,$('reply'));
      }else if(name==='error')throw new Error('The AI could not finish the reply.');
      else if(name==='done')replyDone=true;
    },controller.signal);
    if(version!==revision)return;
    if(!replyDone||!replyRaw.trim())throw new Error('The AI returned an incomplete reply.');
    renderTokens(replyRaw,$('reply'));$('reply-label').textContent='Claude’s reply';
    $('revert').disabled=!restoredSegments(replyRaw,approved.aliases).some(x=>x.alias);
  }catch{
    if(version!==revision)return;
    replyDone=false;$('reply-label').textContent='Reply interrupted';$('send').disabled=false;
    $('reply').append(document.createTextNode('\n\nThe reply could not finish. You can retry sending the same protected message.'));
  }finally{clearTimeout(timeout);if(sendController===controller)sendController=null;controls();}
});
$('revert').addEventListener('click',()=>{
  if(!replyDone||!preview)return;
  $('reply').replaceChildren();
  for(const part of restoredSegments(replyRaw,preview.aliases)){
    const el=document.createElement('span');el.textContent=part.text;if(part.alias)el.className='restored';$('reply').append(el);
  }
  $('revert').disabled=true;
});
try{
  const [c,e]=await Promise.all([fetch('/app-config.json',{cache:'no-store'}),fetch('/examples.json')]);
  if(!c.ok||!e.ok)throw new Error();config=await c.json();examples=await e.json();
  if(typeof config.modelPointer!=='string'||config.relayURL&&new URL(config.relayURL,location.origin).protocol!=='https:')throw new Error();
  if(!config.models || Object.keys(config.models).sort().join(',')!=='mask1,mask2,maskmini' || Object.values(config.models).some(x=>typeof x!=='string'||!x.startsWith('/models/')))throw new Error();
  if(!Object.hasOwn(config.models,config.defaultModel))throw new Error();
  selectedModel=config.defaultModel;$('model-select').value=selectedModel;
  $('model-select').disabled=false;startWorker();
}catch{$('model-status').textContent='The demo configuration could not be loaded. Reload this page.';}
