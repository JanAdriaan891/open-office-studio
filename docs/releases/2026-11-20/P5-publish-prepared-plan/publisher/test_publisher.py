"""Synthetic backend/files only. No real gh, network, GPG or release operations."""
import copy
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest.mock import patch
from urllib.request import Request
import zipfile

import core
from gh_backend import GhBackend, NoRedirect
from publish_prepared import main

HERE = Path(__file__).resolve().parent


def archive(entries):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:
        for name,data in entries.items(): z.writestr(name,data)
    return stream.getvalue()


def fixture():
    """Real60 names, synthetic payloads/archives; exercises control flow, not crypto."""
    real = core.check(HERE.parent/'plan.final-review.json')
    bundle = copy.deepcopy(real)
    data = {}
    for name,a in bundle['assets'].items():
        data[name] = ('SYNTHETIC '+name).encode() if a['kind']=='installer' else real['rawProof'][name]
    rows = {name:core.sha(payload) for name,payload in data.items() if name not in ('SHA256SUMS','SHA256SUMS.asc')}
    data['SHA256SUMS'] = ''.join(h+'  '+n+'\n' for n,h in sorted(rows.items())).encode()
    for name,a in bundle['assets'].items():
        a['bytes'],a['sha256'] = len(data[name]),core.sha(data[name])
    bundle['plan']['assets'] = list(bundle['assets'].values())
    bundle['receipt']['releasePayloadChecksums'] = rows
    for name,item in bundle['receipt']['installers'].items():
        item.update(bytes=len(data[name]),sha256=core.sha(data[name]))
    raw = {name:payload for name,payload in data.items() if bundle['assets'][name]['kind']!='installer'}
    raw['verification-receipt.json'] = json.dumps(bundle['receipt']).encode()
    bundle['rawProof'] = raw
    proof = archive(raw)
    bundle['plan']['preparedProof'].update(archiveBytes=len(proof),archiveSha256=core.sha(proof))
    archives = {core.PROOF[3]:proof}
    for platform,c in bundle['plan']['producerChains'].items():
        entries = {a['sourceMember']:data[name] for name,a in bundle['assets'].items() if a.get('platform')==platform}
        entries.update({r['member']:data[r['name']] for r in bundle['receipt']['reports'] if r['platform']==platform})
        if platform=='macOS':
            witness = (json.dumps(c['applicationSourceWitness']['witness'],indent=2)+'\n').encode()
            c['applicationSourceWitness'].update(bytes=len(witness),sha256=core.sha(witness))
            entries[core.WITNESS] = witness
        payload = archive(entries)
        c.update(parentArchiveBytes=len(payload),parentArchiveSha256=core.sha(payload))
        archives[c['parentArtifactId']] = payload
    bundle.update(planSha256='a'*64,assetsSha256=core.sha(core.canonical(bundle['plan']['assets'])))
    return bundle,data,archives


