import test from 'node:test';
import assert from 'node:assert/strict';
import {validateManifest,LABELS,ACTIONS,RELEVANCE} from '../src/manifest.js';
import {makePreview} from '../src/preview.js';
function manifest(section=false){return {
  schema:2,id:'test',pipeline:'privacy-edit-pipeline.2',policy:'consumer-v1-pilot.2',
  source_commit:'0b3854dfb65eaffca6714595ae6daf961d3f421e',max_tokens:512,stride:64,
  tokenizers_version:'0.22.2',onnxruntime_version:'1.24.3',labels:LABELS,actions:ACTIONS,relevance:RELEVANCE,
  tags:['O',...LABELS.flatMap(x=>[`B-${x}`,`I-${x}`])],
  inputs:['input_ids','attention_mask',...(section?['section_mask']:[])],
  outputs:['tag_logits','action_logits','relevance_logits',...(section?['section_logits']:[])],
  pad_id:0,marker_ids:[1,2],section_marker_ids:section?[3,4]:null,
  runtime:section?{section_mode:'section-head-v1',architecture_version:'section-relevance-v1',section_labels:RELEVANCE,section_threshold:.9}:{},
  assets:Object.fromEntries(['model.onnx','tokenizer.json'].map(path=>[path,{path,bytes:100,sha256:'0'.repeat(64)}]))
};}
test('legacy and section models require their exact head contracts',()=>{
  assert.ok(validateManifest(manifest()));assert.ok(validateManifest(manifest(true)));
  const missing=manifest(true);missing.inputs.pop();assert.throws(()=>validateManifest(missing));
  const stale=manifest();stale.source_commit='0'.repeat(40);assert.throws(()=>validateManifest(stale));
  const threshold=manifest(true);threshold.runtime.section_threshold=.1;assert.throws(()=>validateManifest(threshold));
});
test('section name links restore the full name without accepting conflicting full names',()=>{
  const text='Jane Smith. Jane.',task='Greet person';
  const result={status:'needs_review',coverage:{complete:true,scanned_characters:text.length},
    protected_text:'[PERSON_1]. [PERSON_1].',protected_task:task,receiving_ai_instruction:'fixed',
    edits:[{start:0,end:10,label:'PERSON',action:'ALIAS',replacement:'[PERSON_1]'},
      {start:12,end:16,label:'PERSON',action:'ALIAS',replacement:'[PERSON_1]'}],
    context_reports:[{component:'task',coverage:{complete:true},edits:[]}],runtime_versions:{section_mode:'section-head-v1'}};
  assert.equal(makePreview(text,task,result,1).aliases.get('[PERSON_1]'),'Jane Smith');
  result.runtime_versions.section_mode='legacy';assert.throws(()=>makePreview(text,task,result,1));
  result.runtime_versions.section_mode='section-head-v1';
  result.edits[1].end=22;result.coverage.scanned_characters=23;
  assert.throws(()=>makePreview('Jane Smith. Jane Jones.',task,result,1));
});
