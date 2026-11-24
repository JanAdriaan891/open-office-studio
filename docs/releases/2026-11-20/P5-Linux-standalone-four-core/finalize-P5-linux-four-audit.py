from pathlib import Path
import json,hashlib,subprocess
r=Path.cwd();d=r/'docs/releases/2026-11-20/P5-Linux-standalone-four-core';sha=lambda b:hashlib.sha256(b).hexdigest()
raw=subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/actions/jobs/137703365848']);j=json.loads(raw)
assert j['run_id']==45177730188 and j['run_attempt']==1 and j['head_sha']=='b696ab86bd1c128729a079b68c0082e6df3d36a5' and j['conclusion']=='success'
prepared=json.loads((d/'prepared-git-original.json').read_bytes());gates=prepared['apps'][0]['origin']['intake']['intake']['requiredGates']
assert all(next(s for s in j['steps'] if s['name']==gate)['conclusion']=='success' for gate in gates)
(d/'official-parent-linux-job.json').write_bytes(raw)
a=json.loads((d/'independent-audit.json').read_bytes());a['officialParentJobVerified']={'run':45177730188,'job':137703365848,'attempt':1,'conclusion':'success','requiredGatesVerified':gates}
(d/'independent-audit.json').write_text(json.dumps(a,indent=2)+'\n',encoding='utf-8')
(d/'finalize-P5-linux-four-audit.py').write_bytes(Path(__file__).read_bytes())
entries=[{'file':p.relative_to(d).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(d.rglob('*')) if p.is_file() and p.name!='evidence-index.json']
p=d/'evidence-index.json';p.write_text(json.dumps({'application':a['application'],'tree':a['tree'],'qa':a['qa'],'run':a['run'],'entries':entries},indent=2)+'\n',encoding='utf-8')
for e in entries:
 raw=(d/e['file']).read_bytes();assert len(raw)==e['bytes'] and sha(raw)==e['sha256']
print(json.dumps({'retainedFiles':len(entries),'indexBytes':p.stat().st_size,'indexSha256':sha(p.read_bytes()),'eightBoundedCoreRoutesPassed':a['allEightBoundedCoreRoutesPassed'],'independentContentAudits':len(a['independentSavedContent']),'originalPNGReviews':len(a['originalPNGReviews']),'ancillaryMetadataInconsistenciesRetained':len(a['ancillaryMetadataInconsistencies'])}))
