"""Real GitHub/GPG backend. Constructed only after explicit execution selection.

The reviewed dispatch-only main workflow must assign github.token directly.
Environment strings/token prefixes are guards, not cryptographic issuer proof.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import quote
from urllib.request import Request, HTTPRedirectHandler, build_opener

from core import APP, KEY, REPO, WORKFLOW, need, strict_json


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        return None


class GhBackend:
    def __init__(self, environment=None):
        self.env = dict(os.environ if environment is None else environment)
        self.allowed = set()
        self.verified_context = None

    def child_env(self):
        token = self.env.get('GITHUB_TOKEN') or self.env.get('GH_TOKEN','')
        need(token.startswith('ghs_'),'A GitHub App installation job token is required; no PAT/local path')
        need(not (self.env.get('GITHUB_TOKEN') and self.env.get('GH_TOKEN') and self.env['GITHUB_TOKEN']!=self.env['GH_TOKEN']),'Conflicting GitHub token environment')
        child = dict(self.env)
        for key in ('GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_HOST','OPENAEC_GPG_PRIVATE_KEY','OPENAEC_GPG_PASSPHRASE'):
            child.pop(key,None)
        child.update(GH_TOKEN=token,GITHUB_TOKEN=token,GH_HOST='github.com',GH_PROMPT_DISABLED='1')
        return child

    def _json(self,path,method='GET',body=None,missing=False):
        need(isinstance(path,str) and re.fullmatch(r'[A-Za-z0-9_./?=&-]+',path) and not path.startswith('/'),'Unexpected GitHub route')
        if path.startswith('compare/'):
            need(re.fullmatch(r'compare/[0-9a-f]{40}\.\.\.[0-9a-f]{40}',path),'Compare requires two exact commit hashes')
        else:
            need('..' not in path and all(segment!='.' for segment in path.split('?',1)[0].split('/')),'Unexpected GitHub path traversal')
        command = ['gh','api',f'repos/{REPO}/{path}','--method',method,'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2022-11-28']
        if body is not None:
            command += ['--input','-']
        result = subprocess.run(command,input=json.dumps(body).encode() if body is not None else None,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=self.child_env(),check=False)
        if result.returncode:
            try:
                error = strict_json(result.stdout)
            except (ValueError,UnicodeDecodeError):
                error = {}
            if missing and (str(error.get('status'))=='404' or b'HTTP 404' in result.stderr):
                return None
            raise RuntimeError('GitHub API request failed: '+method+' '+path+' '+result.stderr.decode(errors='replace')[:1200])
        return strict_json(result.stdout)

    def api(self,path,missing=False):
        return self._json(path,missing=missing)

    def check_context(self,approval):
        env = self.env
        expected = approval['actionsContext']
        need(env.get('GITHUB_ACTIONS')=='true' and env.get('GITHUB_REPOSITORY')==REPO,'Execution is allowed only in reviewed GitHub Actions repository context')
        need(env.get('GITHUB_EVENT_NAME')=='workflow_dispatch' and env.get('GITHUB_REF')=='refs/heads/main' and env.get('GITHUB_JOB')=='execute','Only the dedicated manual main execute job may run')
        need(env.get('GITHUB_WORKFLOW_REF')==WORKFLOW,'Unexpected publisher workflow/ref')
        commit = env.get('GITHUB_SHA')
        need(commit==env.get('GITHUB_WORKFLOW_SHA')==expected['workflowCommit'],'Workflow/application checkout context is not the approved main commit')
        attempt = int(env.get('GITHUB_RUN_ATTEMPT','0'))
        need(attempt==expected.get('runAttempt',1),'Unapproved publisher attempt')
        run_id = int(env.get('GITHUB_RUN_ID','0'))
        need(run_id>0 and expected.get('runId') in (None,run_id),'Unapproved publisher run')
        self.child_env()  # Reject PAT/token conflicts before any request.
        run = self.api(f'actions/runs/{run_id}/attempts/{attempt}')
        need((run['id'],run['head_sha'],run['head_branch'],run['event'],run['path'],run['run_attempt'])==(run_id,commit,'main','workflow_dispatch','.github/workflows/publish-prepared.yml',attempt),'Actual publisher run differs from environment/approval')
        need(run['head_repository']['full_name']==REPO and run['status']=='in_progress','Publisher must be the actual running repository workflow')
        actual = self.api(f'git/commits/{commit}')
        need(actual['tree']['sha']==expected['expectedMainTree'],'Main workflow checkout tree differs from reviewed approval')
        self.verified_context = {'run':run_id,'attempt':attempt,'workflowCommit':commit,'workflowRef':WORKFLOW,'mainTree':actual['tree']['sha'],'tokenBasis':'Reviewed workflow assigns github.token directly; no PAT input. Environment/prefix checks alone are not issuer attestation.'}
        return self.verified_context

    def allow(self,permissions):
        need(self.verified_context is not None,'Context must be verified before enabling scoped actions')
        self.allowed = set(permissions)

    def permitted(self,name):
        need(self.verified_context is not None and name in self.allowed,'Backend action not permitted: '+name)

    def download_artifact(self,artifact_id,path):
        self.permitted('collect')
        self._download(f'actions/artifacts/{int(artifact_id)}/zip',path)

    def download_release_asset(self,asset_id,path):
        self.permitted('readBack')
        self._download(f'releases/assets/{int(asset_id)}',path)

    def _download(self,path,target):
        with Path(target).open('xb') as output:
            subprocess.run(['gh','api',f'repos/{REPO}/{path}','-H','Accept: application/octet-stream'],stdout=output,stderr=subprocess.PIPE,env=self.child_env(),check=True)

    def release_list(self):
        found = []
        for page in range(1,101):
            current = self.api(f'releases?per_page=100&page={page}')
            found.extend(current)
            if len(current)<100:
                return found
        raise ValueError('Release listing exceeded bounded pagination')

    def create_tag(self,tag,sha):
        self.permitted('createTag')
        need(sha==APP,'No alternate or force tag target')
        return self._json('git/refs','POST',{'ref':'refs/tags/'+tag,'sha':sha})

    def create_draft(self,tag,sha,title,body):
        self.permitted('createDraft')
        return self._json('releases','POST',{'tag_name':tag,'target_commitish':sha,'name':title,'body':body,'draft':True,'prerelease':False,'make_latest':'false'})

    def upload_asset(self,release_id,name,path):
        self.permitted('uploadAssets')
        need(Path(name).name==name and '/' not in name and '\\' not in name and ':' not in name,'Unsafe upload filename')
        token = self.child_env()['GH_TOKEN']
        url = f'https://uploads.github.com/repos/{REPO}/releases/{int(release_id)}/assets?name='+quote(name,safe='')
        # Fixed HTTPS host and explicit length: stream the existing file, no shell,
        # no --clobber, and no redirect-following authorization to another host.
        with Path(path).open('rb') as stream:
            request = Request(url,data=stream,method='POST',headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/octet-stream','Content-Length':str(Path(path).stat().st_size),'X-GitHub-Api-Version':'2022-11-28'})
            with build_opener(NoRedirect()).open(request,timeout=600) as response:
                need(response.geturl()==url and response.status==201,'Unexpected upload response or redirect')
                return strict_json(response.read(1_000_000))

    def publish_release(self,release_id):
        self.permitted('publish')
        return self._json(f'releases/{int(release_id)}','PATCH',{'draft':False,'prerelease':False,'make_latest':'true'})

    def public_verify(self,public_key,pairs,fingerprint,work):
        self.permitted('verifyCrypto')
        need(fingerprint==KEY,'Frozen public-only verification key required')
        need(Path(public_key).read_bytes().startswith(b'-----BEGIN PGP PUBLIC KEY BLOCK-----'),'Only the prepared public key may be imported')
        results,cleanup = [],None
        with tempfile.TemporaryDirectory(prefix='public-only-gpg-',dir=work) as directory:
            home = Path(directory)
            home.chmod(0o700)
            env = dict(self.env)
            for key in ('OPENAEC_GPG_PRIVATE_KEY','OPENAEC_GPG_PASSPHRASE','GH_TOKEN','GITHUB_TOKEN','GPG_AGENT_INFO'):
                env.pop(key,None)
            env['GNUPGHOME'] = str(home)
            def gpg(*args):
                return subprocess.run(['gpg','--no-options','--homedir',str(home),'--batch','--no-tty','--no-auto-key-retrieve','--no-auto-key-import',*map(str,args)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,check=True).stdout
            try:
                gpg('--import',public_key)
                secret = gpg('--with-colons','--list-secret-keys').decode()
                need(not any(line.startswith(('sec:','ssb:')) for line in secret.splitlines()),'Secret key unexpectedly present')
                listing = gpg('--with-colons','--fingerprint','--list-keys').decode()
                fingerprints = [line.split(':')[9] for line in listing.splitlines() if line.startswith('fpr:')]
                need(fingerprints and fingerprints[0]==KEY,'Prepared public primary fingerprint differs')
                for signature,payload in pairs:
                    status = gpg('--status-fd','1','--verify',signature,payload).decode()
                    valid = [line.split() for line in status.splitlines() if line.startswith('[GNUPG:] VALIDSIG ')]
                    need(len(valid)==1 and KEY in (valid[0][2],valid[0][-1]),'Public-only signature verification failed')
                    results.append({'signature':Path(signature).name,'payload':Path(payload).name,'primaryFingerprint':KEY})
                need(len(results)==15,'Exactly fifteen public-only verifications required')
            finally:
                result = subprocess.run(['gpgconf','--homedir',str(home),'--kill','gpg-agent'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,check=False)
                cleanup = result.returncode
                need(cleanup==0,'Scoped public-only GPG agent termination failed')
        need(not home.exists(),'Temporary public-only GPG home remains')
        return {'verifiedSignatures':len(results),'primaryFingerprint':KEY,'verifications':results,'scopedAgentStopReturnCode':cleanup,'temporaryHomeRemoved':True}
