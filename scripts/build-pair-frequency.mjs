import fs from 'node:fs';
import crypto from 'node:crypto';
import scope from '../content/scope.json' with {type:'json'};
import aliases from '../content/references/pair-frequency-aliases.json' with {type:'json'};

const args=Object.fromEntries(process.argv.slice(2).reduce((rows,value,index,all)=>index%2?rows:[...rows,[value,all[index+1]]],[]));
const jpdbPath=args['--jpdb'],jitenPath=args['--jiten'],output=args['--output'],orderOutput=args['--order-output'],generatedAt=args['--date'],jitenRevision=args['--jiten-revision'];
if(!jpdbPath||!jitenPath||!output||!orderOutput||!generatedAt||!jitenRevision)throw new Error('用法：node scripts/build-pair-frequency.mjs --jpdb JPDB.csv --jiten Jiten.csv --jiten-revision REVISION --output pair-frequency.json --order-output pair-frequency-order.json --date YYYY-MM-DD');

const sha256=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const key=(term,reading)=>`${term}\u0000${reading}`;
const add=(map,id,row)=>{const rows=map.get(id)??[];rows.push(row);map.set(id,rows);};
const minimum=values=>{const available=values.filter(Number.isFinite);return available.length?Math.min(...available):null;};

function parseCsvLine(line){
  const fields=[];let value='',quoted=false;
  for(let index=0;index<line.length;index++){
    const char=line[index];
    if(quoted&&char==='"'&&line[index+1]==='"'){value+='"';index++;}
    else if(char==='"')quoted=!quoted;
    else if(char===','&&!quoted){fields.push(value);value='';}
    else value+=char;
  }
  fields.push(value);return fields;
}

function readJpdb(path){
  const lines=fs.readFileSync(path,'utf8').trimEnd().split(/\r?\n/u),header=lines.shift().split('\t');
  if(header.join('\t')!=='term\treading\tfrequency\tkana_frequency')throw new Error('JPDB 列结构不符合预期');
  const index=new Map();let maxRank=0;
  for(const line of lines){const [term,reading,rank,kanaRank]=line.split('\t'),row={rank:rank?Number(rank):null,kanaRank:kanaRank?Number(kanaRank):null};if(!term||!reading||rank&&!Number.isSafeInteger(row.rank)||kanaRank&&!Number.isSafeInteger(row.kanaRank))throw new Error('JPDB 数据行无效');add(index,key(term,reading),row);for(const value of [row.rank,row.kanaRank])if(value)maxRank=Math.max(maxRank,value);}
  return {index,maxRank,rows:lines.length};
}

function readJiten(path){
  const lines=fs.readFileSync(path,'utf8').trimEnd().split(/\r?\n/u),header=parseCsvLine(lines.shift().replace(/^\uFEFF/u,''));
  if(header.join(',')!=='Word,Form,Rank')throw new Error('Jiten 列结构不符合预期');
  const index=new Map();let maxRank=0;
  for(const line of lines){const [term,reading,rank]=parseCsvLine(line),value=Number(rank);if(!term||!reading||!Number.isSafeInteger(value))throw new Error('Jiten 数据行无效');add(index,key(term,reading),value);maxRank=Math.max(maxRank,value);}
  return {index,maxRank,rows:lines.length};
}

