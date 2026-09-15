import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';

const root=path.resolve('.tmp/embroidery-browser');
fs.mkdirSync(root,{recursive:true});
await build({entryPoints:['tests/browser/entry.tsx'],outfile:path.join(root,'app.js'),bundle:true,platform:'browser',format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{
  name:'local-test-boundaries',setup(build){
    build.onResolve({filter:/(CompanySettingsContext|PricingContext|ProfileContext|AuthContext|ClientSelect|MatrixDetailsModal|useBackgroundTasks|whatsappService|pdfGenerator|thermalPrinter)$/},()=>({path:path.resolve('tests/browser/mocks.tsx')}));
    build.onResolve({filter:/integrations\/supabase\/client$/},()=>({path:path.resolve('tests/browser/mocks.tsx')}));
  },
}]});
const css=spawnSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/index.css','-o',path.join(root,'style.css')],{stdio:'pipe'});
if(css.status!==0)throw new Error(css.stderr.toString());
fs.writeFileSync(path.join(root,'index.html'),'<!doctype html><html class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teste local · Matrizes</title><link rel="stylesheet" href="/style.css"></head><body style="background:#101016;color:white"><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const name=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');
  res.end(fs.readFileSync(path.join(root,name)));
}).listen(5181,'127.0.0.1',()=>console.log('Embroidery browser tests: http://127.0.0.1:5181 (external services mocked)'));
