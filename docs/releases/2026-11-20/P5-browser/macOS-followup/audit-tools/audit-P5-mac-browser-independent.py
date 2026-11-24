from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, zipfile, xml.etree.ElementTree as E, subprocess, sys

root=Path.cwd(); folder=root/'docs/releases/2026-11-20'
dest=folder/'P5-browser/macOS-followup';dest.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
sha=lambda b:hashlib.sha256(b).hexdigest()
app='b696ab86bd1c128729a079b68c0082e6df3d36a5';tree='e30879fd772871e690847c061ef66e6b81808a05';qa='6bff15bf7a4b529e389460b6c0ffa397cfaa1e9a';run=45183129618
index=read(dest/'evidence-index.json') if (dest/'evidence-index.json').exists() else {'schemaVersion':1,'application':app,'tree':tree,'qaSource':qa,'entries':[]}
audit_path=dest/'root-audit.json'
previous=read(audit_path)['platformsAndRoutes'] if audit_path.exists() else []
jobs=json.loads(subprocess.check_output(['gh','api',f'repos/OpenAEC-Foundation/open-office-studio/actions/runs/{run}/jobs?per_page=100']))['jobs']
labels={'Linux':'ubuntu-22.04','Windows':'windows-latest','macOS':'macos-latest'}
rows=[]
def copy(p,name):
    raw=p.read_bytes();target=folder/name;target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():assert target.read_bytes()==raw,name
    else:target.write_bytes(raw)
    entry={'file':name,'bytes':len(raw),'sha256':sha(raw),'kind':'Original P5 browser receipt/report/DOCX bytes; not native or signed-installer acceptance'}
    index['entries']=[x for x in index['entries'] if x['file']!=name]+[entry]
for os in sys.argv[1:]:
    job=next(j for j in jobs if j['name']==f'browser ({labels[os]})')
    assert job['status']=='completed' and job['conclusion']=='success'
    metadata=read(root/f'.local/nov20-ci/{run}/artifacts-{os}.json')
    artifact=next(a for a in metadata['artifacts'] if a['name']==f'writer-481-browser-QA-{os}')
    archive=root/f'.local/nov20-ci/{run}/writer-481-browser-QA-{os}'
    digest=sha((archive/'artifact.zip').read_bytes());assert artifact['digest']=='sha256:'+digest
    a=archive/'app/.local'
    for key,route in [('normal','/'),('hosted','/office/')]:
        label=f'writer-481-QA-{key}';summary_path=a/label/'summary.json';s=read(summary_path)
        assert s['passed'] and s['browserOnly'] and not s['nativeApplicationStarted']
        assert (s['source'],s['tree'],s['harnessCommit'])==(app,tree,qa)
        assert s['externalProbeGitBlobSha256']=='c8fc555ddd1990831fffaedf338e19cac10704e5f1ecd965f798a93852158c38'
        assert s['route']==route and len(s['issues'])==4 and all(i['passed'] and i['exitCode']==0 for i in s['issues'])
        receipt_path=a/f'dist-481-QA-{key}.build.json';receipt=read(receipt_path)
        assert sha(receipt_path.read_bytes())==s['buildReceiptSha256'] and receipt['source']==app and receipt['tree']==tree
        prefix=f'P5-browser/macOS-followup/{os}/{key}'
        copy(summary_path,prefix+'/summary.json');copy(receipt_path,prefix+'/build-receipt.json')
        for i in s['issues']:
            p=a/f'{label}-{i["issue"]}/report.json';r=read(p)
            assert sha(p.read_bytes())==i['reportSha256'] and r['status']=='passed'
            assert r.get('source',r.get('applicationCommit'))==app and not r.get('errors',[])
            if i['issue']==356:
                assert r['applicationTree']==tree and r['offlineEditAndSave'] and r['tableContent'] and r['reopenedDocx']
                doc=p.parent/'saved.docx'
                with zipfile.ZipFile(doc) as z:
                    ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    xml=E.fromstring(z.read('word/document.xml'));text=''.join(t.text or '' for t in xml.findall('.//w:t',ns))
                    assert 'EPUB356 EDIT EPUB EERSTE HOOFDSTUK' in text
                    cells=[[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)] for row in xml.findall('.//w:tbl/w:tr',ns)]
                    assert ['Hout','42'] in cells
                    assert any(sha(z.read(n))==r['embeddedImageSha256'] for n in z.namelist() if n.startswith('word/media/'))
                copy(doc,prefix+'/356-saved.docx')
            copy(p,prefix+f'/{i["issue"]}-report.json')
        op=a/f'{label}-office/report.json';o=read(op)
        assert sha(op.read_bytes())==s['office']['sha256'] and o['codepoint']==app and len(o['cases'])==9 and all(c['passed'] for c in o['cases']) and not o['errors']
        copy(op,prefix+'/office-report.json')
        rows.append({'platform':os,'route':route,'producerJob':job['id'],'artifactId':artifact['id'],'archiveSha256':digest,'assetEntriesInReceipt':len(receipt['files']),'issuesPassed':[i['issue'] for i in s['issues']],'OfficeCasesPassed':9,'savedDOCXIndependentlyChecked':True})
rows=sorted([r for r in previous if r['platform'] not in sys.argv[1:]]+rows,key=lambda r:(r['platform'],r['route']))
audit={'asOfUTC':datetime.now(timezone.utc).isoformat(),'run':run,'applicationCommit':app,'applicationTree':tree,'harnessCommit':qa,'platformsAndRoutes':rows,'allFourAssignedRoutesPassed':len(rows)==2,'nativePackageAcceptance':False,'CIAssetByteRehashByRoot':False,'assetLimit':'Actual archived receipt/report bytes and saved DOCX content independently checked. CI asset directories are absent from archives; root does not claim a separate full asset-byte hash.','initialPaintLimit':'Browser probes perform document actions before acceptance captures; not untouched native-first-paint certification.'}
audit_path.write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
index['entries']=sorted(index['entries'],key=lambda e:e['file'])
(dest/'evidence-index.json').write_text(json.dumps(index,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'verifiedPlatformRoutes':len(rows),'allFourAssignedRoutesPassed':audit['allFourAssignedRoutesPassed'],'originalPayloads':len(index['entries']),'nativeAcceptance':False}))
