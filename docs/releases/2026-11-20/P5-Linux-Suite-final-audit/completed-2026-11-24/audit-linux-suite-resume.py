from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import hashlib,json,subprocess,zipfile,stat,posixpath,xml.etree.ElementTree as ET
r=Path.cwd();owner=r.parent/'oos-linux-suite-final-acceptance-2026-11-23';rawroot=Path('\\\\?\\'+str(owner.resolve()))/'.local/final-native-proof';root=r/'docs/releases/2026-11-20/P5-Linux-Suite-final-audit';dest=Path('\\\\?\\'+str(root.resolve()))/'completed-2026-11-24';dest.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));app='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05'
cache={}
def git(pin,path,repo=owner):
 k=(str(repo),pin,path)
 if k not in cache:cache[k]=subprocess.check_output(['git','-C',str(repo),'show',pin+':'+path])
 return cache[k]
def save(raw,path):
 p=dest/path;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==raw,str(p)
 else:p.write_bytes(raw)
def write(value,path):save((json.dumps(value,indent=2)+'\n').encode(),path)
old=read(root/'evidence-index.json')
for e in old['entries']:
 p=root/e['file'];assert p.stat().st_size==e['bytes'] and sha(p.read_bytes())==e['sha256']
assert len(old['entries'])==37
finalraw=(root/'owner-receipts/final-receipt.json').read_bytes();assert sha(finalraw)=='267ecaa97893e6dbbe8aa8df7b9ff826e78f317cf2fbfdc5cfeb02586a80a3b6'
assert git('0810c25bc0532e12ab44e87635668faa33ef4ca5','docs/tests/2026-11-23-linux-suite-p5/final-receipt.json')==finalraw
final=json.loads(finalraw);assert final['source']=={'commit':app,'tree':tree} and final['version']=='2026.48.1' and not final['fullNativeAcceptance']
scopes={
 'core':('45189806911','deb',14825596587,'e9cd1b780be2b164288a71a1d23e77190ffae1c24e37208c99e8b3746e44d0f9','e230df9ee4a019db01368d93689893fb2b03d245',137745078121,'suite-final-core',64),
 'appimage-missing':('45193170006','appimage',14826753707,'1d229975a6f2c3863261bc84efe52abaf11b3cc8443a2deaa5a38b4574deddae','55a651186c35bde2937a1a8c529c4c2c984d0085',137756775739,'suite-final-appimage-confirm378-missing',13),
 'appimage-positive':('45193170006','appimage',14826753707,'1d229975a6f2c3863261bc84efe52abaf11b3cc8443a2deaa5a38b4574deddae','55a651186c35bde2937a1a8c529c4c2c984d0085',137756775739,'suite-final-appimage-confirm378-present',7),
 'deb-positive':('45193639082','deb',14827731026,'336d4c6e693f6e74595dc980276a89357e574e37b32b9314276e078640eb751e','80f85a5cb4ae536f1bf7248fbe4cfeeb2653d7d4',137758403838,'suite-final-deb-confirm378-both',16),
 'deb-missing':('45196900595','deb',14830235258,'1ff5ec2fb1f91245f778408e5a52b57b00f5f25890a383e9e2e6f654fea74160','332aa081b7579b39cb39f0499b9d0669b4a3d239',137769907340,'suite-final-deb-confirm378-missing',13),
}
archives={};reports={};sourcechecks=[];metadata=[]
for label,(run,kind,aid,digest,pin,jid,folder,count) in scopes.items():
 base=rawroot/run/kind;archive=base/(str(aid)+'.zip');a=read(base/'artifact.json');runmeta=read(rawroot/run/'run.json');job=next(x for x in read(rawroot/run/'jobs.json')['jobs'] if x['id']==jid)
 assert a['id']==aid and a['digest']=='sha256:'+digest and a['size_in_bytes']==archive.stat().st_size and sha(archive.read_bytes())==digest
 assert a['workflow_run']['id']==int(run) and a['workflow_run']['head_sha']==pin and runmeta['head_sha']==pin and runmeta['run_attempt']==1 and job['head_sha']==pin and job['run_attempt']==1
 if aid not in archives:
  manifest=[]
  with zipfile.ZipFile(archive) as z:
   names=set()
   for e in z.infolist():
    p=PurePosixPath(e.filename);mode=e.external_attr>>16
    assert e.filename not in names;names.add(e.filename)
    assert not p.is_absolute() and '..' not in p.parts and ':' not in e.filename and '\\' not in e.filename and not stat.S_ISLNK(mode)
    assert not stat.S_IFMT(mode) or stat.S_ISREG(mode) or stat.S_ISDIR(mode)
    if e.is_dir():continue
    payload=z.read(e);local=base/'raw'/e.filename;assert local.is_file() and local.read_bytes()==payload,e.filename
    manifest.append({'member':e.filename,'bytes':len(payload),'sha256':sha(payload)})
  archives[aid]={'artifactId':aid,'localArchive':str(archive),'bytes':archive.stat().st_size,'sha256':digest,'cachedOfficialDigestMatches':True,'allLocalRawMembersByteIdentical':True,'members':manifest}
  save((base/'artifact.json').read_bytes(),'provenance/'+str(aid)+'-artifact.json')
  save((rawroot/run/'run.json').read_bytes(),'provenance/'+run+'-run.json');save((rawroot/run/'jobs.json').read_bytes(),'provenance/'+run+'-jobs.json')
 raw=(base/'raw/linux-p2-native'/folder/'report.json').read_bytes();assert raw==(root/'raw-reports'/ (label+'.json')).read_bytes();s=json.loads(raw);reports[label]=s
 assert s['source']=={'commit':app,'tree':tree} and s['harnessCommit']==pin and len(s['checks'])==count
 if label=='core':
  assert job['conclusion']=='failure' and next(x for x in job['steps'] if x['name']=='Actual DEB core368/369 and vertical362')['conclusion']=='success'
 elif label=='deb-positive':
  assert job['conclusion']=='failure' and s['status']=='failed' and s['failedPhase']=='378-missing-runtime' and s['confirmationPositive']['status']=='passed'
 else:assert job['conclusion']=='success' and s['status'].startswith('passed bounded')
 filechecks=[]
 for path,h in s['harnessFiles'].items():
  full=posixpath.normpath('scripts/'+path);blob=git(pin,full);assert sha(blob)==h,(label,full,h,sha(blob));save(blob,'src/'+pin[:8]+'/'+PurePosixPath(full).name)
  filechecks.append({'path':full,'sha256':h,'exactGitLF':True})
 assert s['harnessSha256'] in [x['sha256'] for x in filechecks]
 if label!='core':
  scenario='scripts/proef-linux-suite-final-confirm378.mjs';blob=git(pin,scenario);save(blob,'src/'+pin[:8]+'/'+PurePosixPath(scenario).name);filechecks.append({'path':scenario,'sha256':sha(blob),'exactGitLF':True})
 origin=s['origin'];assert (origin['sourceCommit'],origin['sourceTree'],origin['version'])==(app,tree,'2026.48.1') and origin['executionApproved']
 dpath='docs/tests/linux-release-input-p5/office-'+kind+'-input-descriptor.json';descriptor=git(origin['descriptorGit'],dpath)
 assert sha(descriptor)==origin['descriptorSha256'] and json.loads(descriptor)==origin['origin'];save(descriptor,'desc/'+kind+'.json')
 bound=origin['origin'];assert bound['parent']['sourceCommit']==app and bound['parent']['sourceTree']==tree and bound['parent']['job']==137703365848 and bound['parent']['run']==45177730188 and bound['parent']['attempt']==1
 assert bound['package']['sha256']==origin['packageSha256'] and bound['package']['payloadElf']['sha256']==origin['executableSha256']==origin['expectedPayloadElf']['sha256']
 pkg=base/'raw/linux-suite-final-input/canonical-package-report.json';assert sha(pkg.read_bytes())==bound['parent']['packageReportSha256']
 save(pkg.read_bytes(),'desc/package-report.json')
 identity=read(base/'raw/linux-suite-final-input'/ (kind+'-identity.json'));assert identity==origin
 save((base/'raw/linux-suite-final-input'/ (kind+'-identity.json')).read_bytes(),'identities/'+label+'.json')
 sourcechecks.append({'scope':label,'harnessCommit':pin,'files':filechecks,'descriptorGit':origin['descriptorGit'],'descriptorSha256':origin['descriptorSha256'],'packageSha256':origin['packageSha256'],'expectedELF':origin['executableSha256']})
 metadata.append({'scope':label,'run':int(run),'job':jid,'originalJobConclusion':job['conclusion'],'checks':count,'reportSha256':sha(raw),'reportStatus':s['status'],'completedPositiveScopeRetained':True})
