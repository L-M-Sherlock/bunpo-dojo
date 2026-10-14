import test from 'node:test';
import assert from 'node:assert/strict';
import {hasUnresolvedRuby,usageSentenceParts} from '../src/lib/sentence-parts.mjs';
import {createStatisticsClock} from '../src/lib/statistics-clock.mjs';
import {validateCards} from '../src/lib/content-validation.mjs';
import cards from '../src/data/cards.json' with {type:'json'};
test('Japanese reading anchors align reviewed ambiguous phrases by word',()=>{
  assert.deepEqual(usageSentenceParts({text:'母は来週、眼科',reading:'はははらいしゅう、がんか'}),[
    {text:'母',reading:'はは'},{text:'は'},{text:'来週',reading:'らいしゅう'},{text:'、'},{text:'眼科',reading:'がんか'}]);
  assert.deepEqual(usageSentenceParts({text:'前の表',reading:'まえのひょう'}),[{text:'前',reading:'まえ'},{text:'の'},{text:'表',reading:'ひょう'}]);
});
test('an unreviewed ambiguous phrase never spreads one reading across the whole clause',()=>{
  const part={text:'昨日の部屋',reading:'きのうのへや'};
  assert.equal(hasUnresolvedRuby(part),true);
  assert.deepEqual(usageSentenceParts(part),[{text:'昨日の部屋'}]);
});
test('every active authored phrase has a safe reading alignment',()=>{
  for(const card of cards)for(const field of ['before','after'])for(const part of card[field]??[])assert.equal(hasUnresolvedRuby(part),false,`${card.id}/${field}: ${part.text}`);
});
test('the entire active catalog satisfies the frozen structural requirements',()=>{assert.deepEqual(validateCards(cards),[]);});
test('the inherited active clock pauses outside practice and after idle without changing evidence',()=>{let t=0;const wall=()=>new Date(2026,9,13,12,0,0,t),clock=createStatisticsClock({now:()=>t,wall});clock.setContext({enabled:true,answering:true,domain:'particles',courseId:'location'});t=1000;assert.equal(clock.answerDuration(),1000);clock.setContext({enabled:false});t=6000;assert.equal(clock.answerDuration(),1000);clock.setContext({enabled:true,answering:false});t=80000;const fragments=clock.drain();assert.equal(fragments.reduce((sum,f)=>sum+f.ms,0),61000);assert.equal(clock.answerDuration(),1000);});
