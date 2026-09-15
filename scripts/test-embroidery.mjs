import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints: ['src/utils/embroideryParser.ts','src/utils/embroidery/ole.ts','src/utils/embroidery/properties.ts'], outdir: '.tmp/embroidery-tests', outbase:'src/utils', bundle:true, platform:'node', format:'esm', outExtension:{'.js':'.mjs'}});
const result = spawnSync(process.execPath, ['--test', 'tests/embroidery.test.mjs'], {stdio:'inherit', timeout:60000});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