write({'original37FilesUnchanged':True,'ownerFinalReceiptGitAndLocalSHA':sha(finalraw),'archiveBindings':list(archives.values()),'sourceChecks':sourcechecks,'jobsAndScopes':metadata},'foundation-audit.json')
print(json.dumps({'phase':'foundation','status':'passed','proofZIPs':len(archives),'scopes':len(reports),'original37FilesUnchanged':True}))
sessionAudits=[];xmlAudits=[];confirmationAudits=[];imageBindings=[]
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def grid(path):
 raw=path.read_bytes()
 with zipfile.ZipFile(path) as z:
  doc=ET.fromstring(z.read('word/document.xml'));tables=doc.findall('.//w:tbl',ns)
  assert len(tables)==1,str(path)
  rows=[[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)]
 return raw,rows
def checkCleanup(s):
 c=s['cleanup'];assert c['driverExited'] and c['ownedApplicationClosed'] and not c['remainingApplicationPids'] and not c.get('remainingOwnedResources',[]) and not c.get('errors',[])
 for key in ['children','registeredPortalPeers','attributedBackends']:
  assert all(x['closed'] for x in c.get(key,[]))
 return c
for label,(run,kind,aid,digest,pin,jid,folder,count) in scopes.items():
 s=reports[label];base=rawroot/run/kind/'raw/linux-p2-native'/folder;origin=s['origin'];pids=[x['pid'] for x in s['sessions']]
 assert len(set(pids))==len(pids) and len(s['sessionEnvironments'])==len(s['sessions'])
 environmental=[]
 for session,environ in zip(s['sessions'],s['sessionEnvironments']):
  assert session['phase']==environ['phase'] and session['document']==environ['document'] and environ['xauthorityFileExists']
  assert session['executableSha256']==origin['executableSha256']==session['x11']['binding']['sha256']
  assert session['pid']==session['x11']['pid']==session['x11']['binding']['pid']
  expected=environ['parent'];assert environ['driver']==expected and session['environment']==expected
  assert expected['DISPLAY']==':99' and expected['GDK_BACKEND']=='x11' and '/'+folder+'/profile/config' in expected['XDG_CONFIG_HOME'] and '/'+folder+'/profile/data' in expected['XDG_DATA_HOME']
  assert all(x['environment']==expected for x in environ['children']) and all(x['environment']==expected for x in session['transientApplications'])
  assert all(x['process']['pid']==session['pid'] for x in session['x11']['checks'])
  assert all(x['windowFocus']==session['x11']['xid'] and x['dom']['hasFocus'] and x['dom']['visibilityState']=='visible' and not x['dom']['hidden'] for x in session['x11']['checks'])
  if label!='core':
   assert session['graphicsEnvironment']=={'GDK_BACKEND':'x11','LIBGL_ALWAYS_SOFTWARE':'1','WEBKIT_DISABLE_DMABUF_RENDERER':'1'}
   if kind=='deb':assert session['actualExecutable']=='/usr/bin/open-office-studio'
   else:assert session['actualAppImage']==origin['launchPath'] and session['actualExecutable']==session['actualAppDir']+'/usr/bin/open-office-studio' and session['actualAppDir'].startswith('/tmp/')
  environmental.append({'phase':session['phase'],'document':session['document'],'pid':session['pid'],'executableSha256':session['executableSha256'],'xid':session['x11']['xid'],'nativeFocusChecks':len(session['x11']['checks']),'parentDriverActualAppAndTransientEnvironmentMatch':True,'graphics':session.get('graphicsEnvironment',{'GDK_BACKEND':'x11','extraGraphicsValues':'Not independently recorded in original core session; runtime reports software mode; no body-paint certification.'})})
 normal=[x for x in s['checks'] if x['label']=='normal native Alt+F4 full process exit'];assert normal and all(not x['remainingPids'] and x['pid'] in pids for x in normal)
 cleanup=checkCleanup(s)
 for cap in s['captures']:
  p=base/cap['file'];assert sha(p.read_bytes())==cap['sha256'] and cap['backend']=='owned X11 window pixels' and cap['pid'] in pids
 if label!='core':
  for capture in s['presentedCaptures']:
   image=base/(capture['name']+'.png');assert sha(image.read_bytes())==capture['retainedFinalSha256']
   assert len(capture['samples'])==3 and all(sha((base/x['file']).read_bytes())==x['sha256'] for x in capture['samples'])
 # Independently parse every actual saved XML assertion, leaving inputs unchanged.
 for chk in s['checks']:
  if chk['label']=='saved DOCX independent XML oracle':
   path=base/chk['file'];raw,rows=grid(path);assert sha(raw)==chk['sha256'] and rows==chk['rows']
   save(raw,'saved/'+label+'/'+path.name)
   xmlAudits.append({'scope':label,'file':path.name,'sha256':sha(raw),'rows':rows,'matchesNativeSaveReceiptAndIndependentXML':True})
 if label=='core':
  assert len(s['checks'])==64 and all(x['status']=='passed' and x['applicationClosed'] for x in s['scopes'].values())
  # Replace-field scenario intentionally remains unsaved; preserve the exact original fixture.
  path=base/'replace-table.docx';raw,rows=grid(path);assert sha(raw)==s['fixtures']['replace-table']['sha256'] and rows==[['alpha','beta',''],['','','omega'],['delta','','']]
  assert s['checks'][12]['label']=='empty input Undo stays empty'
  normalPids={x['pid'] for x in normal};assert len(normalPids)==6
  rest=[x for x in s['checks'] if x['label']=='full process exit'];assert len(rest)==2 and all(not x['pids'] for x in rest)
  ribbon=read(base/'ribbon/report.json');save((base/'ribbon/report.json').read_bytes(),'ribbon-report.json')
  assert ribbon['source']['commit']==app and ribbon['source']['tree']==tree and ribbon['source']['packageSha256']==origin['packageSha256'] and ribbon['source']['executableSha256']==origin['executableSha256']
  assert ribbon['nativePass'] is False and ribbon['status']=='partial' and len(ribbon['unavailable'])==6 and all(x['group']=='Delete' and x['state']=='disabled' for x in ribbon['unavailable'])
  assert len(ribbon['cases'])==258 and len(ribbon['groupButtonCases'])==24 and len(ribbon['toolbarNavigation'])==36
  buttons=[b for c in ribbon['cases'] for b in c['buttons']];assert len(buttons)==1284 and not any(b['clipped'] for b in buttons)
  assert all(b['iconFits'] and (not b['labelVisible'] or b['labelFits']) for b in buttons)
  assert all(not x['clippedY'] for x in ribbon['groupButtonCases']) and sum(bool(x['clippedX']) for x in ribbon['groupButtonCases'])==4
  assert all(x['name']==x['expected'] and x['ring']==4 and x['focusVisible'] for x in ribbon['toolbarNavigation'])
  assert all(x['status']=='fulfilled' for x in ribbon['cleanup']) and ribbon['fixture']['sha256']==sha((base/'ribbon-control.docx').read_bytes())
  write({'status':'partial as reported; bounded vertical checks passed','contentCases':258,'buttonObservations':1284,'contentClipped':0,'groupCases':24,'groupClippedY':0,'groupClippedX':4,'toolbarNavigation':36,'unavailable':ribbon['unavailable'],'nativePass':False,'bodyPaintAcceptance':False,'ribbonReportSha256':sha((base/'ribbon/report.json').read_bytes()),'coreChecks':64,'normalNativeExits':len(normal),'independentScopeWebDriverExitChecks':len(rest)},'core-and-ribbon-audit.json')
 else:
  if 'preflight' in s:
   assert s['preflight']['status']=='passed' and s['preflight']['normalFullQuitAndNewPid'] and s['preflight']['packageSha256']==origin['packageSha256'] and s['preflight']['executableSha256']==origin['executableSha256']
  if label=='appimage-positive':
   previous=root/'raw-reports/appimage-missing.json';assert s['reusedPreflight']['reportSha256']==sha(previous.read_bytes()) and reports['appimage-missing']['preflight']['status']=='passed'
  if 'positive' in label:
   conf=s['conflicts'][0];expected=['Qalpha','beta','','','','omega','delta','','']
   assert conf['nativeWorkingCells']==expected and s['confirmationPositive']['status']=='passed' and s['confirmationPositive']['cells']==expected
   cancel=next(x for x in s['checks'] if x['label']=='Actual user Cancel is not a missing-runtime error');assert cancel['targetSha256']==conf['preActionTargetSha256']
   assert next(x for x in s['checks'] if x['label']=='Real native Cancel preserves unsaved working contents')['tables'][0]['cells']==expected
   raw,rows=grid(base/'confirm_present.docx');assert sha(raw)==s['confirmationPositive']['savedSha256'] and sha(raw)!=conf['preActionTargetSha256'] and sum(rows,[])==expected
   save(raw,'saved/'+label+'/confirm_present.docx')
   assert len(s['confirmations'])==2
   cs=[]
   for i,c in enumerate(s['confirmations']):
    binding=c['input']['binding'];assert c['officePid'] in pids and binding['pid']==c['pid'] and c['anatomy']['pid']==c['pid'] and c['executable']==binding['executable']=='/usr/bin/zenity' and c['executableSha256']==binding['sha256']
    owned=next(x for x in s['sessions'] if x['pid']==c['officePid']);assert all(binding['environment'][k]==v for k,v in owned['environment'].items())
    assert binding['startTime'] and c['input']['xid']==c['capture']['xid'] and c['pid']==c['capture']['pid']
    image=base/('confirmation-'+str(i+1)+'.png');assert sha(image.read_bytes())==c['capture']['sha256']
    for name in ['Overwrite','Cancel']:assert any(n['name']==name and n['showing'] for n in c['anatomy']['nodes'])
    stages=[x['stage'] for x in c['input']['checks']];assert ('before native Escape cancellation' if i==0 else 'before native pointer Overwrite') in stages
    assert c['mainWindowReturn']['pid']==c['officePid'] and c['mainWindowReturn']['binding']['sha256']==origin['executableSha256']
    if i==1:
     controls=[x for x in c['anatomy']['nodes'] if x['name']=='Overwrite' and x['showing'] and x['role']=='push button'];assert len(controls)==1
     b=controls[0]['bounds'];point=c['overwritePointer'];assert b['x']<=point['x']<=b['x']+b['width'] and b['y']<=point['y']<=b['y']+b['height']
    cs.append({'officePid':c['officePid'],'zenityPid':c['pid'],'executableSha256':binding['sha256'],'startTime':binding['startTime'],'xid':c['input']['xid'],'sameAppEnvironment':True,'action':'native Escape Cancel' if i==0 else 'native pointer Overwrite','dialogSha256':sha(image.read_bytes())})
   positiveSessions=[x for x in s['sessions'] if x['phase']=='378-present-runtime'];assert len(positiveSessions)==2 and positiveSessions[0]['pid']!=positiveSessions[1]['pid']
   assert all(x['pid'] in {c['pid'] for c in positiveSessions} for x in normal if x['phase']=='378-present-runtime')
   confirmationAudits.append({'scope':label,'status':'passed bounded positive','originalOverallReportStatus':s['status'],'cancelTargetSHAunchangedAtAction':conf['preActionTargetSha256'],'savedSHA':sha(raw),'rows':rows,'originalPid':positiveSessions[0]['pid'],'reopenedPid':positiveSessions[1]['pid'],'confirmationBindings':cs,'cancelCheckLimit':'Cancelled external target hash is a time-of-action receipt in the immutable successful positive trace; final target correctly contains the later confirmed overwrite.'})
  else:
   missing=s['missingRequirement'];assert missing['error']=='ErrorSaving failed: Linux requires Zenity for native confirmation dialogs. Install the zenity package and try again.'
   conf=s['conflicts'][0];raw,rows=grid(base/'confirm_missing.docx');assert sha(raw)==missing['targetSha256']==conf['preActionTargetSha256']
   assert rows==[['alpha','external_beta',''],['','','omega'],['delta','','']]
   assert next(x for x in s['checks'] if x['label']=='Missing runtime retains native unsaved contents')['tables'][0]['cells']==conf['nativeWorkingCells']==['Qalpha','beta','','','','omega','delta','','']
   assert s['checks'][-1]['sourceTargetUnchanged'] and s['closingClicks']
   if kind=='deb':
    assert missing['initialHostHelper']=='/usr/bin/zenity' and s['missingHelperEnvironment']['scope']=='Only this app child PATH; host environment unchanged'
    live=next(x for x in s['sessions'] if x['phase']=='378-missing-runtime');assert live['effectivePath']=='PATH='+s['missingHelperEnvironment']['bin']
   else:assert missing['initialHostHelper'] is None
   save(raw,'saved/'+label+'/unchanged-target.docx')
   confirmationAudits.append({'scope':label,'status':'passed bounded negative','error':missing['error'],'unchangedTargetSha256':sha(raw),'rows':rows,'retainedWorkingCells':conf['nativeWorkingCells'],'environment':missing['environment'],'initialHostHelper':missing['initialHostHelper'],'dirtyDocumentClosedThroughActualUI':True})
 sessionAudits.append({'scope':label,'sessions':environmental,'normalNativeAltF4Checks':len(normal),'independentScopeWebDriverCleanupNotNativeCloseClaim':len([x for x in s['checks'] if x['label']=='full process exit']),'actualProcessAndDriverEnvironment355Passed':True,'cleanup':cleanup,'originalReportStatus':s['status']})
