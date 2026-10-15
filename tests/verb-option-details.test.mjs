import assert from 'node:assert/strict';
import test from 'node:test';
import cards from '../src/data/cards.json' with {type:'json'};
import {optionVerbDetails} from '../src/lib/verb-option-details.mjs';

const detail=(id,text)=>{const card=cards.find(card=>card.id===id);return optionVerbDetails(card,card.options.find(option=>option.text===text));};
test('every pair option has a dictionary form independent of option order or verdict',()=>{
  let count=0;
  for(const card of cards.filter(card=>card.courseId==='pairs'))for(const option of card.options){
    const expected=optionVerbDetails(card,option);
    assert.ok(expected,`${card.id}/${option.text}`);
    assert.ok(expected.lemma.text&&expected.lemma.reading);
    assert.deepEqual(optionVerbDetails({...card,options:[...card.options].reverse(),answerIds:[]},{...option,verdict:'correct'}),expected);
    count++;
  }
  assert.equal(count,1416);
});
test('intransitive and transitive explanations both name the correct lemma',()=>{
  assert.deepEqual(detail('verb.reftca.02','塞がった'),{lemma:{text:'塞がる',reading:'ふさがる'},label:'自动词'});
  assert.deepEqual(detail('verb.reftca.02','塞いだ'),{lemma:{text:'塞ぐ',reading:'ふさぐ'},label:'他动词'});
});
test('continuative stems, compounds, spelling variants and homograph readings retain their exact roots',()=>{
  assert.deepEqual(detail('verb.refbma.01','進め'),{lemma:{text:'進める',reading:'すすめる'},label:'他动词'});
  assert.deepEqual(detail('verb.refsia.03','泣かし続けた'),{lemma:{text:'泣かす',reading:'なかす'},label:'他动词'});
  assert.deepEqual(detail('verb.refwaa.02','なくし'),{lemma:{text:'無くす',reading:'なくす'},label:'他动词'});
  assert.deepEqual(detail('verb.refsba.01','驚かせた'),{lemma:{text:'驚かせる',reading:'おどろかせる'},label:'他动词'});
  assert.deepEqual(detail('verb.refica.02','汚れない'),{lemma:{text:'汚れる',reading:'けがれる'},label:'自动词'});
});
test('category questions keep the given lemma for both category explanations',()=>{
  for(const card of cards.filter(card=>card.exerciseType==='verb-role'))for(const option of card.options)assert.deepEqual(optionVerbDetails(card,option),{lemma:card.focusVerb,label:null});
});
test('particle options and unresolved verb forms never fabricate a lemma',()=>{
  const particle=cards.find(card=>card.courseId==='location');
  assert.equal(optionVerbDetails(particle,particle.options[0]),null);
  const card=cards.find(card=>card.id==='verb.reftca.02');
  assert.equal(optionVerbDetails(card,{text:'塞ぎましたかもしれない',reading:'ふさぎましたかもしれない'}),null);
});
