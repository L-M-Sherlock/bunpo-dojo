import test from 'node:test';
import assert from 'node:assert/strict';
import cards from '../src/data/cards.json' with {type:'json'};
import {orderedOptions} from '../src/lib/option-order.mjs';

test('option order is stable for one question and never mutates authored cards',()=>{
  for(const card of cards){
    const original=card.options.map(option=>option.id),first=orderedOptions(card,'stable-question').map(option=>option.id),second=orderedOptions(card,'stable-question').map(option=>option.id);
    assert.deepEqual(first,second,card.id);assert.deepEqual(card.options.map(option=>option.id),original,card.id);assert.deepEqual([...first].sort(),[...original].sort(),card.id);
  }
});

test('two consecutive deterministic seeds put every single correct answer in both positions',()=>{
  const single=cards.filter(card=>card.options.length===2&&card.answerIds.length===1);let firstPosition=0,total=0;
  for(const card of single){
    const positions=['position-0','position-1'].map(questionId=>orderedOptions(card,questionId).findIndex(option=>card.answerIds.includes(option.id))+1);
    assert.deepEqual([...positions].sort(),[1,2],card.id);firstPosition+=positions.filter(position=>position===1).length;total+=positions.length;
  }
  assert.equal(firstPosition/total,.5);assert.equal(single.length,827);
});