write(sessionAudits,'session-environment-cleanup-audit.json');write(xmlAudits,'saved-xml-audits.json');write(confirmationAudits,'confirmation378-audit.json')
print(json.dumps({'phase':'native-receipts-and-content','status':'passed within bounded scopes','independentSavedXMLChecks':len(xmlAudits),'confirmationScopes':len(confirmationAudits)}))
# Reuse prior direct image observations strictly by original-byte binding, without viewing images again.
stopped=read(root/'stopped-checkpoint.json');observedBySHA={}
for x in stopped['imageObservations']:
 p=root/x['file'];observedBySHA[sha(p.read_bytes())]=x['file']
for label,(run,kind,aid,digest,pin,jid,folder,count) in scopes.items():
 s=reports[label];base=rawroot/run/kind/'raw/linux-p2-native'/folder
 templatehash=sha(git(app,'public/templates/nieuw.docx'))
 assert all(x['templateSha256']==templatehash for x in s['fixtures'].values())
 if label=='core':continue
 for p in sorted(base.glob('*.png')):
  if '-sample-' in p.name:continue
  h=sha(p.read_bytes());assert h in observedBySHA,(label,p.name,h)
  imageBindings.append({'scope':label,'file':p.name,'sha256':h,'reusedOwnDirectReviewFrom23November':observedBySHA[h],'hashDeduplicatedEquivalentImage':not observedBySHA[h].endswith('/'+label+'/'+p.name),'nativePresentedSampleHashesMayDiffer':True,'acceptanceBasis':'Exact original image bytes plus independently checked native source/process/content receipts; no false identical-sample claim.'})