class FakeBackend:
    def __init__(self,bundle,data,archives):
        self.bundle,self.data,self.archives = bundle,data,archives
        self.events=[];self.allowed=set();self.tag=None;self.release=None;self.remote={};self.context_calls=0
        self.bad_source=False;self.bad_download=False;self.bad_readback=False;self.changed_main=False
        self.peak_readback_installers=0
        self.context={'run':999,'attempt':1,'workflowCommit':'e'*40,'workflowRef':core.WORKFLOW,'mainTree':'d'*40}

    def check_context(self,approval):
        self.context_calls+=1
        return copy.deepcopy(self.context)
    def allow(self,p): self.allowed=set(p)
    def event(self,name,permission=None):
        if permission: core.need(permission in self.allowed,'Fake disallowed event')
        self.events.append(name)

    def job(self,platform):
        c=self.bundle['plan']['producerChains'][platform]
        names={'Windows':['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)'],'Linux':['Linux-installers werkelijk uitpakken en controleren'],'macOS':['Pakket bouwen (macOS, ondertekend en genotariseerd)','Handtekening en notarisatie controleren (macOS)','Exacte P5-appbron en afzonderlijke producerhead bewijzen','Ondertekening beschikbaar']}[platform]
        names += ['Meet- en inhoudscontrole voor de meegeleverde runtime','Linux native WebKit-interface en private installer controleren' if platform=='Linux' else 'Standaardinstaller controleren met uitsluitend de private runtime']
        return {'id':c['job'],'run_id':c['run'],'run_attempt':1,'head_sha':c['producerCommit'],'status':'completed','conclusion':'success','started_at':'2026-11-23T09:00:00Z','completed_at':'2026-11-23T09:02:00Z','steps':[dict(name=n,status='completed',conclusion='success',completed_at='2026-11-23T09:01:00Z') for n in names]}

    def artifact(self,c,platform=None):
        aid=c.get('parentArtifactId',c.get('artifactId'))
        return {'id':aid,'name':'uitgave-'+platform if platform else 'frozen-package-verification-and-prepared-signatures','expired':False,'workflow_run':{'id':c['run'],'head_sha':c.get('producerCommit',core.QA)},'size_in_bytes':len(self.archives[aid]),'digest':'sha256:'+core.sha(self.archives[aid]),'created_at':'2026-11-23T09:01:30Z'}

    def api(self,path,missing=False):
        self.event('read:'+path)
        if path=='branches/main': return {'commit':{'sha':'f'*40 if self.changed_main else self.context['workflowCommit']}}
        if path.startswith('compare/'): return {'merge_base_commit':{'sha':core.APP},'status':'ahead'}
        if path.startswith('git/commits/'): return {'tree':{'sha':core.TREE if path.endswith(core.APP) else self.context['mainTree']}}
        if path.startswith('git/ref/tags/'):
            if not self.tag and missing:return None
            core.need(self.tag,'Missing fake tag');return {'object':{'type':'commit','sha':self.tag}}
        if path.startswith('releases/'):
            if '/assets?' in path:return list(self.remote.values())
            return copy.deepcopy(self.release)
        if path.startswith('actions/artifacts/'):
            aid=int(path.split('/')[2])
            for platform,c in self.bundle['plan']['producerChains'].items():
                if c['parentArtifactId']==aid:return self.artifact(c,platform)
            return self.artifact(self.bundle['plan']['preparedProof'])
        run_id=int(path.split('/')[2])
        if '/artifacts?' in path:
            return {'artifacts':[self.artifact(c,p) for p,c in self.bundle['plan']['producerChains'].items() if c['run']==run_id]}
        if '/jobs?' in path:
            if run_id==core.PROOF[0]:return {'jobs':[{'id':core.PROOF[1],'head_sha':core.QA,'run_attempt':1,'conclusion':'success','completed_at':'2026-11-23T09:02:00Z','steps':[{'name':'Hash actual packages, check reports and sign Linux bytes','conclusion':'success','completed_at':'2026-11-23T09:01:00Z'}]}]}
            jobs=[self.job(p) for p,c in self.bundle['plan']['producerChains'].items() if c['run']==run_id]
            if run_id==45177730188:jobs.append({'id':137703365843,'conclusion':'failure','head_sha':core.APP,'run_attempt':1})
            return {'jobs':jobs}
        head=core.QA if run_id==core.PROOF[0] else core.MAC if run_id==45195055147 else core.APP
        if self.bad_source:head='0'*40
        return {'id':run_id,'head_sha':head,'run_attempt':1,'status':'completed','conclusion':'success','path':'.github/workflows/release.yml','event':'workflow_dispatch','head_repository':{'full_name':core.REPO}}

    def download_artifact(self,aid,path):
        self.event('download-parent','collect');Path(path).write_bytes(self.archives[aid]+(b'bad' if self.bad_download else b''))
    def public_verify(self,key,pairs,fingerprint,work):
        self.event('public-verify','verifyCrypto');pairs=list(pairs)
        core.need(len(pairs)==15,'Fake expected15 verifies')
        return {'verifiedSignatures':15,'primaryFingerprint':core.KEY,'temporaryHomeRemoved':True}
    def release_list(self):return [] if not self.release else [self.release]
    def create_tag(self,tag,sha):self.event('create-tag','createTag');self.tag=sha
    def create_draft(self,tag,sha,title,body):
        self.event('create-draft','createDraft');self.release={'id':7,'tag_name':tag,'draft':True,'published_at':None,'body':body,'assets':[],'html_url':'https://example.invalid/release'};return copy.deepcopy(self.release)
    def upload_asset(self,rid,name,path):
        self.event('upload','uploadAssets');aid=1000+len(self.remote)
        value={'id':aid,'name':name,'size':Path(path).stat().st_size,'state':'uploaded','digest':'sha256:'+core.digest_file(path),'browser_download_url':'https://example.invalid/'+name}
        self.remote[name]=value;return value
    def download_release_asset(self,aid,path):
        self.event('readback','readBack');a=next(a for a in self.remote.values() if a['id']==aid)
        Path(path).write_bytes(self.data[a['name']]+(b'bad' if self.bad_readback else b''))
        count=sum(p.name in self.bundle['receipt']['installers'] for p in Path(path).parent.iterdir())
        self.peak_readback_installers=max(self.peak_readback_installers,count)
    def publish_release(self,rid):
        self.event('publish','publish');self.release.update(draft=False,published_at='2026-11-24T12:00:00Z');return copy.deepcopy(self.release)


