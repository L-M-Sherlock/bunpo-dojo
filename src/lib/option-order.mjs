function hashText(value){
  let hash=2166136261;
  for(const char of value){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}

function nextRandom(state){
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return state>>>0;
}

export function orderedOptions(card,questionId){
  const options=[...card.options];
  if(options.length<2)return options;
  let state=(hashText(questionId)^hashText(card.id))>>>0;
  if(options.length===2)return state%2?[options[1],options[0]]:options;
  if(!state)state=0x9e3779b9;
  for(let index=options.length-1;index>0;index--){state=nextRandom(state);const target=state%(index+1);[options[index],options[target]]=[options[target],options[index]];}
  return options;
}
