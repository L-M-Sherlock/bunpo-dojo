import assert from 'node:assert/strict';
import {beforeEach,afterEach,after,test} from 'node:test';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {createElement} from 'react';
import cards from '../src/data/cards.json' with {type:'json'};
import {newProfile,startSession,STORAGE_KEY,targetKey,exportProfile} from '../src/lib/engine.mjs';
import {trackingSkillIdForCard} from '../src/lib/catalog.mjs';
import {orderedOptions} from '../src/lib/option-order.mjs';
import {withVerbRoleCatalog,withPotentialRoleCatalog} from './fixtures/verb-role.mjs';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/bunpo-dojo/',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLButtonElement','StorageEvent','location','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
for(const key of ['requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
globalThis.innerHeight=768;globalThis.IS_REACT_ACT_ENVIRONMENT=true;HTMLElement.prototype.scrollIntoView=()=>{};
let confirmResult=true,confirmCalls=0;dom.window.confirm=()=>{confirmCalls++;return confirmResult;};
let lockTail=Promise.resolve();Object.defineProperty(navigator,'locks',{configurable:true,value:{request:(_key,fn)=>{const job=lockTail.then(fn);lockTail=job.catch(()=>{});return job;}}});
const {render,cleanup,fireEvent,waitFor,act}=await import('@testing-library/react');
const file=new URL('../src/App.tsx',import.meta.url);
const compiled=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace(/from ["']([^"']+)["']/g,(_match,spec)=>`from ${JSON.stringify(spec.startsWith('.')?new URL(spec,file).href:import.meta.resolve(spec))}${spec.endsWith('.json')?' with {type:"json"}':''}`);
const {default:App}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const read=()=>JSON.parse(localStorage.getItem(STORAGE_KEY));
const seed=(course='location',mode='practice')=>{const p=startSession(newProfile(),cards,{mode,courses:[course]});localStorage.setItem(STORAGE_KEY,JSON.stringify(p));return p;};
const mount=cardPool=>render(createElement(App,cardPool?{cards:cardPool}:{}));
const optionButton=(view,card,option)=>view.container.querySelectorAll('.options button')[orderedOptions(card,read().session.questionId).findIndex(candidate=>candidate.id===option.id)];
const sentenceText=element=>{const copy=element.cloneNode(true);for(const rt of copy.querySelectorAll('rt'))rt.remove();return copy.textContent;};
const seedRole=(card,answerMode='choice')=>{window.history.replaceState(null,'','/bunpo-dojo/#/practice');const p=startSession(newProfile(),[card],{courses:['pairs'],answerMode});localStorage.setItem(STORAGE_KEY,JSON.stringify(p));return p;};
beforeEach(()=>{localStorage.clear();window.history.replaceState(null,'','/bunpo-dojo/');lockTail=Promise.resolve();confirmResult=true;confirmCalls=0;});
afterEach(()=>cleanup());after(()=>dom.window.close());

test('the real page accepts an answer once and records statistics with the result',async()=>{seed();const v=mount(),c=cards.find(c=>c.id===read().session.cardId),o=c.options.find(o=>c.answerIds.includes(o.id));fireEvent.click(optionButton(v,c,o));await waitFor(()=>assert.ok(v.getByRole('button',{name:/检查答案/}).disabled===false));fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.ok(v.getByText('与场景相符！')));assert.equal(read().originalCount,1);assert.equal(read().statistics.questions,1);assert.equal(read().events.length,1);assert.equal(read().bySkill[c.skillId].correct,1);});
test('help survives remount and cannot become an independent correct answer',async()=>{seed();let v=mount();fireEvent.click(v.getByRole('button',{name:'看一条提示'}));await waitFor(()=>assert.equal(read().session.hint,true));assert.equal(read().originalCount,0);cleanup();v=mount();assert.ok(v.getByText('已使用提示'));const c=cards.find(c=>c.id===read().session.cardId),o=c.options.find(o=>c.answerIds.includes(o.id));fireEvent.click(optionButton(v,c,o));await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.ok(v.getByText(/本次作为辅助练习记录/)));assert.equal(read().bySkill[c.skillId],undefined);assert.ok(read().pending[targetKey(c)]);});
test('statistics navigation preserves the unsubmitted input and ignores answer shortcuts',async()=>{seed();const v=mount();fireEvent.click(v.getByRole('button',{name:'输入',exact:true}));await waitFor(()=>assert.ok(v.getByRole('textbox',{name:'你的日语答案'})));fireEvent.change(v.getByRole('textbox',{name:'你的日语答案'}),{target:{value:'に'}});await waitFor(()=>assert.equal(read().session.answer,'に'));await act(async()=>{location.hash='/stats';fireEvent(window,new window.HashChangeEvent('hashchange'));});assert.ok(v.getByText('学习统计'));fireEvent.keyDown(window,{key:'Enter'});assert.equal(read().originalCount,0);await act(async()=>{location.hash='/practice';fireEvent(window,new window.HashChangeEvent('hashchange'));});assert.equal(v.getByRole('textbox',{name:'你的日语答案'}).value,'に');});
test('challenge has its own active navigation and hides the learning sidebar',()=>{seed('pairs','challenge');window.history.replaceState(null,'','/bunpo-dojo/#/challenge/play');const v=mount();assert.equal(v.container.querySelector('.practice-sidebar'),null);assert.equal(v.container.querySelector('.site-header a.active').textContent,'自由挑战');assert.equal(v.container.querySelector('progress'),null);});
test('IME Enter does not submit or double-score a Japanese input',async()=>{seed();const v=mount();fireEvent.click(v.getByRole('button',{name:'输入',exact:true}));await waitFor(()=>assert.ok(v.getByRole('textbox',{name:'你的日语答案'})));const input=v.getByRole('textbox',{name:'你的日语答案'});fireEvent.change(input,{target:{value:'に'}});await waitFor(()=>assert.equal(read().session.answer,'に'));fireEvent.keyDown(input,{key:'Enter',keyCode:229,isComposing:true});await act(async()=>{});assert.equal(read().originalCount,0);fireEvent.keyDown(input,{key:'Enter'});await waitFor(()=>assert.equal(read().originalCount,1));assert.equal(read().events.length,1);});
test('number keys follow a stable per-question shuffled order',async()=>{
  const c=cards.find(card=>card.courseId==='pairs'&&!card.exerciseType&&card.answerIds.length===1),correct=c.options.find(option=>c.answerIds.includes(option.id));let p=startSession(newProfile(),[c],{courses:['pairs']});
  p.session.cardId=c.id;p.session.questionId=['position-0','position-1'].find(id=>orderedOptions(c,id).findIndex(option=>option.id===correct.id)===1);localStorage.setItem(STORAGE_KEY,JSON.stringify(p));window.history.replaceState(null,'','/bunpo-dojo/#/practice');
  let v=mount([c]),before=[...v.container.querySelectorAll('.options button')].map(button=>button.textContent);assert.equal(optionButton(v,c,correct),v.container.querySelectorAll('.options button')[1]);
  cleanup();v=mount([c]);assert.deepEqual([...v.container.querySelectorAll('.options button')].map(button=>button.textContent),before);
  fireEvent.keyDown(window,{key:'2'});await waitFor(()=>assert.equal(read().session.answer,correct.text));fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.equal(read().session.result.correct,true));
});
test('the actual challenge page keeps rendering after its twenty-fifth answer',async()=>{seed('pairs','challenge');window.history.replaceState(null,'','/bunpo-dojo/#/challenge/play');const v=mount();for(let i=0;i<25;i++){const p=read(),c=cards.find(c=>c.id===p.session.cardId),o=c.options.find(o=>c.answerIds.includes(o.id));fireEvent.click(optionButton(v,c,o));await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.equal(read().session.answered,i+1));fireEvent.click(v.getByRole('button',{name:'下一题 Enter →',exact:true}));await waitFor(()=>assert.notEqual(read().session.questionId,p.session.questionId));}assert.equal(read().session.finished,false);assert.equal(read().originalCount,25);assert.ok(v.getByText('第 26 题 · 已答 25 题'));});
test('returning to practice from a challenge creates a regular session and correct navigation',async()=>{seed('pairs','challenge');window.history.replaceState(null,'','/bunpo-dojo/#/challenge/play');const v=mount();fireEvent.click(v.getByRole('link',{name:'练习',exact:true}));await waitFor(()=>assert.equal(read().session.mode,'practice'));await waitFor(()=>assert.equal(v.container.querySelector('.site-header a.active').textContent,'练习'));assert.deepEqual(read().session.courses,['location','movement','relations','pairs']);assert.ok(v.container.querySelector('.practice-sidebar'));});
test('all course pickers show pairs last and keep all five courses visible',()=>{
  const titles=['存在与活动地点','移动与路径','时间与其他关系','综合用法辨析','自动词与他动词'];
  for(const [route,selector,attribute,active]of [
    ['/practice','.landing-courses strong',null,false],
    ['/practice','.practice-sidebar nav button',null,true],
    ['/challenge','.course-option','aria-label',false],
    ['/library','.library-course h2',null,false],
  ]){
    cleanup();localStorage.clear();if(active)seed();window.history.replaceState(null,'',`/bunpo-dojo/#${route}`);
    const v=mount(),actual=[...v.container.querySelectorAll(selector)].map(e=>attribute?e.getAttribute(attribute):e.firstChild.textContent);
    assert.deepEqual(actual,titles,route);
  }
});
test('the header exposes the public GitHub repository in a new tab',()=>{
  const v=mount(),link=v.getByRole('link',{name:'GitHub 源代码（新标签页打开）'});
  assert.equal(link.getAttribute('href'),'https://github.com/L-M-Sherlock/bunpo-dojo');
  assert.equal(link.getAttribute('target'),'_blank');
  assert.equal(link.getAttribute('rel'),'noopener noreferrer');
  assert.equal(link.textContent,'GitHub ↗');
});
test('home and sidebar adaptive starts include the complete pairs course',async()=>{
  const v=mount();fireEvent.click(v.getByRole('button',{name:'开始自适应练习 →',exact:true}));
  await waitFor(()=>assert.deepEqual(read().session.courses,['location','movement','relations','pairs']));
  const old=read().session.questionId;fireEvent.click(v.getByRole('button',{name:/^自适应练习 按当前掌握度继续/}));
  await waitFor(()=>assert.notEqual(read().session.questionId,old));
  assert.deepEqual(read().session.courses,['location','movement','relations','pairs']);
});
test('corrupt local data stays untouched until an explicit valid backup import recovers the page',async()=>{localStorage.setItem(STORAGE_KEY,'{broken');window.history.replaceState(null,'','/bunpo-dojo/#/stats');const v=mount();assert.equal(localStorage.getItem(STORAGE_KEY),'{broken');assert.ok(v.getByRole('button',{name:'导出原始本地数据'}));assert.equal(v.getByRole('button',{name:'导入进度'}).disabled,false);const backup=exportProfile(newProfile());fireEvent.change(v.container.querySelector('input[type="file"]'),{target:{files:[{name:'synthetic.json',text:async()=>backup}]}});await waitFor(()=>assert.equal(read().version,1));await waitFor(()=>assert.ok(v.getByText('备份已导入，统计与待复测已恢复。')));assert.equal(v.queryByRole('button',{name:'导出原始本地数据'}),null);});

