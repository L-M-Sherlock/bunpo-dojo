import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import before from '../content/versions/article-v2/cards.json' with {type:'json'};
import reference from '../content/references/haya-pairs.json' with {type:'json'};
import siteClassification from '../content/references/site-pair-classification.json' with {type:'json'};
import frequency from '../content/references/pair-frequency.json' with {type:'json'};
import frequencyAliases from '../content/references/pair-frequency-aliases.json' with {type:'json'};
import {PAIR_GROUPS,PAIR_GROUP_BY_SKILL,PAIR_CLASSIFICATION_SOURCE_BY_SKILL,PAIR_FREQUENCY_BY_SKILL,SKILLS,SKILL_BY_ID,TRACKED_SKILLS,TRACKED_SKILL_BY_ID,REQUIREMENT_BY_ID,trackingSkillIdForCard} from '../src/lib/catalog.mjs';
import {exportProfile,importProfile,newProfile,grade,targetKey,nextCard,startSession,parseProfile} from '../src/lib/engine.mjs';

test('every article row and spelling sense has its declared pair and both reviewed directions',()=>{
  assert.equal(reference.groups,25);
  assert.equal(reference.groupDefinitions.length,25);
  assert.deepEqual(reference.groupDefinitions.map(group=>group.group),Array.from({length:25},(_,index)=>index+1));
  for(const group of reference.groupDefinitions){assert.ok(group.sameForm||group.intransitiveSuffix&&group.transitiveSuffix,group.group);assert.ok(['五段','一段'].includes(group.intransitiveClass));assert.ok(['五段','一段'].includes(group.transitiveClass));}
  assert.equal(new Set(reference.mapping.map(r=>`${r.group}/${r.row}`)).size,160);
  assert.equal(reference.mapping.length,165);
  assert.deepEqual([...new Set(reference.mapping.map(r=>r.group))].sort((a,b)=>a-b),Array.from({length:25},(_,i)=>i+1));
  const oldIds=new Set(before.map(c=>c.skillId));
  for(const row of reference.mapping){
    const skill=SKILL_BY_ID.get(row.skillId);assert.ok(skill,row.skillId);
    for(const key of ['intransitive','intransitiveReading','transitive','transitiveReading'])assert.equal(skill[key],row[key],`${row.group}/${row.row}/${key}`);
    const pool=cards.filter(c=>c.courseId==='pairs'&&c.skillId===row.skillId);
    for(const dir of ['intransitive','transitive'])assert.ok(pool.filter(c=>REQUIREMENT_BY_ID.get(c.id).direction===dir).length>=2,`${row.skillId}/${dir}`);
    if(!oldIds.has(row.skillId))for(const c of pool)assert.ok(c.sourceIds.includes('haya-pairs'),c.id);
  }
});

test('adding article coverage preserves every existing card and its progress evidence',()=>{
  for(const old of before)assert.deepEqual(cards.find(c=>c.id===old.id),old,old.id);
  const c=before.find(c=>c.courseId==='pairs');
  const p=grade(newProfile(),c,{questionId:'pre-expansion-error',answer:c.options.find(o=>!c.answerIds.includes(o.id)).text,cards:before}).profile;
  const restored=importProfile(exportProfile(p),cards);
  assert.deepEqual(restored.bySkill,p.bySkill);assert.deepEqual(restored.events,p.events);assert.deepEqual(restored.statistics,p.statistics);assert.deepEqual(restored.pending[targetKey(c)],p.pending[targetKey(c)]);
});

test('different readings and senses in the article remain separate targets',()=>{
  for(const group of [[{group:9,row:3},{group:9,row:11}],[{group:2,row:11},{group:19,row:6}],[{group:3,row:5,variant:1},{group:3,row:5,variant:2}],[{group:4,row:4,variant:1},{group:4,row:4,variant:2}]]){
    const ids=group.map(q=>reference.mapping.find(r=>Object.entries(q).every(([k,v])=>r[k]===v)).skillId);
    assert.equal(new Set(ids).size,2);
  }
  const same=reference.mapping.find(r=>r.group===25);
  const pool=cards.filter(c=>c.skillId===same.skillId);assert.equal(pool.length,4);
  for(const c of pool){assert.equal(c.exerciseType,'verb-role');assert.deepEqual(c.focusVerb,{text:'開く',reading:'ひらく'});}
  assert.notEqual(reference.mapping.find(r=>r.group===18&&r.row===7).skillId,'verb.repair');
  assert.notEqual(reference.mapping.find(r=>r.group===2&&r.row===19).skillId,'verb.light');
  const enterVariants=reference.mapping.filter(r=>r.group===2&&r.row===3);
  assert.deepEqual(enterVariants.map(r=>r.intransitiveReading).sort(),['はいる','いる'].sort());
  assert.equal(new Set(enterVariants.map(r=>r.skillId)).size,2);
});

