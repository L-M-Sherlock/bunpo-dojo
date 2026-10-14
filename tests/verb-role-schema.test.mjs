import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import cards from '../src/data/cards.json' with {type:'json'};
import {REQUIREMENT_BY_ID,SKILL_BY_ID} from '../src/lib/catalog.mjs';
import {fullSentences,readingAnchorIssues,validateCards} from '../src/lib/content-validation.mjs';
import {potentialRolePair,withPotentialRoleCatalog,roleCard,rolePair,withVerbRoleCatalog} from './fixtures/verb-role.mjs';

const issue=(card,pattern)=>assert.ok(validateCards([card]).some(error=>pattern.test(error)),JSON.stringify(validateCards([card])));
const replaceRequirement=(card,changes)=>REQUIREMENT_BY_ID.set(card.id,{...REQUIREMENT_BY_ID.get(card.id),...changes});

test('same-form role exercises validate both frozen directions and restore synthetic catalog entries',async()=>{
  const oldSkill=SKILL_BY_ID.get(rolePair.id),oldRequirement=REQUIREMENT_BY_ID.get(roleCard().id);
  await withVerbRoleCatalog(roleCards=>{
    assert.deepEqual(validateCards(roleCards),[]);
    assert.deepEqual(readingAnchorIssues(roleCards),[]);
  });
  assert.equal(SKILL_BY_ID.get(rolePair.id),oldSkill);
  assert.equal(REQUIREMENT_BY_ID.get(roleCard().id),oldRequirement);
});

test('role exercises are limited to the frozen verbs module and pairs course',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const [module,courseId]of [['particles','pairs'],['verbs','location'],['mixed','pairs']]){
      const card=roleCard();card.module=module;card.courseId=courseId;
      replaceRequirement(card,{module,courseId});
      issue(card,/仅适用于verbs模块的pairs课程/u);
    }
  });
});

test('role scope accepts different-form pairs with the lemma and reading from each frozen direction',async()=>{
  await withPotentialRoleCatalog(roleCards=>{
    assert.notEqual(potentialRolePair.intransitive,potentialRolePair.transitive);
    assert.notEqual(potentialRolePair.intransitiveReading,potentialRolePair.transitiveReading);
    assert.deepEqual(validateCards(roleCards),[]);
    assert.deepEqual(readingAnchorIssues(roleCards),[]);
    for(const card of roleCards){
      const direction=REQUIREMENT_BY_ID.get(card.id).direction;
      assert.deepEqual(card.focusVerb,{text:potentialRolePair[direction],reading:potentialRolePair[`${direction}Reading`]});
    }
  });
});

test('role scope accepts homographs with different readings when focusVerb follows the frozen direction',async()=>{
  await withVerbRoleCatalog(roleCards=>{
    const pair={...rolePair,intransitiveReading:'あく'},originalSkill=SKILL_BY_ID.get(rolePair.id);
    SKILL_BY_ID.set(rolePair.id,{...originalSkill,...pair});
    for(const card of roleCards){
      replaceRequirement(card,{pair:{...pair}});
      const direction=REQUIREMENT_BY_ID.get(card.id).direction;
      card.focusVerb={text:pair[direction],reading:pair[`${direction}Reading`]};
      assert.deepEqual(validateCards([card]),[]);
      card.focusVerb.reading=pair[`${direction==='intransitive'?'transitive':'intransitive'}Reading`];
      issue(card,/focusVerb与冻结direction对应/u);
    }
  });
});

test('role scope rejects missing lemma readings and absent target skills',async()=>{
  await withVerbRoleCatalog(()=>{
    const card=roleCard(),originalSkill=SKILL_BY_ID.get(rolePair.id);
    for(const change of [{intransitive:''},{transitive:''},{transitiveReading:undefined},{intransitiveReading:''}]){
      const skill={...originalSkill,...change};SKILL_BY_ID.set(rolePair.id,skill);
      replaceRequirement(card,{pair:{...rolePair,...change}});
      issue(card,/文字与读音必须与技能一致/u);
    }
    SKILL_BY_ID.delete(rolePair.id);
    replaceRequirement(card,{pair:{...rolePair}});
    issue(card,/文字与读音必须与技能一致/u);
  });
});

