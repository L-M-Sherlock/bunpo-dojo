import {REQUIREMENT_BY_ID,SKILL_BY_ID,SOURCE_URLS} from './catalog.mjs';
const roleLabels={intransitive:'自动词',transitive:'他动词'};
const roleLabel=direction=>typeof direction==='string'&&Object.hasOwn(roleLabels,direction)?roleLabels[direction]:undefined;
const roleReadings=new Map([['自动词',['じどうし','自动词']],['他动词',['たどうし','他动词']]]);
const partsText=parts=>Array.isArray(parts)?parts.map(p=>typeof p?.text==='string'?p.text:'').join(''):'';
const matchingPair=(pair,skill)=>['intransitive','intransitiveReading','transitive','transitiveReading'].every(key=>typeof skill?.[key]==='string'&&Boolean(skill[key].trim())&&pair?.[key]===skill[key]);
export function validateCards(cards,{complete=false}={}) {
  const errors=[],ids=new Set(),scenes=new Set();
  if(!Array.isArray(cards))return ['题库必须是数组'];
  for(const c of cards){
    const issue=m=>errors.push(`${c?.id??'unknown'}: ${m}`),r=REQUIREMENT_BY_ID.get(c?.id);
    if(!r){issue('不在冻结范围内');continue;}
    if(ids.has(c.id))issue('重复ID');ids.add(c.id);
    for(const k of ['module','courseId','skillId','familyId'])if(c[k]!==r[k])issue(`${k}与要求不符`);
    const verbRole=c.exerciseType==='verb-role';
    if(c.exerciseType!==undefined&&!verbRole)issue('未知exerciseType');
    if(verbRole){
      if(c.module!=='verbs'||c.courseId!=='pairs'||r.module!=='verbs'||r.courseId!=='pairs')issue('verb-role仅适用于verbs模块的pairs课程');
      const skill=SKILL_BY_ID.get(r.skillId),direction=roleLabel(r.direction)?r.direction:null;
      if(skill?.id!==r.skillId||skill?.courseId!=='pairs'||r.pair?.id!==r.skillId||!matchingPair(r.pair,skill))issue('verb-role冻结词对的文字与读音必须与技能一致');
      if(!direction)issue('verb-role冻结direction必须为intransitive或transitive');
      const text=direction?r.pair?.[direction]:undefined,reading=direction?r.pair?.[`${direction}Reading`]:undefined;
      if(!c.focusVerb||Array.isArray(c.focusVerb)||typeof c.focusVerb!=='object'||typeof c.focusVerb.text!=='string'||!c.focusVerb.text.trim()||typeof c.focusVerb.reading!=='string'||!c.focusVerb.reading.trim())issue('verb-role缺少focusVerb文字或读音');
      else if(c.focusVerb.text!==text||c.focusVerb.reading!==reading)issue('focusVerb与冻结direction对应的词条或读音不符');
      if(!partsText(c.before).trim())issue('verb-role的before必须包含完整句');
    }
    for(const k of ['lexicalKey','scene','translation','explanation','hint'])if(typeof c[k]!=='string'||!c[k].trim())issue(`${k}缺失`);
    if(c.scene?.length>60)issue('场景过长');
    const sentence=partsText(c.before)+(verbRole?'':'【】')+partsText(c.after);
    if(scenes.has(sentence))issue(verbRole?'重复完整句不算独立场景':'重复挖空句不算独立场景');scenes.add(sentence);
    for(const k of ['before','after']){
      if(!Array.isArray(c[k])){issue(`${k}必须为数组`);continue;}
      for(const p of c[k]){if(typeof p?.text!=='string'||/[\u3400-\u9fff々〇]/u.test(p.text)&&typeof p.reading!=='string')issue('句段缺text或汉字reading');if(/[＿【】]/u.test(p?.text))issue('句段含额外空格标记');}
    }
    if(verbRole&&(!Array.isArray(c.options)||c.options.length!==2||c.options.some(o=>!Object.values(roleLabels).includes(o?.text))||new Set(c.options.map(o=>o?.text)).size!==2))issue('verb-role必须只提供自动词和他动词两个候选');
    if(!Array.isArray(c.options)||c.options.length<2){issue('至少两个候选');continue;}
    if(c.options.some(o=>!o||typeof o!=='object'||Array.isArray(o))){issue('候选必须为对象');continue;}
    if(c.courseId==='location'&&(c.options.length!==2||c.options.some(o=>!['に','で'].includes(o.text))))issue('存在与活动地点只提供に和で两个候选');
    const options=new Set(),texts=new Set();
    for(const o of c.options){
      if(options.has(o.id)||texts.has(o.text))issue('候选ID或文本重复');options.add(o.id);texts.add(o.text);
      for(const k of ['id','text','reading','explanation'])if(typeof o[k]!=='string'||!o[k].trim())issue(`候选${k}缺失`);
      if(!['correct','meaning-mismatch','ungrammatical'].includes(o.verdict))issue('非法候选判断');
      if(verbRole&&!roleReadings.get(o.text)?.includes(o.reading))issue('verb-role类别reading与候选不符');
    }
    const correct=c.options.filter(o=>o.verdict==='correct').map(o=>o.id).sort();
    if(!correct.length||!Array.isArray(c.answerIds)||JSON.stringify([...c.answerIds].sort())!==JSON.stringify(correct))issue('正确集合与选项判断不一致');
    if(verbRole){
      const expected=c.options.find(o=>o.text===roleLabel(r.direction));
      if(!expected||correct.length!==1||correct[0]!==expected.id||!Array.isArray(c.answerIds)||c.answerIds.length!==1||c.answerIds[0]!==expected.id)issue('verb-role正确类别必须与冻结direction一致且只有一个');
    }
    if(!Array.isArray(c.sourceIds)||!c.sourceIds.length||c.sourceIds.some(id=>!SOURCE_URLS[id]))issue('来源缺失或未知');
    if(!['draft','approved'].includes(c.review))issue('非法审核状态');
  }
  if(complete)for(const id of REQUIREMENT_BY_ID.keys())if(!ids.has(id))errors.push(`${id}: 缺少场景`);
  return errors;
}
export function fullSentences(card){if(card.exerciseType==='verb-role')return [partsText(card.before)+partsText(card.after)];return card.options.filter(o=>card.answerIds.includes(o.id)).map(o=>partsText(card.before)+o.text+partsText(card.after));}

export function readingAnchorIssues(cards){
  const errors=[],escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const c of cards)for(const part of [...c.before,...c.after]){
    if(!part.reading)continue;
    const groups=part.text.normalize('NFKC').match(/[\u3400-\u9fff々〇]+|[^\u3400-\u9fff々〇]+/gu)??[];
    const pattern=groups.map(g=>/[\u3400-\u9fff々〇]/u.test(g)?'.+?':escape(g.replace(/\s/gu,''))).join('');
    if(!new RegExp(`^${pattern}$`,'u').test(part.reading.normalize('NFKC').replace(/\s/gu,'')))errors.push(`${c.id}: 书面假名或标点与reading不对应 (${part.text})`);
  }
  return errors;
}
