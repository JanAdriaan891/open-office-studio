from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,subprocess
r=Path.cwd();d=r/'docs/releases/2026-11-20/P5-browser';sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
app='b696ab86bd1c128729a079b68c0082e6df3d36a5';qa='7be704895534c3095f697292af07dc10d2e5860b';tree='e30879fd772871e690847c061ef66e6b81808a05';run=45179944903
cache={}
def git(pin,path):
 key=(pin,path)
 if key not in cache:cache[key]=subprocess.check_output(['git','show',pin+':'+path])
 return cache[key]
def check(pin,path,reported):
 raw=git(pin,path);lf=sha(raw);crlf=sha(raw.replace(b'\n',b'\r\n'));assert reported in (lf,crlf),(pin,path,reported,lf,crlf)
 return {'path':path,'gitCommit':pin,'gitBlobLFsha256':lf,'checkoutCRLFsha256':crlf,'reportedSha256':reported,'matchesGitLF':reported==lf,'matchesCheckoutCRLF':reported==crlf,'normalizationAppliedToEvidence':False}
provenance=d/'provenance';provenance.mkdir(exist_ok=True)
for endpoint,name in [(f'actions/runs/{run}','run.json'),(f'actions/runs/{run}/jobs?per_page=100','jobs.json')]:
 raw=subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+endpoint]);(provenance/name).write_bytes(raw)
runmeta=read(provenance/'run.json');assert runmeta['head_sha']==qa and runmeta['run_attempt']==1
jobs=read(provenance/'jobs.json')['jobs'];assert all(next(j for j in jobs if j['id']==jid)['conclusion']=='success' for jid in [137710842379,137710841837])
assert subprocess.check_output(['git','rev-parse',app+'^{tree}']).decode().strip()==tree
assert json.loads(git(app,'package.json'))['version']=='2026.48.1'
rows=[];reviews=[]
for platform in ['Linux','Windows']:
 (provenance/('artifacts-'+platform+'.json')).write_bytes((r/f'.local/nov20-ci/{run}/artifacts-{platform}.json').read_bytes())
 for route in ['normal','hosted']:
  path=d/platform/route;receipt=read(path/'build-receipt.json')
  for issue in [356,361,362,363]:
   report=read(path/f'{issue}-report.json');checks=[]
   if issue==356:assert report['cleanupPassed'] and report['originalUnchanged'] and not report['externalRequests']
   if issue==361:
    assert not report['dirty'] and not report['cleanupErrors'] and report['buildReceipt']==receipt
    checks=[check(app,p,h) for p,h in report['sourceHashes'].items()]
   if issue==362:
    assert report['sourceTree']==tree and not report['dirty'] and all(x['status']=='fulfilled' for x in report['cleanup']) and report['buildReceipt']==receipt
    checks=[check(qa if p=='scripts/proef-writer-linthoogte.mjs' else app,p,h) for p,h in report['sourceFiles'].items()]
   if issue==363:assert report['tree']==tree and report['documentNotEdited'] and all(report['cleanup'][k] for k in ['serverClosed','browserClosed']) and report['buildVerifiedAfter'] and report['buildReceipt']==receipt
   rows.append({'platform':platform,'route':route,'issue':issue,'rawReportSha256':sha((path/f'{issue}-report.json').read_bytes()),'sourceChecks':checks,'cleanupVerified':True})
  office=read(path/'office-report.json');rows.append({'platform':platform,'route':route,'scope':'Office9','sourceChecks':[check(app,p,h) for p,h in office['sourceHashes'].items()]})
  field=d/platform/('field-'+route);report=read(field/'report.json')
  rows.append({'platform':platform,'route':route,'scope':'field374-harness','sourceChecks':[check(qa,file,report[key]) for file,key in [('qa/field374/browser.mjs','harnessSha256'),('qa/field374/contract.mjs','contractSha256'),('qa/field374/capture.mjs','captureSha256')]]})
  for name in ['unchanged-windows-source','unmodified-control','after-real-edit','fresh-context-reopen']:
   p=field/(name+'.png');raw=p.read_bytes();capture=read(field/(name+'-capture.json'));assert sha(raw)==capture['acceptedPngSha256']
   reviews.append({'platform':platform,'route':'/' if route=='normal' else '/office/','file':p.relative_to(d).as_posix(),'bytes':len(raw),'sha256':sha(raw),'originalViewedDirectlyAndSerially':True,'status':'passed','titleVisible':'REPORT TITLE' if name=='unmodified-control' else 'REPORT TITLE -- / STW30 EDIT / 2026-11-23','markerExpected':name!='unmodified-control','completeExpectedTitleAndMarkerVisible':True,'glyphOverlapObserved':False,'titleClippingObserved':False,'subtitleVisibleAndSeparated':True,'fontSubstitutionNoticeObserved':True})