assert len(stopped['imageObservations'])==14 and len(imageBindings)==18
write({'status':'passed bounded 378/preflight original-image observations','previousDirectOriginalImagesReviewed':14,'boundOriginalImagesIncludingExactDuplicates':18,'newImageViewingPerformed':False,'entries':imageBindings,'coreBlankBodyImagesAcceptedAsBodyPaint':False},'reused-378-image-bindings.json')
# Bind already completed field374 work; do not rerun its six content audits or seven original image reviews.
fieldrepo=r.parent/'oos-writer-field-layout-374-9d3b';reviewpin='658512c9a1511140e23bde0a81fb194fbac90d03';reviewpath='qa/field374/evidence/p5-native-deb-complete-review.json'
reviewraw=git(reviewpin,reviewpath,fieldrepo);review=json.loads(reviewraw)
assert review['application']=={'commit':app,'tree':tree,'version':'2026.48.1'} and review['status']=='passed bounded native field374 scope'
assert review['nativeProducer']['run']==45193639082 and review['nativeProducer']['job']==137758403838 and review['nativeProducer']['qaCommit']==scopes['deb-positive'][4] and review['nativeProducer']['overallRunConclusion']=='failure'
assert review['proofArchive']['artifact']==14827731026 and review['proofArchive']['officialAndActualZipSha256']==archives[14827731026]['sha256']
save(reviewraw,'reused-field374/review.json')
memberByName={m['member']:m for m in archives[14827731026]['members']}
for name,b in review['proofArchive']['retainedMembers'].items():
 m=memberByName[b['member']];assert m['bytes']==b['bytes'] and m['sha256']==b['sha256']
