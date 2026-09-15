import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import CFB from 'cfb';
import {inspectEmbroidery, parseEmbroideryFile} from '../.tmp/embroidery-tests/embroideryParser.mjs';
import {readOle} from '../.tmp/embroidery-tests/embroidery/ole.mjs';
import {readPropertySet} from '../.tmp/embroidery-tests/embroidery/properties.mjs';

const fixture = name => fs.readFileSync(new URL('./fixtures/embroidery/' + name, import.meta.url));
const expected = [
  ['LIDER 007.DST',5973,5,55.6,78.4],
  ['LIDER 007.EMB',5973,5,10010/180,14097/180],
  ['LIDER020.DST',12564,2,80.4,71.4],
  ['LIDER020.EMB',12564,2,14485/180,12865/180],
  ['LIDER016manga.EMB',5504,2,12716/180,7604/180],
];
for (const [name,stitches,colors,width,height] of expected) {
  test(`real fixture: ${name}`, async () => {
    const bytes = fixture(name);
    const {metadata:m,previewBytes} = inspectEmbroidery(bytes,name);
    assert.equal(m.stitches,stitches); assert.equal(m.colors,colors);
    assert.ok(Math.abs(m.widthMm-width)<1e-10); assert.ok(Math.abs(m.heightMm-height)<1e-10);
    assert.equal(m.validated,true); assert.ok(Object.values(m.sources).every(Boolean));
    const fileResult = await parseEmbroideryFile(new File([bytes],name));
    assert.equal(fileResult.stitches,stitches);
    if (name.endsWith('EMB')) { assert.ok(previewBytes.length>1000); assert.ok(fileResult.preview_url); URL.revokeObjectURL(fileResult.preview_url); }
  });
}
test('007 distinguishes declared height from decoded geometry and counts END', () => {
  const {diagnostics:d,metadata:m}=inspectEmbroidery(fixture('LIDER 007.DST'),'007.dst');
  assert.equal(d.declaredHeightMm,78.2); assert.equal(d.consistent.height,false);
  assert.deepEqual(d.counts,{normal:5941,jumps:27,colorChanges:4,sequinMode:0,sequinEject:0,end:1,total:5973});
  assert.match(m.sources.heightMm,/Movimentos/); assert.equal(d.trims,null); assert.equal(d.stops,null);
});
for (const field of ['ST','CO','+X','-X','+Y','-Y']) test(`inconsistent DST ${field} falls back to decoded commands`, () => {
  const b=fixture('LIDER020.DST'), text=b.subarray(0,512).toString('ascii');
  const line=text.split('\r').find(x=>x.startsWith(field+':'));
  b.write(text.replace(line,field+':'+ '9'.repeat(line.length-3)),0,'ascii');
  const {metadata:m,diagnostics:d}=inspectEmbroidery(b,'bad-header.dst');
  assert.equal(m.stitches,12564); assert.equal(m.colors,2); assert.equal(m.widthMm,80.4); assert.equal(m.heightMm,71.4);
  assert.ok(Object.values(d.consistent).includes(false));
});
test('missing header fields fall back, decimals survive and no false default', () => {
  const b=fixture('LIDER 007.DST'); b.fill(0x20,0,512);
  const {metadata:m}=inspectEmbroidery(b,'no-header.dst');
  assert.equal(m.stitches,5973); assert.equal(m.widthMm,55.6); assert.equal(m.heightMm,78.4);
});
test('complete Tajima masks distinguish sequin commands, jumps, color changes and END', () => {
  const header=Buffer.alloc(512,32);
  const b=Buffer.concat([header,Buffer.from([0x81,0,3, 0,0,0x43, 0x81,0,0x83, 0,0,0x43, 0,0,0x83, 0,0,0xc3, 0,0,0xf3])]);
  const {diagnostics:d}=inspectEmbroidery(b,'sequin.dst');
  assert.deepEqual(d.counts,{normal:1,jumps:1,colorChanges:1,sequinMode:2,sequinEject:1,end:1,total:7});
});
test('END mask is recognized even when unused bits are set', () => {
  const b=fixture('LIDER 007.DST'); b[18430]=0xff;
  assert.equal(inspectEmbroidery(b,'end.dst').metadata.stitches,5973);
});
test('truncated files, invalid commands, empty and renamed files fail without metadata', () => {
  for (const name of ['LIDER 007.DST','LIDER 007.EMB']) {
    const b=fixture(name);
    for (const length of [0,7,48,511,512,Math.floor(b.length/2),b.length-(name.endsWith('DST')?3:1)]) assert.throws(()=>inspectEmbroidery(b.subarray(0,length),name));
  }
  const b=fixture('LIDER020.DST'); b[514]=0;
  assert.throws(()=>inspectEmbroidery(b,'invalid.dst'));
  assert.throws(()=>inspectEmbroidery(fixture('LIDER020.DST'),'renamed.emb'));
  assert.throws(()=>inspectEmbroidery(fixture('LIDER020.EMB'),'renamed.dst'));
  assert.throws(()=>inspectEmbroidery(fixture('LIDER020.DST'),'renamed.pes'));
  assert.throws(()=>inspectEmbroidery(Buffer.alloc(32*1024*1024+1),'large.emb'));
});
for (const [name] of expected.filter(([name])=>name.endsWith('EMB'))) test(`bounded OLE reader matches independent CFB library: ${name}`,()=>{
  const b=fixture(name), reference=CFB.read(b,{type:'buffer'});
  const {streams}=readOle(b);
  const actual=reference.FileIndex.filter(s=>s.type===2);
  assert.equal(streams.length,actual.length);
  for(const stream of streams) assert.deepEqual(Buffer.from(stream.content),Buffer.from(CFB.find(reference,stream.name).content));
});
function mutateProperties(fn) {
  const c=CFB.read(fixture('LIDER020.EMB'),{type:'buffer'});
  const stream=CFB.find(c,'\x05WilcomDesignInformationDDD');
  const data=Buffer.from(stream.content); fn(data); stream.content=data; stream.size=data.length;
  return Buffer.from(CFB.write(c,{type:'buffer'}));
}
function properties(b) { const s=b.readUInt32LE(44);return Array.from({length:b.readUInt32LE(s+4)},(_,i)=>({id:b.readUInt32LE(s+8+i*8),table:s+8+i*8,offset:s+b.readUInt32LE(s+12+i*8)})); }
for(const [name, mutate] of [
  ['section offset',b=>b.writeUInt32LE(0xfffffff0,44)],
  ['section count',b=>b.writeUInt32LE(0xffffffff,24)],
  ['property offset',b=>b.writeUInt32LE(0xffffffff,60)],
  ['property table count',b=>b.writeUInt32LE(0xffffffff,52)],
  ['wrong type',b=>b.writeUInt32LE(5,properties(b).find(p=>p.id===6).offset)],
  ['missing dictionary',b=>b.writeUInt32LE(88,properties(b).find(p=>p.id===0).table)],
  ['zero stitch count',b=>b.writeUInt32LE(0,properties(b).find(p=>p.id===6).offset+4)],
  ['NaN width',b=>b.writeDoubleLE(NaN,properties(b).find(p=>p.id===17).offset+4)],
  ['oversized dictionary',b=>b.writeUInt32LE(0xffffffff,properties(b).find(p=>p.id===0).offset)],
]) test(`corrupt EMB ${name} fails safely`,()=>assert.throws(()=>inspectEmbroidery(mutateProperties(mutate),'corrupt.emb')));
test('property IDs are resolved by dictionary names, not fixed IDs',()=>{
  const b=mutateProperties(b=>{
    const ps=properties(b); b.writeUInt32LE(99,ps.find(p=>p.id===6).table);
    let o=ps.find(p=>p.id===0).offset;const n=b.readUInt32LE(o);o+=4;
    for(let i=0;i<n;i++){const id=b.readUInt32LE(o),len=b.readUInt32LE(o+4);if(id===6)b.writeUInt32LE(99,o);o+=8+len;}
  });
  const {metadata:m}=inspectEmbroidery(b,'remapped.emb');assert.equal(m.stitches,12564);assert.match(m.sources.stitches,/ID 99/);
});
test('all property streams can be enumerated with bounded typed offsets',()=>{
  const {streams}=readOle(fixture('LIDER 007.EMB'));
  for(const s of streams.filter(s=>s.name.startsWith('\x05'))) assert.ok(readPropertySet(s.content)[0].properties.length>0);
});
for(const kind of ['FAT cycle','directory cycle','out-of-file sector','oversized stream']) test(`corrupt OLE ${kind} cannot loop`,()=>{
  const b=fixture('LIDER020.EMB'), dir=b.readUInt32LE(48), fat=b.readUInt32LE(76);
  if(kind==='FAT cycle') b.writeUInt32LE(dir,(fat+1)*512+dir*4);
  if(kind==='directory cycle') b.writeUInt32LE(0,(dir+1)*512+76);
  if(kind==='out-of-file sector') b.writeUInt32LE(0xffffff00,48);
  if(kind==='oversized stream') b.writeUInt32LE(0xffffffff,(dir+1)*512+120);
  assert.throws(()=>inspectEmbroidery(b,'cycle.emb'));
});
test('nonzero view offsets do not corrupt parsing',()=>{
  const source=fixture('LIDER020.EMB'), backing=Buffer.alloc(source.length+13);source.copy(backing,7);
  assert.equal(inspectEmbroidery(backing.subarray(7,7+source.length),'view.emb').metadata.stitches,12564);
});
