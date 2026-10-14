import rubyLayouts from '../data/ruby-layouts.json' with {type:'json'};

const kanji=/[\u3400-\u9fff々〇]/u;
const leadingSentencePunctuation=/^[。、！？!?」』）]+/u;
const layoutKey=part=>`${part.text}\u0000${part.reading}`;
const layoutMap=new Map(rubyLayouts.layouts.map(row=>[layoutKey(row),row.parts]));

/** Use the reviewed word-level layout; never infer a boundary in the browser. */
export function usageSentenceParts(part,{omitLeadingPunctuation=false}={}){
  const parts=!part.reading||!kanji.test(part.text)?[{text:part.text}]:layoutMap.get(layoutKey(part))??[{text:part.text}];
  if(!omitLeadingPunctuation)return parts;
  let atStart=true;
  return parts.flatMap(current=>{
    if(!atStart)return [current];
    const text=current.text.replace(leadingSentencePunctuation,'');
    if(text===current.text){atStart=false;return [current];}
    if(!text)return [];
    atStart=false;
    return [{...current,text}];
  });
}

export function hasUnresolvedRuby(part){
  return !!part?.reading&&kanji.test(part.text)&&!layoutMap.has(layoutKey(part));
}

export const rubyLayoutMetadata={
  version:rubyLayouts.version,
  policy:rubyLayouts.policy,
  cards:rubyLayouts.cards,
  count:rubyLayouts.layouts.length,
  generator:rubyLayouts.generator,
};
