from pathlib import Path
import json,hashlib,subprocess,sys
r=Path.cwd();dest=r/'docs/releases/2026-11-20/P5-browser/macOS-followup';src='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';qa='6bff15bf7a4b529e389460b6c0ffa397cfaa1e9a';helper=r.parent/'oos-writer-field-layout-374-9d3b/qa/field374/audit-docx.mjs';python=r'C:/Users/alper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
index=read(dest/'field-evidence-index.json') if (dest/'field-evidence-index.json').exists() else {'entries':[]};rows=[]
for platform in sys.argv[1:]:
 base=r/'.local/nov20-ci/45183129618'/('writer-481-browser-QA-'+platform)/'app/.local';sdk=read(base/'writer-481-QA-field-sdk/report.json');assert sdk['applicationCommit']==src and sdk['status']=='passed' and len(sdk['checks'])==44 and all(x['passed'] for x in sdk['checks']);assert sdk['cleanup']=={'sessionsDestroyed':True,'privateKernelClosed':True,'guiStarted':False}
 assert sdk['kernels']['edit']['sha256']=='4364eb8065228c805d8fbefe7e58c29e392516b6e7cca419e191766881d324ce' and sdk['kernels']['layout']['sha256']=='c5a59ce0d980cd7f85775aaf283bcac1c19fba976b47bbe08c0387e2ca7d2569'
 for label in ['field-sdk','field-normal','field-hosted']:
  folder=base/('writer-481-QA-'+label);report=read(folder/'report.json')
  if label!='field-sdk':
   assert report['applicationCommit']==src and report['applicationTree']==tree and report['status']=='passed' and not report['errors'] and not report['externalRequests'];assert all(report['cleanup'][x] for x in ['contextsClosed','browserClosed','serverClosed']) and not report['cleanup']['errors']
   for file,key in [('browser.mjs','harnessSha256'),('contract.mjs','contractSha256'),('capture.mjs','captureSha256')]:
    raw=subprocess.check_output(['git','show',qa+':qa/field374/'+file]);assert report[key] in [sha(raw),sha(raw.replace(b'\n',b'\r\n'))]
   paint=[x for x in report['cases'] if 'paintedTitleObserved' in x];saved=[x for x in report['cases'] if 'saveAudit' in x];assert len(paint)==4 and len(saved)==3 and all(x['saveAudit']['passed'] for x in saved)
   for case in paint:
    assert case['paintedTitleObserved'] and case['fullExpectedTextPainted'] and case['overlappingGlyphRuns']==0
    image=folder/(case['name']+'.png');capture=read(folder/(case['name']+'-capture.json'));assert case['stableOriginalPngSha256']==capture['acceptedPngSha256']==sha(image.read_bytes());assert capture['status']=='stable-original-PNG-captured' and capture['doubleAnimationFramesPerSample'] and capture['requiredConsecutive']==3 and capture['requiredStableMs']==200
    last=capture['samples'][-1];assert last['consecutive']>=3 and last['stableForMs']>=200 and last['completePaintUnchangedDuringCapture'] and last['pngSha256']==capture['acceptedPngSha256']
  for p in folder.iterdir():
   if not p.is_file():continue
   raw=p.read_bytes();out=dest/platform/label/p.name;out.parent.mkdir(parents=True,exist_ok=True)
   if out.exists():assert out.read_bytes()==raw
   else:out.write_bytes(raw)
   key=out.relative_to(dest).as_posix();index['entries']=[x for x in index['entries'] if x['file']!=key]+[{'file':key,'bytes':len(raw),'sha256':sha(raw)}]
   if p.suffix=='.docx':
    output=r/'.local/P5-browser/macOS-followup-docx-audits'/platform/label/p.stem;output.parent.mkdir(parents=True,exist_ok=True)
    if not output.exists():subprocess.run(['node',str(helper),str(p),str(output),' -- STW30 EDIT 2026-11-23'],env={**__import__('os').environ,'OOS_FIELD_PYTHON':python},check=True,stdout=subprocess.DEVNULL)
    audit=read(output/'report.json');assert audit['status']=='passed' and audit['inputSha256']==sha(raw) and audit['exactFieldCacheAndAdjacentTextBoundary'] and audit['audit']['passed']
    rawAudit=(output/'report.json').read_bytes();audit['rawAuditSha256']=sha(rawAudit);audit['input']=platform+'/'+label+'/'+p.name;audit['localInputPathSanitized']=True
    retained=dest/'independent-content-audits'/platform/label/(p.stem+'.json');retained.parent.mkdir(parents=True,exist_ok=True);retained.write_text(json.dumps(audit,indent=2)+'\n')
  rows.append({'platform':platform,'scope':label,'source':src,'status':'passed','sdkChecks':44 if label=='field-sdk' else None,'paintObservations':4 if label!='field-sdk' else None,'savedDocumentsIndependentlyAudited':2 if label=='field-sdk' else 3,'originalPNGVisualReview':'pending separate explicit review; stable pixels and worker geometry alone are insufficient','nativeAcceptance':False})
auditpath=dest/'field-root-audit.json';old=read(auditpath).get('rows',[]) if auditpath.exists() else [];rows=[x for x in old if x['platform'] not in sys.argv[1:]]+rows
(dest/'field-evidence-index.json').write_text(json.dumps(index,indent=2)+'\n');auditpath.write_text(json.dumps({'source':src,'tree':tree,'harness':qa,'run':45183129618,'rows':rows,'allAssignedPlatformsPassed':len({x['platform'] for x in rows})==1,'nativeAcceptance':False},indent=2)+'\n');print(json.dumps({'platforms':sys.argv[1:],'scopeRows':len(rows),'retainedOriginalPayloads':len(index['entries'])}))