class PublisherTests(unittest.TestCase):
    def setUp(self):
        self.bundle,self.data,archives=fixture();self.backend=FakeBackend(self.bundle,self.data,archives)
        self.temp=tempfile.TemporaryDirectory();self.work=Path(self.temp.name)/'work'
        self.approval={'executionEnabled':True,'repository':core.REPO,'planSha256':self.bundle['planSha256'],'reviewedCodeSha256':self.bundle['codeSha256'],'application':self.bundle['plan']['application'],'tag':'v2026.48.1','tagTarget':core.APP,'releaseBodySha256':self.bundle['bodySha256'],'assetsSha256':self.bundle['assetsSha256'],'writtenApprovalReference':'SYNTHETIC TEST ONLY','expiresAt':'2099-01-01T00:00:00Z','actionsContext':{'workflowRef':core.WORKFLOW,'workflowCommit':'e'*40,'expectedMainTree':'d'*40},'permissions':{p:True for values in core.PERMISSIONS.values() for p in values}}
    def tearDown(self):self.temp.cleanup()
    def run_stage(self,stage,approval=None):return core.execute(self.bundle,approval or self.approval,stage,self.work,self.backend)

    def test_default_check_has_zero_backend_network_process_or_write_events(self):
        with redirect_stdout(io.StringIO()),patch('subprocess.run',side_effect=AssertionError('No process allowed')):
            result=main(['check','--plan',str(HERE.parent/'plan.final-review.json')],backend_factory=lambda:(_ for _ in ()).throw(AssertionError('No backend allowed')))
        self.assertEqual(result['assets'],60);self.assertFalse(self.work.exists());self.assertEqual(self.backend.events,[])

    def test_actual_bad_plan_digest_rejected_offline(self):
        plan=copy.deepcopy(core.check(HERE.parent/'plan.final-review.json')['plan'])
        plan['preparedProof']['localOriginalArchive']=str((HERE.parent.parent/'P5-final-package-verification/artifact.zip').resolve())
        plan['assets'][0]['sha256']='0'*64
        path=Path(self.temp.name)/'bad-plan.json';path.write_text(json.dumps(plan))
        with self.assertRaisesRegex(ValueError,'Installer byte/member mismatch'):
            core.check(path,HERE.parent/'release-body.final-review.md')

    def test_approval_and_code_digest_reject_before_any_backend_events(self):
        for key,value in [('executionEnabled',False),('reviewedCodeSha256','0'*64),('planSha256','0'*64),('repository','wrong/repo')]:
            approval={**self.approval,key:value}
            with self.subTest(key=key),self.assertRaises(ValueError):self.run_stage('collect',approval)
        self.assertEqual(self.backend.events,[])

    def test_duplicate_approval_keys_reject_before_backend_factory(self):
        path=Path(self.temp.name)/'approval.json'
        path.write_text('{"executionEnabled":false,"executionEnabled":true}')
        called=[]
        with self.assertRaisesRegex(ValueError,'Duplicate JSON key'):
            main(['collect','--plan',str(HERE.parent/'plan.final-review.json'),'--approval',str(path),'--work-dir',str(self.work)],backend_factory=lambda:called.append(True))
        self.assertEqual(called,[])

    def test_duplicate_state_keys_reject_before_context_calls(self):
        self.run_stage('collect');path=self.work/'state.json';raw=path.read_bytes()
        path.write_bytes(b'{"phase":"collected",'+raw[1:]);before=self.backend.context_calls
        with self.assertRaisesRegex(ValueError,'Duplicate JSON key'):self.run_stage('stage-draft')
        self.assertEqual(before,self.backend.context_calls)

    def test_bad_source_and_archive_bytes_reject_before_mutations(self):
        self.backend.bad_source=True
        with self.assertRaises(ValueError):self.run_stage('collect')
        self.assertNotIn('download-parent',self.backend.events);self.assertIsNone(self.backend.tag)

    def test_corrupt_download_rejected(self):
        self.backend.bad_download=True
        with self.assertRaises(ValueError):self.run_stage('collect')
        self.assertIsNone(self.backend.tag)

    def test_duplicate_canonical_archive_member_rejected(self):
        blob=archive({'a/Open Writer.exe':b'a','b/Open.Writer.exe':b'b'})
        with zipfile.ZipFile(io.BytesIO(blob)) as z,self.assertRaises(ValueError):core.zip_members(z)

    def test_disk_preflight_stops_before_parent_download_or_tag(self):
        with patch.object(core.shutil,'disk_usage',return_value=SimpleNamespace(free=1)),self.assertRaises(ValueError):self.run_stage('collect')
        self.assertNotIn('download-parent',self.backend.events);self.assertIsNone(self.backend.tag)

    def test_stage_order_and_mutation_permission_reject(self):
        with self.assertRaises(FileNotFoundError):self.run_stage('stage-draft')
        self.run_stage('collect');approval=copy.deepcopy(self.approval);approval['permissions']['createTag']=False
        prior=list(self.backend.events)
        with self.assertRaises(ValueError):self.run_stage('stage-draft',approval)
        self.assertEqual(prior,self.backend.events);self.assertIsNone(self.backend.tag)

    def test_full_fake_lifecycle_sequential_cache_and_streaming_readback(self):
        self.run_stage('collect')
        self.assertEqual({p.name for p in (self.work/'cache').iterdir()},{str(core.PROOF[3])+'.zip'})
        self.run_stage('stage-draft');self.assertFalse((self.work/'assets').exists())
        self.run_stage('verify-remote');self.assertLessEqual(self.backend.peak_readback_installers,1)
        reads=self.backend.events.count('readback');self.run_stage('publish')
        self.assertEqual(reads,60);self.assertEqual(self.backend.events.count('readback'),60)
        self.assertEqual(self.backend.events.count('publish'),1)

    def test_actual_manifest_collection_peak_fits_standard14gb_before_checkout_reserve(self):
        real=core.check(HERE.parent/'plan.final-review.json')
        held=0;peak=0
        for platform in ('Windows','Linux','macOS'):
            sizes=sum(a['bytes'] for a in real['assets'].values() if a.get('platform')==platform)
            archive=real['plan']['producerChains'][platform]['parentArchiveBytes']
            peak=max(peak,held+archive+sizes+1_000_000_000)
            held+=sizes
        self.assertLess(peak,14_000_000_000)

    def test_bad_remote_readback_blocks_publish_and_retains_partial_state(self):
        self.run_stage('collect');self.run_stage('stage-draft');self.backend.bad_readback=True
        with self.assertRaises(ValueError):self.run_stage('verify-remote')
        self.assertNotIn('publish',self.backend.events)
        with self.assertRaises(ValueError):self.run_stage('publish')
        self.assertTrue(json.loads((self.work/'state.json').read_bytes())['requiresManualReview'])

    def test_existing_tag_is_not_overwritten(self):
        self.run_stage('collect');self.backend.tag=core.APP
        with self.assertRaises(ValueError):self.run_stage('stage-draft')
        self.assertNotIn('create-tag',self.backend.events)

    def test_changed_main_blocks_tag_before_any_mutation(self):
        self.run_stage('collect');self.backend.changed_main=True
        with self.assertRaisesRegex(ValueError,'Current main moved'):self.run_stage('stage-draft')
        self.assertNotIn('create-tag',self.backend.events);self.assertNotIn('create-draft',self.backend.events)

    def test_changed_main_blocks_publication(self):
        self.run_stage('collect');self.run_stage('stage-draft');self.run_stage('verify-remote')
        self.backend.changed_main=True
        with self.assertRaisesRegex(ValueError,'Current main moved'):self.run_stage('publish')
        self.assertNotIn('publish',self.backend.events)

    def test_new_context_requires_pinned_state_and_fresh_remote_readback(self):
        self.run_stage('collect');self.run_stage('stage-draft');self.run_stage('verify-remote')
        self.backend.context['run']=1000
        with self.assertRaises(ValueError):self.run_stage('publish')
        approval={**self.approval,'inputStateSha256':core.digest_file(self.work/'state.json')}
        self.run_stage('publish',approval);self.assertEqual(self.backend.events.count('readback'),120)