assert len(review['independentContentAudits'])==6 and len(review['independentOriginalImageReviews'])==7
contentBindings=[]
for oldaudit in review['independentContentAudits']:
 assert oldaudit['status']=='passed' and oldaudit['sourceBlocks']==8 and oldaudit['placeholders']==2
 auditraw=git(reviewpin,'qa/field374/evidence/'+oldaudit['rawAudit'],fieldrepo);assert sha(auditraw)==oldaudit['rawAuditSha256']
 a=json.loads(auditraw);assert a['status']=='passed' and a['inputSha256']==oldaudit['sha256'] and a['audit']['passed'] and a['exactFieldCacheAndAdjacentTextBoundary']
 assert review['proofArchive']['retainedMembers'][oldaudit['name']]['sha256']==oldaudit['sha256']
 save(auditraw,'reused-field374/'+PurePosixPath(oldaudit['rawAudit']).name)
 contentBindings.append({'name':oldaudit['name'],'inputSha256':oldaudit['sha256'],'priorAuditSha256':sha(auditraw),'sourceBlocks':8,'placeholders':2,'reusedWithoutReexecution':True})
for image in review['independentOriginalImageReviews']:
 assert image['directlyViewedOriginal'] and image['unchangedAfterReview'] and image['status']=='passed bounded title-layout review' and image['fullExpectedTextVisible'] and not image['overlapOrClippingObserved'] and image['subtitleSeparated']
 assert memberByName[image['member']]['sha256']==image['sha256'] and memberByName[image['member']]['bytes']==image['bytes']
