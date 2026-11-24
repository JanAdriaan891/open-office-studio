from pathlib import Path,PurePosixPath
import json,hashlib,zipfile,stat,subprocess
r=Path.cwd();owner=r.parent/'oos-standalone-windows-p4-2026-11-23';base=Path('\\\\?\\'+str(owner.resolve()))/'.local/p5-reuse-second-20261124';raw=base/'standalone-windows-p5-presentation-proof';d=Path('\\\\?\\'+str((r/'docs/releases/2026-11-20/P5-Windows-Presentation-boundary-audit').resolve()));d.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'));qa='07343ca93ee7f95575f2dbffe6cc87d69ca91358'
def save(b,path):
 p=d/path;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==b
 else:p.write_bytes(b)
metadata=next(x for x in read(base/'artifacts.json') if x['id']==14901826518);archive=base/'standalone-windows-p5-presentation-proof.zip';digest=sha(archive.read_bytes())
assert digest=='6b6d82efd7133cfc1a129fe905aee48fa1000b569885a09e803120df08c3724a' and metadata['digest']=='sha256:'+digest and archive.stat().st_size==metadata['size_in_bytes']==195419 and metadata['workflow_run']['head_sha']==qa and metadata['workflow_run']['id']==45353530654
jobs=read(base/'jobs.json');job=next(x for x in (jobs['jobs'] if isinstance(jobs,dict) else jobs) if x['id']==138305718571)
assert job['run_id']==45353530654 and job['run_attempt']==1 and job['head_sha']==qa and job['conclusion']=='failure'
members=[]
with zipfile.ZipFile(archive) as z:
 names=set()
 for e in z.infolist():
  p=PurePosixPath(e.filename);mode=e.external_attr>>16
  assert e.filename not in names;names.add(e.filename)
  assert not p.is_absolute() and '..' not in p.parts and ':' not in e.filename and '\\' not in e.filename and not stat.S_ISLNK(mode)
  if not e.is_dir():
   b=z.read(e);assert (raw/e.filename).read_bytes()==b,e.filename
   members.append({'member':e.filename,'bytes':len(b),'sha256':sha(b)})
reportfile=raw/'p4-native-presentation/report.json';report=read(reportfile);png=raw/'p4-native-presentation/failure.png'
assert report['harnessCommit']==qa and report['applicationCommit']=='b696ab86bd1c128729a079b68c0082e6df3d36a5' and report['applicationTree']=='e30879fd772871e690847c061ef66e6b81808a05' and report['status']=='failed' and len(report['phases'])==1
assert 'page.waitForFunction: Timeout 20000ms exceeded.' in report['error'] and 'cases.mjs:42:18' in report['error']
assert any('nativePresentationHitPoint' in x for x in report['steps']) and not any('actualSlideEditor' in x or x.get('focus')=='presentation-text' or 'actualNativeSave' in x for x in report['steps'])
assert report['phases'][0]['exactInputTabActivated'] and report['phases'][0]['pid']==1488 and report['steps'][0]['foregroundPid']==1488
git=lambda p:subprocess.check_output(['git','-C',str(owner),'show',qa+':'+p])
cases=git('scripts/standalone-windows-p4/cases.mjs');native=git('scripts/standalone-windows-p4/native.mjs');caseText=cases.decode();nativeText=native.decode()
order=['await canvas.dblclick','qa.record({phase,nativePresentationHitPoint','await page.waitForFunction(()=>{','const input=page.locator(\':focus\')','qa.record({phase,actualSlideEditor','await qa.checkFocus(input,\'presentation-text\')','await page.keyboard.type(\'STANDALONE23 PRESENTATION EDIT\')']
start=caseText.index('const canvas=page.locator');positions=[caseText.index(x,start) for x in order];assert positions==sorted(positions)
assert caseText.splitlines()[41].strip()=='await page.waitForFunction(()=>{'
save(cases,'cases-07343ca9.mjs');save(native,'native-07343ca9.mjs');save(reportfile.read_bytes(),'report.json');save(png.read_bytes(),'failure.png');save((base/'artifacts.json').read_bytes(),'artifacts.json');save((base/'jobs.json').read_bytes(),'jobs.json')
conclusion={
 'status':'FAILED canvas editable-focus guard; functional typing/save/reopen not reached. Root cause remains unproved.',
 'run':45353530654,'job':138305718571,'attempt':1,'qaCommit':qa,'applicationCommit':report['applicationCommit'],'applicationTree':report['applicationTree'],'artifact':14901826518,'archiveBytes':195419,'archiveSHA256':digest,'all18MembersByteCompared':len(members)==18,'members':members,
 'sourceCasesSha256':sha(cases),'sourceNativeSha256':sha(native),'reportSha256':sha(reportfile.read_bytes()),'originalFailurePngSha256':sha(png.read_bytes()),
 'confirmedBeforeTimeout':['App process1488/own WebView and exact source input tab were opened; native OS Focus step reports foregroundPid1488.','The PPTX canvas wait, bounds assertion and source-derived hit point guards completed.','The awaited Playwright canvas.dblclick request completed; its next hit-point record exists. This establishes dispatched double-click request, not actual DOM text focus.','The 20-second activeElement eligibility predicate did not return true.'],
 'notReached':['No actualSlideEditor DOM dump record.','No qa.checkFocus(presentation-text) assertion or corresponding record.','No page.keyboard.type(STANDALONE23 PRESENTATION EDIT).','No following Escape, New Slide click, thumbnail/two-slide checks, saveOffice, saved output oracle or new-PID reopen.'],
 'screenshotReview':{'originalViewedDirectly':True,'observation':'The original image shows the unchanged title text, dashed title text-box outline and visible caret-like vertical mark inside the title; it remains one slide. These pixels do not establish document.activeElement or keyboard eligibility.','fullCanvasEditAcceptance':False},
 'missingEvidence':['No raw DOM/activeElement dump was captured because the predicate timed out before its record.','No text-input event was sent after that guard, so the proof cannot establish that Presentation ignored typed text.'],
 'cannotConclude':['Exact product-versus-driver/selector/focus cause.','Whether the visible caret corresponds to an eligible activeElement, another focus host or a different editing state.','That no editable control exists, or that canvas typing/save is functionally broken.','That the successful Mac Outline route proves Windows canvas behavior.'],
 'cleanup':report['cleanup'],'cleanupClaim':'Failure cleanup Close/WM_CLOSE and disposal only, not functional normal-save/fullquit/reopen acceptance.',
 'scopeLimit':'Boundary/source-order audit only; no SDK focus cause analysis or patch; no new run, download, GUI or Git write.'
}
assert report['cleanup']['ownedAppExited'] and not report['cleanup']['residualOwnedWebviews'] and not report['cleanup'].get('forcedOwnedProcessTree',False)
save((json.dumps(conclusion,indent=2)+'\n').encode(),'boundary-audit.json');save(Path(__file__).read_bytes(),'audit-boundary.py')
entries=[{'file':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(d.rglob('*')) if p.is_file() and p.name!='evidence-index.json'];save((json.dumps({'entries':entries},indent=2)+'\n').encode(),'evidence-index.json')
print(json.dumps({'status':conclusion['status'],'archiveSHA256':digest,'originalPNGSHA256':sha(png.read_bytes()),'retainedFiles':len(entries),'auditSHA256':sha((d/'boundary-audit.json').read_bytes())}))
