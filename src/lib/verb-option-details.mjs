import {PAIR_GROUP_BY_SKILL,SKILL_BY_ID} from './catalog.mjs';
import reference from '../../content/references/haya-pairs.json' with {type:'json'};

const labels={intransitive:'自动词',transitive:'他动词'};
const classes=new Map(reference.groupDefinitions.map(group=>[group.group,group]));
const godan={う:['わ','い','え','お','って','った'],く:['か','き','け','こ','いて','いた'],ぐ:['が','ぎ','げ','ご','いで','いだ'],す:['さ','し','せ','そ','して','した'],つ:['た','ち','て','と','って','った'],ぬ:['な','に','ね','の','んで','んだ'],ぶ:['ば','び','べ','ぼ','んで','んだ'],む:['ま','み','め','も','んで','んだ'],る:['ら','り','れ','ろ','って','った']};
// This reviewed option uses the lexical variant 驚かせる, not 驚かす's inflection.
const variants={'verb.refsba':{transitive:[{text:'驚かせる',reading:'おどろかせる',verbClass:'一段'}]}};
// In these continuative clauses 進め is 進める's stem, not 進む's imperative.
const directionOverrides={'verb.refbma.01':{'すすめ':'transitive'},'verb.refbma.03':{'すすめ':'transitive'}};

function forms(reading,verbClass){
  const stem=reading.slice(0,-1),ichidan=verbClass==='一段';
  const [a,i,e,o,te,ta]=ichidan?['','','ろ','よ','て','た']:godan[reading.at(-1)]??[];
  if(a===undefined)return new Set();
  const result=new Set([reading,stem+i,stem+e,stem+ta,stem+a+'ない',stem+a+'なかった',stem+i+'ます',stem+i+'ました',stem+i+'ません',stem+i+'ませんでした',stem+o+'うとしました',stem+a+(ichidan?'られた':'れた')]);
  for(const tail of ['','いる','いた','います','いました','きた','きました','くる','いった','しまった','しまいました','見えました'])result.add(stem+te+tail.replace('見','み'));
  for(const tail of ['はじめた','はじめました','つづけた'])result.add(stem+i+tail);
  return result;
}

/** Resolve each option from its own full reading, never from its verdict or order. */
export function optionVerbDetails(card,option){
  if(card.courseId!=='pairs')return null;
  const pair=SKILL_BY_ID.get(card.skillId),group=classes.get(PAIR_GROUP_BY_SKILL.get(card.skillId)?.order);
  if(!pair||!group)return null;
  if(card.exerciseType==='verb-role')return card.focusVerb?{lemma:card.focusVerb,label:null}:null;
  const candidates=[];
  for(const direction of Object.keys(labels)){
    if(directionOverrides[card.id]?.[option.reading]&&directionOverrides[card.id][option.reading]!==direction)continue;
    const choices=[{text:pair[direction],reading:pair[`${direction}Reading`],verbClass:group[`${direction}Class`]},...(variants[card.skillId]?.[direction]??[])];
    for(const lemma of choices)if(forms(lemma.reading,lemma.verbClass).has(option.reading))candidates.push({lemma:{text:lemma.text,reading:lemma.reading},label:labels[direction]});
  }
  return candidates.length===1?candidates[0]:null;
}
