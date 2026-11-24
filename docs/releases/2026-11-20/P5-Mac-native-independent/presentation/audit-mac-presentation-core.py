from pathlib import Path,PurePosixPath
from datetime import datetime,timezone
import subprocess,json,hashlib,base64,zipfile,stat,xml.etree.ElementTree as E,posixpath
r=Path.cwd();owner=r.parent/'oos-standalone-macos-20261123-6f92';local=Path('\\\\?\\'+str(owner.resolve()))/'.local/native-45351696628-2026-11-24/presentation';raw=local/'raw';appraw=raw/'presentation';docs=raw/'presentation-documents';d=Path('\\\\?\\'+str((r/'docs/releases/2026-11-20/P5-Mac-native-independent/presentation').resolve()));d.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));app='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';qa='03477b0199daeb50ae7b20d552b111630c3271ce';producer='2af94cdcefa3e88e4980b631d16a88d7d7de5ae8';source={'commit':app,'tree':tree,'version':'2026.48.1'}
def save(b,path):
 p=d/path;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==b,str(p)
 else:p.write_bytes(b)
def api(endpoint,path):
 b=subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+endpoint]);save(b,'api/'+path);return json.loads(b)
def git(pin,path):return subprocess.check_output(['git','-C',str(owner),'show',pin+':'+path])
metadata=api('actions/artifacts/14900827581','proof-artifact.json');job=api('actions/jobs/138300391259','native-job.json');parentmeta=api('actions/artifacts/14836145077','parent-artifact.json');parentjob=api('actions/jobs/137763371873','parent-job.json')
archive=local/'artifact.zip';digest=sha(archive.read_bytes());assert archive.stat().st_size==metadata['size_in_bytes']==1477915 and metadata['digest']=='sha256:'+digest and digest=='4acbe1656695456bae403da6a64925b9e830aa19823e9206414a2a03e7eb03e3'
assert metadata['workflow_run']['head_sha']==qa and metadata['workflow_run']['id']==45351696628
assert job['run_id']==45351696628 and job['id']==138300391259 and job['head_sha']==qa and job['run_attempt']==1 and job['conclusion']=='success'
members=[]
with zipfile.ZipFile(archive) as z:
 names=set()
 for info in z.infolist():
  p=PurePosixPath(info.filename);mode=info.external_attr>>16
  assert info.filename not in names;names.add(info.filename)
  assert not p.is_absolute() and '..' not in p.parts and ':' not in info.filename and '\\' not in info.filename and not stat.S_ISLNK(mode)
  assert not stat.S_IFMT(mode) or stat.S_ISREG(mode) or stat.S_ISDIR(mode)
  if info.is_dir():continue
  b=z.read(info);assert (raw/info.filename).read_bytes()==b,info.filename
  members.append({'member':info.filename,'bytes':len(b),'sha256':sha(b)})
