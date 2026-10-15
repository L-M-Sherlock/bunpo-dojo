import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../src/data/furifont-manifest.json' with {type:'json'};
import {createFurifontLoader,furifontEntry,furifontFeatures,getFurifontLoader} from '../src/lib/furifont.mjs';

test('font entries require the exact reviewed text and reading and enable both OpenType features',()=>{
  for(const entry of manifest.entries){
    assert.deepEqual(furifontEntry(entry),entry);
    const features=furifontFeatures(entry.salt);
    assert.match(features,/"rclt"\s+1/u);
    assert.match(features,new RegExp(`"salt"\\s+${entry.salt}(?:\\D|$)`));
  }
  assert.equal(furifontEntry({text:'開',reading:'かい'}),undefined);
  assert.equal(furifontEntry({text:'開く',reading:'あく'}),undefined);
  assert.equal(furifontEntry({text:'開',reading:'ああ'}),undefined);
});

test('a verified font load activates subscribers once, is shared, and uses the manifest hash',async()=>{
  let constructed=0,loads=0,release;
  const faces=new Set();
  class FontFace{
    constructor(family,source,descriptors){constructed++;this.family=family;this.source=source;this.descriptors=descriptors;}
    load(){loads++;return new Promise(resolve=>{release=()=>resolve(this);});}
  }
  const loader=createFurifontLoader({fontSet:{add:face=>faces.add(face)},FontFace,baseUrl:'https://example.test/bunpo-dojo/'});
  let notifications=0;
  const unsubscribe=loader.subscribe(()=>notifications++);
  assert.equal(loader.getSnapshot(),false);
  const first=loader.load(),second=loader.load();
  assert.equal(constructed,1);
  assert.equal(loads,1);
  assert.equal(loader.getSnapshot(),false);
  release();
  assert.equal(await first,true);
  assert.equal(await second,true);
  assert.equal(loader.getSnapshot(),true);
  assert.equal(notifications,1);
  const [face]=faces;
  assert.equal(face.family,manifest.family);
  assert.ok(face.source.includes(`https://example.test/bunpo-dojo/${manifest.fontUrl}?v=${manifest.metadata.font.sha256}`));
  unsubscribe();
  assert.equal(await loader.load(),true);
  assert.equal(notifications,1);
  assert.equal(loads,1);
});

test('missing font APIs never activate the font even if fallback check would pass',async()=>{
  const deceptivelyReady={check:()=>true,load:async()=>[],add:()=>{throw new Error('must not add');}};
  for(const args of [
    {fontSet:deceptivelyReady,FontFace:undefined},
    {fontSet:undefined,FontFace:class FontFace{}},
    {fontSet:{},FontFace:class FontFace{}},
  ]){
    const loader=createFurifontLoader({...args,baseUrl:'https://example.test/bunpo-dojo/'});
    assert.equal(loader.getSnapshot(),false);
    assert.equal(await loader.load(),false);
    assert.equal(loader.getSnapshot(),false);
  }
});

test('failed, empty, or unrelated load results retain native-ruby fallback',async()=>{
  for(const result of ['reject',[],{},undefined]){
    let adds=0,notifications=0;
    class FontFace{load(){return result==='reject'?Promise.reject(new Error('network unavailable')):Promise.resolve(result);}}
    const loader=createFurifontLoader({fontSet:{check:()=>true,load:async()=>[],add:()=>adds++},FontFace,baseUrl:'https://example.test/bunpo-dojo/'});
    loader.subscribe(()=>notifications++);
    assert.equal(await loader.load(),false);
    assert.equal(loader.getSnapshot(),false);
    assert.equal(adds,0);
    assert.equal(notifications,0);
  }
});

test('a loaded face that cannot be registered still leaves all annotations in fallback',async()=>{
  class FontFace{load(){return Promise.resolve(this);}}
  const loader=createFurifontLoader({fontSet:{add:()=>{throw new Error('registration failed');}},FontFace,baseUrl:'https://example.test/bunpo-dojo/'});
  let notifications=0;
  loader.subscribe(()=>notifications++);
  assert.equal(await loader.load(),false);
  assert.equal(loader.getSnapshot(),false);
  assert.equal(notifications,0);
});

test('a face still marked loading or failed cannot activate annotations',async()=>{
  for(const status of ['loading','error','unloaded']){
    let adds=0;
    class FontFace{constructor(){this.status=status;}load(){return Promise.resolve(this);}}
    const loader=createFurifontLoader({fontSet:{add:()=>adds++},FontFace,baseUrl:'https://example.test/bunpo-dojo/'});
    assert.equal(await loader.load(),false,status);
    assert.equal(loader.getSnapshot(),false,status);
    assert.equal(adds,0,status);
  }
});

test('an unsupported document does not poison later supported font sets or other documents',async()=>{
  const page=Object.getOwnPropertyDescriptor(globalThis,'document'),fontApi=Object.getOwnPropertyDescriptor(globalThis,'FontFace');
  const firstSet={add:()=>{}},secondSet={add:()=>{}};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{fonts:firstSet,baseURI:'https://example.test/bunpo-dojo/'}});
  Object.defineProperty(globalThis,'FontFace',{configurable:true,value:undefined});
  try{
    const unsupported=getFurifontLoader();
    assert.equal(await unsupported.load(),false);
    class FontFace{constructor(){this.status='loaded';}load(){return Promise.resolve(this);}}
    Object.defineProperty(globalThis,'FontFace',{configurable:true,value:FontFace});
    const first=getFurifontLoader();
    assert.notEqual(first,unsupported);
    assert.equal(await first.load(),true);
    assert.equal(getFurifontLoader(),first);
    document.fonts=secondSet;
    const second=getFurifontLoader();
    assert.notEqual(second,first);
    assert.equal(second.getSnapshot(),false);
    assert.equal(await second.load(),true);
    assert.equal(first.getSnapshot(),true);
  }finally{
    if(page)Object.defineProperty(globalThis,'document',page);else delete globalThis.document;
    if(fontApi)Object.defineProperty(globalThis,'FontFace',fontApi);else delete globalThis.FontFace;
  }
});
