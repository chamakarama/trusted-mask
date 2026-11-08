export const REPLY_FORMAT = 'Reply in plain text without Markdown formatting.';
export function applyEdits(source, edits) {
  const chars=Array.from(source), chunks=[];
  let cursor=0;
  for(const edit of [...edits].sort((a,b)=>a.start-b.start||a.end-b.end)) {
    if(!Number.isInteger(edit.start)||!Number.isInteger(edit.end)||edit.start<cursor||edit.end<=edit.start||edit.end>chars.length||typeof edit.replacement!=='string'||edit.action==='KEEP') throw new Error('Invalid local edit boundaries.');
    chunks.push(chars.slice(cursor,edit.start).join(''),edit.replacement);cursor=edit.end;
  }
  chunks.push(chars.slice(cursor).join(''));
  return chunks.join('');
}
export function makePreview(source, task, result, revision) {
  if(!['ready','needs_review'].includes(result.status)||result.coverage?.complete!==true||
      result.coverage.scanned_characters!==Array.from(source).length||typeof result.protected_text!=='string'||
      typeof result.protected_task!=='string'||typeof result.receiving_ai_instruction!=='string'||
      !Array.isArray(result.edits)||applyEdits(source,result.edits)!==result.protected_text) throw new Error('No complete local preview. Nothing can be sent.');
  const taskReport=result.context_reports?.find(x=>x.component==='task');
  if(!taskReport||taskReport.coverage?.complete!==true||applyEdits(task,taskReport.edits)!==result.protected_task) throw new Error('The request context was not fully protected.');
  const aliases=new Map();
  for(const [text,edits] of [[source,result.edits],[task,taskReport.edits]]) {
    const chars=Array.from(text);
    for(const edit of edits) if(edit.label==='PERSON'&&edit.action==='ALIAS'&&/^\[PERSON_\d{1,6}\]$/.test(edit.replacement)) {
      const value=chars.slice(edit.start,edit.end).join('');
      const previous=aliases.get(edit.replacement);
      if(previous&&previous!==value) {
        // The section model links an unambiguous first/surname to its full name.
        // Accept only that explicit relationship, never two different full names.
        const linked=result.runtime_versions?.section_mode==='section-head-v1' &&
          (previous.split(/\s+/).includes(value)||value.split(/\s+/).includes(previous));
        if(!linked)throw new Error('Conflicting local aliases.');
        aliases.set(edit.replacement,previous.length>value.length?previous:value);
      } else aliases.set(edit.replacement,value);
    }
  }
  const system=[result.receiving_ai_instruction.trim(),REPLY_FORMAT].filter(Boolean).join('\n\n');
  const user=task===source?result.protected_text:`Task: ${result.protected_task.trim()}\n\n${result.protected_text}`;
  const request=Object.freeze({system,user});
  return Object.freeze({id:crypto.randomUUID(),revision,request,aliases,result});
}
export function restoredSegments(text, aliases) {
  const segments=[];let cursor=0;
  for(const match of text.matchAll(/\[PERSON_\d{1,6}\]/g)) {
    if(!aliases.has(match[0]))continue;
    if(match.index>cursor)segments.push({text:text.slice(cursor,match.index)});
    segments.push({text:aliases.get(match[0]),alias:match[0]});cursor=match.index+match[0].length;
  }
  if(cursor<text.length)segments.push({text:text.slice(cursor)});
  return segments;
}
export async function readSSE(body,onEvent,signal) {
  if(!body)throw new Error('Streaming is unavailable in this browser.');
  const reader=body.getReader(),decoder=new TextDecoder();let buffer='',finished=false;
  try {
    while(!finished) {
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const {value,done}=await reader.read();
      buffer=(buffer+(done?decoder.decode():decoder.decode(value,{stream:true}))).replace(/\r\n/g,'\n');
      let cut;
      while((cut=buffer.indexOf('\n\n'))>=0) {
        const frame=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
        let name='',lines=[];
        for(const line of frame.split('\n')) {
          if(line.startsWith('event:'))name=line.slice(6).trim();
          if(line.startsWith('data:'))lines.push(line.slice(5).trimStart());
        }
        if(!name)continue;
        const data=JSON.parse(lines.join('\n')||'{}');
        onEvent(name,data);
        if(name==='done'){finished=true;break;}
      }
      if(done)break;
    }
    if(!finished)throw new Error('The reply was interrupted.');
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
}
