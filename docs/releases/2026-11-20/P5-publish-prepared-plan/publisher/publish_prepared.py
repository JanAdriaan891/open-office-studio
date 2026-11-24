"""Default check is offline/inert. Every executing stage needs concrete approval."""
import argparse
import json
from pathlib import Path
from core import check, execute, approve, strict_json


def main(argv=None,backend_factory=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',nargs='?',default='check',choices=('check','collect','stage-draft','verify-remote','publish'))
    parser.add_argument('--plan',type=Path,default=Path(__file__).resolve().parent.parent/'plan.json')
    parser.add_argument('--approval',type=Path)
    parser.add_argument('--work-dir',type=Path)
    parser.add_argument('--body',type=Path)
    args = parser.parse_args(argv)
    bundle = check(args.plan,args.body)
    if args.stage=='check':
        result = {'stage':'check','assets':60,'checksumRows':58,'planSha256':bundle['planSha256'],'reviewedCodeSha256':bundle['codeSha256'],'assetsSha256':bundle['assetsSha256'],'releaseBodySha256':bundle['bodySha256'],'networkOrPublicationPerformed':False}
    else:
        parser.error('Execution requires --approval and --work-dir') if not args.approval or not args.work_dir else None
        approval = strict_json(args.approval.read_bytes())
        approve(bundle,approval,args.stage)
        if args.stage!='collect':
            strict_json((args.work_dir/'state.json').read_bytes())
        if backend_factory is None:
            from gh_backend import GhBackend
            backend_factory = GhBackend
        result = execute(bundle,approval,args.stage,args.work_dir,backend_factory())
    print(json.dumps(result,indent=2))
    return result


if __name__=='__main__':
    main()
