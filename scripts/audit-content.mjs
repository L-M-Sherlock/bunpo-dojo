import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateCards,fullSentences,readingAnchorIssues} from '../src/lib/content-validation.mjs';
import {REQUIREMENTS,SKILLS,TRACKED_SKILLS,PAIR_GROUPS,PAIR_FREQUENCY_BY_SKILL,COURSES} from '../src/lib/catalog.mjs';
const partial=process.argv.includes('--partial');
const baseline=JSON.parse(fs.readFileSync('content/baseline.json','utf8'));
for(const [file,key]of [['content/scope.json','scopeSha256'],['content/requirements.json','requirementsSha256']])if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==baseline[key])throw new Error(`冻结范围发生变化 ${file}`);
const cards=JSON.parse(fs.readFileSync('src/data/cards.json','utf8')),index=JSON.parse(fs.readFileSync('content/approved-index.json','utf8'));
const errors=validateCards(cards,{complete:!partial});
errors.push(...readingAnchorIssues(cards));
const reference=JSON.parse(fs.readFileSync('content/references/haya-pairs.json','utf8'));
const frequencyBytes=fs.readFileSync('content/references/pair-frequency.json'),frequency=JSON.parse(frequencyBytes),frequencyOrder=JSON.parse(fs.readFileSync('content/references/pair-frequency-order.json','utf8')),frequencyIds=frequency.orderedSkillIds;
if(frequency.coverage?.pairs!==172||frequency.coverage?.lexemes!==344||frequency.coverage?.jpdbExact!==344||frequency.coverage?.jitenExact!==344||frequencyIds.length!==172||new Set(frequencyIds).size!==172)errors.push('词频排序范围不完整');
if(frequencyOrder.sourceSha256!==crypto.createHash('sha256').update(frequencyBytes).digest('hex')||JSON.stringify(frequencyOrder.orderedSkillIds)!==JSON.stringify(frequencyIds))errors.push('运行时词频顺序与审核快照不一致');
for(const [index,id]of frequencyIds.entries())if(!PAIR_FREQUENCY_BY_SKILL.has(id)||PAIR_FREQUENCY_BY_SKILL.get(id).overallOrder!==index+1)errors.push(`词频排序位置不一致 ${id}`);
for(const group of PAIR_GROUPS)for(let index=1;index<group.skillIds.length;index++)if(PAIR_FREQUENCY_BY_SKILL.get(group.skillIds[index-1]).overallOrder>PAIR_FREQUENCY_BY_SKILL.get(group.skillIds[index]).overallOrder)errors.push(`类别内词频顺序错误 ${group.id}`);
for(const [file,expected]of Object.entries(baseline.referencesSha256??{}))if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)errors.push(`参考范围发生变化 ${file}`);
const sourceCoverage=reference.mapping.map(row=>{
  const skill=SKILLS.find(s=>s.id===row.skillId);
  if(!skill||['intransitive','intransitiveReading','transitive','transitiveReading'].some(k=>skill[k]!==row[k]))errors.push(`原文映射与知识点不一致 ${row.group}/${row.row}/${row.variant}`);
  const pool=cards.filter(c=>c.courseId==='pairs'&&c.skillId===row.skillId);
  const directions=Object.fromEntries(['intransitive','transitive'].map(d=>[d,pool.filter(c=>REQUIREMENTS.find(r=>r.id===c.id)?.direction===d).length]));
  if(!partial&&Object.values(directions).some(n=>n<2))errors.push(`原文词对缺少两方向各两个场景 ${row.skillId}`);
  return {...row,directions,covered:Object.values(directions).every(n=>n>=2)};
});
if(reference.mapping.length!==165||new Set(reference.mapping.map(r=>`${r.group}/${r.row}`)).size!==160||new Set(reference.mapping.map(r=>r.group)).size!==25)errors.push('文章来源完整范围发生变化');
const hash=c=>crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
for(const c of cards){const proof=index[c.id];if(!proof){errors.push(`${c.id}: 缺少逐卡审核凭据`);continue;}const report=JSON.parse(fs.readFileSync(proof.report,'utf8')),receipt=JSON.parse(fs.readFileSync(path.join(proof.delivery,'receipt.json'),'utf8')),row=report.cards.find(r=>r.id===c.id),source=JSON.parse(fs.readFileSync(path.join(proof.delivery,'cards.json'),'utf8')).find(r=>r.id===c.id);
  if(row?.status!=='approved'||row.hash!==hash(c)||proof.hash!==hash(c)||hash(source)!==hash(c)||JSON.stringify(row.fullSentences)!==JSON.stringify(fullSentences(c))||receipt.cards.find(r=>r.id===c.id)?.hash!==hash(c)||report.reviewer!==proof.reviewer||receipt.author!==proof.author||report.reviewer===receipt.author)errors.push(`${c.id}: 批准记录过期或缺失`);
}
if(cards.length!==Object.keys(index).length)errors.push('审核索引与在用题目不一致');
if(!partial)for(const skill of SKILLS){const pool=cards.filter(c=>c.skillId===skill.id);if(new Set(pool.map(c=>c.id)).size<3)errors.push(`${skill.id}: 缺少三个独立场景`);if(skill.id.startsWith('verb.'))for(const direction of ['intransitive','transitive']){const n=pool.filter(c=>REQUIREMENTS.find(r=>r.id===c.id)?.direction===direction&&c.module==='verbs').length;if(n<2)errors.push(`${skill.id}/${direction}: 基础场景不足两题`);}}
const result={valid:!errors.length,scope:REQUIREMENTS.length,active:cards.length,approved:cards.filter(c=>index[c.id]).length,open:REQUIREMENTS.filter(r=>!index[r.id]).length,contentSkills:SKILLS.length,trackedSkills:TRACKED_SKILLS.length,courses:Object.fromEntries(COURSES.map(c=>[c.id,cards.filter(q=>q.courseId===c.id).length])),article:{groups:25,rows:160,pairs:165,covered:sourceCoverage.filter(r=>r.covered).length,remaining:sourceCoverage.filter(r=>!r.covered).map(r=>r.skillId)},frequency:{pairs:frequency.coverage.pairs,lexemes:frequency.coverage.lexemes,jpdb:frequency.sources.jpdb.snapshot,jiten:frequency.sources.jiten.revision},errors};console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
