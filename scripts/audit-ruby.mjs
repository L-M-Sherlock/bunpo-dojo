import cards from '../src/data/cards.json' with {type:'json'};
import data from '../src/data/ruby-layouts.json' with {type:'json'};
import {hasUnresolvedRuby} from '../src/lib/sentence-parts.mjs';
import {rubySourceParts} from '../src/lib/ruby-source-parts.mjs';

const han=/[\u3400-\u9fff々〇]/u,pureHan=/^[\u3400-\u9fff々〇]+$/u,unsafeStart=/^[ぁぃぅぇぉゃゅょっゎー]/u;
const normalize=text=>text.normalize('NFKC').replace(/[ァ-ヶ]/g,char=>String.fromCharCode(char.charCodeAt(0)-0x60)).replace(/\s/g,'').replace(/,/g,'、').replace(/\./g,'。');
const key=part=>`${part.text}\u0000${part.reading}`;

function activeParts(){
  const result=new Map();
  for(const part of rubySourceParts(cards))if(part.reading&&han.test(part.text))result.set(key(part),part);
  return result;
}

const errors=[],active=activeParts(),layouts=new Map();
if(data.version!==1||data.policy!=='word-boundary-ruby'||data.cards!==cards.length||data.generator?.sudachipy!=='0.6.10'||data.generator?.sudachidictCore!=='20250825'||!Array.isArray(data.layouts))errors.push('注音布局元数据无效');
for(const row of data.layouts??[]){
  const rowKey=key(row);
  if(layouts.has(rowKey))errors.push(`重复注音布局: ${row.text}`);layouts.set(rowKey,row);
  if(!active.has(rowKey))errors.push(`陈旧注音布局: ${row.text}`);
  if(!Array.isArray(row.parts)||!row.parts.length){errors.push(`空注音布局: ${row.text}`);continue;}
  if(row.parts.map(part=>part.text).join('')!==row.text)errors.push(`正文无法重组: ${row.text}`);
  const rebuilt=row.parts.map(part=>part.reading??part.text).join('');
  if(normalize(rebuilt)!==normalize(row.reading))errors.push(`读音无法重组: ${row.text}`);
  for(const part of row.parts){
    if(part.reading!==undefined){
      if(typeof part.reading!=='string'||!part.reading)errors.push(`非法局部读音: ${row.text}`);
      if(!pureHan.test(part.text))errors.push(`注音亲文字不是完整汉字段: ${row.text} -> ${part.text}`);
      if(unsafeStart.test(part.reading))errors.push(`局部读音从小假名或长音开始: ${row.text} -> ${part.text}/${part.reading}`);
    }else if(han.test(part.text))errors.push(`汉字遗漏注音: ${row.text} -> ${part.text}`);
  }
}
for(const [partKey,part]of active){if(!layouts.has(partKey)||hasUnresolvedRuby(part))errors.push(`缺少注音布局: ${part.text} / ${part.reading}`);}
const result={valid:!errors.length,cards:cards.length,layouts:layouts.size,active:active.size,unresolved:errors.filter(error=>error.startsWith('缺少注音布局')).length,errors};
console.log(JSON.stringify(result,null,2));
if(errors.length)process.exitCode=1;