const jpdb=readJpdb(jpdbPath),jiten=readJiten(jitenPath);
const aliasByTarget=new Map(aliases.overrides.map(row=>[`${row.skillId}/${row.side}`,row]));
function jpdbRanks(term,reading){
  const exact=jpdb.index.get(key(term,reading))??[],kana=jpdb.index.get(key(reading,reading))??[];
  if(exact.length!==1)throw new Error(`JPDB 需要人工消歧：${term}／${reading}（${exact.length} 条）`);
  return {rank:exact[0].rank,kanaRank:term===reading?exact[0].rank:minimum([...exact.map(row=>row.kanaRank),...kana.map(row=>row.rank)]),matches:exact.length};
}
function jitenRanks(term,reading,override){
  const exact=jiten.index.get(key(term,reading))??[],kana=jiten.index.get(key(reading,reading))??[];
  if(!override&&exact.length!==1)throw new Error(`Jiten 需要人工消歧：${term}／${reading}（${exact.length} 条）`);
  return {rank:override?.rank??exact[0],kanaRank:minimum(kana),matches:exact.length,resolution:override?{kind:'api-override',wordId:override.wordId,readingIndex:override.readingIndex,reason:override.reason}:{kind:'csv-exact'}};
}
const withPenalty=(rank,maxRank)=>rank??maxRank+1;
const geometric=(left,right)=>Math.sqrt(left*right);
const normalized=(rank,maxRank)=>Math.log1p(rank)/Math.log1p(maxRank+1);
const fixed=value=>Math.round(value*1_000_000_000);
const pairs=scope.pairs.map((pair,originalIndex)=>{
  const makeTerm=side=>{const term=pair[side],reading=pair[`${side}Reading`],alias=aliasByTarget.get(`${pair.id}/${side}`),lookupTerm=alias?.lookupTerm??term;return {term,reading,lookupTerm,jpdb:jpdbRanks(lookupTerm,reading),jiten:jitenRanks(lookupTerm,reading,alias?.jitenOverride)};},
    intransitive=makeTerm('intransitive'),transitive=makeTerm('transitive');
  return {id:pair.id,originalOrder:originalIndex+1,intransitive,transitive,pairScore:{
    jpdbWorst:Math.max(withPenalty(intransitive.jpdb.rank,jpdb.maxRank),withPenalty(transitive.jpdb.rank,jpdb.maxRank)),
    jpdbMean:geometric(withPenalty(intransitive.jpdb.rank,jpdb.maxRank),withPenalty(transitive.jpdb.rank,jpdb.maxRank)),
    jitenWorst:Math.max(withPenalty(intransitive.jiten.rank,jiten.maxRank),withPenalty(transitive.jiten.rank,jiten.maxRank)),
    jitenMean:geometric(withPenalty(intransitive.jiten.rank,jiten.maxRank),withPenalty(transitive.jiten.rank,jiten.maxRank)),
    jpdbKanaWorst:Math.max(withPenalty(intransitive.jpdb.kanaRank,jpdb.maxRank),withPenalty(transitive.jpdb.kanaRank,jpdb.maxRank)),
    jpdbKanaMean:geometric(withPenalty(intransitive.jpdb.kanaRank,jpdb.maxRank),withPenalty(transitive.jpdb.kanaRank,jpdb.maxRank)),
    jitenKanaWorst:Math.max(withPenalty(intransitive.jiten.kanaRank,jiten.maxRank),withPenalty(transitive.jiten.kanaRank,jiten.maxRank)),
    jitenKanaMean:geometric(withPenalty(intransitive.jiten.kanaRank,jiten.maxRank),withPenalty(transitive.jiten.kanaRank,jiten.maxRank)),
  }};
});
function assignOrder(primary,secondary,property){[...pairs].sort((a,b)=>a.pairScore[primary]-b.pairScore[primary]||a.pairScore[secondary]-b.pairScore[secondary]||a.originalOrder-b.originalOrder).forEach((pair,index)=>{pair.pairScore[property]=index+1;});}
assignOrder('jpdbWorst','jpdbMean','jpdbOrder');assignOrder('jitenWorst','jitenMean','jitenOrder');assignOrder('jpdbMean','jpdbWorst','jpdbMeanOrder');assignOrder('jitenMean','jitenWorst','jitenMeanOrder');assignOrder('jpdbKanaWorst','jpdbKanaMean','jpdbKanaOrder');assignOrder('jitenKanaWorst','jitenKanaMean','jitenKanaOrder');
for(const pair of pairs){
  const jpdbScore=normalized(pair.pairScore.jpdbWorst,jpdb.maxRank),jitenScore=normalized(pair.pairScore.jitenWorst,jiten.maxRank),jpdbKanaScore=normalized(pair.pairScore.jpdbKanaWorst,jpdb.maxRank),jitenKanaScore=normalized(pair.pairScore.jitenKanaWorst,jiten.maxRank);
  pair.pairScore.combined=fixed((jpdbScore+jitenScore)/2);pair.pairScore.imbalance=fixed(Math.max(jpdbScore,jitenScore));pair.pairScore.kanaTieBreak=fixed((jpdbKanaScore+jitenKanaScore)/2);
}
const ordered=[...pairs].sort((a,b)=>a.pairScore.combined-b.pairScore.combined||a.pairScore.imbalance-b.pairScore.imbalance||a.pairScore.jpdbWorst-b.pairScore.jpdbWorst||a.pairScore.jitenWorst-b.pairScore.jitenWorst||a.pairScore.kanaTieBreak-b.pairScore.kanaTieBreak||a.originalOrder-b.originalOrder);
ordered.forEach((pair,index)=>{pair.overallOrder=index+1;});
const byId=new Map(ordered.map(pair=>[pair.id,pair]));
const publicPair=pair=>({id:pair.id,originalOrder:pair.originalOrder,overallOrder:pair.overallOrder,
  intransitive:{term:pair.intransitive.term,reading:pair.intransitive.reading,lookupTerm:pair.intransitive.lookupTerm,jiten:pair.intransitive.jiten},
  transitive:{term:pair.transitive.term,reading:pair.transitive.reading,lookupTerm:pair.transitive.lookupTerm,jiten:pair.transitive.jiten},
  jitenPair:{worstRank:pair.pairScore.jitenWorst,geometricMean:Math.round(pair.pairScore.jitenMean*1000)/1000},
  sourceOrder:{jpdb:pair.pairScore.jpdbOrder,jiten:pair.pairScore.jitenOrder,jpdbGeometric:pair.pairScore.jpdbMeanOrder,jitenGeometric:pair.pairScore.jitenMeanOrder,jpdbKana:pair.pairScore.jpdbKanaOrder,jitenKana:pair.pairScore.jitenKanaOrder},
  combinedScore:pair.pairScore.combined,sourceImbalance:pair.pairScore.imbalance,kanaTieBreak:pair.pairScore.kanaTieBreak});
