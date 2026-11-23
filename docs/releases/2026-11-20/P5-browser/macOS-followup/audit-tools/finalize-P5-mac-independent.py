from pathlib import Path
import subprocess,json,hashlib
r=Path.cwd();parent=r/'docs/releases/2026-11-20/P5-browser';d=parent/'macOS-followup';helper=r.parent/'oos-writer-field-layout-374-9d3b/qa/field374';sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
app='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';qa='6bff15bf7a4b529e389460b6c0ffa397cfaa1e9a';reviewpin='8a53e729b5bf6d52daf78e2286dc20e85f29e8a6';run=45183129618
cache={};checks=[]
def git(pin,path,repo=r):
 k=(str(repo),pin,path)
 if k not in cache:cache[k]=subprocess.check_output(['git','-C',str(repo),'show',pin+':'+path])
 return cache[k]
def lf(pin,path,reported):
 b=git(pin,path);assert sha(b)==reported,(pin,path,reported,sha(b))
 return {'commit':pin,'file':path,'exactGitLFsha256':reported,'noNormalization':True}
provenance=d/'provenance';provenance.mkdir(exist_ok=True)
for endpoint,name in [(f'actions/runs/{run}','run.json'),(f'actions/runs/{run}/jobs?per_page=100','jobs.json')]:
 raw=subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+endpoint]);(provenance/name).write_bytes(raw)
runmeta=read(provenance/'run.json');assert runmeta['head_sha']==qa and runmeta['run_attempt']==1 and runmeta['conclusion']=='success'
job=read(provenance/'jobs.json')['jobs'][0];assert job['id']==137721777872 and job['head_sha']==qa and job['run_attempt']==1 and job['conclusion']=='success'
assert subprocess.check_output(['git','rev-parse',app+'^{tree}']).decode().strip()==tree
assert json.loads(git(app,'package.json'))['version']=='2026.48.1'
reviewraw=git(reviewpin,'qa/field374/evidence/p5-mac-original-png-review.json',helper)
localreview=(helper/'evidence/p5-mac-original-png-review.json').read_bytes()
assert localreview in [reviewraw,reviewraw.replace(b'\n',b'\r\n')]
review=json.loads(reviewraw);assert review['producer']['runId']==run and review['producer']['qaCommit']==qa and review['summary']['passed']==8 and review['summary']['failed']==0
(d/'reused-original-png-review.json').write_bytes(reviewraw)
reviewbinding=[]
for case in review['cases']:
 route='field-normal' if case['route']=='/' else 'field-hosted';p=d/'macOS'/route/(case['case']+'.png')
 assert p.stat().st_size==case['bytes'] and sha(p.read_bytes())==case['sha256'] and case['originalFullPngDirectlyViewed'] and case['result']=='passed' and case['allExpectedBandsVisible'] and not case['titleOrSuffixGlyphOverlapObserved'] and not case['titleOrSuffixClippingObserved'] and case['subtitleVisibleAndSeparated']
 reviewbinding.append({'file':p.relative_to(d).as_posix(),'sha256':case['sha256'],'reviewCommit':reviewpin,'reviewReusedWithoutNewImageInspection':True})
for route in ['normal','hosted']:
 folder=d/'macOS'/route;receipt=read(folder/'build-receipt.json')
 for issue in [356,361,362,363]:
  p=folder/f'{issue}-report.json';a=read(p);cs=[]
  if issue==356:assert a['cleanupPassed'] and a['originalUnchanged'] and not a['externalRequests']
  if issue==361:
   assert not a['dirty'] and not a['cleanupErrors'] and a['buildReceipt']==receipt
   cs=[lf(app,p,h) for p,h in a['sourceHashes'].items()]
  if issue==362:
   assert a['sourceTree']==tree and not a['dirty'] and all(x['status']=='fulfilled' for x in a['cleanup']) and a['buildReceipt']==receipt
   cs=[lf(qa if p=='scripts/proef-writer-linthoogte.mjs' else app,p,h) for p,h in a['sourceFiles'].items()]
  if issue==363:assert a['tree']==tree and a['documentNotEdited'] and all(a['cleanup'][k] for k in ['serverClosed','browserClosed']) and a['buildVerifiedAfter'] and a['buildReceipt']==receipt
  checks.append({'route':route,'issue':issue,'rawReportSha256':sha(p.read_bytes()),'sourceChecks':cs,'cleanupVerified':True})
 office=read(folder/'office-report.json');checks.append({'route':route,'scope':'Office9','sourceChecks':[lf(app,p,h) for p,h in office['sourceHashes'].items()]})
 field=d/'macOS'/('field-'+route);report=read(field/'report.json')
 assert read(field/'build-receipt.json')==receipt
 checks.append({'route':route,'scope':'field374','sourceChecks':[lf(qa,'qa/field374/'+file,report[key]) for file,key in [('browser.mjs','harnessSha256'),('contract.mjs','contractSha256'),('capture.mjs','captureSha256')]]})
 preflight=read(field/'mac-caret-preflight.json');assert preflight['ready'] and preflight['focused'] and abs(preflight['atEnd']['x']-preflight['expectedProjectedModelEnd'])<=0.25 and preflight['projectionToleranceCssPx']==0.25
 assert preflight['canvasTransform']=={'a':1,'b':0,'c':0,'d':1,'e':0,'f':0}
 assert preflight['fontBinding']['packageFontSha256']=='76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8' and preflight['projectionOracle']['wasmSha256']=='c5a59ce0d980cd7f85775aaf283bcac1c19fba976b47bbe08c0387e2ca7d2569'
 checks.append({'route':route,'scope':'mac-caret-helper','sourceChecks':[lf(qa,'qa/field374/mac-field-caret.mjs',preflight['helperSha256'])],'readOnlyPreflightPassed':True,'fullInkEdgeMatched':preflight['fullInkEdgeMatched'],'semanticModelBoundaryGuard':True})
