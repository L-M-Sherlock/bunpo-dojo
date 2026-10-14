import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAnswer,newProfile,startSession,grade,parseProfile,targetKey} from '../src/lib/engine.mjs';
import {roleCard,withVerbRoleCatalog} from './fixtures/verb-role.mjs';

test('verb-role accepts Chinese categories and their reviewed readings in both directions',()=>{
  for(const direction of ['intransitive','transitive']){
    const c=roleCard(direction);
    for(const o of c.options)for(const answer of [o.text,` ${o.reading} `]){
      const result=classifyAnswer(c,answer,{requireReading:true});
      assert.equal(result.correct,o.id===direction,`${direction}: ${answer}`);
      assert.equal(result.kind,o.verdict);
      assert.equal(result.option.id,o.id);
      assert.equal(result.retry,undefined);
    }
    assert.equal(classifyAnswer(c,'開きました',{requireReading:true}).kind,'unknown');
  }
});

test('verb-role grading records only the requested category target and preserves a wrong-role retest',async()=>{
  await withVerbRoleCatalog(cards=>{
    const c=cards[0],wrong=c.options.find(o=>!c.answerIds.includes(o.id));
    const p=startSession(newProfile(),cards,{courses:['pairs'],answerMode:'input'}),
      scored=grade(p,c,{questionId:p.session.questionId,answer:wrong.text,answerMode:'input',cards});
    assert.equal(scored.retry,undefined);
    assert.equal(scored.result.kind,'meaning-mismatch');
    assert.equal(scored.profile.statistics.questions,1);
    assert.equal(scored.profile.statistics.input,1);
    assert.deepEqual(Object.keys(scored.profile.bySkill),[c.skillId]);
    assert.equal(scored.profile.bySkill[c.skillId].correct,0);
    assert.equal(scored.profile.pending[targetKey(c)].failures,1);
    assert.equal(scored.profile.session.result.optionId,wrong.id);
    assert.deepEqual(parseProfile(scored.profile,cards),scored.profile);
    const duplicate=grade(scored.profile,c,{questionId:p.session.questionId,answer:'自动词',cards});
    assert.equal(duplicate.duplicate,true);
    assert.deepEqual(duplicate.profile,scored.profile);
  });
});