receipt=read(appraw/'receipt.json');core=read(appraw/'core-receipt.json');review=read(owner/'.local/mac-final-45351696628-2026-11-24/reviewed-presentation.json')
assert receipt['app']=='presentation' and receipt['source']==core['source']==review['source']==source and receipt['provenance']==core['provenance']==review['provenance']
prov=receipt['provenance'];parent=prov['parentArtifact'];package=prov['package'];workflow=prov['producerWorkflow'];witness=prov['sourceWitness']
assert parentmeta['workflow_run']['head_sha']==producer and parentmeta['workflow_run']['id']==parent['run']==45195055147 and parentjob['run_id']==45195055147 and parentjob['id']==parent['producerJobId']==137763371873 and parentjob['head_sha']==producer and parentjob['run_attempt']==1 and parentjob['conclusion']=='success'
assert parentmeta['digest']=='sha256:'+parent['sha256'] and parentmeta['size_in_bytes']==parent['bytes']==1972148013
assert package['sha256']=='544b088148dc9f0ef8bd250427fc2c70883fd28424861bfba50fd66d3664e71f' and package['bytes']==373169095 and prov['member']=='dist-installers/presentation/dmg/'+package['filename'] and prov['memberSHA256DerivedFromVerifiedParent']
w=base64.b64decode(witness['rawBase64'],validate=True);assert len(w)==witness['bytes']==820 and sha(w)==witness['sha256']=='236085a316b40b2e5033316a3e3ed45f91cb9a27e83d518117160ba4aff4e7d5' and json.loads(w)==witness['value']
actualWitness=owner/'.local/mac-final-45351696628-2026-11-24/actual-parent-source-witness.json';assert actualWitness.read_bytes()==w
v=json.loads(w);assert (v['appHead'],v['appTree'],v['appVersion'],v['producerHead'],v['producerWorkflowHead'])==(app,tree,'2026.48.1',producer,producer) and v['event']=='workflow_dispatch' and v['runId']=='45195055147' and v['attempt']=='1' and v['publiceren']=='false'
assert sha(git(producer,'.github/workflows/release.yml'))==workflow['workflowSha256'] and sha(git(app,'.github/workflows/release.yml'))==workflow['checkoutWorkflowSha256']==v['checkoutWorkflowSha256']
assert subprocess.check_output(['git','-C',str(owner),'rev-parse',app+'^{tree}']).decode().strip()==tree and subprocess.check_output(['git','-C',str(owner),'rev-parse',producer+'^{tree}']).decode().strip()==workflow['tree']
save(w,'source-witness.json')
for pin,path,name in [(producer,'.github/workflows/release.yml','producer-release.yml'),(app,'.github/workflows/release.yml','application-release.yml'),(qa,'scripts/standalone-macos/run.py','run.py'),(qa,'scripts/standalone-macos/contracts.py','contracts.py'),(qa,'scripts/standalone-macos/cases.py','cases.py'),(qa,'scripts/standalone-macos/native.py','native.py'),(qa,'scripts/standalone-macos/fixtures.py','fixtures.py'),(qa,'scripts/standalone-macos/oracles.py','oracles.py')]:save(git(pin,path),'src/'+name)
assert receipt['bundleInfo']['CFBundleIdentifier']=='org.openaec.presentation-studio' and receipt['bundleInfo']['CFBundleExecutable']=='open-presentation-studio' and receipt['bundleInfo']['CFBundleShortVersionString']==receipt['bundleInfo']['CFBundleVersion']=='2026.48.1'
assert receipt['executableSHA256']=='607354ff5323d570c697a3e0bd005ce379c2f96f07f3ec8aa15bf15adcf0a240'
for key in ['identityVerified','installedSignatureGatesVerified','suiteAbsent','freshProfileVerified','ownCwdEnvironmentVerified','nativeFocusVerified','nativeSaveVerified','outputOraclePassed','fullQuitVerified','newPidReopenVerified','ownConverterChildObserved','functionalCaseCompleted','cleanupPassed']:assert receipt[key] is True,key
assert receipt['cleanupErrors']==[] and not receipt['nativeAccepted'] and not receipt['resourceIndependencePassed']
installed=receipt['diagnosticRoot']+'/installed/Open Presentation Studio.app';exe=installed+'/Contents/MacOS/open-presentation-studio'
for key in ['signature','signatureIdentity','gatekeeper','notarizationStaple']:
 c=receipt[key];assert c['code']==0 and c['argv'][-1]==installed
assert 'Identifier=org.openaec.presentation-studio' in receipt['signatureIdentity']['stderr'] and 'TeamIdentifier=7KFV4QY98M' in receipt['signatureIdentity']['stderr'] and 'Notarization Ticket=stapled' in receipt['signatureIdentity']['stderr']
assert 'accepted' in receipt['gatekeeper']['stderr'] and 'source=Notarized Developer ID' in receipt['gatekeeper']['stderr'] and 'validate action worked' in receipt['notarizationStaple']['stdout']
profile=read(appraw/'profile-preflight.json');assert len(profile['checkedAbsent'])==7 and all('org.openaec.presentation-studio' in p for p in profile['checkedAbsent']) and 'org.openaec.presentation-studio' in profile['seededPreferencesOnly']
assert receipt['suiteAbsence']['found']==[] and receipt['suiteAbsence']['processes']['code']==0
for file in ['mount.json','copy.json','detach.json']:assert read(appraw/file)['code']==0
launches=receipt['launches'];assert len(launches)==2 and launches[0]['pid']==3433 and launches[1]['pid']==4091
for launch in launches:
 assert launch['argv'][0]==exe and launch['cwd']==receipt['diagnosticRoot']+'/empty-cwd' and launch['environment']['PATH']=='/usr/bin:/bin:/usr/sbin:/sbin'
 q=read(appraw/('quit-'+str(launch['pid'])+'.json'));assert q=={'pid':launch['pid'],'returncode':0,'normalCmdQ':True}
 cwd=read(appraw/('actual-cwd-'+str(launch['pid'])+'.json'));assert cwd['code']==0 and '\nn'+launch['cwd']+'\n' in cwd['stdout']
