const status=document.getElementById('status'),results=document.getElementById('results');
document.getElementById('run').addEventListener('click',async()=>{
  document.getElementById('run').disabled=true;
  const worker=new Worker(new URL('./pipeline.worker.js',import.meta.url),{type:'module'});
  const requests=new Map();let id=0;
  worker.onmessage=({data})=>{
    if(data.type==='status')status.textContent=JSON.stringify(data);
    else if(requests.has(data.id)){
      const [resolve,reject]=requests.get(data.id);requests.delete(data.id);
      if(data.type==='error')reject(new Error(data.message));else resolve(data);
    }
  };
  worker.onerror=()=>status.textContent='Worker failed';
  const call=(type,data={})=>new Promise((resolve,reject)=>{requests.set(++id,[resolve,reject]);worker.postMessage({id,type,...data});});
  try{
    const key=document.getElementById('qa-model').value;
    const config=await(await fetch('/app-config.json')).json();
    const initialized=await call('init',{pointer:config.models[key]});
    const cases=await(await fetch(`/qa/${key}/cases.json`)).json();
    const mismatches=[],referenceOutputs=[],referenceMetadata=[];let total=0;
    const keys=['status','protected_text','protected_task','review_reasons','retained_sensitive','pending_reviews','coverage'];
    for(const [i,c] of cases.entries()){
      const response=await call('protect',{text:c.text,task:c.task});total+=response.elapsed;
      const different=keys.filter(key=>JSON.stringify(response.result[key])!==JSON.stringify(c.expected[key]));
      if(['protected_text','protected_task'].some(key=>response.result[key]!==c.reference[key]))referenceOutputs.push(c.id);
      const metadata=keys.filter(key=>!['protected_text','protected_task'].includes(key)&&JSON.stringify(response.result[key])!==JSON.stringify(c.reference[key]));
      if(metadata.length)referenceMetadata.push({id:c.id,fields:metadata});
      if(different.length)mismatches.push({id:c.id,keys:different,result:response.result,reference:c.reference});
      status.textContent=`Completed ${i+1}/${cases.length}`;
      results.textContent=JSON.stringify({model:key,model_id:initialized.modelId,comparison_target:'converted-python',completed:i+1,mismatch_count:mismatches.length,mismatches,reference_output_mismatches:referenceOutputs,reference_metadata_mismatches:referenceMetadata,elapsed_ms:total},null,2);
    }
    status.textContent=mismatches.length?'FAILED':'PASSED';
  }catch(e){status.textContent=`FAILED: ${e.message}`;}finally{worker.terminate();document.getElementById('run').disabled=false;}
});