test('role scope binds the requirement pair to the catalog skill instead of trusting card fields',async()=>{
  await withVerbRoleCatalog(()=>{
    const card=roleCard();
    for(const pair of [undefined,{...rolePair,id:'verb.unrelated'},
      {...rolePair,intransitive:'閉じる',transitive:'閉じる',intransitiveReading:'とじる',transitiveReading:'とじる'},
      {...rolePair,transitive:'開ける'},{...rolePair,transitiveReading:'あく'},
      {...rolePair,transitiveReading:undefined}]){
      replaceRequirement(card,{pair});issue(card,/文字与读音必须与技能一致/u);
    }
  });
});

test('role scope retains the catalog skill id and course boundaries',async()=>{
  await withVerbRoleCatalog(()=>{
    const card=roleCard(),originalSkill=SKILL_BY_ID.get(rolePair.id);
    for(const change of [{id:'verb.unrelated'},{courseId:'location'}]){
      SKILL_BY_ID.set(rolePair.id,{...originalSkill,...change});issue(card,/文字与读音必须与技能一致/u);
    }
  });
});

test('role focusVerb requires an exact text and reading object for the frozen directional target',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const focusVerb of [undefined,null,'開く',[],{},
      {text:'',reading:'ひらく'},{text:'開く',reading:' '},
      {text:'開いた',reading:'ひらいた'},{text:'開く',reading:'あく'}]){
      const card=roleCard();card.focusVerb=focusVerb;
      issue(card,/focusVerb/u);
    }
  });
});

test('different-form role focusVerb rejects the opposite lemma and its reading',async()=>{
  await withPotentialRoleCatalog(roleCards=>{
    for(const card of roleCards){
      const direction=REQUIREMENT_BY_ID.get(card.id).direction,opposite=direction==='intransitive'?'transitive':'intransitive';
      const focus={...card.focusVerb};
      for(const focusVerb of [
        {text:potentialRolePair[opposite],reading:potentialRolePair[`${opposite}Reading`]},
        {text:focus.text,reading:potentialRolePair[`${opposite}Reading`]},
        {text:potentialRolePair[opposite],reading:focus.reading},
      ]){
        card.focusVerb=focusVerb;issue(card,/focusVerb与冻结direction对应/u);
      }
    }
  });
});

test('missing exerciseType retains ordinary cards while every unknown exerciseType is rejected',()=>{
  const ordinary=structuredClone(cards.find(card=>card.courseId==='location'));
  assert.equal(ordinary.exerciseType,undefined);
  assert.deepEqual(validateCards([ordinary]),[]);
  for(const exerciseType of ['cloze','',null,7])issue({...ordinary,exerciseType},/未知exerciseType/u);
});

test('role before must contain text and malformed sentence parts return errors without throwing',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const before of [[],[{text:''}],[{text:'  '}],null,{},[null],[{text:17}]]){
      const card=roleCard();card.before=before;
      issue(card,/before必须包含完整句/u);
    }
    const card=roleCard();card.after=null;issue(card,/after必须为数组/u);
    card.after=[];assert.deepEqual(validateCards([card]),[]);
  });
});

test('role sentence parts keep the existing kanji readings and no-extra-blank rules',async()=>{
  await withVerbRoleCatalog(()=>{
    const card=roleCard();delete card.before[0].reading;issue(card,/汉字reading/u);
    card.before=[{text:'花が【】。',reading:'はなが【】。'}];issue(card,/额外空格标记/u);
    card.before=[{text:'はながひらきました。'}];assert.deepEqual(validateCards([card]),[]);
  });
});

test('role choices must be exactly one 自动词 and one 他动词 category',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const mutate of [
      card=>card.options.pop(),
      card=>card.options.push({...card.options[1],id:'extra',text:'其他'}),
      card=>card.options[1].text='自动词',
      card=>card.options[0].text='自動詞',
      card=>card.options[0].text='開く',
      card=>card.options[0].text='toString',
      card=>card.options[0]=null,
    ]){
      const card=roleCard();mutate(card);issue(card,/必须只提供自动词和他动词/u);
    }
  });
});

test('role choice readings accept the corresponding Japanese reading or Chinese category text',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const readings of [['じどうし','たどうし'],['自动词','他动词'],['じどうし','他动词'],['自动词','たどうし']]){
      const card=roleCard();card.options.forEach((option,index)=>option.reading=readings[index]);
      assert.deepEqual(validateCards([card]),[]);
    }
    for(const [index,reading]of [[0,'たどうし'],[1,'じどうし'],[0,'他动词'],[1,'自动词'],[0,'じどう'],[1,'']]){
      const card=roleCard();card.options[index].reading=reading;issue(card,/类别reading与候选不符/u);
    }
  });
});

