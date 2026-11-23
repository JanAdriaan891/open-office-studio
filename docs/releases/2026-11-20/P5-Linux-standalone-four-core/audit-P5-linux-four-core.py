from pathlib import Path,PurePosixPath
import subprocess,json,hashlib,zipfile,sqlite3,xml.etree.ElementTree as E,posixpath,re
r=Path.cwd();local=r/'.local/P5-Linux-standalone-four-core';dest=r/'docs/releases/2026-11-20/P5-Linux-standalone-four-core';sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
appcommit='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';qa='b3d594aaf09a83215bb809bdbcda6305a0af1612';prepcommit='5d4198b7001c21cac7a03cf752900aac6e4dd91e';run=45190082427
prepared=read(dest/'prepared-git-original.json');assert (prepared['sourceCommit'],prepared['sourceTree'],prepared['version'])==(appcommit,tree,'2026.48.1') and len(prepared['apps'])==6 and sum(len(x['origin']['packages']) for x in prepared['apps'])==12 and prepared['singleCanonicalParentWholeZipHashVerified']
api=lambda p:subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+p])
def retain(raw,target):
 target.parent.mkdir(parents=True,exist_ok=True)
 if target.exists():assert target.read_bytes()==raw,str(target)
 else:target.write_bytes(raw)
git=lambda pin,path:subprocess.check_output(['git','show',pin+':'+path])
sources={}
for path in ['scripts/proef-standalone-linux.mjs','scripts/standalone-linux-ooxml.mjs','scripts/database-normal-picker-probe.py','scripts/linux-p2-ribbon-native.mjs','scripts/linux-p2-native-ready.mjs','scripts/linux-p2-native-capture.py','scripts/linux-stw-portal.py','.github/workflows/standalone-linux-native-p5.yml']:
 raw=git(qa,path);retain(raw,dest/'pinned-harness'/path);sources[path]=sha(raw)
for kind in ['docx','pptx']:
 raw=git(appcommit,'public/templates/nieuw.'+kind);retain(raw,dest/'source-templates'/('nieuw.'+kind))
