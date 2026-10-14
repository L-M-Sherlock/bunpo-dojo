import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import {newProfile,grade,classifyAnswer,recordHint,targetKey,isRetestReady,nextCard,planNextCard,mastery,masteryGaps,importProfile,exportProfile,advanceSession,startSession,parseProfile} from '../src/lib/engine.mjs';
import {SKILL_BY_ID,TRACKED_SKILL_BY_ID,PAIR_GROUP_BY_SKILL,REQUIREMENT_BY_ID,trackingSkillIdForCard} from '../src/lib/catalog.mjs';
const pool=id=>cards.filter(c=>c.skillId===id);
const tracked=c=>trackingSkillIdForCard(c);
const answer=c=>c.options.find(o=>c.answerIds.includes(o.id)).text;
const wrong=c=>c.options.find(o=>!c.answerIds.includes(o.id)).text;
const attempt=(p,c,options={})=>grade(p,c,{questionId:crypto.randomUUID(),answer:answer(c),cards,...options}).profile;

test('all authored acceptable alternatives accept their spelling and verb kana readings',()=>{assert.ok(cards.length);for(const c of cards)for(const o of c.options.filter(o=>c.answerIds.includes(o.id))){assert.equal(classifyAnswer(c,o.text).correct,true,c.id);if(!c.skillId.startsWith('particle.'))assert.equal(classifyAnswer(c,` ${o.reading} `).correct,true,c.id);}});
test('all distractors preserve their reviewed meaning or syntax classification',()=>{for(const c of cards)for(const o of c.options.filter(o=>!c.answerIds.includes(o.id))){const r=classifyAnswer(c,o.text);assert.equal(r.correct,false,c.id);assert.equal(r.kind,o.verdict,c.id);}});
test('unknown words never fabricate a primary-rule failure but retain the whole target',()=>{const c=cards[0],p=attempt(newProfile(),c,{answer:'未审核的完全不同答案'});assert.equal(p.bySkill[c.skillId],undefined);assert.equal(p.originalCount,1);assert.ok(p.pending[targetKey(c)]);assert.equal(p.events[0].kind,'unknown');});
test('a question updates only its shared tracked target and duplicate submits cannot count twice',()=>{const c=cards[0],id=crypto.randomUUID(),first=grade(newProfile(),c,{questionId:id,answer:answer(c),cards}),second=grade(first.profile,c,{questionId:id,answer:wrong(c),cards});assert.deepEqual(Object.keys(first.profile.bySkill),[tracked(c)]);assert.equal(first.profile.events[0].skillId,c.skillId);assert.equal(first.profile.events[0].trackedSkillId,tracked(c));assert.equal(second.duplicate,true);assert.deepEqual(first.profile,second.profile);});
test('help is persisted immediately and assisted work never establishes independent mastery',()=>{const c=cards[0],target=tracked(c);let p=newProfile();p=recordHint(p,c,'hinted','practice');assert.equal(p.originalCount,0);assert.ok(p.pending[targetKey(c)]);for(let n=0;n<6;n++)p=attempt(p,c,{hint:true});assert.equal(p.bySkill[target],undefined);assert.equal(p.assisted[target].correct,6);assert.ok(p.pending[targetKey(c)]);});
test('a pair category needs five answers, three representative pairs and both directions, not every pair',()=>{
  const c=pool('verb.open')[0],group=PAIR_GROUP_BY_SKILL.get(c.skillId),skill=TRACKED_SKILL_BY_ID.get(group.categoryId);let p=newProfile();
  for(let i=0;i<5;i++)p=attempt(p,c);assert.equal(mastery(skill,p.bySkill[skill.id]),false);
  p=newProfile();const sample=group.skillIds.slice(0,3),questions=sample.map(id=>pool(id).find(q=>REQUIREMENT_BY_ID.get(q.id).direction==='intransitive'));
  questions.push(pool(sample[0]).find(q=>REQUIREMENT_BY_ID.get(q.id).direction==='transitive'));
  questions.push(pool(sample[1]).find(q=>REQUIREMENT_BY_ID.get(q.id).direction==='transitive'));
  for(const q of questions)p=attempt(p,q);assert.equal(mastery(skill,p.bySkill[skill.id]),true);assert.equal(p.bySkill[skill.id].lexical.length,3);assert.ok(group.skillIds.length>p.bySkill[skill.id].lexical.length);
});
test('retest changes scenario and preserves the exact role contrast across two other originals',()=>{const c=pool('verb.open')[0],alternative=pool(c.skillId).find(q=>q.id!==c.id&&targetKey(q)===targetKey(c)),other=cards.find(q=>q.skillId!==c.skillId);assert.ok(alternative);let p=attempt(newProfile(),c,{answer:wrong(c)});assert.equal(isRetestReady(p.pending[targetKey(c)],alternative,p,cards),false);p=attempt(p,other);p=attempt(p,other);assert.equal(isRetestReady(p.pending[targetKey(c)],alternative,p,cards),true);assert.equal(isRetestReady(p.pending[targetKey(c)],c,p,cards),false);p=attempt(p,alternative);assert.equal(p.pending[targetKey(c)],undefined);assert.equal(p.statistics.retestCorrect,1);});
test('all-waiting tiny pools choose spacing for the oldest obligation rather than deadlocking',()=>{const a=pool('verb.open')[0],b=cards.find(c=>c.skillId!==a.skillId),subset=[...pool(a.skillId),...pool(b.skillId)];let p=attempt(newProfile(),a,{answer:wrong(a)});p=attempt(p,b,{answer:wrong(b)});const q=nextCard(p,subset,{courses:[a.courseId,b.courseId]});assert.notEqual(targetKey(q),targetKey(a));});
test('challenge mistakes do not enter normal practice queue or downgrade clean normal answers',()=>{const c=cards[0];let p=attempt(newProfile(),c,{answer:wrong(c),mode:'challenge'});assert.equal(p.pending[targetKey(c)].queue,'challenge');p=attempt(p,c,{mode:'practice'});assert.equal(p.events.at(-1).independent,true);assert.equal(p.pending[targetKey(c)].queue,'challenge');});
test('unknown input and auxiliary results are counted once with consistent statistics',()=>{const c=cards[0];let p=attempt(newProfile(),c,{answer:'???'});p=attempt(p,c,{hint:true});assert.equal(p.originalCount,p.statistics.questions);assert.equal(p.statistics.assisted,1);assert.equal(p.statistics.correct,1);});
test('backup round trips without replaying scores and refuses katsuyo or malformed totals',()=>{const c=cards[0],p=attempt(newProfile(),c);assert.deepEqual(importProfile(exportProfile(p),cards),p);assert.throws(()=>importProfile(JSON.stringify({format:'katsuyo-dojo-progress',formatVersion:1,profile:p}),cards));const invalid=structuredClone(p);invalid.statistics.questions++;assert.throws(()=>parseProfile(invalid,cards));});
test('catalog v1 pair evidence migrates once into its category without losing concrete logs',()=>{
  const group=PAIR_GROUP_BY_SKILL.get('verb.open'),[a,b]=group.skillIds,legacy=newProfile();legacy.catalogVersion=1;
  legacy.bySkill={
    [a]:{attempts:3,correct:2,accuracy:.7,confidence:.49,scenes:pool(a).slice(0,2).map(c=>c.id),coverage:['intransitive']},
    [b]:{attempts:2,correct:2,accuracy:1,confidence:.4,scenes:pool(b).slice(0,2).map(c=>c.id),coverage:['transitive']},
  };
  legacy.assisted={[a]:{attempts:1,correct:1},[b]:{attempts:2,correct:1}};
  const migrated=parseProfile(legacy,cards),stats=migrated.bySkill[group.categoryId];
  assert.equal(migrated.catalogVersion,2);assert.deepEqual(Object.keys(migrated.bySkill),[group.categoryId]);assert.equal(stats.attempts,5);assert.equal(stats.correct,4);assert.deepEqual(stats.coverage,['intransitive','transitive']);assert.deepEqual(stats.lexical,[a,b]);assert.deepEqual(migrated.assisted[group.categoryId],{attempts:3,correct:2});assert.deepEqual(parseProfile(migrated,cards),migrated);
});
test('catalog v1 migration preserves an active submitted question and its concrete-pair retest',()=>{
  const c=pool('verb.open')[0],trackedId=tracked(c);let current=startSession(newProfile(),cards,{courses:['pairs']});current.session.cardId=c.id;current.session.questionId='legacy-active';
  current=grade(current,c,{questionId:'legacy-active',answer:wrong(c),cards}).profile;
  const legacy=structuredClone(current);legacy.catalogVersion=1;legacy.bySkill={[c.skillId]:legacy.bySkill[trackedId]};delete legacy.bySkill[c.skillId].lexical;delete legacy.pending[targetKey(c)].trackedSkillId;delete legacy.events[0].trackedSkillId;
  const migrated=parseProfile(legacy,cards);assert.equal(migrated.session.cardId,c.id);assert.equal(migrated.session.result.kind,current.session.result.kind);assert.equal(migrated.pending[targetKey(c)].skillId,c.skillId);assert.equal(migrated.pending[targetKey(c)].trackedSkillId,trackedId);assert.equal(migrated.events[0].skillId,c.skillId);assert.equal(migrated.events[0].trackedSkillId,trackedId);
});
test('challenge continues past twelve and twenty four and only manual stop can end it',()=>{let p=startSession(newProfile(),cards,{mode:'challenge',courses:[cards[0].courseId]});for(let n=0;n<25;n++){const c=cards.find(c=>c.id===p.session.cardId);p=attempt(p,c,{questionId:p.session.questionId,mode:'challenge'});p=advanceSession(p,cards);}assert.equal(p.session.finished,false);assert.equal(p.session.answered,25);assert.equal(p.session.recent.length,25);});
test('particle pronunciation spellings cannot replace the actual particle writing',()=>{const c=cards.find(c=>c.skillId==='particle.destination'),o=c.options.find(o=>o.text==='へ');assert.ok(o&&c.answerIds.includes(o.id));assert.equal(classifyAnswer(c,'へ').correct,true);assert.equal(classifyAnswer(c,'え').correct,false);});
test('a homographic wrong kanji answer requests its reading without changing scores or counts',()=>{const c=cards.find(c=>c.skillId==='verb.open'&&c.options.some(o=>o.text.includes('開き')&&!c.answerIds.includes(o.id)));assert.ok(c);const o=c.options.find(o=>o.text.includes('開き')&&!c.answerIds.includes(o.id)),p=newProfile(),r=grade(p,c,{questionId:'ambiguous',answer:o.text,answerMode:'input',cards});assert.equal(r.retry,true);assert.deepEqual(r.profile,p);});
test('temporarily removed targets retain suspended retest duties and resume without fake success',()=>{const c=cards[0],p=attempt(newProfile(),c,{answer:wrong(c)}),key=targetKey(c),reduced=cards.filter(q=>targetKey(q)!==key);const paused=parseProfile(p,reduced);assert.equal(paused.pending[key],undefined);assert.equal(paused.suspended[key].failures,1);assert.deepEqual(paused.bySkill,p.bySkill);const restored=parseProfile(paused,cards);assert.equal(restored.suspended[key],undefined);assert.deepEqual(restored.pending[key],p.pending[key]);});

