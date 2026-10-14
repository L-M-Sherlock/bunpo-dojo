import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fullSentences,validateCards} from '../src/lib/content-validation.mjs';
const [delivery,reportPath]=process.argv.slice(2);
const cards=JSON.parse(fs.readFileSync(path.join(delivery,'cards.json'),'utf8')),receipt=JSON.parse(fs.readFileSync(path.join(delivery,'receipt.json'),'utf8')),report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
const hash=c=>crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
const issues=validateCards(cards);if(issues.length)throw new Error(issues.join('\n'));
if(report.reviewer===receipt.author||!report.reviewer||report.cards.length!==cards.length)throw new Error('作者审核者或报告范围错误');
const index=JSON.parse(fs.readFileSync('content/approved-index.json','utf8'));
for(const c of cards){
  const row=report.cards.find(r=>r.id===c.id),proof=receipt.cards.find(r=>r.id===c.id);
  if(row?.hash!==hash(c)||proof?.hash!==hash(c)||JSON.stringify(row.fullSentences)!==JSON.stringify(fullSentences(c)))throw new Error(`凭据错误 ${c.id}`);
  for(const k of ['reason','answerSet','readings','translation','options'])if(typeof row[k]!=='string'||!row[k].trim())throw new Error(`缺少实质审核 ${c.id}/${k}`);
  if(row.status==='approved')index[c.id]={hash:hash(c),delivery,report:reportPath,author:receipt.author,reviewer:report.reviewer};
}
fs.writeFileSync('content/approved-index.json',JSON.stringify(index,null,2)+'\n');
const merged=Object.entries(index).map(([id,proof])=>JSON.parse(fs.readFileSync(path.join(proof.delivery,'cards.json'),'utf8')).find(c=>c.id===id)).sort((a,b)=>a.id.localeCompare(b.id));
fs.writeFileSync('src/data/cards.json',JSON.stringify(merged,null,2)+'\n');
console.log(JSON.stringify({accepted:report.cards.filter(r=>r.status==='approved').length,active:merged.length}));