test('the pair curriculum keeps all twenty-five source categories and assigns site supplements',()=>{
  assert.equal(PAIR_GROUPS.length,25);assert.deepEqual(PAIR_GROUPS.map(group=>group.order),Array.from({length:25},(_,index)=>index+1));
  assert.equal(new Set(PAIR_GROUPS.map(group=>group.label)).size,25);assert.ok(PAIR_GROUPS.every(group=>group.label.includes('（')));
  assert.equal(PAIR_GROUPS.flatMap(group=>group.articleSkillIds).length,165);assert.equal(PAIR_GROUPS.flatMap(group=>group.supplementalSkillIds).length,7);
  const ordered=PAIR_GROUPS.flatMap(group=>group.skillIds);assert.equal(new Set(ordered).size,172);assert.deepEqual(SKILLS.filter(skill=>skill.courseId==='pairs').map(skill=>skill.id),ordered);
  assert.equal(TRACKED_SKILLS.length,35);assert.deepEqual(TRACKED_SKILLS.filter(skill=>skill.courseId==='pairs').map(skill=>skill.id),PAIR_GROUPS.map(group=>group.categoryId));
  for(const card of cards)assert.ok(TRACKED_SKILL_BY_ID.has(trackingSkillIdForCard(card)),card.id);
  const articleIds=new Set(PAIR_GROUPS.flatMap(group=>group.articleSkillIds)),supplementalIds=new Set(PAIR_GROUPS.flatMap(group=>group.supplementalSkillIds));
  assert.equal(cards.filter(card=>card.courseId==='pairs'&&articleIds.has(card.skillId)).length,677);assert.equal(cards.filter(card=>card.courseId==='pairs'&&supplementalIds.has(card.skillId)).length,31);
  for(const row of reference.mapping)assert.equal(PAIR_GROUP_BY_SKILL.get(row.skillId).order,row.group,`${row.group}/${row.row}`);
  assert.deepEqual(PAIR_GROUPS.slice(0,5).map(group=>group.title),['自动 -aru ／ 他动 -eru','自动 -u ／ 他动 -eru','自动 -eru ／ 他动 -u','自动 -eru ／ 他动 -asu','自动 -eru ／ 他动 -yasu']);
  assert.deepEqual(siteClassification.assignments.map(entry=>[entry.skillId,entry.group]),[['verb.find',1],['verb.light',2],['verb.continue',2],['verb.line',2],['verb.sell',3],['verb.repair',18],['verb.boil',19]]);
  for(const entry of siteClassification.assignments){assert.equal(PAIR_GROUP_BY_SKILL.get(entry.skillId).order,entry.group);assert.equal(PAIR_CLASSIFICATION_SOURCE_BY_SKILL.get(entry.skillId),'site');}
});

test('pair examples use the frozen JPDB and Jiten frequency order with explicit sense overrides',()=>{
  assert.equal(frequency.coverage.pairs,172);assert.equal(frequency.coverage.lexemes,344);assert.equal(frequency.coverage.jpdbExact,344);assert.equal(frequency.coverage.jitenExact,344);
  assert.equal(new Set(frequency.orderedSkillIds).size,172);assert.deepEqual(new Set(frequency.orderedSkillIds),new Set(SKILLS.filter(skill=>skill.courseId==='pairs').map(skill=>skill.id)));
  for(const [index,id] of frequency.orderedSkillIds.entries())assert.equal(PAIR_FREQUENCY_BY_SKILL.get(id).overallOrder,index+1,id);
  for(const group of PAIR_GROUPS)assert.deepEqual(group.skillIds,[...group.skillIds].sort((a,b)=>PAIR_FREQUENCY_BY_SKILL.get(a).overallOrder-PAIR_FREQUENCY_BY_SKILL.get(b).overallOrder));
  assert.deepEqual(PAIR_GROUPS[0].skillIds.slice(0,5),['verb.decide','verb.change','verb.start','verb.find','verb.stop']);
  const byId=new Map(frequency.pairs.map(row=>[row.id,row])),light=byId.get('verb.light'),stain=byId.get('verb.refica'),solve=byId.get('verb.refceb');
  assert.equal(light.intransitive.lookupTerm,'点く');assert.equal(light.transitive.lookupTerm,'点ける');assert.equal(stain.transitive.lookupTerm,'穢す');assert.equal(stain.transitive.jiten.resolution.wordId,1178960);assert.equal(solve.intransitive.jiten.rank,2656);assert.equal(solve.intransitive.jiten.resolution.wordId,1198910);
  assert.equal(frequencyAliases.overrides.length,5);assert.equal(nextCard(newProfile(),cards,{courses:['pairs']}).skillId,'verb.decide');
});

test('three representative pairs complete a category without requiring all of its pairs',()=>{
  const profile=newProfile(),first=PAIR_GROUPS[0],skill=TRACKED_SKILL_BY_ID.get(first.categoryId),sample=first.skillIds.slice(0,skill.minLexical),pool=cards.filter(card=>sample.includes(card.skillId));
  profile.bySkill[skill.id]={attempts:5,correct:5,accuracy:1,confidence:1,scenes:pool.slice(0,3).map(card=>card.id),coverage:['intransitive','transitive'],lexical:sample};
  const card=nextCard(profile,cards,{courses:['pairs']});assert.equal(PAIR_GROUP_BY_SKILL.get(card.skillId).order,2);assert.ok(first.skillIds.length>sample.length);
});

test('reordering categories preserves an active pair question and its submitted feedback by id',()=>{
  const moved=cards.find(card=>card.id==='verb.open.01');let profile=startSession(newProfile(),cards,{courses:['pairs']});
  profile.session.cardId=moved.id;profile.session.questionId='pre-grouping-session';profile.session.answer=moved.options.find(option=>moved.answerIds.includes(option.id)).text;
  profile=grade(profile,moved,{questionId:profile.session.questionId,answer:profile.session.answer,cards}).profile;
  const restored=parseProfile(JSON.stringify(profile),cards);assert.equal(restored.session.cardId,moved.id);assert.equal(restored.session.answer,profile.session.answer);assert.deepEqual(restored.session.result,profile.session.result);
});