assert launches[0]['environmentSHA256']==launches[1]['environmentSHA256']
for viewport in receipt['viewportPreflights']:assert viewport['fitted'] and viewport['pid'] in [3433,4091] and viewport['mainDisplay']['Width']==1920 and viewport['mainDisplay']['Height']==1080
typed=[]
for p in appraw.glob('ax-*.json'):
 a=read(p)
 if a.get('keyboardTransport'):
  assert a['pid'] in [3433,4091] and a['frontmost'] and a['status']=='input-sent' and 'Native HID' in a['keyboardTransport']
  if a['action']=='type':assert a['focused']['AXFocused'] and a['focused']['AXEnabled'];typed.append({'file':p.name,'pid':a['pid'],'focusedRole':a['focused']['AXRole'],'focusedTitle':a['focused'].get('AXTitle'),'focusedPreInputValue':a['focused'].get('AXValue'),'transport':a['keyboardTransport']})
assert any(x['pid']==3433 and x['focusedRole']=='AXTextArea' and x['focusedPreInputValue']=='STANDALONE_PRESENTATION_SEED' for x in typed)
assert len(receipt['nativeFileDialogs'])==1
dialog=receipt['nativeFileDialogs'][0];assert dialog['requestedPath'].endswith('/standalone-runtime-presentation.odp') and dialog['nativeModalWindow']['AXIdentifier']=='save-panel' and dialog['nativeModalWindow']['AXRole']=='AXSheet' and dialog['focused']['AXIdentifier']=='saveAsNameTextField' and dialog['focused']['AXValue']=='standalone-runtime-presentation.odp' and dialog['focused']['AXFocused'] and dialog['confirmation']=='one native HID Return'
observations=read(appraw/'owned-process-observations.json');converters=[p for p in observations['processes'] if p.get('executable','').endswith('/soffice')]
assert any(p['ppid']==4091 and p['resolvedInsideOwnApp'] and p['executable'].startswith(installed+'/Contents/Helpers/LibreOffice.app/') and '--convert-to odp:impress8' in p['arguments'] for p in converters)
# Independent standard-library saved-content audit; does not call the owner's oracle or app engine.
pptx=docs/'synthetic-inputs/presentation.pptx';odp=docs/'standalone-runtime-presentation.odp';expected=['STANDALONE_PRESENTATION_SEED STANDALONE_PRESENTATION_EDIT','STANDALONE_UNCHANGED_CONTROL']
with zipfile.ZipFile(pptx) as z:
 ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
 ids=E.fromstring(z.read('ppt/presentation.xml')).findall('p:sldIdLst/p:sldId',ns);assert len(ids)==1
 rels={x.attrib['Id']:x.attrib['Target'] for x in E.fromstring(z.read('ppt/_rels/presentation.xml.rels'))};part=posixpath.normpath(posixpath.join('ppt',rels[ids[0].attrib['{'+ns['r']+'}id']]))
 text=[t.text or '' for t in E.fromstring(z.read(part)).iter('{'+ns['a']+'}t')];assert text==expected
with zipfile.ZipFile(odp) as z:
 assert z.read('mimetype')==b'application/vnd.oasis.opendocument.presentation'
 content=E.fromstring(z.read('content.xml'));pages=list(content.iter('{urn:oasis:names:tc:opendocument:xmlns:drawing:1.0}page'));assert len(pages)==1
 paragraphs=[''.join(p.itertext()) for p in pages[0].iter('{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p')];assert paragraphs==expected
