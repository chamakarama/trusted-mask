import * as ort from 'onnxruntime-web/wasm';
import { validateManifest, validText } from './manifest.js';
import { checkedAsset } from './model-cache.js';

let runtime, initializing, busy = false, lastProgress = 0;
const status = (phase, details={}) => self.postMessage({type:'status',phase,...details});
async function json(url) {
  const r = await fetch(url,{cache:'no-store',credentials:'omit'});
  if(!r.ok) throw new Error('Model configuration is unavailable.');
  return r.json();
}
async function initialize(pointer) {
  const pointerURL = new URL(pointer,self.location.origin);
  if(pointerURL.protocol !== 'https:' && pointerURL.origin !== self.location.origin) throw new Error('Model hosting requires HTTPS.');
  const current = await json(pointerURL.href);
  const manifestURL = new URL(current.manifest,pointerURL);
  const manifest = validateManifest(await json(manifestURL.href));
  status('download',{model:manifest.name,modelId:manifest.id,total:manifest.assets['model.onnx'].bytes});
  const progress = p => {
    if(performance.now()-lastProgress>150 || p.loaded === p.total) { lastProgress=performance.now(); status('download',p); }
  };
  let weights = await checkedAsset(new URL('model.onnx',manifestURL).href,manifest.assets['model.onnx'],progress);
  const tokenizerBytes = await checkedAsset(new URL('tokenizer.json',manifestURL).href,manifest.assets['tokenizer.json']);
  status('initializing');
  const tokenizerModuleURL = '/tokenizer/mask_tokenizer.js';
  const wasm = await import(/* @vite-ignore */ tokenizerModuleURL);
  await wasm.default({module_or_path:'/tokenizer/mask_tokenizer_bg.wasm'});
  const tokenizer = new wasm.BrowserTokenizer(new TextDecoder().decode(tokenizerBytes),manifest.pad_id,manifest.max_tokens,manifest.stride);
  for(let i=0;i<2;i++) if(tokenizer.token_id(`[unused${i}]`) !== manifest.marker_ids[i]) throw new Error('Tokenizer markers do not match the trained model.');
  ort.env.wasm.wasmPaths = new URL('/runtime/ort/',self.location.origin).href;
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4,Math.max(1,(navigator.hardwareConcurrency||2)>>1)) : 1;
  ort.env.wasm.proxy = false;
  const session = await ort.InferenceSession.create(weights,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  weights = null;
  if(JSON.stringify(session.inputNames)!==JSON.stringify(manifest.inputs)) throw new Error('Model input contract mismatch.');
  if(JSON.stringify(session.outputNames)!==JSON.stringify(manifest.outputs)) throw new Error('Model output contract mismatch.');
  if(manifest.section_marker_ids && manifest.section_marker_ids.some((id,i)=>tokenizer.token_id(`[unused${i+2}]`)!==id)) throw new Error('Section tokenizer mismatch.');
  const pythonModuleURL = '/runtime/pyodide/pyodide.mjs';
  const {loadPyodide} = await import(/* @vite-ignore */ pythonModuleURL);
  const py = await loadPyodide({indexURL:'/runtime/pyodide/',stdout:()=>{},stderr:()=>{}});
  const policy = await fetch('/policy/policy.zip',{cache:'no-cache'});
  if(!policy.ok) throw new Error('Privacy policy runtime is unavailable.');
  py.unpackArchive(await policy.arrayBuffer(),'zip');
  const encode = (text,pair,windowed) => tokenizer.encode(text,pair === undefined || pair === null ? undefined : pair,windowed);
  const infer = async (batchJSON,mode) => {
    const batch=JSON.parse(batchJSON), feeds={};
    const length=batch.input_ids.length;
    if(length>512 || length<1) throw new Error('Unsupported input length.');
    for(const name of session.inputNames) {
      const values = name === 'section_mask' && !batch[name] ? new Array(length).fill(0) : batch[name];
      if(!Array.isArray(values)||values.length!==length) throw new Error('Invalid model input.');
      feeds[name]=new ort.Tensor('int64',BigInt64Array.from(values,BigInt),[1,length]);
    }
    let outputs;
    try {
      outputs=await session.run(feeds);
      if(mode==='section') return JSON.stringify(Array.from(outputs.section_logits.data));
      if(mode==='tag') {
        const data=outputs.tag_logits.data, width=manifest.tags.length, rows=[];
        for(let i=0;i<length;i++) rows.push(Array.from(data.subarray(i*width,(i+1)*width)));
        return JSON.stringify(rows);
      }
      return JSON.stringify([Array.from(outputs.action_logits.data),Array.from(outputs.relevance_logits.data)]);
    } finally { for(const tensor of Object.values(outputs||{})) tensor.dispose(); for(const tensor of Object.values(feeds)) tensor.dispose(); }
  };
  const adapter=py.pyimport('browser_model');
  adapter.configure(JSON.stringify(manifest),encode,infer);
  // Run a real forward pass before exposing Ready.
  const probe=JSON.parse(encode('Ready.',undefined,false)).windows[0];
  await infer(JSON.stringify(probe),'tag');
  runtime={adapter,manifest,tokenizer,session,py};
  status('ready',{model:manifest.name,modelId:manifest.id,backend:'WebAssembly',threads:ort.env.wasm.numThreads});
  return runtime;
}
self.onmessage = async ({data}) => {
  const {id,type}=data;
  try {
    if(type==='init') {
      initializing ||= initialize(data.pointer).catch(e=>{initializing=null;throw e;});
      await initializing;
      self.postMessage({id,type:'initialized',modelId:runtime.manifest.id});
    } else if(type==='protect') {
      if(!runtime || busy) throw new Error('The local model is not ready.');
      if(!validText(data.text) || typeof data.task !== 'string' || Array.from(data.task).length>4000) throw new Error('Use a shorter, readable message.');
      busy=true;
      const start=performance.now();
      const result=JSON.parse(await runtime.adapter.protect(data.text,data.task));
      self.postMessage({id,type:'result',result,elapsed:performance.now()-start});
    } else throw new Error('Unknown local operation.');
  } catch(error) {
    if(import.meta.env.DEV && type==='init') console.error('Local runtime initialization failed',error);
    // Never echo runtime/provider errors that could contain source text.
    self.postMessage({id,type:'error',message:type==='init' ? 'Could not load the local model. Check your connection, available memory, and browser settings, then retry.' : 'Filtering could not complete. Try a shorter message. Nothing was sent.'});
  } finally { if(type==='protect') busy=false; }
};
