import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

await build({entryPoints:['src/utils/embroideryParser.ts','src/utils/embroidery/ole.ts','src/utils/embroidery/properties.ts'],outdir:'.tmp/embroidery-tests',outbase:'src/utils',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'}});
const {inspectEmbroidery}=await import('../.tmp/embroidery-tests/embroideryParser.mjs');
const {readOle,hex}=await import('../.tmp/embroidery-tests/embroidery/ole.mjs');
const {readPropertySet}=await import('../.tmp/embroidery-tests/embroidery/properties.mjs');
const inputs=process.argv.slice(2);
const files=inputs.length?inputs:fs.readdirSync('tests/fixtures/embroidery').filter(n=>/\.(emb|dst)$/i.test(n)).map(n=>path.join('tests/fixtures/embroidery',n));
const report=[];
for(const file of files) {
  const data=fs.readFileSync(file), name=path.basename(file);
  const result={name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),signature:hex(data.subarray(0,16))};
  try {
    const {metadata,diagnostics}=inspectEmbroidery(data,name);
    Object.assign(result,{metadata,diagnostics});
  } catch(error) {result.error=error.message;}
  if(data[0]===0xd0) {
    try {
      result.propertyStreams=readOle(data).streams.filter(s=>s.name.startsWith('\x05')).map(s=>{
        try{return {path:s.path,sections:readPropertySet(s.content).map(section=>({...section,properties:section.properties.map(p=>({...p,bytes:p.bytes?hex(p.bytes):undefined}))}))};}
        catch(error){return {path:s.path,error:error.message};}
      });
    } catch(error){result.oleError=error.message;}
  }
  report.push(result);
}
fs.mkdirSync('docs/embroidery',{recursive:true});
fs.writeFileSync('docs/embroidery/diagnostics.json',JSON.stringify(report,null,2)+'\n');
console.table(report.map(r=>({file:r.name,stitches:r.metadata?.stitches,colors:r.metadata?.colors,widthMm:r.metadata?.widthMm,heightMm:r.metadata?.heightMm,error:r.error??''})));
console.log('Full report: docs/embroidery/diagnostics.json');
if(report.some(r=>r.error))process.exitCode=1;
