"""Read-only offline integrity check; not a publisher or an authorization gate."""
import hashlib
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent
APP = 'b696ab86bd1c128729a079b68c0082e6df3d36a5'
TREE = 'e30879fd772871e690847c061ef66e6b81808a05'
MAC_HEAD = '2af94cdcefa3e88e4980b631d16a88d7d7de5ae8'
QA_HEAD = '618beafb98b060a0fdd6da13f59ada8841425abc'
PROOF_SHA = 'b88d02e19168ecb0bb60f0557ac44d643ca61779cfc9fb426c2517aac6218a53'
RECEIPT_SHA = '38f84ed6972aa2b306b7ff3040b26c5acf25fc43f463dd0f9d2bb855ed757f8c'
PARENTS = {
    'Windows': (45177730188, 137703365803, APP, 14828525724, 2037941610, '24816ccb20360bbfc976abf38810988dfe4b27a3305c80d5b80b711719587e0d'),
    'Linux': (45177730188, 137703365848, APP, 14824745492, 4444993178, 'c64b0e90e2144d1a5a6d17ad7e4881429a70ade8c48e76f7a22858b54c3928c5'),
    'macOS': (45195055147, 137763371873, MAC_HEAD, 14836145077, 1972148013, '45a88b40325f516e91b0b4cb557b88fd2a81d62bde2e4be26dc87bd1b55ff015'),
}


def require(value, message):
    if not value:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def original_evidence():
    path = HERE.parent/'P5-final-package-verification/artifact.zip'
    blob = path.read_bytes()
    require(len(blob) == 26500 and sha(blob) == PROOF_SHA, 'Original proof ZIP bytes differ')
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        require(len(names) == 33 and len(set(names)) == 33, 'Original33 proof names differ')
        require(all('/' not in name and '\\' not in name and ':' not in name for name in names), 'Unsafe proof names')
        raw = {entry.filename: archive.read(entry) for entry in entries}
    require(sha(raw['verification-receipt.json']) == RECEIPT_SHA, 'Original receipt bytes differ')
    return raw, json.loads(raw['verification-receipt.json'])


