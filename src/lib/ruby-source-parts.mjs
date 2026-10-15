import {optionVerbDetails} from './verb-option-details.mjs';

/** Every authored or catalog-backed field passed to the Japanese renderer. */
export function rubySourceParts(cards){
  return cards.flatMap(card=>{
    const parts=[...(card.before??[]),...(card.after??[])];
    if(card.exerciseType==='verb-role'){if(card.focusVerb)parts.push(card.focusVerb);}
    else parts.push(...(card.options??[]));
    if(card.courseId==='pairs')for(const option of card.options){
      const detail=optionVerbDetails(card,option);
      if(!detail)throw new Error(`选项缺少唯一的动词原形：${card.id}/${option.id} ${option.text}`);
      parts.push(detail.lemma);
    }
    return parts;
  });
}