assert review['scopeConclusions']['fullSTWRouteClosed'] is False
fieldRawPath=rawroot/'45193639082/deb/raw/linux-p2-native/suite-final-deb-field374/report.json';field=read(fieldRawPath)
assert len(field['checks'])==19 and field['source']=={'commit':app,'tree':tree} and field['origin']['packageSha256']==reports['deb-positive']['origin']['packageSha256'] and field['origin']['executableSha256']==reports['deb-positive']['origin']['executableSha256']
fieldreuse={'status':'passed exact reuse binding only','reviewGit':reviewpin,'canonicalReviewSha256':sha(reviewraw),'contentAudits':contentBindings,'originalImageReviewsReused':7,'allReviewRetainedMemberBindingsMatchAlreadyVerifiedProofZIP':True,'noAuditOrImageReviewRepeated':True,'fullSTWRouteClosed':False}
write(fieldreuse,'field374-reuse-binding.json')
# Include additional Git-pinned scenario helpers and anatomy readers in the reviewable source evidence.
for label in ['appimage-positive','deb-positive','deb-missing']:
 pin=scopes[label][4]
 for path in ['qa/linux-suite-final/scenarios.mjs','scripts/linux-suite-native-anatomy.py']:
  blob=git(pin,path);save(blob,'src/'+pin[:8]+'/'+PurePosixPath(path).name)
