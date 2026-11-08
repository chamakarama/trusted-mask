import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEdits,makePreview,restoredSegments,readSSE} from '../src/preview.js';
import {validText,validateManifest} from '../src/manifest.js';

test('Unicode edits use code points and reject overlaps',()=>{
  assert.equal(applyEdits('😀 Jane Smith',[{start:2,end:12,action:'ALIAS',replacement:'[PERSON_1]'}]),'😀 [PERSON_1]');
  assert.throws(()=>applyEdits('abcd',[{start:0,end:3,action:'DROP',replacement:''},{start:2,end:4,action:'DROP',replacement:''}]));
});
test('invalid Unicode is rejected before Rust conversion',()=>{
  assert.equal(validText('😀 valid'),true);assert.equal(validText('bad\ud800'),false);assert.equal(validText('bad\u0000'),false);
  assert.equal(validText('x'.repeat(4001)),false);
});
test('preview fails closed on incomplete coverage or mismatched output',()=>{
  assert.throws(()=>makePreview('name','task',{status:'needs_review',coverage:{complete:false}},1));
  assert.throws(()=>makePreview('name','task',{status:'needs_review',coverage:{complete:true,scanned_characters:4},edits:[],protected_text:'other',protected_task:'task',receiving_ai_instruction:'fixed'},1));
});
test('restoration uses only exact known aliases and never recursively substitutes',()=>{
  const map=new Map([['[PERSON_1]','[PERSON_2]'],['[PERSON_2]','<script>Jane</script>']]);
  assert.deepEqual(restoredSegments('Hi [PERSON_1], [PERSON_3] and [EMAIL]',map),[{text:'Hi '},{text:'[PERSON_2]',alias:'[PERSON_1]'},{text:', [PERSON_3] and [EMAIL]'}]);
});
test('SSE decodes split UTF-8 and requires a final done event',async()=>{
  const bytes=new TextEncoder().encode('event: delta\ndata: {"text":"😀 [PERSON_1]"}\n\nevent: done\ndata: {}\n\n');
  const stream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}});
  const events=[];await readSSE(stream,(name,data)=>events.push([name,data]));
  assert.equal(events[0][1].text,'😀 [PERSON_1]');assert.equal(events[1][0],'done');
  await assert.rejects(readSSE(new ReadableStream({start(c){c.close();}}),()=>{}));
});
test('unknown model contracts are refused',()=>{assert.throws(()=>validateManifest({schema:1}));});
test('SSE accepts CRLF boundaries split across network chunks',async()=>{
  const bytes=new TextEncoder().encode('event: delta\r\ndata: {"text":"ok"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n');
  const stream=new ReadableStream({start(c){for(const byte of bytes)c.enqueue(Uint8Array.of(byte));c.close();}});
  const events=[];await readSSE(stream,(name,data)=>events.push([name,data]));assert.equal(events.length,2);
});
