/** Actual production UI labels only; no editor bridge or document changes. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
import {chromium} from 'playwright';
const dist=process.argv[2]??'dist',route=process.argv[3]??'/';
const out=process.env.WRITER363_OUT??'.local/writer363-labels';await mkdir(out,{recursive:true});
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const server=await preview({configFile:false,base:route,build:{outDir:dist},preview:{host:'127.0.0.1',port:0}});
const browser=await chromium.launch();const results=[];
const bytes=await readFile('public/templates/nieuw.docx');
try{
 for(const language of ['en','nl','lo']){
  const context=await browser.newContext({viewport:{width:1600,height:1000}});const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(language=>localStorage.setItem('openaec-office-instellingen',JSON.stringify({taal:language,spelling:{controleren:false}})),language);
   await page.goto(`http://127.0.0.1:${server.httpServer.address().port}${route}`);
   await page.waitForFunction(language=>document.documentElement.lang===language,language);
   await page.locator('input[type=file]').first().setInputFiles({name:'363 label check.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
   await page.getByRole('tab',{name:/363 label check.docx/}).waitFor();
   const nl=language==='nl',tab=nl?'Stijlen':'Styles',pane=nl?'Stijlenvenster':'Styles pane';
   await page.getByRole('tab',{name:tab,exact:true}).click();
   const paneButton=page.getByRole('button',{name:pane,exact:true,includeHidden:true});
   const group=page.locator('.ribbon-groep').filter({has:paneButton});
   await group.waitFor({state:'attached'});
   if(!await paneButton.isVisible())await group.locator('.ribbon-groep-knop').click();
   await paneButton.waitFor();
   const modify=nl?'Stijl wijzigen: Standaard':'Modify Style: Normal';
   await group.getByRole('button',{name:modify,exact:true}).waitFor();
   const buttons=await group.locator('button.ribbon-actie').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent.trim(),name:n.getAttribute('aria-label'),title:n.getAttribute('title'),disabled:n.disabled})));
   assert.equal(buttons.length,5);assert(!JSON.stringify(buttons).includes('styles.manage.'));
   assert(buttons.every(b=>b.name?.trim()&&b.title?.trim()));
   assert.equal(await group.getAttribute('aria-label'),tab);
   assert(buttons.some(b=>b.name===(nl?'Nieuwe stijl…':'New Style…')));
   assert(buttons.some(b=>b.name===(nl?'Stijlset…':'Style Set…')));
   assert(buttons.some(b=>b.name===modify));
   assert.deepEqual(errors,[]);
   const png=`${language}.png`;await page.screenshot({path:`${out}/${png}`});
   results.push({language,expectedFallback:language==='lo'?'en':null,group:await group.getAttribute('aria-label'),buttons,errors,screenshot:{name:png,sha256:createHash('sha256').update(await readFile(`${out}/${png}`)).digest('hex')}});
  }catch(e){await page.screenshot({path:`${out}/${language}-failure.png`});throw e;}finally{await context.close();}
 }
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
const report={source,host:process.platform,route,dist,browser:browser.version(),status:'passed',results,documentNotEdited:true,browserClosed:true,serverClosed:true,limits:['Local production browser only; no native Windows/Linux/macOS claim','No ribbon clipping/CSS or style-command behavior change']};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({source,route,passed:results.length}));
