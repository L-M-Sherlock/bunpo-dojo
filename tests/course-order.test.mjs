import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import {COURSES,ADAPTIVE_COURSE_IDS,TRACKED_SKILLS,SKILL_BY_ID,trackingSkillIdForCard} from '../src/lib/catalog.mjs';
import {newProfile,startSession,nextCard,grade,targetKey,parseProfile} from '../src/lib/engine.mjs';

const markCourseMastered=(profile,courseId)=>{
  for(const skill of TRACKED_SKILLS.filter(s=>s.courseId===courseId)){const pool=cards.filter(c=>trackingSkillIdForCard(c)===skill.id);profile.bySkill[skill.id]={attempts:5,correct:5,accuracy:1,confidence:1,scenes:pool.slice(0,3).map(c=>c.id),coverage:[...skill.coverage],lexical:skill.minLexical?[...new Set(pool.map(c=>c.skillId))].slice(0,skill.minLexical):[]};}
};
const correct=c=>c.options.find(o=>c.answerIds.includes(o.id)).text;

test('course order keeps pairs last and a new adaptive session retains every full course',()=>{
  assert.deepEqual(COURSES.map(c=>c.id),['location','movement','relations','mixed','pairs']);
  const p=startSession(newProfile(),cards);
  assert.deepEqual(p.session.courses,['location','movement','relations','pairs']);
  for(const skill of TRACKED_SKILLS)assert.ok(cards.some(c=>p.session.courses.includes(c.courseId)&&trackingSkillIdForCard(c)===skill.id),skill.id);
});

test('normal practice advances through particle courses before pairs even in mixed scenes',()=>{
  for(const courses of [[...COURSES].reverse().map(c=>c.id),['mixed']]){
    const p=newProfile();
    for(const courseId of ADAPTIVE_COURSE_IDS){
      const c=nextCard(p,[...cards].reverse(),{courses});
      assert.equal(SKILL_BY_ID.get(c.skillId).courseId,courseId);
      markCourseMastered(p,courseId);
    }
  }
});

test('due pairs retests still precede new particle targets and existing progress round trips',()=>{
  const c=cards.find(c=>c.courseId==='pairs'),other=cards.filter(q=>q.courseId==='location').slice(0,2);
  let p=startSession(newProfile(),cards,{courses:['location','pairs','movement','relations']});
  p=grade(p,c,{questionId:'old-pairs-error',answer:c.options.find(o=>!c.answerIds.includes(o.id)).text,cards}).profile;
  for(const [i,q]of other.entries())p=grade(p,q,{questionId:`spacing-${i}`,answer:correct(q),cards}).profile;
  const q=nextCard(p,cards,{courses:ADAPTIVE_COURSE_IDS});
  assert.equal(targetKey(q),targetKey(c));
  assert.notEqual(q.id,c.id);
  assert.deepEqual(parseProfile(JSON.stringify(p),cards),p);
  assert.deepEqual(p.session.courses,['location','pairs','movement','relations']);
});
