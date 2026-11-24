import json,hashlib,subprocess,zipfile,stat,re,base64,sys
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).parent
EXPECTED_HEAD='618beafb98b060a0fdd6da13f59ada8841425abc'
RUN=45352330223; JOB=138301610586
APP='b696ab86bd1c128729a079b68c0082e6df3d36a5';TREE='e30879fd772871e690847c061ef66e6b81808a05'
KEY='13F6D414ADEE4ED4CD09AC60601D86C93C504D29'
PARENTS={'Windows':(45177730188,APP,137703365803,14828525724,'24816ccb20360bbfc976abf38810988dfe4b27a3305c80d5b80b711719587e0d'),'Linux':(45177730188,APP,137703365848,14824745492,'c64b0e90e2144d1a5a6d17ad7e4881429a70ade8c48e76f7a22858b54c3928c5'),'macOS':(45195055147,'2af94cdcefa3e88e4980b631d16a88d7d7de5ae8',137763371873,14836145077,'45a88b40325f516e91b0b4cb557b88fd2a81d62bde2e4be26dc87bd1b55ff015')}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(v,m):
 if not v:raise AssertionError(m)
def api(p):return json.loads(subprocess.check_output(['gh','api','repos/OpenAEC-Foundation/open-office-studio/'+p]))
def raw_fingerprint(armor):
 lines=armor.decode('ascii').splitlines();start=lines.index('-----BEGIN PGP PUBLIC KEY BLOCK-----')+1
 while start<len(lines) and lines[start]:start+=1
 data=base64.b64decode(''.join(x for x in lines[start+1:] if x and not x.startswith(('=','-----'))),validate=True)
 pos=0
 while pos<len(data):
  tag=data[pos];pos+=1;check(tag&128,'PGP packet tag')
  if tag&64:
   tag &=63;first=data[pos];pos+=1
   if first<192:length=first
   elif first<=223:length=((first-192)<<8)+data[pos]+192;pos+=1
   elif first==255:length=int.from_bytes(data[pos:pos+4],'big');pos+=4
   else:raise AssertionError('Unsupported partial public-key packet')
  else:
   kind=tag&3;tag=(tag>>2)&15;check(kind!=3,'Indeterminate public-key packet')
   n=(1,2,4)[kind];length=int.from_bytes(data[pos:pos+n],'big');pos+=n
  body=data[pos:pos+length];pos+=length;check(len(body)==length,'Truncated public key packet')
  if tag==6:
   check(body[0]==4,'Expected v4 OpenPGP primary key')
   return hashlib.sha1(b'\x99'+len(body).to_bytes(2,'big')+body).hexdigest().upper()
 raise AssertionError('No primary public key packet')
