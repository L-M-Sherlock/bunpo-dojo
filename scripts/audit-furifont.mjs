/** Audit the delivered WOFF2, not only the plan: shape each pair and inspect its drawn components. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brotliDecompressSync} from 'node:zlib';
import * as hb from 'harfbuzzjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const knownTags='cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar,gvar,hsty,just,lcar,mort,morx,opbd,prop,trak,Zapf,Silf,Glat,Gloc,Feat,Sill'.split(',');
// Furifont emits WOFF2 with null table transforms. Reconstruct the exact SFNT
// table payloads so the same delivered bytes are audited by HarfBuzz.
export function decodeFurifontWoff2(bytes){
  const input=Buffer.from(bytes);
  assert.equal(input.toString('ascii',0,4),'wOF2');
  let cursor=48;
  const base128=()=>{let value=0;for(let n=0;n<5;n++){const byte=input[cursor++];value=value*128+(byte&127);if(!(byte&128))return value;}throw new Error('Invalid WOFF2 base128');};
  const records=[];
  for(let n=0;n<input.readUInt16BE(12);n++){
    const flags=input[cursor++];
    const index=flags&63;
    const tag=index===63?input.toString('ascii',cursor,cursor+=4):knownTags[index];
    const length=base128();
    const transform=flags>>>6;
    assert.equal(transform,tag==='glyf'||tag==='loca'?3:0,`Unsupported WOFF2 transform: ${tag}`);
    records.push({tag,length});
  }
  const payload=brotliDecompressSync(input.subarray(cursor,cursor+input.readUInt32BE(20)));
  const sfnt=Buffer.alloc(input.readUInt32BE(16));
  input.copy(sfnt,0,4,8);
  sfnt.writeUInt16BE(records.length,4);
  const power=2**Math.floor(Math.log2(records.length));
  sfnt.writeUInt16BE(power*16,6);sfnt.writeUInt16BE(Math.log2(power),8);sfnt.writeUInt16BE(records.length*16-power*16,10);
  let source=0,offset=12+records.length*16;
  const tables=new Map();
  for(const [index,record]of records.entries()){
    const data=payload.subarray(source,source+record.length);
    const row=12+index*16;
    sfnt.write(record.tag,row,4,'ascii');sfnt.writeUInt32BE(offset,row+8);sfnt.writeUInt32BE(record.length,row+12);
    data.copy(sfnt,offset);tables.set(record.tag,data);
    source+=record.length;offset+=(record.length+3)&~3;
  }
  assert.equal(source,payload.length);
  return {sfnt,tables};
}

function composite(tables,gid){
  const longLoca=tables.get('head').readInt16BE(50)!==0;
  const loca=tables.get('loca');
  const at=longLoca?loca.readUInt32BE(gid*4):loca.readUInt16BE(gid*2)*2;
  const glyf=tables.get('glyf');
  assert.equal(glyf.readInt16BE(at),-1,`Glyph ${gid} must be a composite`);
  const components=[];
  let cursor=at+10,flags;
  do{
    flags=glyf.readUInt16BE(cursor);const glyph=glyf.readUInt16BE(cursor+2);cursor+=4;
    assert.ok(flags&2,'Components must use XY offsets');
    const words=flags&1;
    const x=words?glyf.readInt16BE(cursor):glyf.readInt8(cursor);cursor+=words?2:1;
    const y=words?glyf.readInt16BE(cursor):glyf.readInt8(cursor);cursor+=words?2:1;
    let sx=1,sy=1;
    if(flags&8){sx=sy=glyf.readInt16BE(cursor)/16384;cursor+=2;}
    else if(flags&64){sx=glyf.readInt16BE(cursor)/16384;sy=glyf.readInt16BE(cursor+2)/16384;cursor+=4;}
    else assert.ok(!(flags&128),'Unexpected two-by-two component');
    components.push({glyph,x,y,sx,sy});
  }while(flags&32);
  return components;
}

/** Source Han's avar knots delimit its piecewise-linear weight interpolation. */
export function furifontAuditWeights(tables,font){
  const axes=Object.values(font.face.getAxisInfos()).sort((a,b)=>a.axisIndex-b.axisIndex);
  assert.equal(axes.length,1,'This font build supports the pinned single weight axis');
  const axis=axes[0];assert.equal(axis.tag,'wght');
  const values=new Set([axis.min,axis.default,axis.max,400,700]);
  const avar=tables.get('avar');
  if(avar){
    assert.equal(avar.readUInt16BE(6),1);
    const count=avar.readUInt16BE(8);
    for(let index=0;index<count;index++){
      const normalized=avar.readInt16BE(10+index*4)/16384;
      values.add(axis.default+normalized*(normalized<0?axis.default-axis.min:axis.max-axis.default));
    }
  }
  return [...values].filter(value=>value>=axis.min&&value<=axis.max).sort((a,b)=>a-b);
}

/** Reserve only real ink outside the advance, at every variable-font knot. */
export function furifontInkOverhang(tables,font,entry,weights){
  const components=composite(tables,entry.glyphId);
  let left=0,right=0;
  for(const weight of weights){
    font.setVariations([new hb.Variation('wght',weight)]);
    const advance=font.glyphHAdvance(entry.glyphId);
    const full=font.glyphExtents(entry.glyphId);
    if(full){left=Math.max(left,-full.xBearing);right=Math.max(right,full.xBearing+full.width-advance);}
    // Include the component envelopes too: TrueType composite header bounds
    // are stored at the default instance, while source contours vary in weight.
    for(const component of components){
      const extent=font.glyphExtents(component.glyph);
      if(!extent)continue;
      left=Math.max(left,-(component.x+extent.xBearing*component.sx));
      right=Math.max(right,component.x+(extent.xBearing+extent.width)*component.sx-advance);
    }
  }
  const ceil=value=>Math.ceil(Math.max(0,value/font.face.upem)*1e6)/1e6;
  return {left:ceil(left),right:ceil(right)};
}