test('mastery gaps explain attempts, accuracy, scenes and human-facing direction coverage',()=>{
  const skill=TRACKED_SKILL_BY_ID.get(PAIR_GROUP_BY_SKILL.get('verb.open').categoryId),empty=masteryGaps(skill);
  assert.deepEqual(empty,{attempts:5,scenes:3,coverage:['intransitive','transitive'],lexical:3,needsAccuracy:false,accuracy:undefined});
  const partial={attempts:5,correct:4,accuracy:.8,confidence:.94,scenes:['a','b','c'],coverage:['intransitive'],lexical:['verb.open']},gaps=masteryGaps(skill,partial);
  assert.equal(gaps.attempts,0);assert.equal(gaps.scenes,0);assert.equal(gaps.lexical,2);assert.equal(gaps.needsAccuracy,true);assert.deepEqual(gaps.coverage,['transitive']);
});

test('a single typo in the shared lexical anchor retries without changing the profile',()=>{
  const c=cards.find(card=>card.id==='verb.refbea.01');assert.ok(c);
  for(const value of ['かだむきました','かたきました','かたたむきました','かむたきました']){
    const p=newProfile(),scored=grade(p,c,{questionId:`typo-${value}`,answer:value,answerMode:'input',cards});
    assert.equal(scored.retry,true,value);assert.equal(scored.result.kind,'typo',value);assert.deepEqual(scored.profile,p,value);
  }
  assert.equal(classifyAnswer(c,'かだむきました').kind,'unknown');
  assert.equal(classifyAnswer(cards.find(card=>card.skillId==='particle.existence'),'二',{requireReading:true}).kind,'unknown');
  const role=cards.find(card=>card.exerciseType==='verb-role');assert.ok(role);assert.equal(classifyAnswer(role,'自働詞',{requireReading:true}).kind,'unknown');
  assert.equal(classifyAnswer(c,'かたむけました',{requireReading:true}).kind,'meaning-mismatch');
  const outside=grade(newProfile(),c,{questionId:'ending-error',answer:'かたむきましだ',answerMode:'input',cards});
  assert.equal(outside.retry,undefined);assert.equal(outside.result.kind,'unknown');assert.equal(outside.profile.originalCount,1);assert.ok(outside.profile.pending[targetKey(c)]);
  const line=cards.find(card=>card.id==='verb.line.01'),collision=grade(newProfile(),line,{questionId:'real-word',answer:'からんだ',answerMode:'input',cards});
  assert.equal(collision.retry,undefined);assert.equal(collision.result.kind,'unknown');assert.equal(collision.profile.originalCount,1);
});

