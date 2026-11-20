/** One normal/hosted build, source- and asset-bound, for the combined UI proof. */
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {build} from 'vite';
import {buildWriter363} from './writer-363-build.mjs';

const [dist='dist',route='/',flag,source]=process.argv.slice(2);
if(flag!=='--source')throw new Error('Usage: node scripts/bouw-writer-363-proef.mjs <dist> </|/office/> --source <fullSHA>');
const manifest=await buildWriter363({root:process.cwd(),source,dist,route,buildApp:async options=>{
  // Same preparation/typecheck as the repository build scripts; no shared config edits.
  execFileSync(process.execPath,[resolve('scripts/kopieer-assets.mjs')],{stdio:'inherit'});
  execFileSync(process.execPath,[resolve('node_modules/typescript/bin/tsc'),'--noEmit'],{stdio:'inherit'});
  await build({...options,build:{outDir:options.outDir,emptyOutDir:true,manifest:true}});
  if(route==='/office/')execFileSync(process.execPath,[resolve('scripts/controleer-hosted.mjs'),options.outDir],{stdio:'inherit'});
}});
console.log(JSON.stringify({source:manifest.source,tree:manifest.tree,route:manifest.route,filesSha256:manifest.filesSha256,files:manifest.files.length}));
