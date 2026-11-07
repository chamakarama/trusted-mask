import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../static/app.js',import.meta.url),'utf8');
const examples=JSON.parse(readFileSync(new URL('../../../demo/web-examples.json',import.meta.url),'utf8')).examples;
const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
const result={preview_id:'approved-preview',status:'needs_review',coverage:{complete:true},protected_text:'Hello [PERSON_1]'};
function setup(preview=async()=>({ok:true,json:async()=>result}),motion=false,provider=null){
  const dom=new JSDOM(html,{url:'http://127.0.0.1:8788',runScripts:'outside-only'}), w=dom.window, calls=[];
  w.matchMedia=()=>({matches:!motion});w.TextDecoder=TextDecoder;w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.HTMLElement.prototype.scrollIntoView=function(){this.dataset.scrolled='true';};
  w.fetch=async(path,options)=>{calls.push({path,options}); return path==='/api/preview'?preview():path==='/api/send'&&provider?provider():{ok:true,json:async()=>({})};};
  w.eval(script); const $=id=>w.document.getElementById(id);
  const type=value=>{$('message').value=value;$('message').dispatchEvent(new w.Event('input'));};
  return {w,$,type,calls,close:()=>w.close()};
}
test('exactly one visible box and two controls; no auto filtering or provider calls',async()=>{
 const ui=setup();try{
 assert.equal(ui.$('send').hidden,true);assert.equal(ui.$('reply-section').hidden,true);
 assert.equal(ui.w.document.querySelectorAll('h1,h2,header,footer,input').length,0);
 assert.equal(ui.$('output').hidden,true);ui.type('Hello Emma');await flush();
 assert.equal(ui.calls.filter(x=>x.path==='/api/preview').length,0);
 ui.$('filter').click();await flush();assert.equal(ui.$('message').hidden,true);
 assert.equal(ui.$('output').textContent,result.protected_text);
 assert.equal(ui.calls.some(x=>x.path==='/api/send'),false);
 }finally{ui.close();}
});
test('example link alternates the two supplied complete messages',()=>{
 const ui=setup();try{
 ui.$('example').click();assert.equal(ui.$('message').value,examples[0].text.trimEnd().replace('below?\n\nPATIENT','below?\nPATIENT'));
 ui.$('example').click();assert.equal(ui.$('message').value,examples[1].text.trimEnd());
 ui.$('example').click();assert.match(ui.$('message').value,/Name: Alex Bennett/);
 assert.equal(ui.calls.filter(x=>x.path==='/api/preview').length,0);
 }finally{ui.close();}
});
test('full message is scanned; opening request supplies context',async()=>{
 const ui=setup();try{ui.$('example').click();ui.$('filter').click();await flush();
 const body=JSON.parse(ui.calls.find(x=>x.path==='/api/preview').options.body);
 assert.match(body.text,/wrist pain/);assert.equal(body.task,examples[0].intended_use);
 }finally{ui.close();}
});
test('example change discards obsolete inference',async()=>{
 let resolve;const ui=setup(()=>new Promise(done=>resolve=done));try{
 ui.type('First');ui.$('filter').click();ui.$('example').click();
 resolve({ok:true,json:async()=>result});await flush();
 assert.equal(ui.$('output').hidden,true);assert.match(ui.$('message').value,/Alex Bennett/);
 }finally{ui.close();}
});
test('failed coverage preserves source and exposes retry only in the existing button',async()=>{
 const ui=setup(async()=>({ok:true,json:async()=>({...result,coverage:{complete:false}})}));try{
 ui.type('Original');ui.$('filter').click();await flush();assert.equal(ui.$('message').value,'Original');
 assert.match(ui.$('filter').textContent,/try again/);assert.equal(ui.$('output').hidden,true);
 }finally{ui.close();}
});
test('real edit ranges animate safely, including Unicode and DROP, without HTML execution',async()=>{
 const data={...result,protected_text:'😀 [PERSON_1].',protected_view:{message:[{text:'😀 '},{text:'[PERSON_1]',start:2,end:6,action:'ALIAS'},{text:'.'},{text:'',start:7,end:14,action:'DROP'}]}};
 const ui=setup(async()=>({ok:true,json:async()=>data}),true);try{
 ui.type('😀 Emma. <img>');ui.$('filter').click();await flush();
 assert.ok(ui.$('output').querySelector('.dust'));assert.equal(ui.$('output').querySelector('img'),null);
 await new Promise(resolve=>setTimeout(resolve,850));assert.equal(ui.$('output').textContent,data.protected_text);
 assert.equal(ui.$('message').value,data.protected_text);assert.equal(ui.$('output').querySelector('.dust'),null);
 }finally{ui.close();}
});