test('selection plans persist truthful learning, spacing, retest and consolidation reasons',()=>{
  const a=cards.find(c=>c.skillId==='particle.existence'),others=cards.filter(c=>c.skillId==='particle.activity').slice(0,2),pool=[a,...others,...cards.filter(c=>c.skillId==='particle.existence').slice(1,4)];
  let p=newProfile();assert.equal(planNextCard(p,pool,{courses:['location']}).reason,'unmastered');
  p=attempt(p,a,{answer:wrong(a)});assert.equal(planNextCard(p,pool,{courses:['location']}).reason,'spacing');
  for(const q of others)p=attempt(p,q);assert.equal(planNextCard(p,pool,{courses:['location']}).reason,'retest');
  const mastered=newProfile();for(const id of ['particle.existence','particle.activity'])mastered.bySkill[id]={attempts:5,correct:5,accuracy:1,confidence:1,scenes:cards.filter(c=>c.skillId===id).slice(0,3).map(c=>c.id),coverage:['context']};
  assert.equal(planNextCard(mastered,pool,{courses:['location']}).reason,'consolidation');
  const session=startSession(newProfile(),pool,{courses:['location']});assert.equal(session.session.selectionReason,'unmastered');assert.equal(parseProfile(session,pool).session.selectionReason,'unmastered');
  const legacy=structuredClone(session);delete legacy.session.selectionReason;assert.equal(parseProfile(legacy,pool).session.selectionReason,'continuation');
  const malformed=structuredClone(session);malformed.session.courses=null;assert.throws(()=>parseProfile(malformed,pool),/练习状态无效/);
});