export async function auditFurifont({root=fileURLToPath(new URL('../',import.meta.url))}={}){
  const layoutsBytes=await readFile(join(root,'src/data/ruby-layouts.json'));
  const layouts=JSON.parse(layoutsBytes);
  const manifest=JSON.parse(await readFile(join(root,'src/data/furifont-manifest.json')));
  const fontBytes=await readFile(join(root,'public',manifest.fontUrl));
  assert.equal(manifest.version,1);assert.equal(manifest.metadata.compiler.version,'0.1.2');
  assert.equal(manifest.metadata.source.sha256,hash(layoutsBytes),'Reviewed layouts changed; rebuild the font');
  assert.equal(manifest.metadata.font.sha256,hash(fontBytes));
  assert.equal(manifest.metadata.font.bytes,fontBytes.length);
  const required=new Set(layouts.layouts.flatMap(l=>l.parts.filter(p=>p.reading).map(p=>`${p.text}\0${p.reading}`)));
  const supplied=new Set(manifest.entries.map(p=>`${p.text}\0${p.reading}`));
  assert.equal(supplied.size,manifest.entries.length,'Duplicate manifest pair');
  assert.deepEqual([...supplied].sort(),[...required].sort(),'Manifest must cover exactly the reviewed ruby pairs');
  const {sfnt,tables}=decodeFurifontWoff2(fontBytes);
  const face=new hb.Face(new hb.Blob(sfnt));
  const font=new hb.Font(face);
  const inkWeights=furifontAuditWeights(tables,font);
  assert.deepEqual(manifest.metadata.font.inkAuditWeights,inkWeights);
  const axes=Object.values(face.getAxisInfos());
  const weight=axes.find(a=>a.tag==='wght');
  assert.ok(weight);assert.equal(weight.min,250);assert.equal(weight.max,900);
  assert.ok(tables.has('gvar'),'Variable outlines must be retained');
  const buffer=new hb.Buffer();
  let shapes=0,componentsChecked=0;
  const baseGlyphs=new Set();
  for(const entry of manifest.entries){
    assert.ok(Number.isInteger(entry.salt)&&entry.salt>0);
    assert.deepEqual(entry.inkOverhangEm,furifontInkOverhang(tables,font,entry,inkWeights),`${entry.text}/${entry.reading}: stale ink-overhang reservation`);
    font.setVariations([new hb.Variation('wght',250)]);
    const components=composite(tables,entry.glyphId);
    const base=[...entry.text],reading=[...entry.reading];
    const advance=chars=>chars.reduce((total,char)=>total+font.glyphHAdvance(font.nominalGlyph(char.codePointAt(0))),0);
    const span=advance(base),natural=advance(reading)*manifest.metadata.metrics.rubyScale;
    const squeeze=Math.min(natural<=span?1:Math.max(span/natural,manifest.metadata.metrics.compressionFloor),manifest.metadata.metrics.maxRubyWidth*face.upem/natural);
    assert.ok(natural*squeeze+0.01>=Math.min(natural,span),`${entry.text}/${entry.reading}: compound ruby compressed below its available base span`);
    assert.equal(components.length,base.length+reading.length,`${entry.text}/${entry.reading}: component count`);
    for(const [index,char]of [...base,...reading].entries()){
      const expected=font.nominalGlyph(char.codePointAt(0));
      assert.ok(expected,`Missing source glyph ${char}`);baseGlyphs.add(expected);
      assert.equal(components[index].glyph,expected,`${entry.text}/${entry.reading}: drawn component ${index}`);
      if(index<base.length){assert.equal(components[index].sx,1);assert.equal(components[index].sy,1);assert.equal(components[index].y,0);}
      else{assert.ok(components[index].y>0);assert.ok(Math.abs(components[index].sx-manifest.metadata.metrics.rubyScale*squeeze)<=1/16384);assert.equal(components[index].sy,manifest.metadata.metrics.rubyScale);}
      componentsChecked++;
    }
    for(const value of [250,400,700,900]){
      font.setVariations([new hb.Variation('wght',value)]);
      buffer.reset();buffer.addText(entry.text);buffer.guessSegmentProperties();
      hb.shape(font,buffer,[new hb.Feature('salt',entry.salt)]);
      assert.deepEqual(buffer.getGlyphInfos().map(g=>g.codepoint),[entry.glyphId],`${entry.text}/${entry.reading}: salt ${entry.salt}, weight ${value}`);
      assert.ok(font.glyphToJson(entry.glyphId).length>0,`Empty shaped glyph ${entry.glyph}`);
      shapes++;
    }
  }
  return {version:1,ok:true,sourceSha256:hash(layoutsBytes),fontSha256:hash(fontBytes),pairs:manifest.entries.length,layouts:layouts.layouts.length,shapes,weights:[250,400,700,900],inkAuditWeights:inkWeights,componentsChecked,sourceGlyphsVerified:baseGlyphs.size,harfbuzz:hb.versionString(),readingSource:'reviewed-ruby-layouts-only',dictionaryUsed:false,failures:0};
}

if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await auditFurifont(),null,2));