function stream(events){
 const bytes=new TextEncoder().encode(events.map(([name,data])=>`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(''));
 return {ok:true,body:new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}})};
}
test('send creates a lower reply, scrolls into view, and restores only on button click',async()=>{
 const events=[['delta',{raw:'Hi [PER',segments:[{text:'Hi '}]}],['delta',{raw:'SON_1] — hello',segments:[{text:'Emma',alias:'[PERSON_1]'},{text:' — hello'}]}],['done',{}]];
 const ui=setup(undefined,false,()=>stream(events));try{
 ui.type('Hello Emma');ui.$('filter').click();await flush();assert.equal(ui.$('send').hidden,false);
 ui.$('send').click();await flush();assert.equal(ui.$('reply-section').hidden,false);
 assert.equal(ui.$('reply-section').dataset.scrolled,'true');assert.equal(ui.$('reply').textContent,'Hi [PERSON_1] — hello');
 assert.deepEqual(JSON.parse(ui.calls.find(c=>c.path==='/api/send').options.body),{preview_id:'approved-preview'});
 ui.$('revert').click();assert.equal(ui.$('reply').textContent,'Hi Emma — hello');
 assert.equal(ui.calls.filter(c=>c.path==='/api/send').length,1);assert.equal(ui.$('revert').disabled,true);
 }finally{ui.close();}
});
test('editing or selecting another example cancels obsolete sends and clears the reply',async()=>{
 let resolve;const ui=setup(undefined,false,()=>new Promise(done=>resolve=done));try{
 ui.type('Hello Emma');ui.$('filter').click();await flush();ui.$('send').click();await flush();
 ui.$('example').click();assert.equal(ui.calls.find(c=>c.path==='/api/send').options.signal.aborted,true);
 resolve(stream([['delta',{raw:'OBSOLETE'}],['done',{}]]));await flush();
 assert.equal(ui.$('reply-section').hidden,true);assert.equal(ui.$('reply').textContent,'');
 }finally{ui.close();}
});
test('provider errors permit retry and never enable name restoration',async()=>{
 const ui=setup(undefined,false,()=>stream([['error',{message:'Service unavailable. Try sending again.'}]]));try{
 ui.type('Hello Emma');ui.$('filter').click();await flush();ui.$('send').click();await flush();
 assert.match(ui.$('reply').textContent,/Service unavailable/);assert.equal(ui.$('revert').disabled,true);assert.equal(ui.$('send').disabled,false);
 }finally{ui.close();}
});
test('HTML in replies and local restored values is inert',async()=>{
 const ui=setup(undefined,false,()=>stream([['delta',{raw:'[PERSON_1]<img>',segments:[{text:'<script>name</script>',alias:'[PERSON_1]'},{text:'<img>'}]}],['done',{}]]));try{
 ui.type('Hello');ui.$('filter').click();await flush();ui.$('send').click();await flush();ui.$('revert').click();
 assert.equal(ui.$('reply').querySelector('script,img'),null);assert.match(ui.$('reply').textContent,/<script>/);
 }finally{ui.close();}
});

test('multi-word placeholders stay highlighted after animation, streaming and name restoration',async()=>{
 const text='[PERSON_1] [ACCOUNT_ID_1] [ACCOUNT_ID] [EMAIL]';
 const data={...result,protected_text:text,protected_view:{message:[{text,start:0,end:4,action:'ALIAS'}]}};
 const events=[['delta',{raw:'[PERSON_1] [ACCOUNT_',segments:[{text:'Emma',alias:'[PERSON_1]'},{text:' [ACCOUNT_'}]}],['delta',{raw:'ID_1] [ACCOUNT_ID] [EMAIL]',segments:[{text:'ID_1] [ACCOUNT_ID] [EMAIL]'}]}],['done',{}]];
 const ui=setup(async()=>({ok:true,json:async()=>data}),true,()=>stream(events));try{
 ui.type('Emma');ui.$('filter').click();await new Promise(resolve=>setTimeout(resolve,900));
 const tokens=id=>Array.from(ui.$(id).querySelectorAll('.token'),el=>el.textContent);
 assert.deepEqual(tokens('output'),['[PERSON_1]','[ACCOUNT_ID_1]','[ACCOUNT_ID]','[EMAIL]']);
 ui.$('send').click();await flush();assert.deepEqual(tokens('reply'),tokens('output'));
 ui.$('revert').click();await new Promise(resolve=>setTimeout(resolve,600));
 assert.deepEqual(tokens('reply'),['[ACCOUNT_ID_1]','[ACCOUNT_ID]','[EMAIL]']);
 assert.equal(ui.$('reply').textContent,'Emma [ACCOUNT_ID_1] [ACCOUNT_ID] [EMAIL]');
 }finally{ui.close();}
});
