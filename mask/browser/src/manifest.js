import runtimeSource from '../runtime-source.json' with {type:'json'};
export const LABELS = ['PERSON','EMAIL','PHONE','ADDRESS','USERNAME','ACCOUNT_ID','NATIONAL_ID','PAYMENT_CARD','IBAN','SECRET','DATE','AGE','LOCATION','ORG','HEALTH','FINANCIAL','EMPLOYMENT','FAMILY'];
export const ACTIONS = ['KEEP','DROP','ALIAS','ROLE','GENERALISE','PLACEHOLDER'];
export const RELEVANCE = ['essential','unnecessary','uncertain'];
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function validateManifest(m) {
  if (!m || m.schema !== 2 || typeof m.id !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(m.id) ||
      m.pipeline !== 'privacy-edit-pipeline.2' || m.policy !== 'consumer-v1-pilot.2' ||
      m.max_tokens !== 512 || m.stride !== 64 || m.tokenizers_version !== '0.22.2' || m.onnxruntime_version !== '1.24.3' ||
      !equal(m.labels,LABELS) || !equal(m.actions,ACTIONS) || !equal(m.relevance,RELEVANCE) ||
      !equal(m.tags,['O',...LABELS.flatMap(x=>[`B-${x}`,`I-${x}`])]) ||
      !equal(m.outputs,['tag_logits','action_logits','relevance_logits',...(m.runtime?.section_mode === 'section-head-v1' ? ['section_logits'] : [])]) ||
      !Array.isArray(m.inputs) || !m.inputs.includes('input_ids') || !m.inputs.includes('attention_mask') ||
      m.inputs.some(x=>!['input_ids','attention_mask','token_type_ids','section_mask'].includes(x)) ||
      !Number.isInteger(m.pad_id) || !Array.isArray(m.marker_ids) || m.marker_ids.length !== 2 || m.marker_ids[0] === m.marker_ids[1]) {
    throw new Error('This model is not compatible with this version of Mask.');
  }
  if(m.source_commit !== runtimeSource.commit) throw new Error('Model and filtering sources do not match.');
  if(m.runtime?.section_mode === 'section-head-v1') {
    if(m.runtime.architecture_version !== 'section-relevance-v1' || !equal(m.runtime.section_labels,RELEVANCE) ||
       m.runtime.section_threshold !== 0.9 || !m.inputs.includes('section_mask') ||
       !Array.isArray(m.section_marker_ids) || m.section_marker_ids.length !== 2 ||
       new Set([...m.marker_ids,...m.section_marker_ids]).size !== 4 ||
       m.section_marker_ids.some(x=>!Number.isInteger(x)||x<0)) throw new Error('Invalid section model contract.');
  } else if(Object.keys(m.runtime||{}).length || m.inputs.includes('section_mask') || m.section_marker_ids) throw new Error('Unknown model architecture.');
  for (const name of ['model.onnx','tokenizer.json']) {
    const a = m.assets?.[name];
    if (!a || a.path !== name || !Number.isSafeInteger(a.bytes) || a.bytes < 1 || a.bytes > 1_900_000_000 || !/^[a-f0-9]{64}$/.test(a.sha256)) {
      throw new Error('The model manifest has invalid asset metadata.');
    }
  }
  return m;
}
export function validText(text) {
  return typeof text === 'string' && text.trim().length > 0 && Array.from(text).length <= 4000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text) &&
    !/[\uD800-\uDFFF]/u.test(text);
}
