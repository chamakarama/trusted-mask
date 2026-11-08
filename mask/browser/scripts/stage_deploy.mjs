// Make an allowlisted static deployment. Never copy the checkout or .env files.
import {cp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'out/netlify');
await rm(destination,{recursive:true,force:true});await mkdir(destination,{recursive:true});
await cp(path.join(root,'dist'),destination,{recursive:true,filter:file=>!['models','qa','qa.html'].includes(path.basename(file))});
await mkdir(path.join(destination,'models'),{recursive:true});
const config=JSON.parse(await readFile(path.join(root,'public/app-config.json'),'utf8'));
config.modelPointer='/models/current.json';
config.relayURL=process.env.MASK_RELAY_URL||null;
const modelBase=process.env.MASK_MODEL_BASE_URL;
if(!modelBase?.startsWith('https://'))throw new Error('Set MASK_MODEL_BASE_URL to the public model bucket HTTPS URL.');
if(config.relayURL&&!config.relayURL.startsWith('https://'))throw new Error('Relay requires HTTPS.');
for(const key of ['mask1','mask2','maskmini']) {
  const pointer=JSON.parse(await readFile(path.join(root,`public/models/${key}.json`),'utf8'));
  const local=JSON.parse(await readFile(path.join(root,'public/models',pointer.manifest),'utf8'));
  const validation=JSON.parse(await readFile(path.join(root,`.cache/validation/${key}/report.json`),'utf8'));
  if(validation.model!==local.id)throw new Error(`Unvalidated ${key}`);
  let review;
  if(validation.final_result_differences!==0) {
    review=JSON.parse(await readFile(path.join(root,`evidence/precision-review-${key}.json`),'utf8'));
    const differences=await readFile(path.join(root,`.cache/validation/${key}/quantization-differences.json`));
    if(review.model!==local.id||review.source_commit!==local.source_commit||review.cases!==validation.cases||
       review.difference_sha256!==createHash('sha256').update(differences).digest('hex')||
       review.final_result_differences!==validation.final_result_differences||
       validation.protected_output_differences!==0||validation.applied_edit_differences!==0||validation.section_decision_differences!==0)
      throw new Error(`Unreviewed conversion difference in ${key}`);
  }
  const browser=JSON.parse(await readFile(path.join(root,`evidence/browser-${key}.json`),'utf8'));
  if(browser.model_id!==local.id||browser.mismatch_count!==0||browser.completed!==validation.cases)throw new Error(`Browser validation missing for ${key}`);
  if(review && (browser.comparison_target!=='converted-python'||browser.reference_output_mismatches?.length!==0||
      JSON.stringify(browser.reference_metadata_mismatches)!==JSON.stringify(review.browser_reference_metadata)))
    throw new Error(`Unreviewed browser difference in ${key}`);
  const manifest=new URL(`${local.id}/manifest.json`,modelBase.replace(/\/?$/,'/')).href;
  await writeFile(path.join(destination,`models/${key}.json`),JSON.stringify({manifest},null,2)+'\n');
  if(key===config.defaultModel)await writeFile(path.join(destination,'models/current.json'),JSON.stringify({manifest},null,2)+'\n');
}
await writeFile(path.join(destination,'app-config.json'),JSON.stringify(config,null,2)+'\n');
const env=await readFile(path.join(root,'.env.local'),'utf8').catch(()=> '');
const secret=env.split('\n').find(x=>x.startsWith('ANTHROPIC_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g,'');
async function audit(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.name.startsWith('.env'))throw new Error('Environment file in static output.');
    if(entry.isDirectory())await audit(file);
    else if(secret&&(await readFile(file)).includes(Buffer.from(secret)))throw new Error('Credential detected in deployment.');
  }
}
await audit(destination);
console.log('Deployment staged; no environment files or API key in static output.');
