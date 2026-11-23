from pathlib import Path,PurePosixPath
import subprocess,json,hashlib,zipfile,stat
r=Path.cwd();helper=r.parent/'oos-writer-field-layout-374-9d3b';source=helper/'.local/field374/p5-mac-success';archive=source/'artifact.zip';sha=lambda b:hashlib.sha256(b).hexdigest()
assert archive.stat().st_size==5588758 and sha(archive.read_bytes())=='4355f4220b22a521f708fa8f3965f42662e7f1f58f326e47426778bb27ab7864'
base=r/'.local/nov20-ci/45183129618';base.mkdir(parents=True,exist_ok=True);folder=base/'writer-481-browser-QA-macOS';folder.mkdir(exist_ok=True)
metadata=json.loads((source/'artifact-metadata.json').read_bytes())
officialraw=subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/14823150600']);official=json.loads(officialraw)
assert official==metadata
(base/'artifacts-macOS.json').write_text(json.dumps({'artifacts':[official]})+'\n')
with zipfile.ZipFile(archive) as z:
 names=set()
 for e in z.infolist():
  p=PurePosixPath(e.filename);mode=e.external_attr>>16
  assert e.filename not in names;names.add(e.filename)
  assert not p.is_absolute() and '..' not in p.parts and ':' not in e.filename and '\\' not in e.filename
  assert not stat.S_ISLNK(mode) and (not stat.S_IFMT(mode) or stat.S_ISREG(mode) or stat.S_ISDIR(mode))
  target=folder.joinpath(*p.parts);assert target.resolve().is_relative_to(folder.resolve())
  if e.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:
   payload=z.read(e)
   if target.exists():assert target.read_bytes()==payload
   else:target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(payload)
# One locally reused archive; no network archive download.
ziptarget=folder/'artifact.zip'
if ziptarget.exists():assert ziptarget.read_bytes()==archive.read_bytes()
else:ziptarget.write_bytes(archive.read_bytes())
dest=r/'docs/releases/2026-11-20/P5-browser/macOS-followup';dest.mkdir(exist_ok=True)
(dest/'official-artifact-metadata.json').write_bytes(officialraw)
for original,new in [('audit-P5-browser-independent.py','audit-P5-mac-browser-independent.py'),('audit-P5-field-browser-independent.py','audit-P5-mac-field-independent.py')]:
 code=(r/'.local'/original).read_text()
 code=code.replace('P5-browser','P5-browser/macOS-followup').replace('45179944903','45183129618').replace('7be704895534c3095f697292af07dc10d2e5860b','6bff15bf7a4b529e389460b6c0ffa397cfaa1e9a')
 code=code.replace("len(rows)==4","len(rows)==2").replace("len({x['platform'] for x in rows})==2","len({x['platform'] for x in rows})==1")
 # All emitted audit outputs go to a fresh, scoped directory; old 178 evidence files stay unchanged.
 (r/'.local'/new).write_text(code,encoding='utf-8')
print('Mac archive reused and safely extracted; official metadata independently matched')