conclusion={
 'status':'PASS for explicitly bounded Linux Suite completed scopes; wider matrix PARTIAL',
 'recordedAtUTC':datetime.now(timezone.utc).isoformat(),
 'application':{'commit':app,'tree':tree,'version':'2026.48.1'},'ownerFinalGit':'0810c25bc0532e12ab44e87635668faa33ef4ca5','ownerFinalReceiptSha256':sha(finalraw),
 'criteria':[
  {'scope':'DEB core368/369','verdict':'PASS bounded','checks':64,'savedXMLAssertionsIndependentlyVerified':4,'normalAltF4Exits':6,'independentScopeWebDriverCloses':2,'jobRetainedAsFailure':True},
  {'scope':'362 ribbon vertical checks','verdict':'PASS measured vertical scope; full matrix PARTIAL','contentCases':258,'buttonObservations':1284,'groupCases':24,'clippedContent':0,'clippedGroupsY':0,'clippedGroupsX':4,'unavailableGenuineDisabledDeleteStates':6,'fullNativePass':False},
  {'scope':'DEB378 native Cancel/Overwrite/save/newPID','verdict':'PASS bounded positive','checks':16,'originalReportAndJobRetainedAsFailed':True},
  {'scope':'DEB378 own-child PATH missing helper','verdict':'PASS bounded negative and necessary preflight','checks':13,'hostHelperPreserved':True},
  {'scope':'AppImage actual executable preflight/missing helper','verdict':'PASS bounded','checks':13,'physicalFUSEAcceptance':False},
  {'scope':'AppImage native Cancel/Overwrite/save/newPID','verdict':'PASS bounded','checks':7,'sameHostPreflightReceiptReused':True},
  {'scope':'374 six DOCX/seven title images','verdict':'PASS exact prior independent evidence binding','reviewGit':reviewpin,'nativeReportChecks':19,'fullSTWRouteClosed':False}
 ],
 'newFailuresFound':[],
 'openOrUncertified':['Full ribbon matrix remains partial: six genuine disabled-Delete states unavailable.','Four horizontal group-clipping observations remain outside the strictly passed vertical criterion.','Two independent core scopes close through WebDriver cleanup, not native normal Alt+F4; six normal native closes are explicitly recorded.','Original black/blank core body images provide no body-paint acceptance. Later readable 378 images and prior field374 images have separate bounded evidence.','Original core session records verify GDK/display/profile environment; software mode is runtime-reported, while later 378 sessions additionally record all three actual process graphics variables.','No physical FUSE, GPG/signature, full typography/pagination, other platform, standalone-app or full-STW-route certification.'],
 'remainingAuditTasksWithinAssignedScope':[],
 'packageIdentityLimit':'Auditor independently hashed existing proof ZIPs/all raw members, source/descriptor/report hashes and receipt/package/ELF consistency. No installer or parent archive download/re-extraction was performed.',
 'newNativeRunOrGUIOrCIOrDownload':False,'old37EvidenceFilesPreserved':True,'mainTagPublicationOrGitWrite':False,
 'evidenceReports':['foundation-audit.json','session-environment-cleanup-audit.json','core-and-ribbon-audit.json','saved-xml-audits.json','confirmation378-audit.json','reused-378-image-bindings.json','field374-reuse-binding.json']
}
write(conclusion,'final-audit.json')
save(Path(__file__).read_bytes(),'audit-linux-suite-resume.py')
inventory=[{'file':p.relative_to(dest).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(dest.rglob('*')) if p.is_file() and p.name!='completed-evidence-index.json']
write({'status':'complete bounded independent audit','entries':inventory},'completed-evidence-index.json')
print(json.dumps({'phase':'complete','verdict':conclusion['status'],'savedXMLAssertions':len(xmlAudits),'fieldContentAuditsReused':6,'fieldOriginalImageReviewsReused':7,'previousOwnImagesReused':14,'retainedFiles':len(inventory),'newNativeRunOrDownload':False}))