test('learning rounds stop after every useful scene is used and review rounds still fill twelve',()=>{
  const pool=cards.filter(c=>c.skillId==='verb.refbea');assert.equal(pool.length,4);
  let p=startSession(newProfile(),pool,{courses:['pairs']});
  while(!p.session.finished){const c=pool.find(card=>card.id===p.session.cardId);p=grade(p,c,{questionId:p.session.questionId,answer:answer(c),cards}).profile;p=advanceSession(p,pool);}
  assert.equal(p.session.answered,4);assert.equal(new Set(p.session.recent).size,4);assert.equal(p.rotation,1);
  const previousLast=p.session.recent.at(-1);p=startSession(p,pool,{courses:['pairs']});assert.notEqual(p.session.cardId,previousLast);
  const reviewed=newProfile(),trackedId=tracked(pool[0]),trackedSkill=TRACKED_SKILL_BY_ID.get(trackedId);reviewed.bySkill[trackedId]={attempts:5,correct:5,accuracy:1,confidence:1,scenes:pool.slice(0,3).map(c=>c.id),coverage:['intransitive','transitive'],lexical:PAIR_GROUP_BY_SKILL.get(pool[0].skillId).skillIds.slice(0,trackedSkill.minLexical)};
  let r=startSession(reviewed,pool,{courses:['pairs']});assert.equal(r.session.learningRound,false);assert.equal(r.session.selectionReason,'consolidation');
  while(!r.session.finished){const c=pool.find(card=>card.id===r.session.cardId);r=grade(r,c,{questionId:r.session.questionId,answer:answer(c),cards}).profile;r=advanceSession(r,pool);}
  assert.equal(r.session.answered,12);
});

test('a mature challenge retest cannot be cleared by practice in the other queue',()=>{
  const c=cards.find(card=>card.courseId==='pairs'),other=cards.filter(card=>card.skillId!==c.skillId).slice(0,2),alternative=cards.find(card=>targetKey(card)===targetKey(c)&&card.id!==c.id);assert.ok(alternative);
  let p=attempt(newProfile(),c,{answer:wrong(c),mode:'challenge'});for(const q of other)p=attempt(p,q,{mode:'practice'});
  assert.equal(isRetestReady(p.pending[targetKey(c)],alternative,p,cards),true);
  p=attempt(p,alternative,{mode:'practice'});assert.ok(p.pending[targetKey(c)]);assert.equal(p.pending[targetKey(c)].queue,'challenge');assert.equal(p.events.at(-1).independent,true);
});

