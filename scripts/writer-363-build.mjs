import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {lstat,readFile,readdir,realpath,unlink,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';

export const WRITER363_WITNESS='writer363-build.json';
const META='openaec-writer363-source';
const sum=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
export function writer363Source(root,expected) {
  assert.match(expected??'',/^[0-9a-f]{40}$/,'A full, explicit application SHA is required');
  assert.equal(git(root,'rev-parse','HEAD'),expected,'Application checkout differs from expected SHA');
  assert.equal(git(root,'status','--porcelain','--untracked-files=normal'),'','Application checkout must be clean');
  return {source:expected,tree:git(root,'rev-parse','HEAD^{tree}')};
}
function routeInfo(route) {
  assert(['/','/office/'].includes(route),'Unsupported Writer363 browser route');
  return {route,base:route==='/'?'/':'./',mode:route==='/'?'production':'hosted'};
}
/** Validate the absolute target and existing parent before Vite can empty it. */
export async function writer363Output(root,dist) {
  const actualRoot=await realpath(root),target=resolve(actualRoot,dist);
  const rel=relative(actualRoot,target);
  assert(rel&&!rel.startsWith('..'+sep)&&!isAbsolute(rel),'Build output must stay inside the worktree');
  assert(['dist','dist-hosted'].includes(rel)||rel.replaceAll('\\','/').startsWith('.local/writer363-'),'Use dist, dist-hosted, or .local/writer363-* output');
  let parent=target;
  while(true){
    try { const info=await lstat(parent);assert(!info.isSymbolicLink(),'No symlink build target');break; }
    catch(error){ if(error.code!=='ENOENT')throw error;parent=dirname(parent); }
  }
  const actualParent=await realpath(parent);
  assert(actualParent===actualRoot||actualParent.startsWith(actualRoot+sep),'Resolved output escapes the worktree');
  return target;
}
async function fileDigest(path) {
  const h=createHash('sha256');for await(const bytes of createReadStream(path))h.update(bytes);return h.digest('hex');
}
async function filesAt(root,part='') {
  const result=[];
  for(const entry of await readdir(resolve(root,part),{withFileTypes:true})){
    const name=part?`${part}/${entry.name}`:entry.name;
    const path=resolve(root,name),info=await lstat(path);
    assert(!info.isSymbolicLink(),'Build output must not contain symlinks');
    if(info.isDirectory())result.push(...await filesAt(root,name));
    else if(name!==WRITER363_WITNESS){
      assert(info.isFile(),'Unsupported output entry');
      result.push({path:name,bytes:info.size,sha256:await fileDigest(path)});
    }
  }
  return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
async function checkHtml(dist,source) {
  const html=await readFile(resolve(dist,'index.html'),'utf8');
  const markers=[...html.matchAll(new RegExp(`<meta name="${META}" content="([0-9a-f]+)"\\s*/?>`,'g'))];
  assert.equal(markers.length,1,'Built HTML must contain exactly one source marker');
  assert.equal(markers[0][1],source,'Built HTML belongs to another source');
}
/** This plugin only annotates proof builds, never the checked-in app HTML. */
export function writer363SourcePlugin(source) {
  return {name:'writer363-build-source',transformIndexHtml:{order:'post',handler:()=>[
    {tag:'meta',attrs:{name:META,content:source},injectTo:'head'},
  ]}};
}
export async function buildWriter363({root,source,dist,route,buildApp}) {
  const identity=writer363Source(root,source),info=routeInfo(route);
  const output=await writer363Output(root,dist);
  const witness=resolve(output,WRITER363_WITNESS);
  await unlink(witness).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await buildApp({root,outDir:output,...info,plugins:[writer363SourcePlugin(source)]});
  assert.deepEqual(writer363Source(root,source),identity,'Source changed during build');
  await checkHtml(output,source);
  const files=await filesAt(output);
  const manifest={schema:1,...identity,...info,files,filesSha256:sum(JSON.stringify(files))};
  await writeFile(witness,JSON.stringify(manifest,null,2)+'\n','utf8');
  return manifest;
}
export async function verifyWriter363Build({root,source,dist,route}) {
  const identity=writer363Source(root,source),info=routeInfo(route);
  const output=await writer363Output(root,dist);
  assert(!(await lstat(resolve(output,WRITER363_WITNESS))).isSymbolicLink(),'No symlink witness');
  const manifest=JSON.parse(await readFile(resolve(output,WRITER363_WITNESS),'utf8'));
  assert.equal(manifest.schema,1,'Unknown build witness schema');
  for(const [key,value]of Object.entries({...identity,...info}))assert.equal(manifest[key],value,`Build witness ${key} mismatch`);
  await checkHtml(output,source);
  const files=await filesAt(output);
  assert.equal(sum(JSON.stringify(files)),manifest.filesSha256,'Build assets changed after build');
  assert.deepEqual(files,manifest.files,'Missing, changed or unexpected build files');
  return manifest;
}
