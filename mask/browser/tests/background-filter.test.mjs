import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {validText} from '../src/manifest.js';
import {makePreview, restoredSegments, readSSE} from '../src/preview.js';

const {JSDOM}=createRequire(new URL('../../package.json',import.meta.url))('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function page(t){
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://mask.test/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,workers=[],requests=[];
  w.matchMedia=()=>({matches:true});
  w.validText=validText;w.makePreview=makePreview;w.restoredSegments=restoredSegments;w.readSSE=readSSE;w.CACHE_NAME='test';
  w.Worker=class{
    constructor(){this.messages=[];workers.push(this);}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    emit(data){this.onmessage({data});}
  };
  w.fetch=async url=>{
    requests.push(url);
    return {ok:true,json:async()=>url==='/examples.json'?[{text:'Summarise\nFictional note'}]:{
      modelPointer:'/models/mask2.json',models:{mask1:'/models/mask1.json',mask2:'/models/mask2.json',maskmini:'/models/maskmini.json'},defaultModel:'mask2',relayURL:'https://relay.test/send'
    }};
  };
  const source=(await readFile(new URL('../src/app.js',import.meta.url),'utf8'))
    .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../src/app.js',import.meta.url).href));
  await new vm.Script(`(async()=>{${source}\n})()`).runInContext(dom.getInternalVMContext());
  const $=id=>w.document.getElementById(id);
  const ready=worker=>worker.emit({type:'status',phase:'ready',modelId:'synthetic-test'});
  ready(workers[0]);
  const finish=(worker,run)=>worker.emit({type:'result',id:run.id,elapsed:5,result:{
    status:'ready',coverage:{complete:true,scanned_characters:Array.from(run.text).length},
    edits:[],protected_text:run.text,protected_task:run.task,receiving_ai_instruction:'Use redacted references.',
    context_reports:[{component:'task',coverage:{complete:true},edits:[]}]
  }});
  return {w,$,workers,requests,ready,finish};
}

test('background result stays local and hidden until Filter is clicked',async t=>{
  const p=await page(t);p.$('example').click();await tick();
  const worker=p.workers[0],run=worker.messages.find(x=>x.type==='protect');assert.ok(run);
  p.finish(worker,run);assert.equal(p.$('output').hidden,true);assert.equal(p.$('send').hidden,true);
  p.$('filter').click();assert.equal(p.$('output').textContent,run.text);assert.equal(p.$('send').hidden,false);
  assert.deepEqual(p.requests,['/app-config.json','/examples.json']);
});

test('editing while filtering cannot reveal the stale message',async t=>{
  const p=await page(t);p.$('message').value='Summarise\nOld note';p.$('message').dispatchEvent(new p.w.Event('input'));p.$('filter').click();
  const worker=p.workers[0],old=worker.messages.find(x=>x.type==='protect');
  p.$('message').value='Summarise\nNew note';p.$('message').dispatchEvent(new p.w.Event('input'));p.$('filter').click();
  p.finish(worker,old);assert.equal(p.$('output').hidden,true);
  const fresh=worker.messages.filter(x=>x.type==='protect').at(-1);assert.notEqual(fresh.id,old.id);
  p.finish(worker,fresh);assert.equal(p.$('output').textContent,'Summarise\nNew note');
});

test('Clear session discards an in-flight result instead of recaching it',async t=>{
  const p=await page(t);p.$('example').click();await tick();
  const worker=p.workers[0],old=worker.messages.find(x=>x.type==='protect');
  p.$('clear').click();p.finish(worker,old);
  assert.equal(p.$('message').value,'');assert.equal(p.$('output').hidden,true);assert.equal(p.$('send').hidden,true);
  p.$('example').click();await tick();
  assert.equal(worker.messages.filter(x=>x.type==='protect').length,2);
});

test('switching models ignores the previous worker result',async t=>{
  const p=await page(t);p.$('example').click();await tick();
  const old=p.workers[0],run=old.messages.find(x=>x.type==='protect');
  p.$('model-select').value='maskmini';p.$('model-select').dispatchEvent(new p.w.Event('change'));
  assert.equal(old.terminated,true);p.finish(old,run);assert.equal(p.$('output').hidden,true);
  const current=p.workers[1];p.ready(current);p.$('filter').click();
  const fresh=current.messages.find(x=>x.type==='protect');p.finish(current,fresh);
  assert.equal(p.$('output').textContent,fresh.text);
});
