import test from 'node:test';
import assert from 'node:assert/strict';
import {hasUnresolvedRuby,rubyLayoutMetadata,usageSentenceParts} from '../src/lib/sentence-parts.mjs';
import {createStatisticsClock} from '../src/lib/statistics-clock.mjs';
import {validateCards} from '../src/lib/content-validation.mjs';
import cards from '../src/data/cards.json' with {type:'json'};
test('Japanese reading anchors align reviewed ambiguous phrases by word',()=>{
  assert.deepEqual(usageSentenceParts({text:'母は来週、眼科',reading:'はははらいしゅう、がんか'}),[
    {text:'母',reading:'はは'},{text:'は'},{text:'来週',reading:'らいしゅう'},{text:'、'},{text:'眼科',reading:'がんか'}]);
});
test('an unreviewed ambiguous phrase never spreads one reading across the whole clause',()=>{
  const part={text:'昨日の部屋',reading:'きのうのへや'};
  assert.equal(hasUnresolvedRuby(part),true);
  assert.deepEqual(usageSentenceParts(part),[{text:'昨日の部屋'}]);
});
test('ruby layouts keep word boundaries, counters and okurigana explicit',()=>{
  assert.deepEqual(usageSentenceParts({text:'児童館の読み聞かせ会は、土曜日の午後三時',reading:'じどうかんのよみきかせかいは、どようびのごごさんじ'}),[
    {text:'児童館',reading:'じどうかん'},{text:'の'},{text:'読',reading:'よ'},{text:'み'},{text:'聞',reading:'き'},{text:'かせ'},{text:'会',reading:'かい'},{text:'は、'},{text:'土曜日',reading:'どようび'},{text:'の'},{text:'午後',reading:'ごご'},{text:'三時',reading:'さんじ'}]);
  const time=usageSentenceParts({text:'工場見学の送迎バスは、金曜日の午前八時四十五分',reading:'こうじょうけんがくのそうげいバスは、きんようびのごぜんはちじよんじゅうごふん'});
  assert.deepEqual(time.slice(-3),[{text:'午前',reading:'ごぜん'},{text:'八時',reading:'はちじ'},{text:'四十五分',reading:'よんじゅうごふん'}]);
  const date=usageSentenceParts({text:'野外上映会は六月二十日',reading:'やがいじょうえいかいはろくがつはつか'});
  assert.deepEqual(date.slice(-2),[{text:'六月',reading:'ろくがつ'},{text:'二十日',reading:'はつか'}]);
});
test('reviewed compound layouts never leave broken small-kana ruby fragments',()=>{
  const quartet=usageSentenceParts({text:'アンコールでは、客演のクラリネット奏者が弦楽四重奏に',reading:'アンコールでは、きゃくえんのクラリネットそうしゃがげんがくしじゅうそうに'});
  assert.ok(quartet.some(part=>part.text==='四重奏'&&part.reading==='しじゅうそう'));
  assert.equal(quartet.some(part=>part.reading==='ゅ'),false);
  const fiber=usageSentenceParts({text:'通信会社の点検が終わり、切れていた光回線が夕方に再び',reading:'つうしんがいしゃのてんけんがおわり、きれていたひかりかいせんがゆうがたにふたたび'});
  assert.ok(fiber.some(part=>part.text==='光回線'&&part.reading==='ひかりかいせん'));
});
test('moving leading sentence punctuation beside the answer keeps the reviewed ruby layout',()=>{
  const punctuation=/^[。、！？!?」』）]+/u,kanji=/[\u3400-\u9fff々〇]/u;
  let checked=0;
  for(const card of cards){
    if(card.exerciseType==='verb-role')continue;
    const part=card.after[0],prefix=part?.text.match(punctuation)?.[0]??'';
    if(!part?.reading||!prefix||!kanji.test(part.text))continue;
    const rendered=usageSentenceParts(part,{omitLeadingPunctuation:true});
    assert.equal(rendered.map(item=>item.text).join(''),part.text.slice(prefix.length),card.id);
    assert.ok(rendered.some(item=>item.reading),`${card.id} should retain ruby after moving punctuation`);
    checked++;
  }
  assert.equal(checked,15);
});
test('every active authored phrase has a safe reading alignment',()=>{
  assert.deepEqual(rubyLayoutMetadata,{version:1,policy:'word-boundary-ruby',cards:858,count:1558,generator:{sudachipy:'0.6.10',sudachidictCore:'20250825'}});
  for(const card of cards){
    const parts=[...card.before,...card.after,...(card.exerciseType==='verb-role'?(card.focusVerb?[card.focusVerb]:[]):card.options)];
    for(const part of parts)assert.equal(hasUnresolvedRuby(part),false,`${card.id}: ${part.text}`);
  }
});
test('the entire active catalog satisfies the frozen structural requirements',()=>{assert.deepEqual(validateCards(cards),[]);});
test('the inherited active clock pauses outside practice and after idle without changing evidence',()=>{let t=0;const wall=()=>new Date(2026,9,13,12,0,0,t),clock=createStatisticsClock({now:()=>t,wall});clock.setContext({enabled:true,answering:true,domain:'particles',courseId:'location'});t=1000;assert.equal(clock.answerDuration(),1000);clock.setContext({enabled:false});t=6000;assert.equal(clock.answerDuration(),1000);clock.setContext({enabled:true,answering:false});t=80000;const fragments=clock.drain();assert.equal(fragments.reduce((sum,f)=>sum+f.ms,0),61000);assert.equal(clock.answerDuration(),1000);});
