import {SKILLS,SKILL_BY_ID,COURSES,ADAPTIVE_COURSE_IDS,REQUIREMENT_BY_ID} from './catalog.mjs';
import {emptyStatistics,recordStatistics} from './statistics.mjs';
export const STORAGE_KEY='bunpo-dojo-profile-v1';
export const EXPORT_FORMAT='bunpo-dojo-progress';
export const normalizeAnswer=s=>s.normalize('NFKC').replace(/\s+/gu,'').trim();
export const blankStats=()=>({attempts:0,correct:0,accuracy:null,confidence:0,scenes:[],coverage:[]});
export function mastery(skill,stats){return !!stats&&stats.confidence>=1&&stats.scenes.length>=3&&skill.coverage.every(tag=>stats.coverage.includes(tag));}
export function skillProgress(skill,stats){return mastery(skill,stats)?1:Math.min(stats?.confidence??0,.99);}
export function masteredCount(profile){return SKILLS.filter(s=>mastery(s,profile.bySkill[s.id])).length;}
export function newProfile(){return {version:1,catalogVersion:1,bySkill:{},assisted:{},pending:{},suspended:{},originalCount:0,events:[],statistics:emptyStatistics(),session:null,preferences:{reading:true,answerMode:'choice'},rotation:0};}
export function classifyAnswer(card,answer,{requireReading=false}={}){
  const value=normalizeAnswer(answer),matched=card.options.filter(o=>normalizeAnswer(o.text)===value||!card.skillId.startsWith('particle.')&&normalizeAnswer(o.reading)===value);
  const correct=matched.find(o=>card.answerIds.includes(o.id));
  if(correct)return {correct:true,option:correct,kind:'correct'};
  if(requireReading&&card.skillId==='verb.open'&&matched.some(o=>o.text===value&&/開/u.test(value)))return {correct:false,option:null,kind:'reading-ambiguous',retry:true};
  if(!matched.length)return {correct:false,option:null,kind:'unknown'};
  if(matched.some(o=>o.verdict!==matched[0].verdict))return {correct:false,option:null,kind:'unknown'};
  return {correct:false,option:matched[0],kind:matched[0].verdict};
}
export const targetKey=card=>`${card.skillId}/${card.familyId}/${card.skillId.startsWith('verb.')?REQUIREMENT_BY_ID.get(card.id)?.direction??'contrast':'relation'}`;
export function isRetestReady(pending,card,profile,cards){
  if(!pending||targetKey(card)!==pending.key||profile.originalCount-pending.lastExposureOrdinal<2)return false;
  const pool=cards.filter(c=>targetKey(c)===pending.key);
  const otherScenes=pool.filter(c=>c.id!==pending.lastCardId);
  if(otherScenes.length&&card.id===pending.lastCardId)return false;
  if(card.module==='particles'&&pool.some(c=>c.lexicalKey!==pending.lastLexicalKey)&&card.lexicalKey===pending.lastLexicalKey)return false;
  return true;
}
function updateStats(stats,correct,card){
  const s=structuredClone(stats??blankStats()),evidence=Number(correct);s.attempts++;s.correct+=evidence;
  s.accuracy=s.accuracy===null?evidence:s.accuracy+.2*(evidence-s.accuracy);s.confidence=Math.min(s.accuracy/.85*Math.min(s.attempts/5,1),1);
  if(correct){s.scenes=[...new Set([...s.scenes,card.id])];const req=REQUIREMENT_BY_ID.get(card.id);s.coverage=[...new Set([...s.coverage,req?.direction&&card.skillId.startsWith('verb.')?req.direction:'context'])];}
  return s;
}
export function recordHint(profile,card,questionId,mode){
  const p=structuredClone(profile),key=targetKey(card),old=p.pending[key];
  p.pending[key]={...old,key,skillId:card.skillId,familyId:card.familyId,queue:old?.queue==='practice'?'practice':mode,failures:old?.failures??0,lastExposureOrdinal:p.originalCount,lastCardId:card.id,lastLexicalKey:card.lexicalKey};
  if(p.session?.questionId===questionId)p.session.hint=true;
  return p;
}
export function grade(profile,card,{questionId,answer,revealed=false,hint=false,answerMode='choice',mode='practice',cards=/** @type {any[]} */([]),at=new Date().toISOString()}){
  if(profile.events.some(e=>e.questionId===questionId))return {profile,result:null,duplicate:true};
  const result=revealed?{correct:false,option:null,kind:'revealed'}:classifyAnswer(card,answer,{requireReading:answerMode==='input'}),p=structuredClone(profile),key=targetKey(card),old=p.pending[key];
  if(result.retry)return {profile,result,duplicate:false,retry:true};
  const relevant=old&&old.queue===mode,ready=old&&isRetestReady(old,card,profile,cards),independent=!hint&&!revealed&&(!relevant||ready);
  const event={id:questionId,questionId,at,cardId:card.id,skillId:card.skillId,courseId:card.courseId,mode,answerMode,answer,correct:result.correct,kind:result.kind,independent,retest:!!(old&&ready),hintUsed:hint,revealed};
  p.originalCount++;
  if(independent&&result.kind!=='unknown')p.bySkill[card.skillId]=updateStats(p.bySkill[card.skillId],result.correct,card);
  else{const a=p.assisted[card.skillId]??={attempts:0,correct:0};if(result.kind!=='unknown'){a.attempts++;a.correct+=Number(result.correct);}}
  if(result.correct&&independent&&old&&ready)delete p.pending[key];
  else if(!result.correct||hint||relevant){p.pending[key]={...old,key,skillId:card.skillId,familyId:card.familyId,queue:old?.queue==='practice'?'practice':mode,failures:(old?.failures??0)+Number(!result.correct),lastExposureOrdinal:p.originalCount,lastCardId:card.id,lastLexicalKey:card.lexicalKey};}
  p.events=[...p.events,event].slice(-500);p.statistics=recordStatistics(p.statistics,event);
  if(p.session?.questionId===questionId){p.session.result={...result,optionId:result.option?.id??null,independent,retest:event.retest};delete p.session.result.option;p.session.answer=answer;p.session.answered++;p.session.correct+=Number(result.correct);p.session.recent=[...p.session.recent,card.id].slice(-36);}
  return {profile:p,result:{...result,independent,retest:event.retest},duplicate:false};
}
const relevantPending=(p,mode,courses,cards)=>Object.values(p.pending).filter(v=>v.queue===mode&&cards.some(c=>courses.includes(c.courseId)&&targetKey(c)===v.key));
export function nextCard(profile,cards,{mode='practice',courses=COURSES.map(c=>c.id),recent=/** @type {string[]} */([]),index=0}={}){
  const pool=cards.filter(c=>courses.includes(c.courseId));if(!pool.length)return null;
  const pending=relevantPending(profile,mode,courses,pool);
  const due=pending.flatMap(v=>pool.filter(c=>isRetestReady(v,c,profile,cards))).sort((a,b)=>(profile.pending[targetKey(a)]?.lastExposureOrdinal??0)-(profile.pending[targetKey(b)]?.lastExposureOrdinal??0)||a.id.localeCompare(b.id));
  const recentPosition=c=>{const i=recent.lastIndexOf(c.id);return i<0?-999:i;};
  if(due.length)return [...due].sort((a,b)=>profile.pending[targetKey(a)].lastExposureOrdinal-profile.pending[targetKey(b)].lastExposureOrdinal||recentPosition(a)-recentPosition(b)||a.id.localeCompare(b.id))[0];
  // Leave two genuinely different targets between exposures. Do not exclude
  // all waiting targets forever when a small course pool exhausts its choices.
  const waiting=new Set(pending.map(v=>v.key)),spacing=pool.filter(c=>!waiting.has(targetKey(c)));
  const oldest=[...pending].sort((a,b)=>a.lastExposureOrdinal-b.lastExposureOrdinal)[0];
  const otherTargets=oldest?pool.filter(c=>targetKey(c)!==oldest.key):pool;
  const available=spacing.length?spacing:otherTargets.length?otherTargets:pool;
  let ordered=available;
  if(mode==='practice'){
    const unmastered=available.filter(c=>!mastery(SKILL_BY_ID.get(c.skillId),profile.bySkill[c.skillId]));
    if(unmastered.length){const earliestCourse=ADAPTIVE_COURSE_IDS.find(id=>unmastered.some(c=>SKILL_BY_ID.get(c.skillId).courseId===id));ordered=unmastered.filter(c=>SKILL_BY_ID.get(c.skillId).courseId===earliestCourse);}
    const ids=[...new Set(ordered.map(c=>c.skillId))].sort((a,b)=>(profile.bySkill[a]?.confidence??0)-(profile.bySkill[b]?.confidence??0)||SKILLS.findIndex(s=>s.id===a)-SKILLS.findIndex(s=>s.id===b));
    const focus=ids[0];
    // Every fourth question balances a different target if one exists.
    const target=(index+1)%4===0&&ids.length>1?ids[1+(Math.floor(index/4)+profile.rotation)%(ids.length-1)]:focus;
    ordered=ordered.filter(c=>c.skillId===target);
  }else{
    const courseIds=courses.filter(id=>available.some(c=>c.courseId===id)),course=courseIds[index%courseIds.length];
    ordered=available.filter(c=>c.courseId===course);
    const targets=[...new Set(ordered.map(c=>c.skillId))];const target=targets[Math.floor(index/courseIds.length)%targets.length];ordered=ordered.filter(c=>c.skillId===target);
  }
  return [...ordered].sort((a,b)=>recentPosition(a)-recentPosition(b)||(profile.bySkill[a.skillId]?.scenes.includes(a.id)?1:0)-(profile.bySkill[b.skillId]?.scenes.includes(b.id)?1:0)||a.id.localeCompare(b.id))[0];
}
export function startSession(profile,cards,{mode='practice',courses=ADAPTIVE_COURSE_IDS,answerMode=profile.preferences.answerMode}={}){
  const p=structuredClone(profile),card=nextCard(p,cards,{mode,courses});
  if(!card)return p;
  p.session={mode,courses,answerMode,cardId:card.id,questionId:crypto.randomUUID(),index:0,answered:0,correct:0,recent:[],answer:'',hint:false,result:null,finished:false};return p;
}
export function advanceSession(profile,cards){
  const p=structuredClone(profile),s=p.session;if(!s||!s.result||s.finished)return p;
  if(s.mode==='practice'&&s.answered>=12){s.finished=true;p.rotation++;return p;}
  const card=nextCard(p,cards,{mode:s.mode,courses:s.courses,recent:s.recent,index:s.index+1});
  if(!card){s.finished=true;return p;}
  Object.assign(s,{cardId:card.id,questionId:crypto.randomUUID(),index:s.index+1,answer:'',hint:false,result:null});return p;
}
export function reconcileProfile(profile,cards){
  const p=structuredClone(profile),keys=new Set(cards.map(targetKey));
  for(const [key,v]of Object.entries(p.pending))if(!keys.has(key)){p.suspended[key]=v;delete p.pending[key];}
  for(const [key,v]of Object.entries(p.suspended))if(keys.has(key)){p.pending[key]??=v;delete p.suspended[key];}
  if(p.session){
    const card=cards.find(c=>c.id===p.session.cardId);
    if(!card)p.session=null;
    else{
      if(!p.session.result&&p.session.answerMode==='choice'&&!card.options.some(o=>o.text===p.session.answer))p.session.answer='';
      if(p.session.result?.optionId&&!card.options.some(o=>o.id===p.session.result.optionId))p.session.result.optionId=null;
    }
  }
  return p;
}
function checkNumber(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
export function parseProfile(value,cards=[]){
  const p=typeof value==='string'?JSON.parse(value):structuredClone(value);
  if(p?.version!==1||p?.catalogVersion!==1||!Number.isSafeInteger(p.originalCount)||p.originalCount<0||!Array.isArray(p.events)||p.events.length>500||!p.bySkill||!p.pending||!p.statistics||!p.preferences||!p.assisted||!p.suspended||!Number.isSafeInteger(p.rotation))throw new Error('备份不完整或版本不受支持。');
  for(const [id,s]of Object.entries(p.bySkill))if(!SKILL_BY_ID.has(id)||!Number.isSafeInteger(s.attempts)||!Number.isSafeInteger(s.correct)||s.correct<0||s.correct>s.attempts||!checkNumber(s.confidence)||s.confidence>1||s.accuracy!==null&&(!checkNumber(s.accuracy)||s.accuracy>1)||!Array.isArray(s.scenes)||!Array.isArray(s.coverage))throw new Error('掌握度数据无效。');
  const eventIds=new Set();for(const e of p.events){if(typeof e.questionId!=='string'||eventIds.has(e.questionId)||!['practice','challenge'].includes(e.mode)||!['input','choice'].includes(e.answerMode)||!SKILL_BY_ID.has(e.skillId)||!Number.isFinite(Date.parse(e.at)))throw new Error('作答记录无效。');eventIds.add(e.questionId);}
  for(const [key,v]of Object.entries({...p.pending,...p.suspended}))if(key!==v.key||!['practice','challenge'].includes(v.queue)||!SKILL_BY_ID.has(v.skillId)||!Number.isSafeInteger(v.lastExposureOrdinal)||v.lastExposureOrdinal<0||v.lastExposureOrdinal>p.originalCount||!Number.isSafeInteger(v.failures)||v.failures<0)throw new Error('复测数据无效。');
  for(const k of ['questions','correct','independent','independentCorrect','assisted','retests','retestCorrect','activeMs','choice','input'])if(!checkNumber(p.statistics[k]))throw new Error('统计数据无效。');
  if(p.statistics.questions!==p.originalCount||p.statistics.correct>p.originalCount||p.statistics.independentCorrect>p.statistics.independent||p.statistics.retestCorrect>p.statistics.retests)throw new Error('统计与题数不一致。');
  if(p.events.length>p.originalCount||p.statistics.independent+p.statistics.assisted!==p.originalCount||p.statistics.choice+p.statistics.input!==p.originalCount)throw new Error('作答分类与总量不一致。');
  for(const [key,pattern]of [['days',/^\d{4}-\d{2}-\d{2}$/],['courses',/^[a-z]+$/],['errors',/^(verb|particle)\.[a-z]+$/]]){
    const map=p.statistics[key];if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>5000)throw new Error('统计明细无效。');
    for(const [id,row]of Object.entries(map)){if(!pattern.test(id))throw new Error('统计标识无效。');if(key==='errors'){if(!checkNumber(row))throw new Error('错因次数无效。');}else if(!row||typeof row!=='object'||Object.values(row).some(n=>!checkNumber(n)))throw new Error('统计明细数值无效。');}
  }
  if(!['choice','input'].includes(p.preferences.answerMode)||typeof p.preferences.reading!=='boolean')throw new Error('偏好设置无效。');
  if(p.session){const s=p.session;if(!Array.isArray(s.courses)||!s.courses.length||s.courses.some(id=>!COURSES.some(c=>c.id===id))||!['practice','challenge'].includes(s.mode)||!['choice','input'].includes(s.answerMode)||typeof s.questionId!=='string'||typeof s.cardId!=='string'||typeof s.answer!=='string'||typeof s.hint!=='boolean'||!Array.isArray(s.recent)||s.recent.length>36||s.recent.some(id=>typeof id!=='string')||!Number.isSafeInteger(s.index)||s.index<0||!Number.isSafeInteger(s.answered)||!Number.isSafeInteger(s.correct)||s.correct<0||s.correct>s.answered||s.answered<0||s.answered>p.originalCount||typeof s.finished!=='boolean')throw new Error('练习状态无效。');if(s.result!==null&&(typeof s.result!=='object'||typeof s.result.correct!=='boolean'||typeof s.result.independent!=='boolean'||typeof s.result.retest!=='boolean'||typeof s.result.kind!=='string'||s.result.optionId!==null&&typeof s.result.optionId!=='string'))throw new Error('答案反馈无效。');}
  return cards.length?reconcileProfile(p,cards):p;
}
export function exportProfile(profile){return JSON.stringify({format:EXPORT_FORMAT,formatVersion:1,exportedAt:new Date().toISOString(),profile},null,2);}
export function importProfile(text,cards){const value=JSON.parse(text);if(value.format!==EXPORT_FORMAT||value.formatVersion!==1)throw new Error('这不是文法道场的备份，不能导入其他网站的进度。');return parseProfile(value.profile,cards);}