def run():
 meta=api(f'actions/runs/{RUN}/attempts/1');check(meta['head_sha']==EXPECTED_HEAD and meta['status']=='completed' and meta['conclusion']=='success','Verifier exact head/success')
 jobs=api(f'actions/runs/{RUN}/attempts/1/jobs?per_page=100')['jobs'];job=next(j for j in jobs if j['id']==JOB)
 check(job['run_attempt']==1 and job['head_sha']==EXPECTED_HEAD and job['conclusion']=='success','Exact verifier job/attempt')
 arts=api(f'actions/runs/{RUN}/artifacts?per_page=100')['artifacts'];found=[a for a in arts if a['name']=='frozen-package-verification-and-prepared-signatures'];check(len(found)==1,'Unique final proof artifact')
 art=found[0];check(not art['expired'] and art['workflow_run']['id']==RUN and art['workflow_run']['head_sha']==EXPECTED_HEAD,'Proof artifact identity')
 (ROOT/'official-metadata.json').write_text(json.dumps(dict(run=meta,job=job,artifact=art),indent=2)+'\n')
 zpath=ROOT/'artifact.zip'
 if not zpath.exists():
  with zpath.open('xb') as out:subprocess.run(['gh','api',f"repos/OpenAEC-Foundation/open-office-studio/actions/artifacts/{art['id']}/zip"],stdout=out,check=True)
 check(zpath.stat().st_size==art['size_in_bytes'] and 'sha256:'+sha(zpath.read_bytes())==art['digest'],'Complete proof ZIP hash/size')
 raw={}
 with zipfile.ZipFile(zpath) as z:
  for info in z.infolist():
   name=info.orig_filename;check('/' not in name and '\\' not in name and ':' not in name and name not in raw,'Unique flat safe proof entries')
   check(not stat.S_ISLNK(info.external_attr>>16) and info.file_size<10000000,'Proof regular small files')
   if not info.is_dir():raw[name]=z.read(info)
 check(len(raw)==33,'Expected33 small output files only')
 receipt=json.loads(raw['verification-receipt.json'])
 check((receipt['source'],receipt['tree'],receipt['version'])==(APP,TREE,'2026.48.1'),'Exact application source/tree/version')
 check(all(receipt[k] is False for k in ['publication','mainOrTagWrite','nativeAcceptance']),'No publication/native approval')
 check(len(receipt['archives'])==3,'Three parent receipts')
 for item in receipt['archives']:
  run,head,jobid,aid,digest=PARENTS[item['platform']]
  check((item['producerRun'],item['producerCommit'],item['producerJobId'],item['artifactId'],item['archiveSha256'],item['producerAttempt'])==(run,head,jobid,aid,digest,1),'Parent source/job/attempt/hash binding')
  check(item['producerAttemptEndpoint']==f'actions/runs/{run}/attempts/1','Frozen metadata endpoint')
  if item['platform']=='macOS':
   w=item['applicationSourceWitness'];check(w['bytes']==820 and w['sha256']=='236085a316b40b2e5033316a3e3ed45f91cb9a27e83d518117160ba4aff4e7d5','Mac original witness binding')
   descriptor=json.loads((ROOT.parent/'resume-2026-11-24/mac-preparer-45351696628/suite-descriptor/suite-support-descriptor.json').read_bytes())
   original=base64.b64decode(descriptor['sourceWitness']['rawBase64'],validate=True)
   check(len(original)==w['bytes'] and sha(original)==w['sha256'] and json.loads(original)==w['witness'],'Receipt witness equals separately retained original raw source bytes')
   expected_witness=dict(appHead=APP,appTree=TREE,appVersion='2026.48.1',producerHead=head,producerWorkflowHead=head,producerRef='refs/heads/codex/p5-macos-only-producer-20261123',producerWorkflowRef='OpenAEC-Foundation/open-office-studio/.github/workflows/release.yml@refs/heads/codex/p5-macos-only-producer-20261123',event='workflow_dispatch',runId='45195055147',attempt='1',job='bouwen',checkoutWorkflowSha256='620e90485493163b87163a8763ffbbfcc2f0af5f03251b592af577721c5a9c64',publiceren='false',nativeAccepted=False,scope='Build-only producer/source binding; no native operation or publication')
   check(w['witness']==expected_witness,'Every separate producer/app source-witness field exact')
 old=receipt['originalMacFailure'];check((old['run'],old['attempt'],old['job'],old['conclusion'])==(45177730188,1,137703365843,'failure'),'Original Mac failure retained')
 studios=json.loads(subprocess.check_output(['git','-C',str(ROOT.parent.parent),'show',APP+':assets/studios.json']))
 forms={'Windows':['x64-setup.exe'],'macOS':['aarch64.dmg'],'Linux':['amd64.deb','amd64.AppImage']}
 expected={f"{s['naam'].replace(' ','.')}_2026.48.1_{suffix}" for s in studios for suffixes in forms.values() for suffix in suffixes}
 installers=receipt['installers'];check(set(installers)==expected and len(installers)==28,'All28 exact release installer names')
 check(all(i['bytes']>1000000 and len(i['sha256'])==64 for i in installers.values()),'Installer actual byte hashes/sizes')
 for name,item in installers.items():check(item['artifactId']==PARENTS[item['platform']][3],'Installer parent binding')
 reports=receipt['reports'];check(len(reports)==14 and len({r['name'] for r in reports})==14,'14 canonical report names')
 for r in reports:
  p=json.loads(raw[r['name']].decode('utf-8-sig'));s=next(s for s in studios if s['sleutel']==r['studio'])
  check((p['versie'],p['programma'],p['platform'])==('2026.48.1',s['programma'],r['platform'].lower()),'Report app/platform/version')
  check(len(p['pakketten'])==len(forms[r['platform']]),'Report exact package form count')
  for pkg in p['pakketten']:
   actual=installers[pkg['naam'].replace(' ','.')];check((pkg['sha256'],pkg['bytes'])==(actual['sha256'],actual['bytes']),'Report checksum/size bound to streamed installer')
 check(len(receipt['linuxSignatures'])==14,'14 detached Linux signature receipts')
 for sig in receipt['linuxSignatures']:
  check(sig['primaryFingerprint']==KEY and sig['publicOnlyVerification'] is True and sig['payload'] in installers,'CI public-only Linux signature verification')
  check(raw[sig['name']].startswith(b'-----BEGIN PGP SIGNATURE-----') and b'-----END PGP SIGNATURE-----' in raw[sig['name']],'Actual ASCII-armored signature bytes')
 sums={}
 for line in raw['SHA256SUMS'].decode().splitlines():
  digest,name=line.split('  ',1);check(name not in sums and re.fullmatch('[a-f0-9]{64}',digest),'Distinct valid checksum entry');sums[name]=digest
 check(len(sums)==58 and sums==receipt['releasePayloadChecksums'],'58 sums exact receipt equality')
 payloads={name:item['sha256'] for name,item in installers.items()}
 for name,data in raw.items():
  if name not in ['verification-receipt.json','SHA256SUMS','SHA256SUMS.asc']:payloads[name]=sha(data)
 check(payloads==sums,'Every retained report/signature/key byte and28 installer hashes match sums')
 check(raw['openaec-signing-fingerprint.txt'].decode().strip()==KEY,'Declared fingerprint')
 computed=raw_fingerprint(raw['openaec-signing-public-key.asc']);check(computed==KEY,'Independent OpenPGP primary-key fingerprint from actual packet')
 check(raw['SHA256SUMS.asc'].startswith(b'-----BEGIN PGP SIGNATURE-----'),'Actual sums detached signature bytes')
 cleanup=receipt['cleanup'];check(cleanup['temporaryKeyAndPayloadTreeRemoved'] is True,'CI temporary key/payload tree removed')
 check(len(cleanup['scopedGpgconfTermination'])==2 and all(x['terminationReturnCode']==0 for x in cleanup['scopedGpgconfTermination']),'Two scoped GPG cleanup return0')
 log=subprocess.check_output(['gh','run','view',str(RUN),'--repo','OpenAEC-Foundation/open-office-studio','--job',str(JOB),'--log']);(ROOT/'verifier-job.log').write_bytes(log)
 check(b'"verifiedInstallers": 28' in log and b'"verifiedReports": 14' in log and b'"signedLinuxPackages": 14' in log,'Actual successful final CI summary')
 report=dict(status='PASS bounded raw-proof/receipt/report/checksum/public-key-fingerprint audit',asOfUTC=datetime.now(timezone.utc).isoformat(),run=RUN,job=JOB,commit=EXPECTED_HEAD,artifact=art['id'],artifactBytes=art['size_in_bytes'],artifactSha256=sha(zpath.read_bytes()),zip=str(zpath),files=[dict(path=n,bytes=len(b),sha256=sha(b)) for n,b in sorted(raw.items())],checks=dict(installerBindings=28,reportByteAndContentChecks=14,linuxDetachedSignatures=14,sha256sumRows=58,independentPrimaryFingerprint=computed,ciPublicOnlyVerifications=15),limits=['No installer/parent downloads by this reviewer; payload hashes and14 payload cryptographic verifications are independently identity-bound CI attestations','Local GPG unavailable; no local cryptographic verification of SHA256SUMS.asc, only exact signature bytes/checksum binding and independent public-key packet fingerprint','No native/stable release/publication acceptance inferred'],sideEffects=dict(parentDownloads=0,privateKeyUse=False,publication=False,native=False),cleanup='Own read-only CLI commands complete; no local key homes/agents/capture created')
 (ROOT/'audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['status','run','artifact','artifactSha256','zip','checks']},indent=2))
if __name__=='__main__':run()