test('role answers must match the frozen direction even when their verdict set is internally consistent',async()=>{
  await withVerbRoleCatalog(()=>{
    for(const direction of ['intransitive','transitive']){
      const card=roleCard(direction),opposite=direction==='intransitive'?'transitive':'intransitive';
      card.options.forEach(option=>option.verdict=option.id===opposite?'correct':'meaning-mismatch');
      card.answerIds=[opposite];issue(card,/正确类别必须与冻结direction一致/u);
    }
    const card=roleCard();
    for(const direction of ['unknown','toString',undefined,null,7,{},['intransitive']]){
      replaceRequirement(card,{direction});issue(card,/正确类别必须与冻结direction一致/u);
    }
  });
});

test('role answers allow exactly one correct verdict and one answerId',async()=>{
  await withVerbRoleCatalog(()=>{
    const card=roleCard();card.options.forEach(option=>option.verdict='correct');
    card.answerIds=card.options.map(option=>option.id);issue(card,/且只有一个/u);
    for(const answerIds of [[],['transitive'],['intransitive','intransitive'],undefined]){
      const candidate=roleCard();candidate.answerIds=answerIds;issue(candidate,/正确集合与选项判断不一致/u);
    }
  });
});

test('ordinary multiple-correct cards keep every reviewed answer and complete sentence in option order',()=>{
  const card=cards.find(candidate=>candidate.answerIds.length>1);
  assert.ok(card);
  assert.deepEqual(validateCards([card]),[]);
  assert.deepEqual(fullSentences(card),card.options.filter(option=>card.answerIds.includes(option.id)).map(option=>
    card.before.map(part=>part.text).join('')+option.text+card.after.map(part=>part.text).join('')));
  assert.equal(fullSentences(card).length,card.answerIds.length);
});

test('role fullSentences return the authored sentence once without adding a category label',async()=>{
  await withVerbRoleCatalog(roleCards=>{
    for(const card of roleCards){
      card.after=[{text:'きのうのことです。'}];
      const sentence=card.before[0].text+'きのうのことです。';
      assert.deepEqual(fullSentences(card),[sentence]);
      assert.ok(!fullSentences(card)[0].includes('动词'));
      card.answerIds=card.options.map(option=>option.id);
      assert.deepEqual(fullSentences(card),[sentence]);
    }
  });
});

test('role duplicate detection uses the complete sentence across different part boundaries',async()=>{
  await withVerbRoleCatalog(([first,second])=>{
    first.after=[{text:'きのうのことです。'}];
    second.before=[...first.before,...first.after];second.after=[];
    assert.deepEqual(fullSentences(first),fullSentences(second));
    assert.ok(validateCards([first,second]).some(error=>error.includes('重复完整句不算独立场景')));
  });
});

test('review binding accepts the same role full sentence and rejects a category inserted into it',()=>{
  const card=roleCard('transitive'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'bunpo-verb-role-schema-'));
  try{
    const hash=crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex'),sentence=card.before[0].text;
    const row={id:card.id,hash,fullSentences:[sentence],status:'approved',reason:'合成结构审核',
      answerSet:'他动词',readings:'已核对合成读音',translation:'已核对合成译文',options:'已核对类别'};
    fs.writeFileSync(path.join(directory,'cards.json'),JSON.stringify([card]));
    fs.writeFileSync(path.join(directory,'receipt.json'),JSON.stringify({author:'/synthetic-author',cards:[{id:card.id,hash,fullSentences:[sentence]}]}));
    const reportPath=path.join(directory,'report.json'),script=fileURLToPath(new URL('../scripts/content-workflow.mjs',import.meta.url));
    const run=()=>spawnSync(process.execPath,[script,'check-review',directory,reportPath],{encoding:'utf8'});
    fs.writeFileSync(reportPath,JSON.stringify({reviewer:'/synthetic-reviewer',cards:[row]}));
    const accepted=run();assert.equal(accepted.status,0,accepted.stderr);assert.equal(JSON.parse(accepted.stdout).approved,1);
    row.fullSentences=[sentence+'他动词'];
    fs.writeFileSync(reportPath,JSON.stringify({reviewer:'/synthetic-reviewer',cards:[row]}));
    const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/报告内容绑定错误/u);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