test('an invalid import is rejected before asking to overwrite progress',async()=>{
  seed();window.history.replaceState(null,'','/bunpo-dojo/#/stats');const before=localStorage.getItem(STORAGE_KEY),v=mount();
  fireEvent.change(v.container.querySelector('input[type="file"]'),{target:{files:[{name:'invalid.json',text:async()=>'{bad'}]}});
  await waitFor(()=>assert.ok(v.getByText(/Expected property name|备份无法读取/)));assert.equal(confirmCalls,0);assert.equal(localStorage.getItem(STORAGE_KEY),before);
});

test('a valid import requires confirmation and cancellation preserves the active profile',async()=>{
  seed();window.history.replaceState(null,'','/bunpo-dojo/#/stats');const before=localStorage.getItem(STORAGE_KEY),v=mount(),backup=exportProfile(newProfile());confirmResult=false;
  fireEvent.change(v.container.querySelector('input[type="file"]'),{target:{files:[{name:'cancel.json',text:async()=>backup}]}});
  await waitFor(()=>assert.ok(v.getByText('已取消导入，当前进度没有改变。')));assert.equal(confirmCalls,1);assert.equal(localStorage.getItem(STORAGE_KEY),before);assert.equal(location.hash,'#/stats');
});

test('practice states why the current question appears and labels the round as a maximum',()=>{
  seed();const v=mount();assert.ok(v.getByText('补齐达标'));assert.ok(v.getByText('当前目标尚未达标，优先补足独立作答、场景与必要覆盖。'));assert.ok(v.getByText('第 1 题 / 最多 12 题'));
  const reason=v.container.querySelector('.selection-reason');assert.equal(reason.getAttribute('role'),'status');assert.equal(reason.getAttribute('aria-live'),'polite');
});

