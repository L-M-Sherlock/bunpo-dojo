import {REQUIREMENT_BY_ID,SKILL_BY_ID} from '../../src/lib/catalog.mjs';

export const rolePair={
  id:'verb.hiraku',intransitive:'開く',intransitiveReading:'ひらく',
  transitive:'開く',transitiveReading:'ひらく',meaning:'开放或打开',count:2,
};
export function roleCard(direction='intransitive'){
  const intransitive=direction==='intransitive';
  return {
    id:`verb.hiraku.synthetic.${direction}`,module:'verbs',courseId:'pairs',
    skillId:rolePair.id,familyId:rolePair.id,lexicalKey:intransitive?'blossom':'register',
    exerciseType:'verb-role',focusVerb:{text:'開く',reading:'ひらく'},
    scene:intransitive?'公园的樱花已经开放。':'接待员把名册翻开了。',
    before:[{text:intransitive?'公園で、桜の花が開きました。':'受付の人が名簿を開きました。',
      reading:intransitive?'こうえんで、さくらのはながひらきました。':'うけつけのひとがめいぼをひらきました。'}],
    after:[],
    options:[
      {id:'intransitive',text:'自动词',reading:'じどうし',
        verdict:intransitive?'correct':'meaning-mismatch',
        explanation:intransitive?'花是开放的主体，动词在这里用作自动词。':'名册是被翻开的对象，这里不能判断为自动词。'},
      {id:'transitive',text:'他动词',reading:'たどうし',
        verdict:intransitive?'meaning-mismatch':'correct',
        explanation:intransitive?'这里陈述花自身开放，不能判断为他动词。':'接待员是动作施事，名册是对象，动词在这里用作他动词。'},
    ],
    answerIds:[direction],translation:intransitive?'公园里，樱花开放了。':'接待员翻开了名册。',
    explanation:intransitive?'判断花自身开放这一变化的主体。':'判断施事对名册做出翻开动作的关系。',
    hint:'看动词陈述谁的变化，以及是否以某个对象为动作目标。',
    sourceIds:['jf-pairs'],review:'draft',
  };
}

export const potentialRolePair={
  id:'verb.flicksynthetic',intransitive:'弾ける',intransitiveReading:'はじける',
  transitive:'弾く',transitiveReading:'はじく',meaning:'爆开或弹开对象',count:2,
};
export function potentialRoleCard(direction='intransitive'){
  const intransitive=direction==='intransitive',card=roleCard(direction);
  return {
    ...card,id:`${potentialRolePair.id}.synthetic.${direction}`,
    skillId:potentialRolePair.id,familyId:potentialRolePair.id,
    lexicalKey:intransitive?'popcorn':'marble',
    focusVerb:{text:potentialRolePair[direction],reading:potentialRolePair[`${direction}Reading`]},
    scene:intransitive?'锅里的爆米花爆开了。':'用手指把玻璃珠弹开了。',
    before:[{text:intransitive?'ポップコーンが弾けた。':'指でビー玉を弾いた。',
      reading:intransitive?'ポップコーンがはじけた。':'ゆびでビーだまをはじいた。'}],
    translation:intransitive?'爆米花爆开了。':'用手指弹开了玻璃珠。',
    explanation:intransitive?'爆米花自身爆开，是自动词的用法。':'玻璃珠是被弹开的对象，是他动词的用法。',
    options:[
      {...card.options[0],explanation:intransitive?'这里陈述爆米花自身发生变化。':'这里有被弹开的对象，不能判断为自动词。'},
      {...card.options[1],explanation:intransitive?'这里陈述爆米花自身爆开，不能判断为他动词。':'这里的玻璃珠是被弹开的对象。'},
    ],
  };
}

/** Install an isolated synthetic target without changing frozen content files. */
export async function withVerbRoleCatalog(callback){
  return withCatalogPair(rolePair,['intransitive','transitive'].map(roleCard),callback);
}
export async function withPotentialRoleCatalog(callback){
  return withCatalogPair(potentialRolePair,['intransitive','transitive'].map(potentialRoleCard),callback);
}
async function withCatalogPair(pair,cards,callback){
  const oldSkill=SKILL_BY_ID.get(pair.id),
    oldRequirements=cards.map(c=>[c.id,REQUIREMENT_BY_ID.get(c.id)]);
  SKILL_BY_ID.set(pair.id,{...pair,courseId:'pairs',title:`${pair.intransitive} / ${pair.transitive}`,
    objective:pair.meaning,prerequisites:[],coverage:['intransitive','transitive']});
  for(const c of cards)REQUIREMENT_BY_ID.set(c.id,{id:c.id,module:c.module,
    courseId:c.courseId,skillId:c.skillId,familyId:c.familyId,pair:{...pair},
    direction:c.answerIds[0]});
  try{return await callback(cards);}
  finally{
    if(oldSkill)SKILL_BY_ID.set(pair.id,oldSkill);else SKILL_BY_ID.delete(pair.id);
    for(const [id,old]of oldRequirements)if(old)REQUIREMENT_BY_ID.set(id,old);else REQUIREMENT_BY_ID.delete(id);
  }
}