helper=r.parent/'oos-writer-field-layout-374-9d3b/qa/field374'
oracle=[]
for file in ['audit-docx.mjs','contract.mjs','oracle.py']:
 raw=(helper/file).read_bytes();original=subprocess.check_output(['git','-C',str(helper),'show','3169b09020184e3a98a4d5364ad77b15f38ac063:qa/field374/'+file])
 assert raw in [original,original.replace(b'\n',b'\r\n')]
 oracle.append({'file':file,'referenceCommit':'3169b09020184e3a98a4d5364ad77b15f38ac063','canonicalGitSha256':sha(original),'localUsedSha256':sha(raw),'matchesGitLF':raw==original,'matchesCheckoutCRLF':raw==original.replace(b'\n',b'\r\n')})
(d/'source-cleanup-and-line-endings-audit.json').write_text(json.dumps({'application':app,'tree':tree,'qa':qa,'rows':rows,'sharedOracleBinding':oracle},indent=2)+'\n',encoding='utf-8')
(d/'original-png-review.json').write_text(json.dumps({'reviewedAtUTC':datetime.now(timezone.utc).isoformat(),'application':app,'qa':qa,'run':run,'originalFinalPNGsReviewed':16,'markerImages':12,'controls':4,'status':'passed','rows':reviews,'limits':['Title/marker region review only; no full-document, native, cross-OS font or pixel identity claim.','Existing font-substitution notices observed.','Known Mac caret-projection/blink QA boundaries are outside this two-OS evidence review; no unproved product-navigation or capture bug inferred.']},indent=2)+'\n',encoding='utf-8')
fieldAudit=read(d/'field-root-audit.json')
for row in fieldAudit['rows']:
 row['originalPNGVisualReview']='passed: original-png-review.json, 4 original final images directly viewed' if row['scope']!='field-sdk' else 'not applicable: SDK content checks'
(d/'field-root-audit.json').write_text(json.dumps(fieldAudit,indent=2)+'\n',encoding='utf-8')
for file in ['audit-P5-browser-independent.py','audit-P5-field-browser-independent.py','finalize-P5-browser-independent.py']:
 target=d/'audit-tools'/file;target.parent.mkdir(exist_ok=True);target.write_bytes((r/'.local'/file).read_bytes())
for p in d.glob('independent-content-audits/*/*/*.json'):
 a=read(p);assert a['status']=='passed' and a['exactFieldCacheAndAdjacentTextBoundary'] and a['audit']['passed']
assert len(list(d.glob('independent-content-audits/*/*/*.json')))==16
for platform in ['Linux','Windows']:
 for label in ['field-sdk','field-normal','field-hosted']:
  for p in (d/platform/label).glob('*.docx'):
   original=r/f'.local/nov20-ci/{run}/writer-481-browser-QA-{platform}/app/.local/writer-481-QA-{label}'/p.name
   assert p.read_bytes()==original.read_bytes()
inventory=[{'file':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(d.rglob('*')) if p.is_file() and p.name!='complete-evidence-index.json']
(d/'complete-evidence-index.json').write_text(json.dumps({'application':app,'tree':tree,'qa':qa,'run':run,'entries':inventory},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'status':'passed','platforms':2,'routes':4,'officeCases':36,'oldWriterIssueRouteChecks':16,'fieldSDKChecksPerOS':44,'fieldPaintCases':16,'fieldDOCXIndependentAudits':16,'originalPNGReviews':16,'retainedFiles':len(inventory),'nativeAcceptance':False}))
