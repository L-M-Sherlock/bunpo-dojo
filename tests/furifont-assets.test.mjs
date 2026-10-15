import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../src/data/furifont-manifest.json' with {type:'json'};
import layouts from '../src/data/ruby-layouts.json' with {type:'json'};

const key=part=>`${part.text}\u0000${part.reading}`;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const expected=new Map(layouts.layouts.flatMap(layout=>layout.parts).filter(part=>part.reading).map(part=>[key(part),part]));

test('the custom Furifont maps every reviewed annotation exactly once without introducing dictionary readings',()=>{
  assert.equal(manifest.version,1);
  assert.equal(manifest.family,'Bunpo Furifont Sans');
  assert.equal(expected.size,2472);
  assert.equal(manifest.entries.length,expected.size);
  assert.equal(new Set(manifest.entries.map(key)).size,expected.size);
  assert.deepEqual(new Set(manifest.entries.map(key)),new Set(expected.keys()));
  const glyphs=new Set(),perInitial=new Map();
  for(const entry of manifest.entries){
    assert.match(entry.text,/^[\u3400-\u9fff々〇]+$/u,key(entry));
    assert.ok(Number.isSafeInteger(entry.salt)&&entry.salt>0,key(entry));
    assert.ok(Number.isSafeInteger(entry.glyphId)&&entry.glyphId>0,key(entry));
    assert.ok(entry.glyph,key(entry));
    assert.equal(glyphs.has(entry.glyph),false,`${entry.glyph}: two source readings share a glyph`);
    glyphs.add(entry.glyph);
    const initial=[...entry.text][0];
    if(!perInitial.has(initial))perInitial.set(initial,[]);
    perInitial.get(initial).push(entry.salt);
  }
  for(const [initial,salts] of perInitial){
    assert.deepEqual([...salts].sort((a,b)=>a-b),Array.from({length:salts.length},(_,i)=>i+1),initial);
  }
  assert.equal(Math.max(...manifest.entries.map(entry=>entry.salt)),31);
});

test('homographs and previous font dictionary gaps retain their reviewed readings',()=>{
  for(const [text,readings]of [
    ['開',['あ','ひら']],['汚',['よご','けが']],
    ['係',['がかり']],['栞',['しおり']],['球',['たま']],
    ['四重奏',['しじゅうそう']],['光回線',['ひかりかいせん']],
  ])for(const reading of readings)assert.ok(manifest.entries.some(entry=>entry.text===text&&entry.reading===reading),`${text}/${reading}`);
});

test('the bundled font is a real local WOFF2 tied to the current layout and manifest build',()=>{
  assert.match(manifest.fontUrl,/^fonts\/furifont\/[^?#]+\.woff2$/u);
  const font=readFileSync(new URL(`../public/${manifest.fontUrl}`,import.meta.url));
  assert.equal(font.subarray(0,4).toString('ascii'),'wOF2');
  assert.ok(font.length>100000,'the artifact must contain the full reviewed annotation set');
  const metadata=manifest.metadata;
  assert.deepEqual(metadata.compiler,{package:'@furifont/compiler',version:'0.1.2',commit:'e971bb5f0f371355ed3ea0dffcd5df6cf823c2af'});
  assert.equal(metadata.base.commit,'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2');
  assert.equal(metadata.base.sha256,'4acc34926098472741bbb7be5949b80afa7fc08f41ea3cd80dc34f12f7d55bbc');
  assert.equal(metadata.font.sha256,sha256(font),'the manifest binds the actual served bytes');
  assert.equal(metadata.font.bytes,font.length);
  assert.deepEqual(metadata.font.weights,[250,900]);
  const source=readFileSync(new URL('../src/data/ruby-layouts.json',import.meta.url));
  assert.equal(metadata.source.path,'src/data/ruby-layouts.json');
  assert.equal(metadata.source.sha256,sha256(source),'the build binds the exact reviewed layout');
  assert.equal(metadata.source.layouts,layouts.layouts.length);
  assert.equal(metadata.source.pairs,expected.size);
  assert.equal(metadata.readingSource,'reviewed-ruby-layouts-only');
  assert.equal(metadata.dictionaryUsed,false);
  const audit=JSON.parse(readFileSync(new URL('../public/fonts/furifont/audit.json',import.meta.url)));
  assert.equal(audit.ok,true);
  assert.equal(audit.sourceSha256,sha256(source));
  assert.equal(audit.fontSha256,sha256(font));
  assert.equal(audit.failures,0);
  assert.equal(audit.pairs,expected.size);
  assert.deepEqual(audit.weights,[250,400,700,900]);
  assert.equal(audit.shapes,expected.size*audit.weights.length);
});

test('the custom font ships its upstream code and derivative font license notices',()=>{
  const dir=new URL('../public/fonts/furifont/',import.meta.url);
  assert.match(readFileSync(new URL('OFL.txt',dir),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(readFileSync(new URL('FURIFONT-LICENSE.md',dir),'utf8'),/MIT License/);
  const notice=readFileSync(new URL('NOTICE.txt',dir),'utf8');
  assert.ok(notice.includes(manifest.family));
  assert.ok(notice.includes(manifest.metadata.compiler.commit));
  assert.ok(notice.includes(manifest.metadata.base.commit));
  assert.match(notice,/upstream dictionary datasets were not used/);
});
