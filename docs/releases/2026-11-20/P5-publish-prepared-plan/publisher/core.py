"""Frozen P5 collector/publisher. Offline checking is the default, inert path."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

REPO = 'OpenAEC-Foundation/open-office-studio'
APP = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
TREE = 'e30879fd772871e690847c061ef66e6b81808a05'
MAC = '2af94cdcefa3e88e4980b631d16a88d7d7de5ae8'
QA = '618beafb98b060a0fdd6da13f59ada8841425abc'
KEY = '13F6D414ADEE4ED4CD09AC60601D86C93C504D29'
WITNESS = '.local/macos-only-producer-source.json'
WORKFLOW = REPO+'/.github/workflows/publish-prepared.yml@refs/heads/main'
PARENTS = {
    'Windows': (45177730188,137703365803,APP,14828525724,2037941610,'24816ccb20360bbfc976abf38810988dfe4b27a3305c80d5b80b711719587e0d'),
    'Linux': (45177730188,137703365848,APP,14824745492,4444993178,'c64b0e90e2144d1a5a6d17ad7e4881429a70ade8c48e76f7a22858b54c3928c5'),
    'macOS': (45195055147,137763371873,MAC,14836145077,1972148013,'45a88b40325f516e91b0b4cb557b88fd2a81d62bde2e4be26dc87bd1b55ff015'),
}
PROOF = (45352330223,138301610586,QA,14900089777,26500,'b88d02e19168ecb0bb60f0557ac44d643ca61779cfc9fb426c2517aac6218a53')
PERMISSIONS = {
    'collect': ('collect','verifyCrypto'),
    'stage-draft': ('checkMainAncestry','createTag','createDraft','uploadAssets'),
    'verify-remote': ('readBack','verifyCrypto'),
    'publish': ('checkMainAncestry','readBack','verifyCrypto','publish'),
}


def need(value, message):
    if not value:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def digest_file(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':')).encode()


def strict_json(raw):
    def pairs(items):
        result = {}
        for key,value in items:
            need(key not in result,'Duplicate JSON key: '+key)
            result[key] = value
        return result
    return json.loads(raw,object_pairs_hook=pairs)


def code_digest():
    here = Path(__file__).resolve().parent
    return sha(canonical({name:sha((here/name).read_bytes()) for name in ('core.py','gh_backend.py','publish_prepared.py')}))


def zip_members(archive):
    found, canonical_names = {}, set()
    for entry in archive.infolist():
        name = entry.orig_filename
        path = PurePosixPath(name)
        mode = entry.external_attr >> 16
        need(not path.is_absolute() and '..' not in path.parts and '\\' not in name and ':' not in name,'Unsafe archive path')
        need(stat.S_IFMT(mode) in (0,stat.S_IFREG,stat.S_IFDIR),'Archive special file forbidden')
        if entry.is_dir():
            continue
        leaf = path.name.replace(' ','.')
        need(name not in found and leaf not in canonical_names,'Duplicate archive member/canonical filename')
        need(0 < entry.file_size <= 2_000_000_000,'Invalid archive member size')
        found[name] = entry
        canonical_names.add(leaf)
    return found


def checksum_rows(raw):
    rows = {}
    for line in raw.decode('ascii').splitlines():
        digest,name = line.split('  ',1)
        need(name not in rows and len(digest)==64 and all(c in '0123456789abcdef' for c in digest),'Invalid/duplicate checksum row')
        rows[name] = digest
    return rows


def check(plan_path, body_path=None):
    """Read only local evidence. No directories, backend, subprocess or network."""
    plan_path = Path(plan_path).resolve()
    plan_raw = plan_path.read_bytes()
    plan = strict_json(plan_raw)
    need(plan['application']=={'commit':APP,'tree':TREE,'version':'2026.48.1'},'Wrong application')
    need(all(plan[k] is False for k in ('executionEnabled','publicationAuthorized','publicationPerformed','publicDownloadsAvailable')),'Manifest must remain inert data')
    need(plan['proposedTag']=='v2026.48.1' and plan['proposedTestedTagTarget']==APP and plan['approvedTagTarget'] is None,'Unexpected proposed tag target')
    need((plan['assetCount'],plan['installerCount'],plan['preparedProofAssetCount'],plan['sha256sumEntryCount'])==(60,28,32,58),'Wrong manifest counts')
    assets = plan['assets']
    need(len(assets)==60 and len({a['name'] for a in assets})==60,'Exactly sixty unique names required')
    need(all(a['publicURL'] is None and PurePosixPath(a['name']).name==a['name'] and '\\' not in a['name'] and ':' not in a['name'] for a in assets),'Unsafe name/invented public URL')
    need(set(plan['producerChains'])==set(PARENTS),'Three producer chains required')
    for platform,expected in PARENTS.items():
        c = plan['producerChains'][platform]
        need((c['run'],c['job'],c['producerCommit'],c['parentArtifactId'],c['parentArchiveBytes'],c['parentArchiveSha256'])==expected and c['attempt']==1,'Wrong frozen producer: '+platform)
        need((c['applicationCommit'],c['applicationTree'])==(APP,TREE),'Producer/application identity conflation')
    p = plan['preparedProof']
    need((p['run'],p['job'],p['qaCommit'],p['artifactId'],p['archiveBytes'],p['archiveSha256'])==PROOF and p['attempt']==1,'Wrong original prepared proof')
    archive_path = (plan_path.parent/p['localOriginalArchive']).resolve()
    need(archive_path.stat().st_size==p['archiveBytes'] and digest_file(archive_path)==p['archiveSha256'],'Original local proof bytes differ')
    with zipfile.ZipFile(archive_path) as archive:
        members = zip_members(archive)
        need(len(members)==33 and all(PurePosixPath(n).name==n and info.file_size<2_000_000 for n,info in members.items()),'Expected original flat bounded proof')
        raw = {n:archive.read(info) for n,info in members.items()}
    need(sha(raw['verification-receipt.json'])==p['receiptSha256'],'Receipt binding differs')
    receipt = strict_json(raw['verification-receipt.json'])
    need((receipt['source'],receipt['tree'],receipt['version'])==(APP,TREE,'2026.48.1'),'Receipt application differs')
    need(all(receipt[k] is False for k in ('publication','mainOrTagWrite','nativeAcceptance')),'Unexpected original receipt claim')
    need(receipt['originalMacFailure']['conclusion']=='failure' and receipt['originalMacFailure']['job']==137703365843,'Original Mac failure missing')
    by_name = {a['name']:a for a in assets}
    need(set(by_name)==set(receipt['installers']) | (set(raw)-{'verification-receipt.json'}),'Unexpected release asset set')
    for name,actual in receipt['installers'].items():
        a = by_name[name]
        c = plan['producerChains'][actual['platform']]
        need((a['kind'],a['platform'],a['bytes'],a['sha256'],a['sourceArtifactId'],a['sourceMember'])==('installer',actual['platform'],actual['bytes'],actual['sha256'],actual['artifactId'],actual['member']),'Installer byte/member mismatch')
        need((a['sourceRun'],a['sourceAttempt'],a['producerCommit'],a['applicationCommit'])==(c['run'],1,c['producerCommit'],APP),'Installer producer mismatch')
    for name,payload in raw.items():
        if name=='verification-receipt.json':
            continue
        a = by_name[name]
        need((a['bytes'],a['sha256'],a['sourceArtifactId'],a['sourceMember'],a['sourceRun'],a['sourceAttempt'],a['producerCommit'])==(len(payload),sha(payload),PROOF[3],name,PROOF[0],1,QA),'Prepared asset byte/source mismatch')
    sums = checksum_rows(raw['SHA256SUMS'])
    need(len(sums)==58 and sums==receipt['releasePayloadChecksums'],'Original checksum rows differ')
    need({n:a['sha256'] for n,a in by_name.items() if n not in ('SHA256SUMS','SHA256SUMS.asc')}==sums,'Manifest digests differ from signed sums')
    w = next(a for a in receipt['archives'] if a['platform']=='macOS')['applicationSourceWitness']
    need(plan['producerChains']['macOS']['applicationSourceWitness']==w and w['witness']['appHead']==APP and w['witness']['producerHead']==MAC,'Mac witness mismatch')
    body_path = Path(body_path).resolve() if body_path else (plan_path.parent/plan['releaseBodyFile']).resolve()
    body = body_path.read_bytes()
    need(sha(body)==plan['releaseBodySha256'],'Release body digest mismatch')
    return {'plan':plan,'planSha256':sha(plan_raw),'body':body.decode('utf-8'),'bodySha256':sha(body),'codeSha256':code_digest(),'rawProof':raw,'receipt':receipt,'assets':by_name,'assetsSha256':sha(canonical(assets))}


def approve(bundle, approval, stage, now=None):
    now = now or datetime.now(timezone.utc)
    need(stage in PERMISSIONS and approval.get('executionEnabled') is True,'Execution is not explicitly enabled')
    need(approval['repository']==REPO and approval['planSha256']==bundle['planSha256'] and approval['reviewedCodeSha256']==bundle['codeSha256'],'Approval repo/plan/code binding differs')
    need(approval['application']==bundle['plan']['application'] and approval['tag']=='v2026.48.1' and approval['tagTarget']==APP,'Approval application/tag target differs')
    need(approval['releaseBodySha256']==bundle['bodySha256'] and approval['assetsSha256']==bundle['assetsSha256'],'Approval body/assets binding differs')
    need(isinstance(approval['writtenApprovalReference'],str) and len(approval['writtenApprovalReference'].strip())>=8,'Specific written user approval reference required')
    expires = datetime.fromisoformat(approval['expiresAt'].replace('Z','+00:00'))
    need(expires.tzinfo is not None and now < expires,'Approval is expired or lacks timezone')
    need(all(approval['permissions'].get(p) is True for p in PERMISSIONS[stage]),'Step permission missing: '+stage)
    need(approval['actionsContext']['workflowRef']==WORKFLOW and len(approval['actionsContext']['workflowCommit'])==40 and len(approval['actionsContext']['expectedMainTree'])==40,'Reviewed main workflow context required')


def time_value(value):
    return datetime.fromisoformat(value.replace('Z','+00:00'))


def preflight_origins(bundle, backend):
    """Read immutable attempts/jobs/artifacts before any download."""
    jobs_cache = {}
    for platform,c in bundle['plan']['producerChains'].items():
        endpoint = f"actions/runs/{c['run']}/attempts/{c['attempt']}"
        run = backend.api(endpoint)
        need((run['id'],run['head_sha'],run['run_attempt'],run['status'],run['path'],run['event'])==(c['run'],c['producerCommit'],1,'completed','.github/workflows/release.yml','workflow_dispatch'),'Producer attempt/source mismatch')
        need(run['head_repository']['full_name']==REPO,'Producer repository mismatch')
        if c['run'] not in jobs_cache:
            jobs_cache[c['run']] = backend.api(endpoint+'/jobs?per_page=100')['jobs']
        job = next(j for j in jobs_cache[c['run']] if j['id']==c['job'])
        need((job['run_id'],job['run_attempt'],job['head_sha'],job['status'],job['conclusion'])==(c['run'],1,c['producerCommit'],'completed','success'),'Producer job mismatch/failure')
        names = {'Windows':['Pakket bouwen (Windows, ondertekend)','Authenticode controleren (installer, programma en uninstaller)'], 'Linux':['Linux-installers werkelijk uitpakken en controleren'], 'macOS':['Pakket bouwen (macOS, ondertekend en genotariseerd)','Handtekening en notarisatie controleren (macOS)','Exacte P5-appbron en afzonderlijke producerhead bewijzen','Ondertekening beschikbaar']}[platform]
        names += ['Meet- en inhoudscontrole voor de meegeleverde runtime','Linux native WebKit-interface en private installer controleren' if platform=='Linux' else 'Standaardinstaller controleren met uitsluitend de private runtime']
        steps = []
        for name in names:
            matches = [s for s in job['steps'] if s['name']==name]
            need(len(matches)==1 and matches[0]['status']=='completed' and matches[0]['conclusion']=='success','Producer gate missing/failed/duplicate: '+name)
            steps.append(matches[0])
        listing = backend.api(f"actions/runs/{c['run']}/artifacts?per_page=100")['artifacts']
        matches = [a for a in listing if a['name']=='uitgave-'+platform]
        need(len(matches)==1,'Canonical parent is not unique')
        artifact = backend.api(f"actions/artifacts/{c['parentArtifactId']}")
        need(matches[0]['id']==artifact['id']==c['parentArtifactId'] and not artifact['expired'],'Wrong/expired parent')
        need((artifact['size_in_bytes'],artifact['digest'],artifact['workflow_run']['id'],artifact['workflow_run']['head_sha'])==(c['parentArchiveBytes'],'sha256:'+c['parentArchiveSha256'],c['run'],c['producerCommit']),'Parent artifact binding differs')
        created = time_value(artifact['created_at'])
        need(time_value(job['started_at']) <= created <= time_value(job['completed_at']) and max(time_value(s['completed_at']) for s in steps)<=created,'Artifact predates gates or is outside selected job')
    old = next(j for j in jobs_cache[45177730188] if j['id']==137703365843)
    need(old['conclusion']=='failure' and old['head_sha']==APP and old['run_attempt']==1,'Original Mac failure not preserved')
    p = bundle['plan']['preparedProof']
    endpoint = f"actions/runs/{p['run']}/attempts/1"
    run = backend.api(endpoint)
    need((run['head_sha'],run['status'],run['conclusion'],run['run_attempt'])==(QA,'completed','success',1),'Verifier producer differs')
    job = next(j for j in backend.api(endpoint+'/jobs?per_page=100')['jobs'] if j['id']==p['job'])
    need((job['head_sha'],job['run_attempt'],job['conclusion'])==(QA,1,'success'),'Verifier job differs')
    gates = [s for s in job['steps'] if s['name']=='Hash actual packages, check reports and sign Linux bytes']
    need(len(gates)==1 and gates[0]['conclusion']=='success','Final byte/crypto gate missing')
    a = backend.api(f"actions/artifacts/{p['artifactId']}")
    need(not a['expired'] and (a['workflow_run']['id'],a['workflow_run']['head_sha'],a['size_in_bytes'],a['digest'])==(p['run'],QA,p['archiveBytes'],'sha256:'+p['archiveSha256']),'Prepared proof artifact mismatch')
    need(time_value(gates[0]['completed_at'])<=time_value(a['created_at'])<=time_value(job['completed_at']),'Prepared proof predates verification')


def verify_asset_files(bundle, directory):
    directory = Path(directory)
    need(directory.is_dir() and {p.name for p in directory.iterdir()}==set(bundle['assets']),'Collected asset set differs')
    for name,a in bundle['assets'].items():
        p = directory/name
        need(p.is_file() and not p.is_symlink() and p.stat().st_size==a['bytes'] and digest_file(p)==a['sha256'],'Asset bytes differ: '+name)
    need(checksum_rows((directory/'SHA256SUMS').read_bytes())==bundle['receipt']['releasePayloadChecksums'],'Collected sums differ')


def crypto_pairs(bundle, directory):
    directory = Path(directory)
    pairs = [(directory/(name+'.asc'),directory/name) for name,a in bundle['assets'].items() if a.get('platform')=='Linux']
    pairs.append((directory/'SHA256SUMS.asc',directory/'SHA256SUMS'))
    need(len(pairs)==15,'Fifteen signature verifications required')
    return pairs


def cache_archive(backend, cache, aid, size, digest):
    path = cache/f'{aid}.zip'
    if not path.exists():
        need(shutil.disk_usage(cache).free > size+1_000_000_000,'Insufficient free collection space')
        partial = cache/f'{aid}.partial'
        need(not partial.exists(),'Partial cache needs manual review')
        backend.download_artifact(aid,partial)
        need(partial.stat().st_size==size and digest_file(partial)==digest,'Downloaded archive hash/size mismatch')
        # Exclusive destination creation: never replace a racing existing cache.
        path.hardlink_to(partial)
        partial.unlink()
    need(path.is_file() and not path.is_symlink() and path.stat().st_size==size and digest_file(path)==digest,'Existing cache not fully verified')
    return path


def collect(bundle, backend, work, state):
    preflight_origins(bundle,backend)
    assets,cache = work/'assets',work/'cache'
    need(not assets.exists(),'Asset directory must be fresh; no overwrite')
    cache.mkdir(exist_ok=True)
    assets.mkdir()
    p = bundle['plan']['preparedProof']
    proof = cache_archive(backend,cache,p['artifactId'],p['archiveBytes'],p['archiveSha256'])
    with zipfile.ZipFile(proof) as z:
        members = zip_members(z)
        need(set(members)==set(bundle['rawProof']),'Prepared proof member set differs')
        for name,raw in bundle['rawProof'].items():
            need(members[name].file_size==len(raw),'Prepared proof member length differs')
            need(z.read(members[name])==raw,'Prepared proof raw bytes differ')
            if name!='verification-receipt.json':
                with (assets/name).open('xb') as out:
                    out.write(raw)
    # Keep only one original parent ZIP at a time. This order stays below the
    # standard runner's disk budget instead of retaining all parents+assets.
    for platform in ('Windows','Linux','macOS'):
        c = bundle['plan']['producerChains'][platform]
        selected = [a for a in bundle['assets'].values() if a.get('platform')==platform]
        cached = cache/f"{c['parentArtifactId']}.zip"
        required = sum(a['bytes'] for a in selected)+1_000_000_000
        if not cached.exists(): required += c['parentArchiveBytes']
        need(shutil.disk_usage(work).free > required,'Insufficient free space before parent download/extraction')
        archive = cache_archive(backend,cache,c['parentArtifactId'],c['parentArchiveBytes'],c['parentArchiveSha256'])
        reports = [r for r in bundle['receipt']['reports'] if r['platform']==platform]
        expected = {a['sourceMember'] for a in selected} | {r['member'] for r in reports}
        if platform=='macOS': expected.add(WITNESS)
        with zipfile.ZipFile(archive) as z:
            members = zip_members(z)
            need(set(members)==expected,'Unexpected/missing original parent members')
            if platform=='macOS':
                w = c['applicationSourceWitness']
                need(members[WITNESS].file_size==w['bytes'] and w['bytes']<65536,'Original Mac witness member length differs')
                raw = z.read(members[WITNESS])
                need(len(raw)==w['bytes'] and sha(raw)==w['sha256'] and strict_json(raw)==w['witness'],'Original Mac source witness bytes differ')
            for a in selected:
                info = members[a['sourceMember']]
                need(info.file_size==a['bytes'],'Installer member size differs')
                with z.open(info) as src,(assets/a['name']).open('xb') as dst:
                    shutil.copyfileobj(src,dst,length=1024*1024)
                need(digest_file(assets/a['name'])==a['sha256'],'Installer member digest differs')
            for r in reports:
                need(members[r['member']].file_size==len(bundle['rawProof'][r['name']])<2_000_000,'Producer report member length differs')
                need(z.read(members[r['member']])==bundle['rawProof'][r['name']],'Original producer report differs from prepared report')
        # This is an individually verified regular file in our own work/cache.
        archive.unlink()
    verify_asset_files(bundle,assets)
    result = backend.public_verify(assets/'openaec-signing-public-key.asc',crypto_pairs(bundle,assets),KEY,work)
    need(result['verifiedSignatures']==15 and result['primaryFingerprint']==KEY and result['temporaryHomeRemoved'] is True,'Public-only verification/cleanup incomplete')
    state.update(phase='collected',crypto=result)


def prove_main_ancestry(bundle, backend, context):
    main = backend.api('branches/main')['commit']['sha']
    need(main==context['workflowCommit'],'Current main moved from the explicitly approved workflow commit')
    need(backend.api(f'git/commits/{main}')['tree']['sha']==context['mainTree'],'Current main tree differs from explicit approval')
    comparison = backend.api(f'compare/{APP}...{main}')
    need(comparison['merge_base_commit']['sha']==APP and comparison['status'] in ('ahead','identical'),'Approved tested target is not an ancestor of main')
    commit = backend.api(f'git/commits/{APP}')
    need(commit['tree']['sha']==TREE,'Approved tested app tree differs')
    return main


def tag_sha(backend, tag):
    ref = backend.api('git/ref/tags/'+tag)
    need(ref and ref['object']['type']=='commit' and ref['object']['sha']==APP,'Tag target/type differs; never retarget')


def exact_remote(bundle,backend,state,published=False):
    release = backend.api(f"releases/{state['releaseId']}")
    need(release['id']==state['releaseId'] and release['tag_name']==state['tag'] and release['draft'] is (not published) and (release['published_at'] is not None)==published,'Release is no longer in the owned expected draft/public state')
    need(sha(release['body'].encode())==bundle['bodySha256'],'Draft release body changed')
    tag_sha(backend,state['tag'])
    found = backend.api(f"releases/{state['releaseId']}/assets?per_page=100")
    need(len(found)==60 and len({a['name'] for a in found})==60,'Remote must contain exactly sixty distinct assets')
    need({a['name'] for a in found}==set(bundle['assets']),'Remote asset names differ')
    for a in found:
        expected = bundle['assets'][a['name']]
        need(a['state']=='uploaded' and a['size']==expected['bytes'] and a['id']==state['uploaded'][a['name']],'Remote asset ID/state/size differs')
        need(not a.get('digest') or a['digest']=='sha256:'+expected['sha256'],'Remote API digest differs')
    return found


def stage_draft(bundle,backend,work,state):
    need(state['phase']=='collected','Collection and public-only verification must finish first')
    verify_asset_files(bundle,work/'assets')
    main = prove_main_ancestry(bundle,backend,state['activeContext'])
    tag = bundle['plan']['proposedTag']
    need(backend.api('git/ref/tags/'+tag,missing=True) is None,'Existing tag: no overwrite or reuse')
    need(not any(r['tag_name']==tag for r in backend.release_list()),'Existing release/draft: no overwrite or reuse')
    prove_main_ancestry(bundle,backend,state['activeContext'])
    backend.create_tag(tag,APP)
    state.update(phase='tag-created',tag=tag,mainAncestorAtCreation=main)
    save_state(work,state)
    tag_sha(backend,tag)
    release = backend.create_draft(tag,APP,'Open Office Studio 2026.48.1',bundle['body'])
    need(release['draft'] is True and release['tag_name']==tag and not release.get('assets'),'New release is not an empty draft')
    state.update(phase='uploading',releaseId=release['id'],uploaded={})
    save_state(work,state)
    for name,a in sorted(bundle['assets'].items()):
        result = backend.upload_asset(release['id'],name,work/'assets'/name)
        need(result['name']==name and result['size']==a['bytes'] and result['state']=='uploaded','Upload response differs')
        state['uploaded'][name] = result['id']
        save_state(work,state)
    exact_remote(bundle,backend,state)
    state['phase'] = 'draft-uploaded'
    # All uploads succeeded and the exact remote IDs are sealed. Release our
    # local copies before the bounded streaming readback; no recursive delete.
    for name in bundle['assets']:
        (work/'assets'/name).unlink()
    (work/'assets').rmdir()
    state['collectedAssetsReleasedAfterUpload'] = True


def verify_remote(bundle,backend,work,state):
    need(state['phase'] in ('draft-uploaded','remote-verified'),'Draft/upload stage must finish first')
    before = exact_remote(bundle,backend,state)
    with tempfile.TemporaryDirectory(prefix='release-readback-',dir=work) as temp:
        directory = Path(temp)
        by_name = {a['name']:a for a in before}
        verified = set()
        def read(name):
            a = by_name[name];expected = bundle['assets'][name]
            need(shutil.disk_usage(work).free > expected['bytes']+250_000_000,'Insufficient readback space')
            path = directory/name
            backend.download_release_asset(a['id'],path)
            need(path.stat().st_size==expected['bytes'] and digest_file(path)==expected['sha256'],'Remote actual byte digest differs: '+name)
            verified.add(name)
            return path
        # Keep only small reports/keys/signatures. Each large installer is read,
        # hashed, optionally verified with GPG and removed before the next one.
        for name,a in bundle['assets'].items():
            if a['kind']!='installer': read(name)
        need(checksum_rows((directory/'SHA256SUMS').read_bytes())==bundle['receipt']['releasePayloadChecksums'],'Remote signed checksum rows differ')
        for name,a in bundle['assets'].items():
            if a['kind']=='installer' and a.get('platform')!='Linux': read(name).unlink()
        def linux_pairs():
            for name,a in bundle['assets'].items():
                if a.get('platform')=='Linux':
                    path = read(name)
                    try:
                        yield directory/(name+'.asc'),path
                    finally:
                        path.unlink(missing_ok=True)
            yield directory/'SHA256SUMS.asc',directory/'SHA256SUMS'
        pairs = linux_pairs()
        try:
            result = backend.public_verify(directory/'openaec-signing-public-key.asc',pairs,KEY,work)
        finally:
            pairs.close()
        need(result['verifiedSignatures']==15 and result['temporaryHomeRemoved'] is True,'Remote public-only verification incomplete')
        need(verified==set(bundle['assets']),'Not all sixty actual remote assets were read back')
        after = exact_remote(bundle,backend,state)
        need([(a['id'],a['name'],a['size']) for a in sorted(before,key=lambda x:x['id'])]==[(a['id'],a['name'],a['size']) for a in sorted(after,key=lambda x:x['id'])],'Remote assets changed during readback')
    need(not directory.exists(),'Readback temporary directory remains')
    state.update(phase='remote-verified',remoteCrypto=result,readbackContext=state.get('activeContext'),remoteReadbackUtc=datetime.now(timezone.utc).isoformat(),remoteAssets=[{'id':a['id'],'name':a['name'],'bytes':a['size'],'sha256':bundle['assets'][a['name']]['sha256']} for a in before])


def publish(bundle,backend,work,state):
    need(state['phase'] in ('draft-uploaded','remote-verified'),'Owned staged draft required')
    prove_main_ancestry(bundle,backend,state['activeContext'])
    # A later, separately approved run never re-downloads original producer ZIPs.
    # It reads the actual draft assets and verifies all bytes/signatures afresh.
    if state['phase']!='remote-verified' or state.get('readbackContext')!=state.get('activeContext'):
        verify_remote(bundle,backend,work,state)
    else:
        # Same reviewed execution context just completed actual readback/GPG.
        # Re-check immutable IDs/names/bytes before publishing without a second
        # payload download. A separate later run takes the full readback path.
        exact_remote(bundle,backend,state)
        need(state['remoteCrypto']['verifiedSignatures']==15 and state['remoteCrypto']['temporaryHomeRemoved'] is True,'Missing current-context remote crypto receipt')
    save_state(work,state)
    prove_main_ancestry(bundle,backend,state['activeContext'])
    result = backend.publish_release(state['releaseId'])
    need(result['id']==state['releaseId'] and result['draft'] is False,'Publish response differs')
    final = backend.api(f"releases/{state['releaseId']}")
    need(final['draft'] is False and final['tag_name']==state['tag'] and final['published_at'] is not None,'Final public release state differs')
    tag_sha(backend,state['tag'])
    public_assets = exact_remote(bundle,backend,state,published=True)
    state.update(phase='published',publicUrl=final['html_url'],publicAssetUrls={a['name']:a['browser_download_url'] for a in public_assets})


def save_state(work,state):
    target = work/'state.json'
    temporary = work/'state.next.json'
    temporary.write_text(json.dumps(state,indent=2)+'\n',encoding='utf-8')
    temporary.replace(target)


def execute(bundle,approval,stage,work,backend):
    approve(bundle,approval,stage)
    work = Path(work).resolve()
    if stage=='collect':
        need(not (work/'state.json').exists(),'Existing state: no new collection overwrite')
        state = None
    else:
        path = work/'state.json';raw = path.read_bytes();state = strict_json(raw)
        need((state['planSha256'],state['codeSha256'],state['assetsSha256'],state['applicationCommit'])==(bundle['planSha256'],bundle['codeSha256'],bundle['assetsSha256'],APP),'State source/plan/code differs')
        need(not state.get('requiresManualReview'),'Partial failed mutation needs manual review; no automatic resume/overwrite')
    # Parse/validate local approval and state before even read-only context APIs.
    context = backend.check_context(approval)
    backend.allow(PERMISSIONS[stage])
    if state is None:
        work.mkdir(parents=True,exist_ok=True)
        state = {'schemaVersion':1,'planSha256':bundle['planSha256'],'codeSha256':bundle['codeSha256'],'assetsSha256':bundle['assetsSha256'],'applicationCommit':APP,'phase':'initial','context':context,'history':[]}
    else:
        if state['context']!=context:
            need(approval.get('inputStateSha256')==sha(raw),'Cross-run state requires an explicitly approved digest')
    state['history'].append({'stage':stage,'writtenApprovalReference':approval['writtenApprovalReference'],'approvalSha256':sha(canonical(approval)),'context':context})
    state['activeContext'] = context
    try:
        {'collect':collect,'stage-draft':stage_draft,'verify-remote':verify_remote,'publish':publish}[stage](bundle,backend,work,state)
        save_state(work,state)
    except Exception as error:
        state['requiresManualReview'] = True
        state['failure'] = {'stage':stage,'type':type(error).__name__,'message':str(error)}
        save_state(work,state)
        raise
    return {'stage':stage,'phase':state['phase'],'statePath':str(work/'state.json'),'stateSha256':digest_file(work/'state.json'),'publicationPerformed':state['phase']=='published'}