assert subprocess.check_output(['git','rev-parse',appcommit+'^{tree}']).decode().strip()==tree
jobs=read(dest/'jobs.json')['jobs'];artifacts=read(dest/'artifacts.json')['artifacts'];rows=[];images=[];independent=[];inconsistencies=[]
parentraw=api('actions/artifacts/14824745492');retain(parentraw,dest/'official-parent-artifact.json');parent=json.loads(parentraw)
assert parent['digest']==prepared['canonicalParent']['digest'] and parent['size_in_bytes']==prepared['canonicalParent']['bytes'] and parent['workflow_run']['head_sha']==appcommit
for app in ['writer','presentation','notition','database']:
 source=local/app;binding=next(x for x in prepared['apps'] if x['app']==app);origin=read(source/'standalone-linux-input/origin.json');receipt=read(source/'standalone-linux-input/input-artifact-receipt.json')
 assert origin==binding['origin'] and receipt['qaCommit']==qa and receipt['qaRun']==run and receipt['archiveLocallyHashVerified'] and receipt['onlyOwnApp']==app and receipt['inputArtifact']==binding['inputArtifact']
 assert receipt['canonicalParent']==origin['artifact'] and receipt['intakeSha256']==prepared['canonicalIntakeSha256']
 raw=api('actions/artifacts/'+str(binding['inputArtifact']['id']));retain(raw,dest/app/'official-child-metadata.json');child=json.loads(raw)
 assert child==binding['inputArtifact'] and child['workflow_run']['head_sha']==prepared['producerCommit'] and child['workflow_run']['id']==prepared['producerRun']
 metadata=next(x for x in artifacts if x['name']=='standalone-linux-'+app);job=next(x for x in jobs if x['name']=='Independent '+app+' DEB and AppImage')
 assert job['conclusion']=='success' and job['head_sha']==qa and job['run_attempt']==1
 archive=source/'artifact.zip';assert sha(archive.read_bytes())==metadata['digest'].removeprefix('sha256:') and archive.stat().st_size==metadata['size_in_bytes']
 retain(archive.read_bytes(),dest/app/'official-proof.zip')
 # Preserve original raw files selected for review, including inputs, outputs, reports, logs and pictures. The raw ZIP also preserves the duplicate matrix.
 for p in source.rglob('*'):
  if p.is_file() and p.name not in ['artifact.zip','matrix.json']:retain(p.read_bytes(),dest/app/'raw'/p.relative_to(source))
 packageReportPath=source/'standalone-linux-input'/origin['packageReport'];assert sha(packageReportPath.read_bytes())==origin['packageReportSha256'];packageReport=read(packageReportPath)
 assert packageReport['versie']=='2026.48.1' and packageReport['programma']==origin['studio']['programma']
 matrix=read(source/'standalone-linux-results'/app/'matrix.json');assert len(matrix)==2
 for kind in ['appimage','deb']:
  folder=source/'standalone-linux-results'/app/kind;p=folder/'report.json';a=read(p)
  assert a==next(m for m in matrix if m['packageType']==kind)
  assert (a['sourceCommit'],a['sourceTree'],a['version'],a['harnessCommit'],a['app'],a['packageType'],a['status'])==(appcommit,tree,'2026.48.1',qa,app,kind,'passed')
  assert a['harnessSha256']==sources['scripts/proef-standalone-linux.mjs'] and not a['pending'] and not any(k in a for k in ['error','cleanupError','uninstallError'])
  assert all(a[k] for k in ['ownedApplicationClosed','ownedDriverClosed','ownedKeyringClosed','ownedProfilesRemoved'])
  pkg=next(x for x in origin['packages'] if x['path'].lower().endswith('.'+('appimage' if kind=='appimage' else 'deb')))
  assert (a['package']['canonicalMember'],a['package']['sha256'],a['package']['bytes'])==(pkg['canonicalMember'],pkg['sha256'],pkg['bytes'])
  officialpkg=next(x for x in packageReport['pakketten'] if x['naam']==pkg['path']);assert officialpkg['sha256']==pkg['sha256'] and officialpkg['bytes']==pkg['bytes']
  assert a['identity']==origin['studio']['identifier']
  if kind=='deb':
   assert a['normalPackageDependencyResolver'] and a['declaredDependencies']==origin['debControl']['fields']['Depends'] and 'zenity' in [x.strip() for x in a['declaredDependencies'].split(',')]
   z=a['nativeMessageDependencyObservation'];assert z['afterNormalDebInstall']['status']=='observed'
   if z['zenityDeclaredByDeb'] is False:inconsistencies.append({'app':app,'kind':kind,'reportedZenityDeclaredByDeb':False,'actualDeclaredDependencies':a['declaredDependencies'],'classification':'Ancillary QA regex rejects comma after zenity; pinned Depends and normal apt install/which observation retain actual dependency evidence. Not a foreign-format confirmation acceptance.'})
  else:assert a['appImageRoute']=='Actual AppImage executable with APPIMAGE_EXTRACT_AND_RUN=1 (supported FUSE-free launch)'
  assert not any('org.openaec.office-studio' in x for x in a['profilePaths'])
  assert any(a['identity'] in x and re.search('webkit|localstorage|indexeddb',x,re.I) for x in a['profilePaths'])
  assert not any('/open-office-studio' in x or '/Open Office Studio/' in x for x in a['resourcePaths'])
  launchsummary=[]
  for launch in a['launches']:
   assert launch['executableSha256']==a['payloadExecutableSha256'] and PurePosixPath(launch['executable']).name==origin['studio']['programma']
   guard=launch['x11'];assert guard['binding']['sha256']==a['payloadExecutableSha256'] and guard['binding']['pid']==launch['pid']
   assert guard['xid'] and guard['checks'] and all(x['process']['pid']==launch['pid'] and x['windowFocus']==guard['xid'] and x['dom']['hasFocus'] and x['dom']['visibilityState']=='visible' and not x['dom']['hidden'] for x in guard['checks'])
   assert any(x.startswith('HOME=') and '/'+app+'/'+kind+'/' in x for x in launch['environment'])
   assert not any('/usr/bin/open-office-studio' in x or '/Open Office Studio/' in x or '/libreoffice/' in x for x in launch['mappedResources'])
   launchsummary.append({'pid':launch['pid'],'runningElfSha256':launch['executableSha256'],'xid':guard['xid'],'nativeFocusChecks':len(guard['checks'])})
  if app!='database':
   assert len(a['launches'])==2 and a['launches'][0]['pid']!=a['launches'][1]['pid']
   assert a['nativeMetadata']=={'identifier':a['identity'],'name':origin['studio']['naam'],'version':'2026.48.1'}
   assert all('Normal Alt+F4 must fully exit' in git(qa,'scripts/proef-standalone-linux.mjs').decode() for _ in [0])
   captures=a['nativeCaptures'];assert len(captures)==2
   for cap in captures:
    image=folder/cap['name'];assert sha(image.read_bytes())==cap['sha256'] and cap['pid'] in [x['pid'] for x in a['launches']]
    detail={'writer':'Visible STANDALONE_WRITER_SAVED plus Original synthetic Writer text; reopened Find shows one result.','presentation':'Saved image has the new blank second slide selected and two thumbnails; reopened Outline visibly shows exact STANDALONE_PRESENTATION_SAVED in slide1 plus empty slide2.','notition':'Synthetic standalone notebook title and STANDALONE_NOTITION_SAVED remain visible after backup save and fresh process reopening.'}[app]
    images.append({'app':app,'kind':kind,'file':str((dest/app/'raw'/image.relative_to(source)).relative_to(dest)).replace('\\','/'),'sha256':cap['sha256'],'directSerialOriginalImageReview':True,'status':'passed','finding':detail,'fullDocumentLayoutClaim':False})
  if app=='writer':
   output=folder/'Synthetic writer.docx';assert sha(output.read_bytes())==a['savedSha256']
   with zipfile.ZipFile(output) as z:
    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'};doc=E.fromstring(z.read('word/document.xml'));texts=[''.join(t.text or '' for t in p.findall('.//w:t',ns)) for p in doc.findall('w:body/w:p',ns)]
    assert texts==['STANDALONE_WRITER_SAVED Original synthetic Writer text.'] and not doc.findall('.//w:tbl',ns)
   independent.append({'app':app,'kind':kind,'inputFixtureExpectation':'Original synthetic Writer text. from pinned syntheticDocument source/template','outputSha256':a['savedSha256'],'paragraphs':texts,'exactSingleMarkerAndOriginalText':True,'status':'passed'})
  if app=='presentation':
   output=folder/'Synthetic presentation.pptx';assert sha(output.read_bytes())==a['savedSha256']
   with zipfile.ZipFile(output) as z:
    names=z.namelist();ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
    ids=E.fromstring(z.read('ppt/presentation.xml')).findall('p:sldIdLst/p:sldId',ns);rels=E.fromstring(z.read('ppt/_rels/presentation.xml.rels'));relmap={x.attrib['Id']:x.attrib['Target'] for x in rels};assert len(ids)==2
    slides=[posixpath.normpath(posixpath.join('ppt',relmap[x.attrib['{'+ns['r']+'}id']])) for x in ids]
    assert len(set(slides))==2 and set(slides)==set(x for x in names if re.fullmatch('ppt/slides/slide[0-9]+.xml',x))
    texts=[''.join(t.text or '' for t in E.fromstring(z.read(s)).findall('.//a:t',ns)) for s in slides]
    assert texts[0].count('STANDALONE_PRESENTATION_SAVED')==1 and texts[1]==''
   independent.append({'app':app,'kind':kind,'outputSha256':a['savedSha256'],'slideCount':2,'orderedSlideParts':slides,'orderedSlideTexts':texts,'expectedEdit':'first title replaced; Ctrl+M adds blank slide2','status':'passed'})
  if app=='notition':
   storage=folder/'notition-local-save.json';backup=folder/'Synthetic standalone.openaec-notities';assert sha(storage.read_bytes())==a['savedSha256'] and sha(backup.read_bytes())==a['backupSha256']
   saved=read(storage);exported=read(backup);assert saved==exported and saved['formaat']=='openaec-notities' and saved['versie']==3
   pages=[p for b in saved['boeken'] for s in b['secties'] for p in s['paginas']];page=next(p for p in pages if p['titel']=='Synthetic standalone notebook');blocks=[x for box in page['vakken'] for x in box['blokken']]
   assert sum(b['tekst']=='STANDALONE_NOTITION_SAVED' for b in blocks)==1 and len(blocks)==6
   assert a['osDialogWindows'] and a['osDialogObservations']
   independent.append({'app':app,'kind':kind,'localStateSha256':a['savedSha256'],'backupSha256':a['backupSha256'],'backupEqualsLocalState':True,'title':page['titel'],'blockTexts':[b['tekst'] for b in blocks],'status':'passed','limit':'Own-profile cold reopen, not importing the exported backup into a new profile.'})
  if app=='database':
   corepath=source/'standalone-linux-results/database'/('normal-'+kind+'-core.json');core=read(corepath);assert core==a['normalNativeCase']
   assert core['status']=='passed' and core['functionalAcceptanceClaim'] and core['normalProcessWithoutWebDriver'] and core['sourceCommit']==appcommit and core['sourceTree']==tree and core['expectedElfSha256']==core['runningElfSha256']==a['payloadExecutableSha256']
   assert core['packageSha256']==pkg['sha256'] and core['normalExitCodes']==[0,0] and core['reopenedPid']!=core['pid'] and not core['remainingOwnedProcesses'] and core['ownedProfilesRemoved'] and core['portalPeerCleanup']['closed'] and core['portalObserver']['monitorClosed']
   assert core['portalObserver']['ownedPid']==core['pid'] and core['portalObserver']['member']=='SaveFile' and core['portalObserver']['status']=='attributed'
   assert core['nativeSqlEntries']==['SELECT SUM(amount) AS SyntheticTotal FROM StandaloneItems','UPDATE StandaloneItems SET amount=13 WHERE id=1','SELECT SUM(amount) AS SyntheticEditedTotal FROM StandaloneItems','SELECT SUM(amount) AS SyntheticReopenedTotal FROM StandaloneItems']
   assert [int(x['pid']) for x in core['nativePickers']]==[core['pid'],core['reopenedPid']]
   assert sha((folder/'metadata-preflight.json').read_bytes())==core['preflightReportSha256']
   config=core['sourceConfigBinding'];assert config==a['databaseIdentityEvidence'] and sha(git(appcommit,config['sourceConfigPath']))==config['sourceConfigSha256']
   assert any(str(x['pid'])==str(core['pid']) for x in core['focusObservations']) and any(str(x['pid'])==str(core['reopenedPid']) for x in core['focusObservations'])
   for cap in core['nativeCaptures']:
    image=source/'linux-p2-native'/('database-normal-'+kind)/(cap['label']+'.png');assert sha(image.read_bytes())==cap['sha256']
    images.append({'app':app,'kind':kind,'file':str((dest/app/'raw'/image.relative_to(source)).relative_to(dest)).replace('\\','/'),'sha256':cap['sha256'],'directSerialOriginalImageReview':True,'status':'passed','finding':'Real SQL View shows edited/reopened SUM(amount)=24; input versus saved SQLite names and own app title visible.','fullDocumentLayoutClaim':False})
   original=source/'standalone-linux-results/database'/('normal-'+kind+'-input.sqlite');output=source/'standalone-linux-results/database'/('normal-'+kind+'-saved.sqlite');assert sha(original.read_bytes())==core['fixtureSha256']==a['fixtureSha256'] and sha(output.read_bytes())==core['savedSha256']==a['savedSha256']
   dbdata=[]
   for path,expected in [(original,[(1,'SyntheticAlpha',7),(2,'SyntheticBeta',11)]),(output,[(1,'SyntheticAlpha',13),(2,'SyntheticBeta',11)])]:
    initial=sha(path.read_bytes());db=sqlite3.connect(path.resolve().as_uri()+'?mode=ro&immutable=1',uri=True)
    try:
     assert db.execute('pragma integrity_check').fetchall()==[('ok',)]
     records=db.execute('select id,label,amount from StandaloneItems order by id').fetchall();assert records==expected
     types=db.execute('select typeof(id),typeof(label),typeof(amount) from StandaloneItems').fetchall();assert types==[('integer','text','integer')]*2
     dbdata.append({'file':path.name,'sha256':initial,'rows':records,'types':types,'sum':db.execute('select sum(amount) from StandaloneItems').fetchone()[0]})
    finally:db.close()
    assert sha(path.read_bytes())==initial
   assert [x['sum'] for x in dbdata]==[18,24]
   independent.append({'app':app,'kind':kind,'sqlite':dbdata,'normalExitCodes':core['normalExitCodes'],'firstPid':core['pid'],'reopenedPid':core['reopenedPid'],'credentialBoundSaveFile':core['portalObserver']['correlation']['requestHandle'],'status':'passed'})
  rows.append({'app':app,'packageType':kind,'status':'passed-with-recorded-QA-metadata-limit','identity':a['identity'],'package':pkg,'payloadExecutableSha256':a['payloadExecutableSha256'],'launches':launchsummary,'sourceCommit':appcommit,'sourceTree':tree,'proofArtifact':metadata['id'],'proofZipSha256':metadata['digest'].removeprefix('sha256:'),'job':job['id'],'sourceReportSha256':sha(p.read_bytes()),'ownProfileAndNoSuiteReceiptChecked':True,'normalCloseAndCleanupReceiptChecked':True,'limits':a['limits']})
