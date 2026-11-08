import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedAsset} from '../src/model-cache.js';
test('a corrupted cached model is removed and never passed to inference',async()=>{
  const bytes=new TextEncoder().encode('verified model');
  const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const previous={caches:globalThis.caches,fetch:globalThis.fetch};let deleted=false,requested=false;
  globalThis.caches={open:async()=>({match:async()=>new Response('modified model'),delete:async()=>{deleted=true;}})};
  globalThis.fetch=async()=>{requested=true;throw new Error('Should not fetch during cache verification');};
  try{await assert.rejects(checkedAsset('https://model.invalid/model.onnx',{bytes:bytes.length,sha256:sha}),/integrity/);assert.equal(deleted,true);assert.equal(requested,false);}
  finally{globalThis.caches=previous.caches;globalThis.fetch=previous.fetch;}
});
test('verified model can run when browser cache is unavailable',async()=>{
  const bytes=Uint8Array.of(1,2,3);const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const previous={caches:globalThis.caches,fetch:globalThis.fetch};
  globalThis.caches={open:async()=>{throw new Error('Storage disabled');}};globalThis.fetch=async()=>new Response(bytes);
  try{assert.deepEqual(await checkedAsset('https://model.invalid/model.onnx',{bytes:3,sha256:sha}),bytes);}
  finally{globalThis.caches=previous.caches;globalThis.fetch=previous.fetch;}
});