sdk=read(d/'macOS/field-sdk/report.json');checks.append({'scope':'SDK44','sourceChecks':[lf(qa,'qa/field374/sdk.mjs',sdk['harnessSha256']),lf(qa,'qa/field374/contract.mjs',sdk['contractSha256'])]})
assert len(list((d/'independent-content-audits').rglob('*.json')))==8
for p in (d/'independent-content-audits').rglob('*.json'):
 a=read(p);assert a['status']=='passed' and a['audit']['passed'] and a['exactFieldCacheAndAdjacentTextBoundary']
fieldaudit=read(d/'field-root-audit.json')
for row in fieldaudit['rows']:row['originalPNGVisualReview']='reused exact Git evidence8a53e729: reused-original-png-review.json; original PNG SHA matches' if row['scope']!='field-sdk' else 'not applicable: SDK content checks'
(d/'field-root-audit.json').write_text(json.dumps(fieldaudit,indent=2)+'\n',encoding='utf-8')
classic=read(d/'root-audit.json');classic['allAssignedRoutesPassed']=classic.pop('allFourAssignedRoutesPassed')
(d/'root-audit.json').write_text(json.dumps(classic,indent=2)+'\n',encoding='utf-8')
# Snapshot the pre-existing index and prove every original Linux/Windows file unchanged.
originalindex=parent/'complete-evidence-index.json';before=read(originalindex)
for entry in before['entries']:
 p=parent/entry['file'];assert p.stat().st_size==entry['bytes'] and sha(p.read_bytes())==entry['sha256']
assert len(before['entries'])==178
audit={'status':'passed','application':app,'tree':tree,'version':'2026.48.1','qa':qa,'run':run,'job':137721777872,'attempt':1,'classicOfficeCases':18,'oldWriterIssueRouteChecks':8,'SDKchecks':44,'fieldPaintCases':8,'fieldDOCXIndependentAudits':8,'reusedOriginalPNGReviews':8,'sourceAndCleanupChecks':checks,'reusedReview':{'commit':reviewpin,'rawGitJsonSha256':sha(reviewraw),'rawGitJsonPreserved':True,'images':reviewbinding},'existing178FilesUnchanged':True,'originalCompleteIndexSha256':sha(originalindex.read_bytes()),'limits':['Browser evidence only; no native/signed package acceptance.','CI assets absent from archive: no separate full asset-byte rehash.','Caret model-end projection differs from ink edge; guarded and documented QA boundary, no new unproved product navigation bug.','No repeated original image review; exact eight-image Git-reviewed evidence reused.','No new archive download, GUI, CI or app build.']}
(d/'independent-mac-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
for name in ['prepare-P5-mac-independent.py','audit-P5-mac-browser-independent.py','audit-P5-mac-field-independent.py','finalize-P5-mac-independent.py']:
 target=d/'audit-tools'/name;target.parent.mkdir(exist_ok=True);target.write_bytes((r/'.local'/name).read_bytes())
inventory=[{'file':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(d.rglob('*')) if p.is_file() and p.name!='complete-evidence-index.json']
(d/'complete-evidence-index.json').write_text(json.dumps({'application':app,'tree':tree,'qa':qa,'run':run,'entries':inventory},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','routes':2,'officeCases':18,'SDKchecks':44,'independentDOCX':8,'reusedPNGReviews':8,'retainedMacFiles':len(inventory),'original178FilesUnchanged':True}))
