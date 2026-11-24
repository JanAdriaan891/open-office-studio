import hashlib,json,pathlib,stat,subprocess,zipfile,io,xml.etree.ElementTree as ET
ROOT=pathlib.Path(r'C:/Users/alper/Desktop/Documents/ChatGPT/code slaafjes');OWNER=ROOT/'work/oos-mac-native-blocker-20261120'
OUT=ROOT/'work/oos-release-prep-2026-11-20-9635/docs/releases/2026-11-20/P5-Mac-Suite-followup-independent'
CORE=OUT.parent/'P5-Mac-Suite-core-independent';CORE_REPORT=CORE/'retained/mac-product-native/report.json'
QA='b052808d6fcfed34c7543176f0a827891b02a60d';P5='b696ab86bd1c128729a079b68c0082e6df3d36a5';TREE='e30879fd772871e690847c061ef66e6b81808a05'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(p,b):p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
def dump(p,v):save(p,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def git(n):return subprocess.check_output(['git','-C',str(OWNER),'show',QA+':'+n])
core=json.loads(CORE_REPORT.read_bytes());assert sha(CORE_REPORT.read_bytes())=='ed6409f1f36a8a327056b2806279d405b9fa749ce0de3dda3e9784b60f7d3ccd'
assert sha((CORE/'audit.json').read_bytes())=='61b72d0d2647a8e2e5e23832e1f0ad6b92bfe7235c3b74db604b1afe8ce7fbbd'
core_ident=core['identity'];core_origin=json.loads((CORE/'retained/mac-product-input/artifact-origin.json').read_bytes())
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def doc(b):
 with zipfile.ZipFile(io.BytesIO(b)) as z:
  t=ET.fromstring(z.read('word/document.xml'));tables=t.findall('.//w:tbl',ns);assert len(tables)==1
  rows=[[''.join(x.text or '' for x in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)] for row in tables[0].findall('w:tr',ns)]
  text=''.join(x.text or '' for x in t.findall('.//w:t',ns))
 return {'rows':rows,'text':text,'sha256':sha(b)}
original=git('scripts/proeven/mac-body-original-361.docx');orig=doc(original)['rows'];assert orig==[['alpha','beta',''],['','','omega'],['delta','','']]
empty=orig+[['','','']];new=orig+[['newrow','','']];col=[[row[0],'',row[1],row[2]] for row in orig];typed=[['alpXha','beta',''],*orig[1:]]
common_sources=['scripts/mac-native-current-session.py','scripts/proef-writer-361-macos.py','scripts/writer-361-macos-ax.swift','scripts/mac-native-361-tab-oracle.py','scripts/mac-native-361-remaining.py']
source_hashes={}
for f in common_sources:
 b=git(f);source_hashes[f]=sha(b);save(OUT/'source'/pathlib.PurePosixPath(f).name,b)
save(OUT/'source/mac-body-original-361.docx',original)
configs=[('Tab',45355259315,138311374083,14901559361,1854207,'ec2b060060c0772a754622cdfe4aa247e698ef7761cdabaf71456ec64547cb34','mac361-tab-history-native','mac361-tab-history-input','native361TabSaveOracle','native361-Tab-save-oracle','Tab-history'),('Find',45355259405,138311374732,14901514577,2641817,'af98581f0b0fbe6b5cc0b7aa5752415d071908b00df67a06d9ffafe04b676fe4','mac361-remaining-native','mac361-remaining-input','native361Remaining','native361-remaining','Find-isolation')]
results=[]
for label,run,jobid,artifactid,size,digest,prefix,inp,key,case,ownerfolder in configs:
 target=OUT/label;target.mkdir(exist_ok=False);base=OWNER/f'.local/nov24-suite/{run}';b=(base/'proof.zip').read_bytes()
 assert len(b)==size and sha(b)==digest;save(target/'proof.zip',b)
 meta={n:json.loads((OUT/f'metadata/{label}-{n}.json').read_bytes()) for n in ['run','job','artifact']}
 assert meta['run']['id']==run and meta['run']['head_sha']==QA and meta['run']['run_attempt']==1 and meta['run']['conclusion']=='success'
 assert meta['job']['id']==jobid and meta['job']['run_id']==run and meta['job']['head_sha']==QA and meta['job']['run_attempt']==1 and meta['job']['conclusion']=='success'
 assert meta['artifact']['id']==artifactid and meta['artifact']['workflow_run']['id']==run and meta['artifact']['workflow_run']['head_sha']==QA
 assert meta['artifact']['size_in_bytes']==size and meta['artifact']['digest']=='sha256:'+digest
 with zipfile.ZipFile(base/'proof.zip') as z:
  names=set();members=[]
  for i in z.infolist():
   n=i.filename;p=pathlib.PurePosixPath(n);assert n not in names and not p.is_absolute() and '..' not in p.parts and ':' not in n and '\\' not in n and not stat.S_ISLNK(i.external_attr>>16);names.add(n)
   if i.is_dir():continue
   data=z.read(n);local=pathlib.Path('\\\\?\\'+str((base/'payload'/n).resolve()));assert data==local.read_bytes()
   members.append({'member':n,'bytes':len(data),'sha256':sha(data)})
  assert len(members)==(100 if label=='Tab' else 145)
  j=lambda n:json.loads(z.read(n));r=j(prefix+'/report.json');p=r[key]
  assert r['harnessCommit']==QA and r['nativePass'] is False and r['applicationModified'] is False
  assert r['identity']['sourceCommit']==P5 and r['identity']['sourceTree']==TREE and r['identity']['declaredVersion']=='2026.48.1'
  # Reuse the exact already-audited foundation; verify each fresh-host binding delta.
  chainkeys=['sourceCommit','sourceTree','declaredVersion','artifactRun','artifactAttempt','artifactId','archiveSha256','packageMember','packageSha256','transferRun','transferCommit','transferAttempt','transferArtifactId','transferArchiveSha256','transferProducerJob','supportDescriptorArtifactId','supportDescriptorArchiveSha256','producerCommit','producerTree','producerWorkflowSha256','checkoutWorkflowSha256','sourceWitnessSha256','executableSha256']
  for k in chainkeys:assert r['identity'][k]==core_ident[k],k
  assert r['installedBundleIdentity']==core['installedBundleIdentity'] and r['installedVersion']=='2026.48.1'
  assert r['payloadInfoPlistSha256']==r['installedInfoPlistSha256']==core['payloadInfoPlistSha256'] and r['ownedRunnerProfileCreated']
  assert r['helperSourceSha256']==source_hashes['scripts/writer-361-macos-ax.swift']==core['helperSourceSha256']
  assert r['sessionDriverSha256']==source_hashes['scripts/mac-native-current-session.py']==core['sessionDriverSha256']
  assert r['helperBinarySha256']==sha(z.read(prefix+'/writer361-ax-82813e7a2b95'))==core['helperBinarySha256']
  origin=j(inp+'/artifact-origin.json')
  for k in ['actualWholeChildArchive','supportDescriptorArchive','sourceWitness','expectedInstalledIdentity']:
   assert origin[k]==core_origin[k],k
  for k,file in [('requestSha256','request.json'),('supportDescriptorSha256','suite-support-descriptor.json'),('originalChildRequestSha256','original-child-request.json'),('rawProvenanceSha256','transfer-provenance.json')]:assert origin[k]==sha(z.read(inp+'/'+file))
  assert origin['wholeChildArchiveHashVerifiedBySuiteConsumer'] is True
  assert origin['stepAndArtifactTimeGates']==core_origin['stepAndArtifactTimeGates']
  assert sha(z.read(inp+'/preparer-job.log'))==origin['stepAndArtifactTimeGates']['rawPreparerLogSha256']
  assert r['ownedAppContainer']!=core['ownedAppContainer']
  signed=j(prefix+'/signed-package-preflight/report.json');assert signed==r['signedPackagePreflight'] and signed['status']=='passed'
  for c in signed['checks']:assert c['returncode']==0 and sha(z.read(prefix+'/'+c['log'].split('/'+prefix+'/',1)[1]))==c['logSha256']
  prior=p.get('priorCore',p.get('reusedCore'));assert prior['reportSha256']==sha(CORE_REPORT.read_bytes()) and prior['archiveSha256']=='0b63b96d5dfa25b95671c12cb39e32e0164a5f01adbfea161597eafd617e8721' and prior['status']=='reused-valid'
  assert r['cleanup']=={'ownedAppClosed':True,'ownedAppContainerRemoved':True}
  checks={x['name']:x for x in p['checks']};actual=[]
  for n in sorted(names):
   if '/action-' in n and n.endswith('.json'):
    a=j(n);v=a['native'];assert a['harnessCommit']==QA and a['helperBinarySha256']==r['helperBinarySha256']
    actual.append({'member':n,**{k:v[k] for k in ['action','status','chord','pid','frontmostPid','focusBefore','focusAfter','testText','testCharacter','keyboardTransport'] if k in v}})
  pid=p['pid'];assert pid==(2449 if label=='Tab' else 2521)
  assert sum(1 for a in actual if a.get('chord')=='cmd-q')==1
  assert any(a.get('chord')=='cmd-q' and a['status']=='input-sent' and a['pid']==pid and a['frontmostPid']==pid for a in actual)
  if label=='Tab':
   assert r['status']=='tab-history-oracle-observed' and r['diagnosticOnly'] is True and p['status']=='observed' and p['nativePass'] is False
   assert p['hostPreflightPassed'] and p['sourceUnchanged']
   assert len(p['tabActions'])==3 and len([a for a in actual if a.get('chord')=='tab'])==3
   for a in p['tabActions']:
    assert a['status']=='input-sent' and a['pid']==pid and a['frontmostPid']==pid and a['focusBefore']['description']=='Document input'
    assert a['keyboardTransport']=='CG HID key down/up; explicit Shift modifier when requested'
   assert p['newrowInput']['testText']=='newrow' and p['newrowInput']['focusBefore']['description']=='Document input' and p['saveInput']['chord']=='cmd-s'
   expected={'361-remaining-A.docx':new,'after-three-Tabs-newrow-CmdS.docx':new,'Undo-1-saved.docx':empty,'Undo-2-saved.docx':orig,'Redo-1-saved.docx':empty,'Redo-2-saved.docx':new}
   assert p['historyGrouping']==[empty,orig,empty,new] and p['historyRoundTripProven']
   for h,e in zip(p['historySteps'],[empty,orig,empty,new]):
    assert h['savedRows']==e and h['savedBytesChanged'] and h['input']['status']=='input-sent' and h['saveInput']['chord']=='cmd-s'
   images={prefix+'/'+case+'/after-save-original-display.png':(p['originalDisplaySha256'],'Visible alpha/beta/omega/delta and newrow in fourth row; clean title and Saved notification. No complete typography claim.')}
   criteria={'exactThreeTabsAndNewrow4x3':True,'Undo1EmptyFourthRow':True,'Undo2Original3x3':True,'Redo1EmptyFourthRow':True,'Redo2Newrow4x3':True,'rawObservedNativePassFalsePreserved':True}
  else:
   assert r['status']=='native361-final-find-isolation-passed-tab-separate' and r['native361FindIsolationPassed'] and r['issue361FullAcceptance'] is False
   assert p['findIsolationPassed'] and p['sourceFixtureUnchanged'] and p['newHostFocusSaveUndoRedoPreflightPassed']
   expected={'361-remaining-A.docx':col,'361-remaining-B.docx':orig,'A-cell-typed-saved.docx':typed,'A-host-preflight-restored-saved.docx':orig,'A-isolated-final-saved.docx':col,'B-isolated-final-saved.docx':orig}
   def rows(name):return checks[name]['native']['tables'][0]['cellTexts']
   for name,value in [('Find empty focused input',''),('Find native typed value','abc'),('Find owns native Undo',''),('Find owns native Redo','abc'),('Find input reset','')]:
    v=checks[name]['native'];assert v['focusAfter']['description']=='Find what' and v['focusAfter']['value']==value and v['tables'][0]['cellTexts']==col
   assert rows('Find close document Undo')==orig and rows('B own Undo')==orig and rows('A own Redo while B inactive')==col and rows('B own Redo while A inactive')==col and rows('B own reset')==orig
   for n in ['A-cell-typed saved XML oracle','A-host-preflight-restored saved XML oracle','A-isolated-final saved XML oracle','B-isolated-final saved XML oracle']:
    v=checks[n];assert v['actualFileWriteObserved'] and v['beforeMtimeNs']!=v['afterMtimeNs']
   images={prefix+'/'+case+'/'+path+'/original-display.png':(checks[name]['displaySha256'],observation) for path,name,observation in [('Find-native-typed','Find-native-typed original pixels','Find field visibly contains abc; original document words remain readable.'),('Find-native-Undo','Find-native-Undo original pixels','Find field visibly empty after native Undo, document words still present.'),('A-isolated-final','A-isolated-final original pixels','A active with both document tabs visible and original words; Saved notification.'),('B-isolated-final','B-isolated-final original pixels','B active with both document tabs visible and original words; Saved notification.')]}
   criteria={'ordinaryCellTypingSaveUndoRedo':True,'findOwnUndoRedoNoDocumentSentinelChange':True,'twoDocumentsIndependentHistory':True,'finalSavedA3x4BOriginal3x3':True,'rawNativePassFalseAndTabSeparatePreserved':True}
  outputs={}
  for filename,e in expected.items():
   n=prefix+'/'+case+'/'+filename;v=doc(z.read(n));assert v['rows']==e
   assert v['rows'][:3]==(typed if filename=='A-cell-typed-saved.docx' else col if label=='Find' and filename in ['361-remaining-A.docx','A-isolated-final-saved.docx'] else orig)
   if label=='Find':assert 'abc' not in v['text']
   outputs[filename]=v;save(target/'outputs'/filename,z.read(n))
  for n,ref in [(h['name']+'-saved.docx',h['savedSha256']) for h in p.get('historySteps',[])]:assert outputs[n]['sha256']==ref
  if label=='Find':
   for k,n in [('A','A-isolated-final-saved.docx'),('B','B-isolated-final-saved.docx')]:assert outputs[n]['sha256']==p['finalDocuments'][k]['sha256']
  review=[]
  for n,(ref,observation) in images.items():
   assert sha(z.read(n))==ref;review.append({'member':n,'sha256':ref,'originalViewedDirectly':True,'observation':observation});save(target/'reviewed-images'/pathlib.PurePosixPath(n).parent.name/pathlib.PurePosixPath(n).name,z.read(n))
  for n in names:
   if n.startswith(inp+'/') or n==prefix+'/report.json' or n.startswith(prefix+'/signed-package-preflight/'):save(target/'retained'/n,z.read(n))
  ownerjson=(OWNER/f'docs/tests/2026-11-23-mac-native-P5/{ownerfolder}/owner-audit.json').read_bytes();oa=json.loads(ownerjson);assert oa['zipSha256']==digest and oa['reportSha256']==sha(z.read(prefix+'/report.json'));save(target/'owner-audit.json',ownerjson)
  dump(target/'members.json',members);dump(target/'actions-summary.json',actual)
  result={'verdict':'PASS bounded '+('Tab/newrow/history' if label=='Tab' else 'Find and two-document isolation')+' criteria only','rawStatus':r['status'],'rawNativePass':r['nativePass'],'rawDiagnosticOnly':r['diagnosticOnly'],'run':run,'attempt':1,'job':jobid,'artifact':artifactid,'artifactSHA256':digest,'artifactBytes':size,'reportSHA256':sha(z.read(prefix+'/report.json')),'qaCommit':QA,'applicationCommit':P5,'applicationTree':TREE,'criteria':criteria,'independentXML':outputs,'originalPNGReview':review,'ownPID':pid,'nativeCmdQAndCleanOwnedContainer':True,'newPIDReopenNewlyExecutedInThisScope':False,'reusedCoreLifecycles':{'control':[4334,5393],'table':[5961,7589],'auditSHA256':sha((CORE/'audit.json').read_bytes()),'reportSHA256':sha(CORE_REPORT.read_bytes())},'sourceAndPackageFoundationExactToAuditedCore':True,'freshInstalledPlistAndExecutableBindingsVerified':True,'signedAttestationLogsHashVerified':True,'signatureCommandsActuallyReverifiedByAuditor':False,'profileCreated':True,'profileRemovalExplicitlyAttested':False,'cleanup':r['cleanup'],'limits':['No overall361/374/stable release acceptance.','Only relevant same-source core is reused; no cold-reopen was newly run here.','AX tree retains truncation and raw nativePass=false labels.','Font substitution/viewport/full fidelity/dependency closure are outside scope.','Earlier Q/CmdS preflight forensic failure remains unexplained and is not resolved by these independent positives.','Only six small API metadata requests were newly made; no ZIP/installer download, GUI, CI, fix or Git write.']}
  dump(target/'audit.json',result);results.append(result)
dump(OUT/'summary.json',{'applicationCommit':P5,'qaCommit':QA,'separateVerdicts':[{'scope':'Tab history','verdict':results[0]['verdict']},{'scope':'Find/two-document isolation','verdict':results[1]['verdict']}],'overall361AcceptanceClaimed':False,'field374AcceptanceClaimed':False,'earlierQCmdSFailureUnresolved':True,'sourceHashes':source_hashes})
save(OUT/'audit-mac-suite-followup.py',pathlib.Path(__file__).read_bytes());save(OUT/'README.md',b'Two independent bounded Suite follow-up audits\n\nTab history and Find/two-document isolation each pass their exact retained scope. Raw nativePass=false/status labels stay intact. New PID reopen is only reused from the separately audited same-source core. The earlier Q/CmdS save failure remains unresolved; no overall361/374/stable-release claim. See each audit.json and summary.json.\n')
idx=[{'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(OUT.rglob('*')) if p.is_file()];dump(OUT/'index.json',{'files':idx})
print(json.dumps({'files':len(idx),'TabAuditSHA256':sha((OUT/'Tab/audit.json').read_bytes()),'FindAuditSHA256':sha((OUT/'Find/audit.json').read_bytes()),'indexSHA256':sha((OUT/'index.json').read_bytes())}))
