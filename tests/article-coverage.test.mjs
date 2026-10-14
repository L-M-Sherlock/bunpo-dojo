import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import before from '../content/versions/article-v2/cards.json' with {type:'json'};
import reference from '../content/references/haya-pairs.json' with {type:'json'};
import {SKILL_BY_ID,REQUIREMENT_BY_ID} from '../src/lib/catalog.mjs';
import {exportProfile,importProfile,newProfile,grade,targetKey} from '../src/lib/engine.mjs';

test('every article row and spelling sense has its declared pair and both reviewed directions',()=>{
  assert.equal(reference.groups,25);
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
