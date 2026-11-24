import hashlib,json,pathlib,stat,subprocess,zipfile,xml.etree.ElementTree as ET
ROOT=pathlib.Path(r'C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes')
OWNER=ROOT/'work/oos-mac-native-blocker-20261120';BASE=OWNER/'.local/nov24-suite/45355259350'
OUT=ROOT/'work/oos-release-prep-2026-11-20-9635/docs/releases/2026-11-20/P5-Mac-Suite-save-readiness-review'
OUT.mkdir(parents=True,exist_ok=False)
QA='b052808d6fcfed34c7543176f0a827891b02a60d';P5='b696ab86bd1c128729a079b68c0082e6df3d36a5'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(n,b):
 p=OUT/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def dump(n,v):save(n,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def git(ref,n):return subprocess.check_output(['git','-C',str(OWNER),'show',ref+':'+n])
b=(BASE/'proof.zip').read_bytes();assert len(b)==1381370 and sha(b)=='505cdc29339ee220ffb27c86ccff4ea9d177f4731720b368e13b87e2dd9d2308';save('proof.zip',b)
with zipfile.ZipFile(BASE/'proof.zip') as z:
 names=set();members=[]
 for i in z.infolist():
  n=i.filename;p=pathlib.PurePosixPath(n);assert n not in names and not p.is_absolute() and '..' not in p.parts and ':' not in n and '\\' not in n and not stat.S_ISLNK(i.external_attr>>16);names.add(n)
  if i.is_dir():continue
  payload=z.read(n);local=pathlib.Path('\\\\?\\'+str((BASE/'payload'/n).resolve()));assert payload==local.read_bytes()
  members.append({'member':n,'bytes':len(payload),'sha256':sha(payload),'zipRecordedTime':list(i.date_time)})
 assert len(members)==55
 j=lambda n:json.loads(z.read(n))
 r=j('mac-product-native/report.json');assert r['harnessCommit']==QA and r['status']=='failed' and r['nativePass'] is False
 assert r['error']=='Native Q input + CommandS did not persist exactly the expected text insertion'
 assert r['identity']['sourceCommit']==P5 and r['identity']['sourceTree']=='e30879fd772871e690847c061ef66e6b81808a05'
 assert r['identity']['executableSha256']=='0c6a58c7438f1ba2b3b9b1e74ea23e29fb9a93523723bc5694bb3727702a9d87'
 assert r['identity']['packageSha256']=='1d0cb79f23e1e082d1aa4e32aa1dd3997c297fb0cb2629aa530a3e29e685c4af'
 source={}
 for n in ['scripts/writer-361-macos-ax.swift','scripts/proef-writer-361-macos.py','scripts/mac-native-current-session.py','scripts/mac-native-writer-preflight.py']:
  source[n]=git(QA,n);save('harness/'+pathlib.PurePosixPath(n).name,source[n])
 assert sha(source['scripts/writer-361-macos-ax.swift'])==r['helperSourceSha256']=='82813e7a2b9509cc1e9238a8eaaadf4b7e281d4535df13a86257f99f4bc06573'
 assert sha(source['scripts/proef-writer-361-macos.py'])==j('mac-product-native/action-010.json')['driverSha256']
 assert sha(source['scripts/mac-native-current-session.py'])==r['sessionDriverSha256']
 assert sha(z.read('mac-product-native/writer361-ax-82813e7a2b95'))==r['helperBinarySha256']
 swift=source['scripts/writer-361-macos-ax.swift'].decode();pre=source['scripts/mac-native-writer-preflight.py'].decode();session=source['scripts/mac-native-current-session.py'].decode()
 # Window summary is a pre-action observation, not a post-input readiness ack.
 assert swift.index('report["window"] = summary(windows[0])')<swift.index('} else if action == "type-test-character"')<swift.index('} else if action == "chord"')
 qbranch=swift.split('} else if action == "type-test-character" {',1)[1].split('} else if action == "click-cell"',1)[0]
 savebranch=swift.split('} else if let (code, flags) = mappings[target] {',1)[1].split('} else { report["status"]',1)[0]
 assert 'keyboardSetUnicodeString' in qbranch and 'event?.postToPid(pid)' in qbranch and 'event?.postToPid(pid)' in savebranch
 assert '.cghidEventTap' not in qbranch+savebranch and 'Thread.sleep' not in qbranch+savebranch
 assert pre.index('action("type-test-character", "Q")')<pre.index('action("chord", "cmd-s")')<pre.index('edited = persisted(')
 assert 'subprocess.run([sys.executable, str(driver)' in session
 a10=j('mac-product-native/action-010.json');a11=j('mac-product-native/action-011.json');a12=j('mac-product-native/action-012.json')
 for a in [a10,a11,a12]:
  assert a['harnessCommit']==QA and a['native']['pid']==2942 and a['native']['frontmostPid']==2942
  assert a['native']['focusBefore']['description']=='Document input' and a['native']['focusAfter']['description']=='Document input'
 assert a10['native']['testCharacter']=='Q' and a10['native']['status']=='input-sent' and a11['native']['chord']=='cmd-s' and a11['native']['status']=='input-sent'
 assert '\u2022' not in a10['native']['window']['title'] and '\u2022' in a11['native']['window']['title'] and '\u2022' in a12['native']['window']['title']
 assert len([n for n in names if n.startswith('mac-product-native/action-')])==12
 control=git(QA,'scripts/proeven/mac-body-positive-356.docx');saved=z.read('mac-product-native/field374-current-host-preflight/native-preflight-private-copy.docx')
 assert control==saved and sha(saved)=='c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d'
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 with zipfile.ZipFile(pathlib.Path('\\\\?\\'+str((BASE/'payload/mac-product-native/field374-current-host-preflight/native-preflight-private-copy.docx').resolve()))) as d:
  root=ET.fromstring(d.read('word/document.xml'));text=''.join(x.text or '' for x in root.findall('.//w:t',ns));assert 'Q' not in text
 assert len(r['nativeControlPreflight']['checks'])==3 and r['nativeControlPreflight']['firstPid']==2942 and 'secondPid' not in r['nativeControlPreflight']
 assert not any('/native-field374/' in n for n in names) and r['cleanup']['forcedTerminationRequired'] is True
 before='mac-product-native/field374-current-host-preflight/before-input/original-display.png';failure='mac-product-native/failure-original-display.png'
 assert sha(z.read(before))==r['nativeControlPreflight']['checks'][1]['receipt']['originalDisplaySha256']
 assert sha(z.read(failure))==r['failureOriginalDisplaySha256']=='81d15a23aad6150bd61542ac78ab827e8b1f8e0b6a23efbb179be3de52a762ae'
 app={}
 for n in ['src/useTabSneltoetsen.ts','src/OfficeStudio.tsx','src/editors.tsx','src/opslag.ts','src/venstertitel.ts','src/werkbestand.ts','src/import/bron.ts']:
  app[n]=git(P5,n);save('application/'+pathlib.PurePosixPath(n).name,app[n])
 assert 'await ref.flushPendingInput();' in app['src/editors.tsx'].decode() and 'if (serialiseer.bereidVoor) await serialiseer.bereidVoor();' in app['src/opslag.ts'].decode()
 assert 'bron.gewijzigd ? `${bron.naam} ${WIJZIGINGSSTIP}`' in app['src/venstertitel.ts'].decode()
 for n in names:
  if n.startswith('mac-product-input/') or n in ['mac-product-native/report.json','mac-product-native/action-010.json','mac-product-native/action-011.json','mac-product-native/action-012.json',before,failure] or n.endswith('native-preflight-private-copy.docx'):
   save('retained/'+n,z.read(n))
 dump('members.json',members)
 conclusions={
 'verdict':'FAILED native save preflight; cause unresolved between input delivery/handler readiness and product save behavior. No374 execution or374 semantic failure.',
 'nativeRun':45355259350,'attempt':1,'job':138311374273,'artifactId':14902571239,'qaCommit':QA,'applicationCommit':P5,
 'proofBytes':len(b),'proofSHA256':sha(b),'all55MembersHashAndLocalBytesVerified':True,'reportSHA256':sha(z.read('mac-product-native/report.json')),
 'sourceHashes':{k:sha(v) for k,v in source.items()},'applicationSourceHashes':{k:sha(v) for k,v in app.items()},
 'transport':{'Q':'CGEvent Unicode virtualKey0 flags[] down/up, postToPid2942','CmdS':'CGEvent virtualKey1 maskCommand down/up, postToPid2942','sameAPITarget':True,'sameHIDQueueClaim':False,'callerSequential':True,'applicationDeliveryOrHandlerAck':False,'explicitPostTypeDirtyWait':False,'extraQOrCmdSRetry':False},
 'observationOrder':['action009 confirms focused Document input PID2942.','action010 window title sampled BEFORE Q was clean; Q postToPid down/up then focusAfter sampled.','action011 window title sampled BEFORE CmdS already has U+2022 dirty bullet; CmdS postToPid down/up then focusAfter sampled.','20s saved-XML polling fails; action012 still dirty; original failure screenshot visibly contains EERQSTE and Unsaved changes.','Retained private DOCX is exactly source bytes, noQ in independent document.xml.'],
 'timing':{'actualInputTimestampsRetained':False,'eventToHandlerProcessingLatencyKnown':False,'zipMetadataOnly':[{'member':n,'dateTime':list(z.getinfo(n).date_time)} for n in ['mac-product-native/action-010.json','mac-product-native/action-011.json','mac-product-native/action-012.json']],'limits':'ZIP member times are coarse2-second file metadata, not monotonic input delivery or handler timings. No quantified rapid-input interval is established.'},
 'applicationSourceReview':['Cmd/Ctrl+S maps to opslaan through window capture handler unless existing modal/defaultPrevented/uit guards apply.','Document opslaan has no general clean-document early return; plainDOCX uses registered serializer.','Serializer.bereidVoor calls flushPendingInput; DocumentOpslag awaits it before serialization/revision capture.','onDocumentChange marks modified; OS title bullet is derived from modified tab state.','No rawDOM keydown, save-handler entry, serialiser flush acknowledgement, native save IPC or error trace is retained here; those codepaths were not observed executing.'],
 'independentContent':{'retainedDOCXSHA256':sha(saved),'exactSourceBytes':True,'documentXMLHasNoQ':True,'sourceText':text},
 'originalPNGReview':[{'member':before,'sha256':sha(z.read(before)),'originalViewedDirectly':True,'observation':'Untouched356 control heading/body readable; clean title; noQ.'},{'member':failure,'sha256':sha(z.read(failure)),'originalViewedDirectly':True,'observation':'Heading visibly contains EERQSTE; title dirty bullet and status Unsaved changes. Font-substitution warning remains.'}],
 'cannotConclude':['Not proven that CmdS arrived before dirty: source and action011 show dirty sampled before posting CmdS.','Not proven harmless driver-readiness failure or a cross-transport reorder; both keyboard actions use postToPid.','Not proven product bug: event posting completion does not attest DOM/app handler delivery or successful save invocation.','A later readiness-guarded pass would validate only that sequence; it cannot erase this unexplained one-Q/one-CmdS failure.','No independent issue374 source/cache/field/layout conclusion: its case was never entered.'],
 'cleanup':r['cleanup'],'cleanupLimit':'Failure required owned process SIGTERM; app/container removed but no normalCmdQ/reopen acceptance.',
 'scope':'Forensic existing-proof/source review only; no fix, criteria change, retry, CI, GUI, download or Git write.'}
 dump('review.json',conclusions);save('review-mac-suite-save-readiness.py',pathlib.Path(__file__).read_bytes());save('README.md',b'Failed Mac Suite save preflight: forensic boundary review\n\nSee review.json. Dirty title is a pre-action observation and was already present before CmdS. Both keyboard actions use postToPid. The failed save remains unexplained; no374 case was reached. Preserve alongside any later guarded pass. No native execution was repeated.\n')
 idx=[{'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(OUT.rglob('*')) if p.is_file()];dump('index.json',{'files':idx})
 print(json.dumps({'files':len(idx),'reviewSHA256':sha((OUT/'review.json').read_bytes()),'indexSHA256':sha((OUT/'index.json').read_bytes())}))
