import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import before from '../content/versions/location-v1/cards.json' with {type:'json'};
import {validateCards} from '../src/lib/content-validation.mjs';
import {newProfile,startSession,grade,parseProfile,targetKey,recordHint} from '../src/lib/engine.mjs';

test('location has twenty independent scenes for each relation and only ni/de choices',()=>{
  const location=cards.filter(c=>c.courseId==='location');
  assert.equal(location.length,40);
  for(const [skill,answer]of [['particle.existence','に'],['particle.activity','で']]){
    const pool=location.filter(c=>c.skillId===skill);assert.equal(pool.length,20);
    assert.deepEqual(pool.map(c=>c.id).sort(),Array.from({length:20},(_,i)=>`${skill}.${String(i+1).padStart(2,'0')}`));
    for(const c of pool){assert.deepEqual(c.options.map(o=>o.text).sort(),['で','に']);assert.deepEqual(c.options.filter(o=>c.answerIds.includes(o.id)).map(o=>o.text),[answer]);}
  }
});
test('old location sentences stay byte-equivalent except for removing the e option',()=>{
  for(const old of before){const current=cards.find(c=>c.id===old.id);assert.ok(current,old.id);const expected=old.courseId==='location'?{...old,options:old.options.filter(o=>o.text!=='へ')}:old;assert.deepEqual(current,expected,old.id);}
  const injected=structuredClone(cards.find(c=>c.courseId==='location'));injected.options.push({id:'e',text:'へ',reading:'え',verdict:'ungrammatical',explanation:'仅用于验证审核门禁'});
  assert.ok(validateCards([injected]).some(s=>s.includes('只提供に和で')));
});
test('an old removed choice clears only the unsubmitted selection and preserves help, score and retest duty',()=>{
  const old=before.find(c=>c.id==='particle.existence.01');let p=startSession(newProfile(),before,{courses:['location']});p.session.cardId=old.id;p.session.answer='へ';p=recordHint(p,old,p.session.questionId,'practice');
  const restored=parseProfile(p,cards);assert.equal(restored.session.answer,'');assert.equal(restored.session.hint,true);assert.equal(restored.session.questionId,p.session.questionId);assert.deepEqual(restored.bySkill,p.bySkill);assert.deepEqual(restored.pending,p.pending);assert.equal(restored.originalCount,0);
});
test('old incorrect feedback and pending survive the removed distractor without a fake correct answer',()=>{
  const old=before.find(c=>c.id==='particle.existence.01');let p=startSession(newProfile(),before,{courses:['location']});p.session.cardId=old.id;p=grade(p,old,{questionId:p.session.questionId,answer:'へ',cards:before}).profile;
  const restored=parseProfile(p,cards);assert.equal(restored.session.result.optionId,null);assert.equal(restored.session.result.correct,false);assert.equal(restored.session.answer,'へ');assert.deepEqual(restored.bySkill,p.bySkill);assert.deepEqual(restored.statistics,p.statistics);assert.deepEqual(restored.events,p.events);assert.deepEqual(restored.pending[targetKey(old)],p.pending[targetKey(old)]);
});
