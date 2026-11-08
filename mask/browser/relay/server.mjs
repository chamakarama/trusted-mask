import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const SYSTEM='Privacy note: Labels such as [PERSON_1] represent redacted references. You may use these labels verbatim in your reply. Do not guess or invent the hidden values.\n\nReply in plain text without Markdown formatting.';
export function validate(body){
  return body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).sort().join(',')==='preview_id,system,user'&&
    typeof body.preview_id==='string'&&/^[a-f0-9-]{36}$/.test(body.preview_id)&&body.system===SYSTEM&&
    typeof body.user==='string'&&body.user.trim().length>0&&body.user.length<=16000;
}
export function createRelay({key=process.env.ANTHROPIC_API_KEY,model=process.env.MASK_MODEL,origin=process.env.MASK_ORIGIN,fetcher=fetch,now=Date.now}={}){
  const seen=new Map(),rates=new Map();let inflight=0;
  function allowedRate(id,limit,window){
    const time=now();let r=rates.get(id);
    if(!r||time-r.start>window){r={start:time,count:0};rates.set(id,r);}
    return ++r.count<=limit;
  }
  const clean=setInterval(()=>{
    const time=now();for(const [id,r]of seen)if(time-r.time>900000&&r.state!=='active')seen.delete(id);
    for(const [id,r]of rates)if(time-r.start>3600000)rates.delete(id);
  },60000);clean.unref();
  const server=http.createServer(async(req,res)=>{
    const sameOrigin=typeof origin==='string'&&req.headers.origin===origin;
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    if(sameOrigin)headers['Access-Control-Allow-Origin']=origin;
    function reply(code,value){res.writeHead(code,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(value));}
    if(req.url==='/health'&&req.method==='GET')return reply(200,{configured:!!(key&&model&&origin),provider:'anthropic'});
    if(!sameOrigin)return reply(403,{error:'Origin not allowed.'});
    if(req.method==='OPTIONS'){
      res.writeHead(204,{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, X-Mask-Request','Access-Control-Max-Age':'600'});return res.end();
    }
    if(req.method!=='POST'||req.url!=='/send')return reply(404,{error:'Not found.'});
    if(!key||!model)return reply(503,{error:'Provider not configured.'});
    if(req.headers['x-mask-request']!=='send'||!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required.'});
    if(inflight>=4||seen.size>=10000||rates.size>=10000)return reply(429,{error:'Busy. Retry shortly.'});
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim();
    if(!allowedRate('all-minute',30,60000)||!allowedRate('all-hour',300,3600000)||!allowedRate(`client:${ip}`,6,60000))return reply(429,{error:'Please wait before trying again.'});
    let body;
    try{
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>65536)return reply(413,{error:'Request too large.'});chunks.push(chunk);}
      body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch{return reply(400,{error:'Invalid request.'});}
    if(!validate(body))return reply(400,{error:'Invalid protected preview.'});
    const digest=createHash('sha256').update(body.system+'\0'+body.user).digest('hex');
    const previous=seen.get(body.preview_id);
    if(previous&&(previous.digest!==digest||previous.state!=='retry'))return reply(409,{error:'This preview has already been sent. Filter again to create a new preview.'});
    const record={state:'active',digest,time:now()};seen.set(body.preview_id,record);inflight++;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),85000);
    res.on('close',()=>controller.abort());
    function event(type,data){if(!res.destroyed)res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);}
    try{
      const upstream=await fetcher('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
        body:JSON.stringify({model,max_tokens:2048,system:SYSTEM,messages:[{role:'user',content:body.user}],stream:true}),signal:controller.signal,
      });
      if(!upstream.ok||!upstream.body){record.state='retry';return reply(502,{error:'Provider unavailable.'});}
      res.writeHead(200,{...headers,'Content-Type':'text/event-stream; charset=utf-8'});res.flushHeaders();
      const reader=upstream.body.getReader(),decoder=new TextDecoder();let buffer='',done=false,length=0,stopReason=null;
      try{
        while(!done){
          const chunk=await reader.read();buffer+=(chunk.done?decoder.decode():decoder.decode(chunk.value,{stream:true}));
          if(buffer.length>131072)throw new Error('Frame limit');
          let index;
          while((index=buffer.indexOf('\n\n'))>=0){
            const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);
            const payload=frame.split('\n').filter(x=>x.startsWith('data:')).map(x=>x.slice(5).trimStart()).join('\n');
            if(!payload)continue;const data=JSON.parse(payload);
            if(data.type==='content_block_delta'&&data.delta?.type==='text_delta'){
              const text=data.delta.text;if(typeof text!=='string')throw new Error('Bad delta');length+=text.length;if(length>64000)throw new Error('Output limit');event('delta',{text});
            }else if(data.type==='message_delta')stopReason=data.delta?.stop_reason||null;
            else if(data.type==='message_stop'){done=true;break;}
            else if(data.type==='error')throw new Error('Provider error');
          }
          if(chunk.done)break;
        }
        if(!done||!length)throw new Error('Incomplete reply');
        record.state='complete';event('done',{stop_reason:stopReason});res.end();
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }catch{
      record.state='retry';
      if(res.headersSent){event('error',{message:'The AI reply could not finish.'});res.end();}
      else if(!res.destroyed)reply(502,{error:'The AI reply could not finish.'});
    }finally{clearTimeout(timeout);controller.abort();inflight--;record.time=now();}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.on('close',()=>clearInterval(clean));
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createRelay().listen(Number(process.env.PORT||8080),'0.0.0.0');