test('the course library makes categories gating and concrete pairs a non-gating example pool',()=>{
  window.history.replaceState(null,'','/bunpo-dojo/#/library');const v=mount(),title=v.getByText('開く / 開ける'),row=title.closest('.pair-example-row');assert.ok(row);
  assert.match(row.textContent,/可作为本类例词练习/);assert.equal(row.querySelector('progress'),null);assert.equal(/达标还需/.test(row.textContent),false);
  const group=v.getByText('自动 -u（五段）／ 他动 -eru（一段）').closest('.pair-group'),progress=group.querySelector('.pair-category-progress');assert.match(progress.textContent,/代表词对 0\/3 · 独立作答 0\/5 · 自动词待覆盖 · 他动词待覆盖/);assert.match(progress.textContent,/达标还需：独立作答 5 次 · 答对 3 个新场景 · 覆盖 3 组新代表词对 · 答对自动词场景 · 答对他动词场景/);assert.equal(/intransitive|transitive|context/.test(progress.textContent),false);assert.equal(progress.querySelector('progress').getAttribute('aria-label'),'自动 -u（五段）／ 他动 -eru（一段）掌握进度');
});

test('the pair course renders the source categories and labels pair questions with their category',async()=>{
  window.history.replaceState(null,'','/bunpo-dojo/#/library');let v=mount();assert.equal(v.container.querySelectorAll('.pair-group').length,25);
  assert.equal(v.queryByText(/原文第 \d+ 类/),null);assert.ok(v.getByText('自动 -aru（五段）／ 他动 -eru（一段）'));assert.ok(v.getByText('自动词与他动词同形（均为五段）'));assert.equal(v.getAllByText('补充例词').length,7);assert.equal(v.getAllByText(/含补充例词 1 组/).length,4);assert.ok(v.getByText(/含补充例词 3 组/));
  const source=[...v.getAllByRole('link')].find(link=>link.textContent.includes('哈呀《日语自动词与他动词的所有对应形式》'));assert.ok(source);assert.equal(source.getAttribute('href'),'https://zhuanlan.zhihu.com/p/58662766');
  cleanup();localStorage.clear();window.history.replaceState(null,'','/bunpo-dojo/#/practice');seed('pairs');v=mount();assert.ok(v.getByText(/自他词形 · 自动 -aru（五段）／ 他动 -eru（一段）/));
  cleanup();localStorage.clear();const supplemental=cards.find(card=>card.skillId==='verb.find'),profile=startSession(newProfile(),[supplemental],{courses:['pairs']});localStorage.setItem(STORAGE_KEY,JSON.stringify(profile));v=mount([supplemental]);assert.ok(v.getByText(/自他词形 · 自动 -aru（五段）／ 他动 -eru（一段） · 补充例词/));
});

