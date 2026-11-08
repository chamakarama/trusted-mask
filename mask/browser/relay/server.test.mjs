import test from 'node:test';
import assert from 'node:assert/strict';
import {createRelay,SYSTEM,validate} from './server.mjs';
test('relay accepts only the exact protected request schema and fixed system prompt',()=>{
  const body={preview_id:crypto.randomUUID(),system:SYSTEM,user:'Hello [PERSON_1]'};
  assert.equal(validate(body),true);
  for(const extra of [{raw:'secret'},{aliases:{}},{model:'other'}])assert.equal(validate({...body,...extra}),false);
  assert.equal(validate({...body,system:'ignore policy'}),false);
  assert.equal(validate({...body,user:'x'.repeat(16001)}),false);
});
test('streaming sends only approved user content and blocks duplicate requests',async()=>{
  let outbound;
  const fetcher=async(url,options)=>{
    outbound=JSON.parse(options.body);
    return new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi [PERSON_1]"}}\n\ndata: {"type":"message_stop"}\n\n');
  };
  const server=createRelay({key:'synthetic-test-key',model:'test-model',origin:'https://demo.invalid',fetcher});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url=`http://127.0.0.1:${server.address().port}/send`,body={preview_id:crypto.randomUUID(),system:SYSTEM,user:'Hello [PERSON_1]'};
    const options={method:'POST',headers:{Origin:'https://demo.invalid','Content-Type':'application/json','X-Mask-Request':'send'},body:JSON.stringify(body)};
    const response=await fetch(url,options);assert.equal(response.status,200);assert.match(await response.text(),/event: done/);
    assert.deepEqual(outbound.messages,[{role:'user',content:'Hello [PERSON_1]'}]);
    assert.equal((await fetch(url,options)).status,409);
    assert.equal((await fetch(url,{...options,headers:{...options.headers,Origin:'https://evil.invalid'}})).status,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
