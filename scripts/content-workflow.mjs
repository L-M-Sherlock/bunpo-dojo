import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateCards,fullSentences} from '../src/lib/content-validation.mjs';
const [command,input,output,actor]=process.argv.slice(2);
const hash=c=>crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
if(command==='freeze'){
  const cards=JSON.parse(fs.readFileSync(input,'utf8')),errors=validateCards(cards);
  const assignmentPath=input.replace('.draft.json','.assignment.json');
  if(fs.existsSync(assignmentPath)){const assignment=JSON.parse(fs.readFileSync(assignmentPath,'utf8'));if(JSON.stringify(assignment.map(r=>r.id).sort())!==JSON.stringify(cards.map(r=>r.id).sort()))errors.push('草稿与派发集合不一致');}
  if(errors.length)throw new Error(errors.join('\n'));
  if(fs.existsSync(output))throw new Error('交付已存在，不可覆盖');
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'cards.json'),JSON.stringify(cards,null,2)+'\n');
  if(!actor)throw new Error('必须记录实际作者句柄');
  const notes=input.replace('.draft.json','.notes.json');if(fs.existsSync(notes))fs.copyFileSync(notes,path.join(output,'notes.json'));
  if(fs.existsSync(assignmentPath))fs.copyFileSync(assignmentPath,path.join(output,'assignment.json'));
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify({author:actor,source:path.resolve(input),at:new Date().toISOString(),count:cards.length,cards:cards.map(c=>({id:c.id,hash:hash(c),fullSentences:fullSentences(c)}))},null,2)+'\n');
  console.log(JSON.stringify({packet:path.resolve(output),count:cards.length}));
}else if(command==='check-review'){
  const cards=JSON.parse(fs.readFileSync(path.join(input,'cards.json'),'utf8')),receipt=JSON.parse(fs.readFileSync(path.join(input,'receipt.json'),'utf8')),report=JSON.parse(fs.readFileSync(output,'utf8'));
  const ids=new Set();
  if(!report.reviewer||!Array.isArray(report.cards)||report.cards.length!==cards.length)throw new Error('报告负责人或范围错误');
  for(const c of cards){
    const row=report.cards.find(r=>r.id===c.id),r=receipt.cards.find(r=>r.id===c.id);
    if(!row||ids.has(row.id)||row.hash!==hash(c)||r?.hash!==hash(c)||JSON.stringify(row.fullSentences)!==JSON.stringify(fullSentences(c)))throw new Error(`报告内容绑定错误 ${c.id}`);ids.add(row.id);
    if(!['approved','revise','uncertain'].includes(row.status))throw new Error(`审核状态缺失 ${c.id}`);
    for(const k of ['reason','answerSet','readings','translation','options'])if(!row[k]||typeof row[k]!=='string')throw new Error(`审核维度缺失 ${c.id}/${k}`);
  }
  console.log(JSON.stringify({valid:true,count:cards.length,approved:report.cards.filter(r=>r.status==='approved').length,remaining:report.cards.filter(r=>r.status!=='approved').map(r=>({id:r.id,status:r.status,reason:r.reason}))}));
}else throw new Error('使用 freeze <draft> <new-delivery> 或 check-review <delivery> <report>');
