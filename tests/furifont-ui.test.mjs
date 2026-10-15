import assert from 'node:assert/strict';
import {beforeEach,afterEach,after,test} from 'node:test';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {createElement} from 'react';
import cards from '../src/data/cards.json' with {type:'json'};
import verbRoleFocus from '../src/data/verb-role-focus.json' with {type:'json'};
import manifest from '../src/data/furifont-manifest.json' with {type:'json'};
import {newProfile,startSession,STORAGE_KEY} from '../src/lib/engine.mjs';
import {orderedOptions} from '../src/lib/option-order.mjs';
import {usageSentenceParts} from '../src/lib/sentence-parts.mjs';

const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/bunpo-dojo/',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','StorageEvent','location','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
for(const key of ['requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
globalThis.innerHeight=768;globalThis.IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollIntoView=()=>{};
let releaseLoad,faceLoads=0;
const addedFaces=new Set();
class LoadedFontFace{
  constructor(family,source,descriptors){this.family=family;this.source=source;this.descriptors=descriptors;this.status='unloaded';}
  load(){
    faceLoads++;
    this.status='loading';
    return new Promise(resolve=>{releaseLoad=()=>{this.status='loaded';resolve(this);};});
  }
}
Object.defineProperty(globalThis,'FontFace',{configurable:true,value:LoadedFontFace});
Object.defineProperty(window,'FontFace',{configurable:true,value:LoadedFontFace});
Object.defineProperty(document,'fonts',{configurable:true,value:{
  add:face=>addedFaces.add(face),
  check:()=>addedFaces.size>0&&[...addedFaces].every(face=>face.status==='loaded'),
  load:async()=>[...addedFaces].filter(face=>face.status==='loaded'),
}});
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const file=new URL('../src/App.tsx',import.meta.url);
const compiled=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ["']([^"']+)["']/g,(_match,spec)=>`from ${JSON.stringify(spec.startsWith('.')?new URL(spec,file).href:import.meta.resolve(spec))}${spec.endsWith('.json')?' with {type:"json"}':''}`);
const {default:App}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const read=()=>JSON.parse(localStorage.getItem(STORAGE_KEY));
const baseText=element=>{const copy=element.cloneNode(true);for(const rt of copy.querySelectorAll('rt'))rt.remove();return copy.textContent;};
const seed=card=>{
  window.history.replaceState(null,'','/bunpo-dojo/#/practice');
  localStorage.setItem(STORAGE_KEY,JSON.stringify(startSession(newProfile(),[card],{courses:[card.courseId]})));
};
const mount=card=>render(createElement(App,{cards:[card]}));
const optionButton=(view,card,option)=>view.container.querySelectorAll('.options button')[orderedOptions(card,read().session.questionId).findIndex(candidate=>candidate.id===option.id)];
const submit=async(view,card,option)=>{
  fireEvent.click(optionButton(view,card,option));
  await waitFor(()=>assert.equal(view.getByRole('button',{name:/检查答案/}).disabled,false));
  fireEvent.click(view.getByRole('button',{name:/检查答案/}));
  await waitFor(()=>assert.ok(view.container.querySelector('.feedback')));
};
const key=part=>`${part.text}\u0000${part.reading}`;
const mapping=new Map(manifest.entries.map(entry=>[key(entry),entry]));

beforeEach(()=>{localStorage.clear();window.history.replaceState(null,'','/bunpo-dojo/');});
afterEach(()=>cleanup());after(()=>dom.window.close());

const fontSpans=root=>[...root.querySelectorAll('span')].filter(span=>/\bsalt\b/u.test(span.style.fontFeatureSettings));
const assertMapped=(root,expectedParts)=>{
  const expected=expectedParts.flatMap(part=>usageSentenceParts(part)).filter(part=>part.reading);
  const actual=fontSpans(root);
  assert.equal(actual.length,expected.length);
  assert.equal(root.querySelector('ruby'),null);
  for(const [index,span] of actual.entries()){
    const part=expected[index],entry=mapping.get(key(part));
    assert.ok(entry,key(part));
    assert.equal(span.textContent,part.text,'font spans contain only the original Japanese text');
    assert.equal(span.childElementCount,0,'readings are drawn by the font, without hidden text copies');
    assert.match(span.style.fontFeatureSettings,new RegExp(`"salt"\\s+${entry.salt}(?:\\D|$)`));
    assert.match(span.style.fontFeatureSettings,/"rclt"\s+1/u);
  }
};

test('the page retains native ruby until the exact local font has loaded, then replaces all annotations',async()=>{
  const card=cards.find(card=>card.id==='particle.time.01');seed(card);const view=mount(card);
  const sentence=view.container.querySelector('.exercise-card .sentence'),initial=baseText(sentence);
  assert.ok(sentence.querySelector('ruby'));
  assert.equal(fontSpans(sentence).length,0);
  await waitFor(()=>assert.equal(typeof releaseLoad,'function'));
  await act(async()=>releaseLoad());
  await waitFor(()=>assert.ok(fontSpans(sentence).length));
  assert.equal(baseText(sentence),initial);
  assertMapped(sentence,[...card.before,...card.after]);
  assert.equal(faceLoads,1,'one font load serves all annotation components');
  const face=[...addedFaces][0];
  assert.equal(face.family,manifest.family);
  assert.ok(face.source.includes(`${manifest.fontUrl}?v=${manifest.metadata.font.sha256}`));
});

test('loaded font annotations toggle without altering the sentence, options or saved answer',async()=>{
  const card=cards.find(card=>card.id==='verb.reftca.02');seed(card);const view=mount(card);
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  const original=baseText(view.container.querySelector('.exercise-card .sentence'));
  for(const [index,option]of orderedOptions(card,read().session.questionId).entries())assertMapped(view.container.querySelectorAll('.options button')[index],[option]);
  fireEvent.click(view.getByRole('button',{name:'隐藏注音'}));
  await waitFor(()=>assert.equal(fontSpans(view.container).length,0));
  assert.equal(view.container.querySelector('ruby'),null);
  assert.equal(baseText(view.container.querySelector('.exercise-card .sentence')),original);
  assert.equal(read().session.answer,'');
  fireEvent.click(view.getByRole('button',{name:'显示注音'}));
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  assert.equal(baseText(view.container.querySelector('.exercise-card .sentence')),original);
});

test('font rendering preserves complete role highlights and the neighboring reviewed boundary',async()=>{
  const card=cards.find(card=>card.id==='verb.refbra.04');seed(card);const view=mount(card);
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  const sentence=view.container.querySelector('.exercise-card .sentence');
  assert.equal(sentence.textContent,card.before.map(part=>part.text).join(''));
  assert.equal([...sentence.querySelectorAll('.focus-verb')].map(node=>node.textContent).join(''),verbRoleFocus[card.id]);
  assertMapped(sentence,card.before);
  const focus=sentence.querySelector('.focus-verb');
  assert.equal(fontSpans(focus)[0].textContent,'縮');
  assert.equal(focus.previousElementSibling.textContent,'分');
  fireEvent.click(view.getByRole('button',{name:'隐藏注音'}));
  await waitFor(()=>assert.equal(fontSpans(sentence).length,0));
  assert.equal([...sentence.querySelectorAll('.focus-verb')].map(node=>node.textContent).join(''),'縮めた');
});

test('answering retains exact font readings for both option forms and their dictionary forms',async()=>{
  const card=cards.find(card=>card.id==='verb.reftca.02');seed(card);const view=mount(card);
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  await submit(view,card,card.options.find(option=>option.text==='塞がった'));
  const rows=[...view.container.querySelectorAll('.verb-option-explanation')];
  assert.equal(rows.length,2);
  for(const [form,lemma]of [['塞がった','塞がる'],['塞いだ','塞ぐ']]){
    const row=rows.find(row=>row.textContent.startsWith(`${form} ← ${lemma}`));
    assert.ok(row,form);
    assert.equal(fontSpans(row).length,2);
    for(const span of fontSpans(row)){
      assert.equal(span.textContent,'塞');
      assert.match(span.style.fontFeatureSettings,new RegExp(`"salt"\\s+${mapping.get('塞\u0000ふさ').salt}(?:\\D|$)`));
    }
  }
  const expected=card.before.map(part=>part.text).join('')+'塞いだ'+card.after.map(part=>part.text).join('');
  assert.equal(view.container.querySelector('.feedback .sentence').textContent,expected);
  assert.equal(view.container.querySelector('.feedback rt'),null);
});

test('leading punctuation moves beside a revealed answer without dropping later font annotations',async()=>{
  const card=cards.find(card=>card.id==='verb.refaaea.02');seed(card);const view=mount(card);
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  const before=view.container.querySelector('.exercise-card .sentence');
  assert.equal(before.querySelector('.sentence-slot').textContent,'、');
  assert.equal(before.textContent.endsWith('、テントを固定した。'),true);
  assert.ok(fontSpans(before).some(span=>span.textContent==='固定'));
  await submit(view,card,card.options.find(option=>card.answerIds.includes(option.id)));
  const sentence=view.container.querySelector('.feedback .sentence');
  assert.equal(sentence.textContent,card.before[0].text+'繋げて'+card.after[0].text);
  assert.equal(sentence.querySelector('.sentence-slot').textContent,'繋げて、');
  assert.ok(fontSpans(sentence).some(span=>span.textContent==='固定'));
  assert.equal(sentence.querySelector('ruby'),null);
});

test('adjacent 入場 and 案内 reserve only the measured annotation overhang without changing the sentence',async()=>{
  const card=cards.find(card=>card.id==='verb.refiha.04');seed(card);const view=mount(card);
  await waitFor(()=>assert.ok(fontSpans(view.container).length));
  const sentence=view.container.querySelector('.exercise-card .sentence');
  assertMapped(sentence,[...card.before,...card.after]);
  assert.equal(sentence.textContent,[...card.before,...card.after].map(part=>part.text).join(''));
  for(const [text,reading]of [['入場','にゅうじょう'],['案内','あんない']]){
    const span=fontSpans(sentence).find(span=>span.textContent===text),entry=mapping.get(`${text}\u0000${reading}`);
    assert.ok(span,`${text} remains font-backed`);
    assert.equal(span.dataset.reading,reading);
    for(const [side,property]of [['left','paddingInlineStart'],['right','paddingInlineEnd']]){
      const expected=entry.inkOverhangEm[side];
      if(text==='入場'){
        assert.ok(expected>0,`${text} ${side} must reserve the measured ink`);
        assert.equal(span.style[property],`${expected}em`);
      }else{
        assert.equal(expected,0);
        assert.equal(span.style[property],'',`${text} must not receive blanket padding`);
      }
    }
  }
});