class RealBackendWithoutNetworkTests(unittest.TestCase):
    def test_exact_compare_route_allowed_but_traversals_rejected(self):
        backend=GhBackend({'GH_TOKEN':'ghs_SYNTHETIC'})
        response=SimpleNamespace(returncode=0,stdout=b'{"status":"ahead"}',stderr=b'')
        with patch('gh_backend.subprocess.run',return_value=response) as called:
            result=backend.api('compare/'+'a'*40+'...'+'b'*40)
            self.assertEqual(result['status'],'ahead');self.assertEqual(called.call_count,1)
            for route in ('../branches/main','branches/./main','https://api.github.com/repos/x/y','/branches/main','branches/%2e%2e/main','compare/main...main'):
                with self.subTest(route=route),self.assertRaises(ValueError):backend.api(route)
            self.assertEqual(called.call_count,1)

    def test_real_redirect_handler_never_constructs_forwarded_authorized_request(self):
        request=Request('https://uploads.github.com/repos/test',data=b'payload',headers={'Authorization':'Bearer ghs_SYNTHETIC'},method='POST')
        handler=NoRedirect()
        for code in (301,302,303,307,308):
            self.assertIsNone(handler.redirect_request(request,None,code,'redirect',{},'https://attacker.invalid/receive'))

    def test_upload_constructs_fixed_https_stream_and_no_redirect_opener(self):
        backend=GhBackend({'GH_TOKEN':'ghs_SYNTHETIC'});backend.verified_context={'test':True};backend.allowed={'uploadAssets'}
        class Response:
            status=201
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def geturl(self):return self.url
            def read(self,n):return b'{"id":123}'
        captured=[]
        class Opener:
            def open(self,request,timeout):
                captured.append(request);self.payload=request.data.read();response=Response();response.url=request.full_url;return response
        opener=Opener()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'safe.exe';path.write_bytes(b'synthetic')
            with patch('gh_backend.build_opener',return_value=opener) as factory:
                self.assertEqual(backend.upload_asset(7,'safe.exe',path)['id'],123)
            self.assertIsInstance(factory.call_args.args[0],NoRedirect)
        self.assertEqual(captured[0].full_url,'https://uploads.github.com/repos/'+core.REPO+'/releases/7/assets?name=safe.exe')
        self.assertEqual(captured[0].get_method(),'POST');self.assertEqual(opener.payload,b'synthetic')

    def test_local_or_pat_context_cannot_make_api_calls(self):
        with patch('gh_backend.subprocess.run',side_effect=AssertionError('No API call')):
            with self.assertRaises(ValueError):GhBackend({'GH_TOKEN':'ghp_SYNTHETIC'}).child_env()
            with self.assertRaises(ValueError):GhBackend({'GH_TOKEN':'ghs_SYNTHETIC'}).check_context({'actionsContext':{}})


if __name__=='__main__': unittest.main()
