/** Build the reviewed ruby pairs with Furifont's compiler, without dictionary inference. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFont,toWoff2} from '@furifont/compiler';
import {brotli,subsetWasm} from '@furifont/compiler/node';
import * as hb from 'harfbuzzjs';
import {auditFurifont,decodeFurifontWoff2,furifontAuditWeights,furifontInkOverhang} from './audit-furifont.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const assetDir=join(root,'public/fonts/furifont');
const family='Bunpo Furifont Sans';
const baseCommit='a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2';
const baseUrl=`https://raw.githubusercontent.com/adobe-fonts/source-han-sans/${baseCommit}/Variable/TTF/Subset/SourceHanSansJP-VF.ttf`;
const baseSha256='4acc34926098472741bbb7be5949b80afa7fc08f41ea3cd80dc34f12f7d55bbc';
const buildDate='2026-10-15T00:00:00.000Z';
const hash=value=>createHash('sha256').update(value).digest('hex');
const logical=cp=>cp>0xFFFF?`u${cp.toString(16).toUpperCase()}`:`uni${cp.toString(16).toUpperCase().padStart(4,'0')}`;
const cps=text=>[...text].map(c=>c.codePointAt(0));
const block=(kind,name,rows)=>`${kind} ${name}${kind==='lookup'?' useExtension':''} {\n${rows.map(r=>`  ${r}`).join('\n')}\n} ${name};\n`;

async function baseFont(){
  const override=process.argv.find(arg=>arg.startsWith('--base='))?.slice(7);
  const cache=join(tmpdir(),'bunpo-furifont-cache');
  await mkdir(cache,{recursive:true});
  const path=override??join(cache,`SourceHanSansJP-VF-${baseCommit}.ttf`);
  let bytes;
  try{bytes=await readFile(path);}catch(error){
    if(override||error.code!=='ENOENT')throw error;
    console.log('Downloading the pinned Source Han Sans JP variable base…');
    const response=await fetch(baseUrl,{signal:AbortSignal.timeout(300000)});
    if(!response.ok)throw new Error(`Base font download failed: ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
    if(hash(bytes)!==baseSha256)throw new Error('Downloaded base font SHA-256 mismatch');
    await writeFile(path,bytes);
  }
  if(hash(bytes)!==baseSha256)throw new Error('Pinned base font SHA-256 mismatch');
  return bytes;
}

export async function buildFurifont(){
  for(const [name,version]of [['@furifont/compiler','0.1.2'],['@furifont/core','0.1.2'],['harfbuzzjs','1.6.3']]){
    const packagePath=name==='harfbuzzjs'?new URL('../node_modules/harfbuzzjs/package.json',import.meta.url):new URL(import.meta.resolve(`${name}/package.json`));
    const actual=JSON.parse(await readFile(packagePath)).version;
    if(actual!==version)throw new Error(`${name} must be pinned to ${version}; found ${actual}`);
  }
  const layoutsBytes=await readFile(join(root,'src/data/ruby-layouts.json'));
  const layouts=JSON.parse(layoutsBytes);
  const unique=new Map();
  for(const layout of layouts.layouts)for(const part of layout.parts){
    if(part.reading)unique.set(`${part.text}\0${part.reading}`,{text:part.text,reading:part.reading});
  }
  const pairs=[...unique.values()].sort((a,b)=>a.text<b.text?-1:a.text>b.text?1:a.reading<b.reading?-1:a.reading>b.reading?1:0);
  if(pairs.some(p=>!/^\p{Script=Han}+$/u.test(p.text)))throw new Error('Every annotated base must be one reviewed Han group');
  const firstGroups=Map.groupBy(pairs,p=>[...p.text][0]);
  const glyphs=[];
  const single=[];
  const ligatures=[];
  const alternates=[];
  const revert=[];
  const selectors=[];
  for(const [first,group]of firstGroups){
    const outputs=[];
    for(const pair of group){
      pair.salt=outputs.length+1;
      pair.glyph=`bunpo.ruby.${pairs.indexOf(pair).toString().padStart(4,'0')}`;
      const selector=`bunpo.select.${first.codePointAt(0).toString(16)}.${pair.salt}`;
      const bases=cps(pair.text);
      glyphs.push({name:pair.glyph,bases,ruby:[{start:0,end:bases.length,text:pair.reading}]});
      glyphs.push({name:selector,bases:[bases[0]],ruby:[]});
      outputs.push(selector);
      selectors.push(selector);
      revert.push(`sub ${selector} by ${logical(bases[0])};`);
      if(bases.length===1)single.push(`sub ${selector} by ${pair.glyph};`);
      else ligatures.push(`sub ${selector} ${bases.slice(1).map(logical).join(' ')} by ${pair.glyph};`);
    }
    alternates.push(`sub ${logical(first.codePointAt(0))} from [${outputs.join(' ')}];`);
  }
  const baseCodepoints=[...new Set(pairs.flatMap(p=>cps(p.text)))].sort((a,b)=>a-b);
  const allCodepoints=[...new Set(pairs.flatMap(p=>cps(p.text+p.reading)))].sort((a,b)=>a-b);
  // salt chooses a selector only on the first Han. Later Han must remain ordinary
  // components so the full reviewed group can form one annotated ligature.
  const fea=[
    'languagesystem DFLT dflt;\n',
    `@han = [${[...baseCodepoints.map(logical),...selectors].join(' ')}];\n`,
    block('lookup','bunpo_alternates',alternates),
    block('lookup','bunpo_revert',revert),
    block('lookup','bunpo_first',[`sub @han [${selectors.join(' ')}]' lookup bunpo_revert;`]),
    block('lookup','bunpo_single',single),
    block('lookup','bunpo_group',ligatures),
    block('feature','salt',['lookup bunpo_alternates;','lookup bunpo_first;']),
    block('feature','rclt',['lookup bunpo_single;','lookup bunpo_group;']),
  ].join('\n');
  const plan={
    version:1,names:{family,description:'Reviewed Japanese readings for Bunpo Dojo; compiled by Furifont 0.1.2 from Source Han Sans JP VF.'},
    // Upstream's 1.6-em cap assumes short readings. A whole reviewed group must
    // retain its full span, not squeeze a five-kanji word's ruby into 1.6 em.
    metrics:{rubyScale:0.5,rubyGap:0.05,compressionFloor:0.8,maxRubyWidth:Math.max(...pairs.map(p=>[...p.text].length*1.6))},
    codepoints:allCodepoints,variants:[],glyphs,fea,subset:allCodepoints,smoke:[],
  };
  let lastStep;
  const built=await compileFont({plan,base:await baseFont(),version:'0.1.2',date:new Date(buildDate),subsetWasm,onProgress:({step})=>{
    if(step!==lastStep){console.log(`Furifont: ${step}`);lastStep=step;}
  }});
  if(!built.variable)throw new Error('The generated font lost its variable weights');
  const woff2=await toWoff2(built.font,brotli);
  const nameToId=new Map(built.glyphNames.map((name,index)=>[name,index]));
  const entries=pairs.map(pair=>({...pair,glyphId:nameToId.get(pair.glyph)}));
  const delivered=decodeFurifontWoff2(woff2);
  const metricsFont=new hb.Font(new hb.Face(new hb.Blob(delivered.sfnt)));
  const inkAuditWeights=furifontAuditWeights(delivered.tables,metricsFont);
  for(const entry of entries)entry.inkOverhangEm=furifontInkOverhang(delivered.tables,metricsFont,entry,inkAuditWeights);
  const manifest={
    version:1,family,fontUrl:'fonts/furifont/bunpo-furifont-sans.woff2',entries,
    metadata:{
      compiler:{package:'@furifont/compiler',version:'0.1.2',commit:'e971bb5f0f371355ed3ea0dffcd5df6cf823c2af'},
      base:{family:'Source Han Sans JP VF',commit:baseCommit,url:baseUrl,sha256:baseSha256},
      source:{path:'src/data/ruby-layouts.json',sha256:hash(layoutsBytes),layouts:layouts.layouts.length,pairs:pairs.length},
      font:{sha256:hash(woff2),bytes:woff2.length,weights:[250,900],glyphs:built.glyphNames.length,codepoints:allCodepoints.length,inkAuditWeights},
      buildDate,metrics:plan.metrics,readingSource:'reviewed-ruby-layouts-only',dictionaryUsed:false,
      selector:'1-based salt alternate on the first Han; one isolated shaping span per reviewed pair',
    },
  };
  await mkdir(assetDir,{recursive:true});
  await writeFile(join(assetDir,'bunpo-furifont-sans.woff2'),woff2);
  await writeFile(join(root,'src/data/furifont-manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
  const report=await auditFurifont({root});
  await writeFile(join(assetDir,'audit.json'),`${JSON.stringify(report,null,2)}\n`);
  console.log(JSON.stringify(report,null,2));
}

if(process.argv[1]===fileURLToPath(import.meta.url))await buildFurifont();