test('a safe lexical typo stays editable and does not create a score or retest',async()=>{
  const c=cards.find(card=>card.id==='verb.refbea.01');seedRole(c,'input');const v=mount([c]),input=v.getByRole('textbox',{name:'你的日语答案'});
  fireEvent.change(input,{target:{value:'かだむきました'}});fireEvent.click(v.getByRole('button',{name:/检查答案/}));
  await waitFor(()=>assert.ok(v.getByText('原词可能有一处输入笔误，请核对后重输；本题尚未计入题数或成绩。')));assert.equal(read().originalCount,0);assert.equal(read().session.result,null);assert.deepEqual(read().pending,{});assert.equal(input.disabled,false);
  fireEvent.change(input,{target:{value:'かたむきました'}});await waitFor(()=>assert.equal(v.queryByText(/原词可能有一处输入笔误/),null));fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.equal(read().originalCount,1));assert.equal(read().session.result.correct,true);
});

test('a successful import clears a transient typo notice from the previous session',async()=>{
  const c=cards.find(card=>card.id==='verb.refbea.01');seedRole(c,'input');const v=mount([c]),input=v.getByRole('textbox',{name:'你的日语答案'});
  fireEvent.change(input,{target:{value:'かだむきました'}});fireEvent.click(v.getByRole('button',{name:/检查答案/}));await waitFor(()=>assert.ok(v.getByText(/原词可能有一处输入笔误/)));
  await act(async()=>{location.hash='/stats';fireEvent(window,new window.HashChangeEvent('hashchange'));});const replacement=startSession(newProfile(),[c],{courses:['pairs'],answerMode:'input'});
  fireEvent.change(v.container.querySelector('input[type="file"]'),{target:{files:[{name:'replacement.json',text:async()=>exportProfile(replacement)}]}});
  await waitFor(()=>assert.equal(location.hash,'#/practice'));assert.equal(v.queryByText(/原词可能有一处输入笔误/),null);assert.equal(read().originalCount,0);
});