const result={
  version:1,generatedAt,
  dataLicenseNotice:'本文件中的 Jiten 排名及其衍生字段依据 CC BY-SA 4.0 提供；筛选、词义消歧和两源合并方法属于本项目改动。完整说明见 content/references/PAIR_FREQUENCY_NOTICE.md。',
  method:{primary:'每套词频均按词形与读音精确匹配。词对先取自动词与他动词中较低频一侧的排名，以 log1p(rank)／log1p(sourceMaxRank+1) 在来源内归一化，再将 JPDB 与 Jiten 等权平均；定点综合分越小越优先。',tieBreak:'综合分相同时依次比较较差的单源归一化分、JPDB词对排名、Jiten词对排名、假名写法综合分和冻结原顺序；两侧几何平均与各来源顺位保存在结果中供审计。',kana:'JPDBv2㋕／Jiten 的假名写法排名只作后续平局判定，避免「いる」「つく」等同音词把特定义项误判为高频。',ambiguity:'0条或多条精确匹配必须在 pair-frequency-aliases.json 中按课程固定词义消歧，生成器不会静默猜测。'},
  sources:{
    jpdb:{name:'JPDB v2.2 Frequency Kana',snapshot:'2024-10-13',url:'https://raw.githubusercontent.com/Kuuuube/yomitan-dictionaries/b1114cc014f4343d04c387c7dcd3b1171dd31782/data/jpdb_v2.2_freq_list_2024-10-13.csv',upstream:'https://jpdb.io/',sha256:sha256(jpdbPath),rows:jpdb.rows,maxRank:jpdb.maxRank,redistribution:'原始资料未声明开放许可证；仓库只保存其派生的172项来源顺位，不保存原始排名或原始文件。'},
    jiten:{name:'Jiten Global',revision:jitenRevision,retrievedAt:generatedAt,url:'https://api.jiten.moe/api/frequency-list/download?downloadType=csv',documentation:'https://jiten.moe/frequency-dictionaries',license:'CC BY-SA 4.0',sha256:sha256(jitenPath),rows:jiten.rows,maxRank:jiten.maxRank},
  },
  aliases:{file:'content/references/pair-frequency-aliases.json',sha256:sha256(new URL('../content/references/pair-frequency-aliases.json',import.meta.url)),count:aliases.overrides.length},
  coverage:{pairs:pairs.length,lexemes:pairs.length*2,jpdbExact:pairs.reduce((sum,pair)=>sum+Number(pair.intransitive.jpdb.rank!==null)+Number(pair.transitive.jpdb.rank!==null),0),jitenExact:pairs.reduce((sum,pair)=>sum+Number(pair.intransitive.jiten.rank!==null)+Number(pair.transitive.jiten.rank!==null),0)},
  orderedSkillIds:ordered.map(pair=>pair.id),pairs:scope.pairs.map(pair=>publicPair(byId.get(pair.id))),
};
const serialized=`${JSON.stringify(result,null,2)}\n`,resultSha256=crypto.createHash('sha256').update(serialized).digest('hex');
fs.writeFileSync(output,serialized);
fs.writeFileSync(orderOutput,`${JSON.stringify({version:1,source:'content/references/pair-frequency.json',sourceSha256:resultSha256,orderedSkillIds:result.orderedSkillIds},null,2)}\n`);