def validate(plan, approval):
    raw, receipt = original_evidence()
    require(plan['kind'] == 'Review-only prepared60-asset publication plan; no publisher implementation', 'Review-only plan required')
    require(all(plan[key] is False for key in ('executionEnabled', 'publicationAuthorized', 'publicationPerformed', 'nativeAcceptanceFinal', 'publicDownloadsAvailable', 'existingReleasePublisherCompatible', 'releaseBodyFinal')), 'Plan must remain disabled and unapproved')
    require(plan['application'] == {'commit':APP, 'tree':TREE, 'version':'2026.48.1'}, 'Application source differs')
    require(plan['proposedTag'] == 'v2026.48.1' and plan['proposedTestedTagTarget'] == APP and plan['approvedTagTarget'] is None, 'Tag proposal is not an approval')
    require(all(approval[key] is False for key in ('executionEnabled', 'mainAncestorVerifiedAfterApproval', 'nativeAcceptanceFinal', 'publicationImplementationReviewed', 'integrationMergeAuthorized', 'mainMergeAuthorized', 'tagCreationAuthorized', 'draftReleaseCreationAuthorized', 'assetUploadAuthorized', 'publishAuthorized')), 'Disabled approval template required')
    require(all(approval[key] is None for key in ('writtenUserApproval', 'approvedPlanSha256', 'approvedApplicationCommit', 'approvedTag', 'approvedTagTarget')), 'This template contains no user permission')
    require((plan['assetCount'], plan['installerCount'], plan['preparedProofAssetCount'], plan['sha256sumEntryCount']) == (60,28,32,58), 'Release asset counts differ')
    proof = plan['preparedProof']
    require((proof['run'],proof['attempt'],proof['job'],proof['qaCommit'],proof['artifactId'],proof['archiveBytes'],proof['archiveSha256'],proof['receiptSha256']) == (45352330223,1,138301610586,QA_HEAD,14900089777,26500,PROOF_SHA,RECEIPT_SHA), 'Prepared-proof source binding differs')
    require(set(plan['producerChains']) == set(PARENTS), 'Exactly three platform origins required')
    for platform, expected in PARENTS.items():
        chain = plan['producerChains'][platform]
        require((chain['run'],chain['job'],chain['producerCommit'],chain['parentArtifactId'],chain['parentArchiveBytes'],chain['parentArchiveSha256']) == expected and chain['attempt'] == 1, 'Frozen platform producer differs: '+platform)
        require((chain['applicationCommit'],chain['applicationTree']) == (APP,TREE), 'Producer cannot replace application identity')
    mac_receipt = next(item for item in receipt['archives'] if item['platform'] == 'macOS')
    require(plan['producerChains']['macOS']['applicationSourceWitness'] == mac_receipt['applicationSourceWitness'], 'Original Mac source witness differs')
    original_failure = plan['originalFailedMacPreserved']
    require((original_failure['run'],original_failure['attempt'],original_failure['job'],original_failure['source'],original_failure['conclusion']) == (45177730188,1,137703365843,APP,'failure'), 'Original failed Mac job must remain failed')
    assets = plan['assets']
    require(len(assets) == 60 and len({item['name'] for item in assets}) == 60, 'Exactly60 distinct release names required')
    require(all(item['publicURL'] is None for item in assets), 'No public availability may be invented')
    by_name = {item['name']:item for item in assets}
    expected_names = set(receipt['installers']) | (set(raw)-{'verification-receipt.json'})
    require(set(by_name) == expected_names, 'Missing or extra release member')
    for name, actual in receipt['installers'].items():
        item = by_name[name]
        chain = plan['producerChains'][actual['platform']]
        require(item['kind'] == 'installer' and item['platform'] == actual['platform'], 'Installer kind/platform differs')
        require((item['bytes'],item['sha256'],item['sourceArtifactId'],item['sourceMember']) == (actual['bytes'],actual['sha256'],actual['artifactId'],actual['member']), 'Installer byte/member binding differs: '+name)
        require((item['sourceRun'],item['sourceAttempt'],item['producerCommit'],item['applicationCommit']) == (chain['run'],1,chain['producerCommit'],APP), 'Installer producer/application differs')
    for name, payload in raw.items():
        if name == 'verification-receipt.json':
            continue
        item = by_name[name]
        require(item['kind'] == 'prepared-checksum-signature-or-report', 'Prepared asset kind differs')
        require((item['bytes'],item['sha256'],item['sourceArtifactId'],item['sourceMember'],item['sourceRun'],item['sourceAttempt'],item['producerCommit']) == (len(payload),sha(payload),14900089777,name,45352330223,1,QA_HEAD), 'Prepared asset byte/source binding differs: '+name)
    sums = {}
    for line in raw['SHA256SUMS'].decode('ascii').splitlines():
        digest, name = line.split('  ',1)
        require(name not in sums, 'Duplicate original checksum row')
        sums[name] = digest
    require(len(sums) == 58 and sums == receipt['releasePayloadChecksums'], 'Original58 checksum rows differ')
    require({name:item['sha256'] for name,item in by_name.items() if name not in ('SHA256SUMS','SHA256SUMS.asc')} == sums, 'Plan digests do not equal original checksum manifest')
    cm = plan['checksumManifest']
    require((cm['sha256'],cm['signatureSha256'],cm['bytes'],cm['signatureBytes']) == (sha(raw['SHA256SUMS']),sha(raw['SHA256SUMS.asc']),len(raw['SHA256SUMS']),len(raw['SHA256SUMS.asc'])), 'Checksum manifest/signature bytes differ')
    require(cm['notListedInOwn58Rows'] == ['SHA256SUMS','SHA256SUMS.asc'] and cm['preparedProofOnlyExcludedFromRelease'] == 'verification-receipt.json', 'Checksum self/excluded receipt scope differs')
    body_path = HERE/plan['releaseBodyFile']
    require(body_path.parent == HERE and sha(body_path.read_bytes()) == plan['releaseBodySha256'], 'Review body bytes differ')
    return {'status':'PASS offline disabled plan integrity only', 'assets':60, 'checksumRows':58, 'networkOrPublicationPerformed':False, 'mainAncestryOrNativeApprovalProven':False}


if __name__ == '__main__':
    print(json.dumps(validate(json.loads((HERE/'plan.json').read_bytes()), json.loads((HERE/'approval.disabled.json').read_bytes())), indent=2))
