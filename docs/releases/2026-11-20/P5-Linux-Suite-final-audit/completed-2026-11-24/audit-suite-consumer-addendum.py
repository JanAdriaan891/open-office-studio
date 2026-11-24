from pathlib import Path
import hashlib,json,subprocess
r=Path.cwd();owner=r.parent/'oos-linux-suite-final-acceptance-2026-11-23';rawroot=Path('\\\\?\\'+str(owner.resolve()))/'.local/final-native-proof';d=Path('\\\\?\\'+str((r/'docs/releases/2026-11-20/P5-Linux-Suite-final-audit/completed-2026-11-24').resolve()));sha=lambda b:hashlib.sha256(b).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
scopes=[('core','45189806911','deb','e230df9ee4a019db01368d93689893fb2b03d245'),('appimage-missing','45193170006','appimage','55a651186c35bde2937a1a8c529c4c2c984d0085'),('appimage-positive','45193170006','appimage','55a651186c35bde2937a1a8c529c4c2c984d0085'),('deb-positive','45193639082','deb','80f85a5cb4ae536f1bf7248fbe4cfeeb2653d7d4'),('deb-missing','45196900595','deb','332aa081b7579b39cb39f0499b9d0669b4a3d239')]
rows=[]
for label,run,kind,pin in scopes:
 report=read(d.parent/'raw-reports'/ (label+'.json'));origin=report['origin'];base=rawroot/run/kind/'raw/linux-suite-final-input'
 consumer=subprocess.check_output(['git','-C',str(owner),'show',pin+':scripts/linux-suite-native-package.py']);assert sha(consumer)==origin['consumerSha256']
 out=d/'src'/pin[:8]/'linux-suite-native-package.py';out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert out.read_bytes()==consumer
 else:out.write_bytes(consumer)
 a=read(base/'api-bindings.json');p=origin['origin']['parent'];transfer=origin['origin']['artifact']
 assert a['run']['id']==p['run'] and a['run']['head_sha']==p['sourceCommit'] and a['run']['run_attempt']==p['attempt']
 assert a['job']['id']==p['job'] and a['job']['head_sha']==p['sourceCommit'] and a['job']['run_attempt']==p['attempt'] and a['job']['conclusion']=='success'
 assert a['canonical']['id']==p['installerArchive']['id'] and a['canonical']['size_in_bytes']==p['installerArchive']['bytes'] and a['canonical']['digest']=='sha256:'+p['installerArchive']['sha256']
 assert a['producer']['id']==transfer['run'] and a['producer']['head_sha']==origin['origin']['qaPin']['producerCommit'] and a['producer']['conclusion']=='success'
 assert a['transfer']['id']==transfer['id'] and a['transfer']['size_in_bytes']==transfer['zipBytes'] and a['transfer']['digest']=='sha256:'+transfer['zipSha256']
 verifier=base/'shared-verifier-receipt.json';receipt=None
 if verifier.exists():
  receipt=read(verifier);assert receipt['status']=='verified-original-Suite-input-only' and receipt['descriptorSha256']==origin['descriptorSha256'] and receipt['parent']==p and receipt['artifact']==transfer and receipt['package']==origin['origin']['package']
  assert receipt['actualPayloadElf']==origin['expectedPayloadElf'] and not receipt['nativeAcceptanceClaim'] and not receipt['signatureCertifiedByThisVerifier'] and not receipt['canonicalParentDownloadedByThisVerifier']
  (d/'identities'/(label+'-verifier.json')).write_bytes(verifier.read_bytes())
 (d/'identities'/(label+'-api.json')).write_bytes((base/'api-bindings.json').read_bytes())
 rows.append({'scope':label,'consumerGit':pin,'consumerPath':'scripts/linux-suite-native-package.py','consumerSha256':sha(consumer),'cachedAPIBindingsSHA':sha((base/'api-bindings.json').read_bytes()),'parentRunConclusionAsOriginallyCaptured':a['run']['conclusion'],'linuxProducerJobConclusion':a['job']['conclusion'],'inputProducerConclusion':a['producer']['conclusion'],'canonicalArtifact':a['canonical']['id'],'childArtifact':a['transfer']['id'],'sharedVerifierReceiptPresentAndBound':receipt is not None,'identityAndELFCheckedAgainstBoundReceipt':True})
p=d/'package-consumer-addendum.json';p.write_text(json.dumps({'status':'passed source-consumer/cached-parent-child-API and shared-verifier bindings','rows':rows,'noDownloadOrInstallerExecution':True,'coreEarlierConsumerHasNoSeparateSharedVerifierReceipt':True},indent=2)+'\n',encoding='utf-8')
(d/'audit-suite-consumer-addendum.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps({'status':'passed','scopeBindings':len(rows),'newDownloadOrNative':False}))