test('verb-role presents a full Japanese sentence and Chinese category options, including wrong-role feedback',async()=>{
  await withVerbRoleCatalog(async synthetic=>{
    const c=synthetic[0];seedRole(c);const v=mount([c]),expected=c.before.map(p=>p.text).join('');
    assert.ok(v.getByRole('heading',{name:'句中这个动词是自动词还是他动词？'}));
    assert.equal(sentenceText(v.container.querySelector('.contrast-title [lang="ja"]')),'開く');
    assert.equal(v.container.querySelector('.contrast-title rt').textContent,'ひら');
    assert.equal(sentenceText(v.container.querySelector('.sentence')),expected);
    assert.equal(v.container.querySelector('.sentence').lang,'ja');
    assert.equal(v.container.querySelector('.sentence-blank'),null);
    assert.ok(v.getByRole('group',{name:'动词类别'}));
    for(const button of v.container.querySelectorAll('.options button')){
      assert.equal(button.querySelector('[lang="ja"]'),null);
      assert.equal(button.closest('[lang="ja"]'),null);
      assert.equal(button.querySelector('ruby'),null);
    }
    fireEvent.click(optionButton(v,c,c.options.find(option=>option.id==='transitive')));
    await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));
    fireEvent.click(v.getByRole('button',{name:/检查答案/}));
    await waitFor(()=>assert.ok(v.getByText('再看看这个动词在句中的角色')));
    assert.equal(read().session.result.kind,'meaning-mismatch');
    assert.equal(read().originalCount,1);
    assert.equal(sentenceText(v.container.querySelector('.feedback .sentence')),expected);
    assert.equal(v.container.querySelector('.feedback .sentence-blank'),null);
    assert.equal(v.queryByText('这个表达说的是另一件事'),null);
    assert.ok(v.getByText('查看自他类别的判断依据'));
    for(const label of v.container.querySelectorAll('.feedback details b'))assert.equal(label.lang,'');
  });
});