assert sha(odp.read_bytes())==read(appraw/'runtime-export-oracle.json')['sha256']==review['independentODFRecheck']['sha256']
images=[]
for info in review['reviewedOriginalScreenshots']:
 p=appraw/info['file'];assert sha(p.read_bytes())==info['sha256']
 meta=read(appraw/('45-screenshot-0.json' if info['file'].startswith('45-') else '94-screenshot-0.json'));assert meta['code']==0 and '-l' in meta['argv']
 images.append({'file':info['file'],'sha256':info['sha256'],'originalDirectlyViewedIndependently':True,'finding':'Cold reopened Outline contains full seed/edit and unchanged control.' if info['file'].startswith('45-') else 'Post-export canvas shows seed/edit and unchanged control; control wraps across lines, no full-layout fidelity inferred.'})
assert len(images)==2
for path in ['receipt.json','core-receipt.json','profile-preflight.json','quit-3433.json','quit-4091.json','mount.json','copy.json','detach.json','actual-cwd-3433.json','actual-cwd-4091.json','owned-process-observations.json','output-oracle.json','reopened-oracle.json','runtime-export-oracle.json','45-resources-reopened.json','94-resources-runtime-exported.json','45-reopened-0.png','94-runtime-exported-0.png','45-screenshot-0.json','94-screenshot-0.json','ax-20.json','ax-21.json','ax-25.json']:
 save((appraw/path).read_bytes(),'raw/'+path)
save(pptx.read_bytes(),'saved/presentation.pptx');save(odp.read_bytes(),'saved/presentation.odp');save((docs/'synthetic-inputs/fixture-receipt.json').read_bytes(),'raw/fixture-receipt.json')
save((owner/'.local/mac-final-45351696628-2026-11-24/reviewed-presentation.json').read_bytes(),'owner-review.json')
audit={'status':'PASS bounded Mac standalone Presentation core and own-runtime ODP export','recordedAtUTC':datetime.now(timezone.utc).isoformat(),'application':source,'producerWorkflowCommit':producer,'qaCommit':qa,'run':45351696628,'job':138300391259,'attempt':1,'proofArtifact':14900827581,'proofZIP':{'localPath':str(archive),'bytes':archive.stat().st_size,'sha256':digest,'allRawMembersByteVerified':True,'members':members},'packageProvenance':prov,'ownBundleIdentity':receipt['bundleInfo'],'executableAttestedSHA256':receipt['executableSHA256'],'signatures':{'attestationsChecked':True,'independentCryptographicVerificationByAuditor':False,'recordedCodesignGatekeeperStaplerCodes':[receipt[x]['code'] for x in ['signature','gatekeeper','notarizationStaple']]},'freshProfileAndNoSuiteReceiptsChecked':True,'launches':launches,'typedFocusReceipts':typed,'nativeSaveAndColdReopen':{'pids':[3433,4091],'normalCmdQExitCodes':[0,0]},'independentSavedFiles':{'pptx':{'sha256':sha(pptx.read_bytes()),'slides':1,'text':text},'odp':{'sha256':sha(odp.read_bytes()),'pages':1,'paragraphs':paragraphs}},'ownConverterObserved':converters,'originalPNGIndependentReview':images,'rawNativeAcceptedFlagUnchanged':receipt['nativeAccepted'],'cleanupPassed':receipt['cleanupPassed'],'limits':['One synthetic Presentation core route only.','No startup latency/immediate-paint acceptance.','No full layout/font/fidelity or complete dependency-closure claim; font substitution and control wrapping visible.','Signatures assessed through retained native command attestations; auditor did not run cryptographic verification on actual app/DMG.','DMG/parent digest provenance checked through native/preparer attestations and official metadata; no installer/parent download or independent rehash by auditor.','No other app, full native matrix, stable-release, Git/main/tag/publication claim.'],'newNativeOperationCIOrArtifactDownload':False}
save((json.dumps(audit,indent=2)+'\n').encode(),'independent-audit.json');save(Path(__file__).read_bytes(),'audit-mac-presentation-core.py')
inventory=[{'file':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(d.rglob('*')) if p.is_file() and p.name!='evidence-index.json']
save((json.dumps({'entries':inventory},indent=2)+'\n').encode(),'evidence-index.json')
print(json.dumps({'status':audit['status'],'proofZIPsha256':digest,'proofMembers':len(members),'savedPPTXsha256':sha(pptx.read_bytes()),'savedODPsha256':sha(odp.read_bytes()),'originalPNGsReviewed':2,'retainedFiles':len(inventory)}))
