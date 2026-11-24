import base64, hashlib, json, pathlib, stat, subprocess, zipfile, xml.etree.ElementTree as ET

ROOT = pathlib.Path(r'C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes')
OWNER = ROOT/'work/oos-mac-native-blocker-20261120'
BASE = OWNER/'.local/nov24-suite/45352741879'
OUT = ROOT/'work/oos-release-prep-2026-11-20-9635/docs/releases/2026-11-20/P5-Mac-Suite-core-independent'
OUT.mkdir(parents=True, exist_ok=False)
P5='b696ab86bd1c128729a079b68c0082e6df3d36a5'; TREE='e30879fd772871e690847c061ef66e6b81808a05'
QA='48e7de0f5c94a7bb8f5e723be6cfd6c383d8b2ae'; OWNERHEAD='b052808d'
sha=lambda b:hashlib.sha256(b).hexdigest()
def dump(n,v):
 p=OUT/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def save(n,b):
 p=OUT/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def git(ref,name):return subprocess.check_output(['git','-C',str(OWNER),'show',f'{ref}:{name}'])
archive=(BASE/'proof.zip').read_bytes()
assert len(archive)==4677514 and sha(archive)=='0b63b96d5dfa25b95671c12cb39e32e0164a5f01adbfea161597eafd617e8721'
save('proof.zip',archive)
members=[]
with zipfile.ZipFile(BASE/'proof.zip') as z:
 names=set()
 for info in z.infolist():
  name=info.filename;p=pathlib.PurePosixPath(name)
  assert name not in names and not p.is_absolute() and '..' not in p.parts and ':' not in name and '\\' not in name
  names.add(name);assert not stat.S_ISLNK(info.external_attr>>16)
  if info.is_dir():continue
  b=z.read(info);local=pathlib.Path('\\\\?\\'+str((BASE/'payload'/name).resolve()))
  assert b==local.read_bytes(),name
  members.append({'member':name,'bytes':len(b),'sha256':sha(b)})
 assert len(members)==188
 read=z.read
 j=lambda n:json.loads(read(n))
 r=j('mac-product-native/report.json');ident=r['identity'];origin=j('mac-product-input/artifact-origin.json')
 assert sha(read('mac-product-native/report.json'))=='ed6409f1f36a8a327056b2806279d405b9fa749ce0de3dda3e9784b60f7d3ccd'
 assert r['harnessCommit']==QA and r['status']=='native-core-passed' and r['nativePass'] is True and r['issue361FullAcceptance'] is False
 assert ident['sourceCommit']==P5 and ident['sourceTree']==TREE and ident['declaredVersion']=='2026.48.1'
 assert ident['producerCommit']=='2af94cdcefa3e88e4980b631d16a88d7d7de5ae8' and ident['artifactRun']==45195055147
 assert ident['packageSha256']=='1d0cb79f23e1e082d1aa4e32aa1dd3997c297fb0cb2629aa530a3e29e685c4af'
 assert ident['executableSha256']=='0c6a58c7438f1ba2b3b9b1e74ea23e29fb9a93523723bc5694bb3727702a9d87'
 assert ident['requireSignedNotarized'] and ident['suiteChildTransferApproved']
 assert r['installedBundleIdentity']['CFBundleIdentifier']=='org.openaec.office-studio'
 assert r['installedBundleIdentity']['CFBundleExecutable']=='open-office-studio' and r['installedVersion']=='2026.48.1'
 assert r['payloadInfoPlistSha256']==r['installedInfoPlistSha256'] and r['ownedRunnerProfileCreated']
 assert origin['parentZipDownloadedByThisRunner'] is False and origin['wholeChildArchiveHashVerifiedBySuiteConsumer'] is True
 parent=j('mac-product-input/officialRun.json');job=j('mac-product-input/officialMacJob.json');art=j('mac-product-input/officialArtifact.json')
 assert parent['id']==45195055147 and parent['run_attempt']==1 and parent['head_sha']==ident['producerCommit']
 assert job['id']==137763371873 and job['conclusion']=='success' and job['status']=='completed'
 assert art['id']==14836145077 and art['digest']=='sha256:'+ident['archiveSha256'] and art['size_in_bytes']==1972148013
 assert art['workflow_run']['head_sha']==ident['producerCommit']
 desc=j('mac-product-input/suite-support-descriptor.json');w=desc['sourceWitness'];raw=base64.b64decode(w['rawBase64'])
 assert raw==read('mac-product-input/actual-parent-source-witness.json') and len(raw)==820 and sha(raw)==ident['sourceWitnessSha256']==w['sha256']
 assert json.loads(raw)==w['value'] and w['value']['appHead']==P5 and w['value']['appTree']==TREE
 assert desc['source']=={'commit':P5,'tree':TREE,'version':'2026.48.1'}
 assert desc['suiteDeliveryToStandaloneHostsAuthorized'] is False
 assert desc['expectedInstalledIdentity']['bundleIdentifier']=='org.openaec.office-studio'
 assert sha(read('mac-product-input/suite-support-descriptor.json'))==origin['supportDescriptorSha256']
 child=j('mac-product-input/transferArtifact.json');tr=j('mac-product-input/transferRun.json');prep=j('mac-product-input/transferPreparerJob.json')
 assert child['id']==14901001083 and child['digest']=='sha256:'+ident['transferArchiveSha256'] and child['size_in_bytes']==ident['transferArchiveBytes']
 assert tr['id']==45351696628 and tr['run_attempt']==1 and tr['head_sha']==ident['transferCommit']
 assert prep['id']==138299734385
 assert origin['actualWholeChildArchive']=={'sha256':ident['transferArchiveSha256'],'bytes':373225524,'wholeArchiveHashed':True}
 assert origin['supportDescriptorArchive']=={'sha256':ident['supportDescriptorArchiveSha256'],'bytes':2673,'wholeArchiveHashed':True}
 for step in origin['stepAndArtifactTimeGates']['requiredSteps']:assert step['status']=='completed' and step['conclusion']=='success'
 assert sha(read('mac-product-input/preparer-job.log'))==origin['stepAndArtifactTimeGates']['rawPreparerLogSha256']
 assert sha(read('mac-product-input/request.json'))==origin['requestSha256']
 assert sha(read('mac-product-input/original-child-request.json'))==origin['originalChildRequestSha256']
 assert sha(read('mac-product-input/transfer-provenance.json'))==origin['rawProvenanceSha256']
 source_files=['scripts/mac-native-current-session.py','scripts/writer-361-macos-ax.swift','scripts/mac-native-body-ocr.swift','scripts/mac-native-writer-preflight.py','scripts/mac-native-writer-table-acceptance.py','scripts/mac-native-suite-transfer-fetch.py','scripts/mac-native-signed-package.py']
 source_hashes={}
 for f in source_files:
  b=git(QA,f);source_hashes[f]=sha(b);save('source/'+pathlib.PurePosixPath(f).name,b)
 assert source_hashes[source_files[0]]==r['sessionDriverSha256'] and source_hashes[source_files[1]]==r['helperSourceSha256']
 assert source_hashes[source_files[2]]==r['ocrHelper']['sourceSha256'] and source_hashes[source_files[5]]==origin['consumerSourceSha256']
 assert sha(read('mac-product-native/writer361-ax-'+r['helperSourceSha256'][:12]))==r['helperBinarySha256']
 assert sha(read('mac-product-native/mac-native-body-ocr'))==r['ocrHelper']['binarySha256'] and r['ocrHelper']['compiledBeforeAppLaunch']
 # Exact workflow/source binding from Git, not a producer/app commit conflation.
 assert sha(git(P5,'.github/workflows/release.yml'))==ident['checkoutWorkflowSha256']
 assert sha(git(ident['producerCommit'],'.github/workflows/release.yml'))==ident['producerWorkflowSha256']
 signed=j('mac-product-native/signed-package-preflight/report.json');assert signed==r['signedPackagePreflight'] and signed['status']=='passed'
 for check in signed['checks']:
  assert check['returncode']==0
  name=check['log'].split('/mac-product-native/',1)[1]
  assert sha(read('mac-product-native/'+name))==check['logSha256']
 assert signed['identifier']=='org.openaec.office-studio' and signed['teamIdentifier']=='7KFV4QY98M'
 # Saved DOCX are parsed independently using only stdlib and source fixtures from Git.
 ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
 def doc(b):
  import io
  with zipfile.ZipFile(io.BytesIO(b)) as d:
   root=ET.fromstring(d.read('word/document.xml'))
   text=''.join(n.text or '' for n in root.findall('.//w:t',ns))
   tables=[[[''.join(n.text or '' for n in c.findall('.//w:t',ns)) for c in row.findall('w:tc',ns)] for row in t.findall('w:tr',ns)] for t in root.findall('.//w:tbl',ns)]
   images=sorted((sha(d.read(n)) for n in d.namelist() if n.startswith('word/media/') and not n.endswith('/')))
  return {'text':text,'tables':tables,'imageHashes':images}
 original=git(QA,'scripts/proeven/mac-body-original-361.docx');control=git(QA,'scripts/proeven/mac-body-positive-356.docx')
 assert sha(original)=='f0eddcec6a630776774e4c3baf834ff4f89e3970d86ce183bba9814494b3f4f1'
 assert sha(control)=='c28b963a6094108cdf6cc412bca58302e731a7810ee81772831a0c621748e52d'
 save('source/mac-body-original-361.docx',original);save('source/mac-body-positive-356.docx',control)
 sc=read('mac-product-native/native-control-preflight/native-preflight-private-copy.docx');st=read('mac-product-native/native-original-acceptance/native-original-private-copy.docx')
 dc=doc(sc);dt=doc(st);assert dc==doc(control)
 expected=[['alpha','','beta',''],['','','','omega'],['delta','','','']]
 assert dt['tables']==[expected] and dt['text']==doc(original)['text']
 assert sha(st)==r['nativeOriginalTable']['savedSha256']=='f9fe71e2bb5737dcf8dc47eb2181819febdd1be76bba85985fc1a7ff27c6bedf'
 assert sha(sc)=='e1902aa776ca394940d01a8f3e1190fa20dd936dd86613dd0f2b4b398c14355f'
 cp=r['nativeControlPreflight'];tb=r['nativeOriginalTable'];assert (cp['firstPid'],cp['secondPid'])==(4334,5393) and (tb['firstPid'],tb['secondPid'])==(5961,7589)
 assert cp['status']=='passed' and cp['sourceControlUnchanged'] and tb['originalSourceUnchanged'] and tb['status']=='core-passed'
 edit=next(x for x in cp['checks'] if x['name']=='native Q and CommandS independently persisted')
 assert edit['persistedText'].count('Q')==1 and edit['persistedText'].replace('Q','',1)==dc['text']
 assert next(x for x in cp['checks'] if x['name']=='fresh PID reopened saved original control without input')['savedSha256']==sha(sc)
 assert r['cleanup']=={'ownedAppClosed':True,'ownedAppContainerRemoved':True}
 actions=[]
 for name in sorted(names):
  if not name.startswith('mac-product-native/action-') or not name.endswith('.json'):continue
  a=j(name);n=a['native'];assert a['harnessCommit']==QA and a['helperBinarySha256']==r['helperBinarySha256']
  actions.append({'member':name,**{k:n[k] for k in ['action','status','pid','frontmostPid','chord','focusBefore','focusAfter'] if k in n}})
 for pid in [3057,3744,4334,5393,5961,7589]:
  assert any(a.get('chord')=='cmd-q' and a['pid']==pid and a['frontmostPid']==pid and a['status']=='input-sent' for a in actions)
 grids={x['name']:x['native']['tables'][0]['cellTexts'] for x in r['checks'] if x['native'].get('tables')}
 orig=[['alpha','beta',''],['','','omega'],['delta','','']]
 for side in ['Left','Right']:
  assert grids[side+' immediate Undo']==orig and grids[side+' reset']==orig
  assert all(len(row)==4 for row in grids[side+' insert']) and grids[side+' Redo']==grids[side+' insert']
 assert grids['persistent column']==expected and grids['fresh process reopened persisted table']==expected
 views={
 'mac-product-native/table-original361/initial-ready.png':'Original untouched361 alpha/beta/omega/delta readable before maximize or editor input; no full-page typography claim.',
 'mac-product-native/saved-epub356-control/initial-ready.png':'Untouched356 headings, accented body, numbered list, image and2x2 table readable before maximize or editor input.',
 'mac-product-native/native-original-acceptance/reopened-original-before-input/original-display.png':'NewPID7589 table words readable; exact persisted3x4 structure independently proven by XML.',
 'mac-product-native/native-control-preflight/reopened-before-input/original-display.png':'NewPID5393 restored headings/body/list/image and table visible; font substitution warning partly overlays right side, no full-document fidelity claim.'}
 view_refs=[r['fixtures'][0]['phases'][0]['capture']['sha256'],r['fixtures'][1]['phases'][0]['capture']['sha256'],tb['checks'][-1]['receipt']['originalDisplaySha256'],cp['checks'][-1]['receipt']['originalDisplaySha256']]
 for (n,observation),expected in zip(views.items(),view_refs):
  assert sha(read(n))==expected
  save('reviewed-images/'+pathlib.PurePosixPath(n).parent.name+'-'+pathlib.PurePosixPath(n).name,read(n))
 retained=[n for n in names if n.startswith('mac-product-input/') or n=='mac-product-native/report.json' or n.startswith('mac-product-native/signed-package-preflight/') or n.endswith('.docx')]
 for n in retained:save('retained/'+n,read(n))
 owner_binding={}
 for f in ['report.json','owner-audit.json','zip-audit.json']:
  gb=git(OWNERHEAD,'docs/tests/2026-11-23-mac-native-P5/core/'+f);local=(OWNER/'docs/tests/2026-11-23-mac-native-P5/core'/f).read_bytes()
  assert local==gb or local.replace(b'\r\n',b'\n')==gb
  owner_binding[f]={'gitSHA256':sha(gb),'workingBytesSHA256':sha(local),'relation':'exact' if local==gb else 'CRLF checkout; exact LF Git projection'}
  save('owner/'+f,gb)
 dump('members.json',members);dump('actions-summary.json',actions)
 audit={'verdict':'PASS bounded Mac Suite body/table core only','nativeRun':45352741879,'attempt':1,'job':138302964907,'qaCommit':QA,
  'nativeMetadataBasis':'Official artifact/run/job pins supplied by integration; local proof ZIP independently fully hashed. No new API request or download.',
  'artifact':14902380591,'artifactBytes':len(archive),'artifactSHA256':sha(archive),'memberCount':len(members),'allMembersMatchRetainedPayload':True,
  'sourceReportSHA256':sha(read('mac-product-native/report.json')),'applicationCommit':P5,'applicationTree':TREE,'producerCommit':ident['producerCommit'],
  'packageChain':{'parentRun':parent['id'],'parentArtifact':art['id'],'parentDigest':art['digest'],'suiteDMG':desc['suitePackage'],'child':origin['actualWholeChildArchive'],'installedIdentity':r['installedBundleIdentity'],'executableSHA256':ident['executableSha256'],'sourceWitnessSHA256':sha(raw),'strictSignatureAttestationLogHashesVerified':True,'signaturesActuallyReverifiedByAuditor':False},
  'sourceHashes':source_hashes,'ownerGitBinding':owner_binding,'ownerEvidenceCommit':subprocess.check_output(['git','-C',str(OWNER),'rev-parse',OWNERHEAD+'^{commit}'],text=True).strip(),'savedControl':{'sha256':sha(sc),'sourceTextTablesAndImageBytesEqual':True,'content':dc},
  'savedTable':{'sha256':sha(st),'content':dt,'exact3x4ExpectedCells':expected},'nativeLifecycles':{'control':[4334,5393],'table':[5961,7589],'allSixOwnedPIDsHaveNativeCmdQReceipt':True,'forcedTerminationRequired':False},
  'originalPNGReview':[{'member':n,'sha256':sha(read(n)),'originalViewedDirectly':True,'reportBoundHashVerified':True,'observation':v} for n,v in views.items()],
  'profile':{'ownedRunnerProfileCreated':True,'sourceGuardRefusesExistingPreferences':True,'profileRemovalNotExplicitlyAttested':True,'disposableHostedRunnerOnly':True},
  'cleanup':r['cleanup'],'limits':['Only Suite own host; no standalone acceptance implied.','No full361 Find/Tab/two-document acceptance or374 title acceptance: separate active runs excluded.','AX snapshots explicitly childListsTruncated: no complete AX-tree claim.','Default1440x950 window extends beyond1024x768 display before native Maximize; body readability witnessed, no viewport-fix claim.','Font substitutions remain visible; no full fidelity, full typography, dependency closure or startup performance claim.','Parent/child/DMG binaries not re-downloaded or rehashed by this independent auditor; retained source-bound acquisition and installed checks audited.','Q intermediate output hash/text retained by original report but intermediate ZIP not retained; final restored control independently parsed.','No new GUI, CI, app execution, download, patch or Git write.']}
 dump('audit.json',audit)
 save('audit-mac-suite-core.py',pathlib.Path(__file__).read_bytes())
 save('README.md',b'Independent bounded Mac Suite core audit\n\nPASS only for the retained signed Suite body/control and table insert/Undo/Redo/save/new-process-reopen scope. See audit.json and members.json. Separate Find/Tab/374 runs are excluded. No actual signature command or native execution was repeated by this auditor.\n')
 index=[]
 for p in sorted(OUT.rglob('*')):
  if p.is_file():index.append({'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
 dump('index.json',{'files':index})
 print(json.dumps({'verdict':audit['verdict'],'files':len(index),'auditSHA256':sha((OUT/'audit.json').read_bytes()),'indexSHA256':sha((OUT/'index.json').read_bytes())}))
