import fs from 'node:fs/promises';
import {Workbook, SpreadsheetFile} from '@oai/artifact-tool';
const base='mask/ml/privacy_v1/annotation/shards/baa368e830134852980cfb6c170455c2';
const out=base+'/adapter-fixtures';
const records=(await fs.readFile(base+'/train-checkpoint-accepted.jsonl','utf8')).trim().split('\n').map(JSON.parse);
const selected=[]; const seen=new Set();
for(const r of records){if(!seen.has(r.source_id)){seen.add(r.source_id);selected.push(r)} if(selected.length===15)break;}
if(selected.length!==15)throw Error('Not enough independent sources');
const esc=x=>'"'+String(x??'').replaceAll('"','""')+'"';
const manifests=[];
for(let i=0;i<15;i++){
 const r=selected[i], format=i<10?'csv':'xlsx', name=`fixture-${String(i+1).padStart(2,'0')}.${format}`;
 const rows=[['kind','message','note','blank'],['primary',r.text,'café, north',''],['repeat',r.text,'ordinary', '']];
 if(format==='csv') await fs.writeFile(out+'/'+name,rows.map(row=>row.map(esc).join(',')).join('\r\n')+'\r\n',{flag:'wx'});
 else {const wb=Workbook.create();const sh=wb.worksheets.add('Data');sh.getRange('A1:D3').values=rows;wb.recalculate();const f=await SpreadsheetFile.exportXlsx(wb);await f.save(out+'/'+name);}
 manifests.push({file:name,split:'train',source_record_id:r.id,source_review_sha256:r.review.record_sha256,intended_use:r.task,expected_cells:{B2:r.approved_output,B3:r.approved_output},unchanged_cells:{A2:'primary',C2:'café, north',D2:'',A3:'repeat',C3:'ordinary',D3:''},note:'Repeated full source checks repeated private references; expected text is inherited from the accepted message record. Alias consistency across cells requires adapter-specific verification.'});
}
await fs.writeFile(out+'/manifest.json',JSON.stringify({purpose:'Training-derived adapter fixtures; not independent evaluation data and not message records.',fixtures:manifests},null,2)+'\n',{flag:'wx'});
console.log('Wrote',manifests.length,'fixtures');