test('recent history is bounded, exported, and reconstructed for old profiles',()=>{
  let p=newProfile();for(let index=0;index<40;index++){const c=cards[index%cards.length];p=attempt(p,c,{questionId:`history-${index}`});}
  assert.equal(p.recentCardIds.length,36);assert.equal(p.recentLexicalKeys.length,36);assert.deepEqual(importProfile(exportProfile(p),cards),p);
  const legacy=structuredClone(p);delete legacy.recentCardIds;delete legacy.recentLexicalKeys;const restored=parseProfile(legacy,cards);
  assert.deepEqual(restored.recentCardIds,p.events.map(event=>event.cardId).slice(-36));assert.equal(restored.recentLexicalKeys.length,36);
});

test('the oldest due obligation stays ahead of recency preferences',()=>{
  const a=cards.find(c=>c.courseId==='location'&&c.skillId==='particle.existence'),aAlternative=cards.find(c=>c.courseId==='location'&&targetKey(c)===targetKey(a)&&c.id!==a.id),b=cards.find(c=>c.courseId==='location'&&c.skillId==='particle.activity'),bAlternative=cards.find(c=>c.courseId==='location'&&targetKey(c)===targetKey(b)&&c.id!==b.id),p=newProfile();
  p.originalCount=5;p.pending[targetKey(a)]={key:targetKey(a),skillId:a.skillId,familyId:a.familyId,queue:'practice',failures:1,lastExposureOrdinal:0,lastCardId:a.id,lastLexicalKey:a.lexicalKey};p.pending[targetKey(b)]={key:targetKey(b),skillId:b.skillId,familyId:b.familyId,queue:'practice',failures:1,lastExposureOrdinal:1,lastCardId:b.id,lastLexicalKey:b.lexicalKey};
  p.recentCardIds=[aAlternative.id];p.recentLexicalKeys=[aAlternative.lexicalKey];
  const plan=planNextCard(p,[a,aAlternative,b,bAlternative],{courses:['location']});assert.equal(plan.reason,'retest');assert.equal(targetKey(plan.card),targetKey(a));
});

test('a mixed-course singleton target becomes eligible and clears within its selected pool',()=>{
  const mixed=cards.filter(c=>c.courseId==='mixed'),c=mixed.find(card=>mixed.filter(other=>targetKey(other)===targetKey(card)).length===1&&cards.filter(other=>targetKey(other)===targetKey(card)).length>1);assert.ok(c);
  let p=startSession(newProfile(),mixed,{courses:['mixed']});p.session.cardId=c.id;p.session.questionId='mixed-error';
  p=grade(p,c,{questionId:'mixed-error',answer:wrong(c),cards}).profile;p=advanceSession(p,mixed);
  for(let index=0;index<2;index++){const q=mixed.find(card=>card.id===p.session.cardId);p=grade(p,q,{questionId:p.session.questionId,answer:answer(q),cards}).profile;p=advanceSession(p,mixed);}
  assert.equal(p.session.cardId,c.id);assert.equal(p.session.selectionReason,'retest');
  p=grade(p,c,{questionId:p.session.questionId,answer:answer(c),cards}).profile;assert.equal(p.pending[targetKey(c)],undefined);
});

test('a learning round uses a mastered safe spacer before a waiting retest',()=>{
  const waiting=cards.find(c=>c.courseId==='location'&&c.skillId==='particle.existence'),useful=cards.find(c=>c.courseId==='location'&&c.skillId==='particle.activity'),masteredCard=cards.find(c=>c.courseId==='relations'&&c.skillId==='particle.means'),pool=[waiting,useful,masteredCard];let p=newProfile();
  const masteredSkill=SKILL_BY_ID.get(masteredCard.skillId);p.bySkill[masteredSkill.id]={attempts:5,correct:5,accuracy:1,confidence:1,scenes:cards.filter(c=>c.skillId===masteredSkill.id).slice(0,3).map(c=>c.id),coverage:[...masteredSkill.coverage]};
  p=recordHint(p,waiting,'waiting-hint','practice');p=startSession(p,pool,{courses:['location','relations']});assert.equal(p.session.cardId,useful.id);assert.equal(p.session.selectionReason,'spacing');
  p=grade(p,useful,{questionId:p.session.questionId,answer:answer(useful),cards:pool}).profile;p=advanceSession(p,pool);assert.equal(p.session.cardId,masteredCard.id);assert.equal(p.session.selectionReason,'spacing');
  p=grade(p,masteredCard,{questionId:p.session.questionId,answer:answer(masteredCard),cards:pool}).profile;p=advanceSession(p,pool);assert.equal(p.session.cardId,waiting.id);assert.equal(p.session.selectionReason,'retest');
});
