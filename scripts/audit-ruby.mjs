import cards from '../src/data/cards.json' with {type:'json'};
import overrides from '../src/data/ruby-overrides.json' with {type:'json'};
import {hasUnresolvedRuby} from '../src/lib/sentence-parts.mjs';

const normalize = text => text.normalize('NFKC')
  .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
  .replace(/\s/g, '').replace(/,/g, '、').replace(/\./g, '。');
const errors=[],keys=new Set();
for(const row of overrides){
  const key=`${row.text}\u0000${row.reading}`;
  if(keys.has(key))errors.push(`重复注音映射: ${row.text}`);keys.add(key);
  if(!Array.isArray(row.parts)||!row.parts.length)errors.push(`空注音映射: ${row.text}`);
  if(row.parts.map(part=>part.text).join('')!==row.text)errors.push(`正文无法重组: ${row.text}`);
  const rebuilt=row.parts.map(part=>part.reading??part.text).join('');
  if(normalize(rebuilt)!==normalize(row.reading))errors.push(`读音无法重组: ${row.text}`);
  for(const part of row.parts)if(part.reading!==undefined&&(!part.reading||typeof part.reading!=='string'))errors.push(`非法局部读音: ${row.text}`);
}
const unresolved=[];
for(const card of cards)for(const field of ['before','after'])for(const part of card[field]??[]){
  if(hasUnresolvedRuby(part))unresolved.push(`${card.id}/${field}: ${part.text} / ${part.reading}`);
}
errors.push(...unresolved.map(item=>`未解析注音: ${item}`));
const result={valid:!errors.length,cards:cards.length,overrides:overrides.length,unresolved:unresolved.length,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