test('verb-role input accepts each Chinese category and displays category feedback with consistent full sentences',async()=>{
  await withVerbRoleCatalog(async synthetic=>{
    for(const c of synthetic){
      cleanup();localStorage.clear();seedRole(c,'input');const v=mount([c]),expected=c.before.map(p=>p.text).join('');
      const input=v.getByRole('textbox',{name:'你的自他类别答案'});
      assert.equal(input.lang,'');assert.equal(input.placeholder,'输入自动词或他动词……');
      assert.ok(v.getByText('请填写“自动词”或“他动词”。'));
      fireEvent.change(input,{target:{value:c.options.find(o=>c.answerIds.includes(o.id)).text}});
      await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));
      fireEvent.click(v.getByRole('button',{name:/检查答案/}));
      await waitFor(()=>assert.ok(v.getByText('自他类别判断正确！')));
      assert.equal(read().statistics.input,1);assert.equal(read().statistics.correct,1);
      for(const sentence of v.container.querySelectorAll('.sentence'))assert.equal(sentenceText(sentence),expected);
      await act(async()=>{location.hash='/stats';fireEvent(window,new window.HashChangeEvent('hashchange'));});
      assert.equal(v.container.querySelector('.log-list details p span').lang,'');
    }
  });
});

test('verb-role unknown input asks for a category and keeps hint assistance when revealed',async()=>{
  await withVerbRoleCatalog(async synthetic=>{
    const c=synthetic[0];seedRole(c,'input');let v=mount([c]);
    fireEvent.change(v.getByRole('textbox',{name:'你的自他类别答案'}),{target:{value:'開く'}});
    await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));
    fireEvent.click(v.getByRole('button',{name:/检查答案/}));
    await waitFor(()=>assert.ok(v.getByText('输入未匹配本题的自他类别。请填写“自动词”或“他动词”，并对照完整句中的角色。')));
    assert.equal(read().session.result.kind,'unknown');
    assert.equal(read().bySkill[c.skillId],undefined);
    cleanup();localStorage.clear();seedRole(c);v=mount([c]);
    fireEvent.click(v.getByRole('button',{name:'看一条提示'}));
    await waitFor(()=>assert.ok(v.getByText(c.hint)));
    fireEvent.click(v.getByRole('button',{name:'不知道'}));
    await waitFor(()=>assert.equal(read().session.result.kind,'revealed'));
    assert.equal(read().session.result.independent,false);
    assert.equal(sentenceText(v.container.querySelector('.feedback .sentence')),c.before[0].text);
    assert.ok(v.getByText(/本次作为辅助练习记录/));
  });
});

test('a potential-form ambiguous pair reuses the real category UI with its direction-specific lemma',async()=>{
  await withPotentialRoleCatalog(async synthetic=>{
    const c=synthetic[1];seedRole(c);const v=mount([c]),expected=c.before[0].text;
    assert.equal(sentenceText(v.container.querySelector('.contrast-title [lang="ja"]')),'弾く');
    assert.equal(v.container.querySelector('.contrast-title rt').textContent,'はじ');
    assert.equal(sentenceText(v.container.querySelector('.sentence')),expected);
    assert.ok(expected.includes('弾いた'));assert.equal(v.container.querySelector('.sentence-blank'),null);
    assert.deepEqual([...v.container.querySelectorAll('.options button span')].map(e=>e.textContent).sort(),['他动词','自动词'].sort());
    fireEvent.click(optionButton(v,c,c.options.find(option=>option.id==='transitive')));
    await waitFor(()=>assert.equal(v.getByRole('button',{name:/检查答案/}).disabled,false));
    fireEvent.click(v.getByRole('button',{name:/检查答案/}));
    await waitFor(()=>assert.ok(v.getByText('自他类别判断正确！')));
    assert.equal(read().bySkill[trackingSkillIdForCard(c)].correct,1);
    assert.equal(sentenceText(v.container.querySelector('.feedback .sentence')),expected);
    assert.equal(read().session.result.optionId,'transitive');
  });
});