audit={'scope':'Independent audit of four successful P5 standalone Linux core apps, both DEB/AppImage; excludes Email/Spreadsheet','application':appcommit,'tree':tree,'version':'2026.48.1','qa':qa,'run':run,'attempt':1,'preparationGit':prepcommit,'preparationOriginalSha256':sha((dest/'prepared-git-original.json').read_bytes()),'sourceFileSha256':sources,'rows':rows,'allEightBoundedCoreRoutesPassed':len(rows)==8,'independentSavedContent':independent,'originalPNGReviews':images,'ancillaryMetadataInconsistencies':inconsistencies,'auditorRehashedInstallersOrChildPackages':False,'auditorRehashedParentInstallerZIP':False,'packageIdentityScope':'Exact preparation snapshot, official metadata and native tester receipt/hash bindings; proof ZIP bytes independently hashed. No installer download/re-extraction by auditor.','fullDependencyClosure':False,'detachedLinuxSignatureAcceptance':False,'newNativeOperationOrCIRun':False,'downloadCoordinationLimit':'Four small proof ZIP downloads were already complete when corrected reuse notice arrived; Presentation/Notition duplicate small downloads are retained and disclosed. No installer/parent download.'}
assert len(independent)==8 and len(images)==16 and len(inconsistencies)==4
(dest/'independent-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
retain(Path(__file__).read_bytes(),dest/'audit-P5-linux-four-core.py')
print(json.dumps({'status':'passed within eight core scenarios, four ancillary QA metadata inconsistencies retained','apps':4,'packageRoutes':len(rows),'independentContentAudits':len(independent),'originalPNGReviews':len(images),'newNativeOrCI':False}))
