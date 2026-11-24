"""Run the actual inline workflow guards with a recording subprocess backend only."""
import base64
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

WORKFLOW = Path(__file__).resolve().parents[4]/'.github/workflows/publish-prepared.yml'

def inline_blocks():
    lines=WORKFLOW.read_text(encoding='utf-8').splitlines()
    blocks=[]
    for index,line in enumerate(lines):
        if line.strip() == "python3 -B - <<'PY'":
            indent=len(line)-len(line.lstrip())
            end=index+1
            while lines[end].strip()!='PY': end+=1
            blocks.append('\n'.join(x[indent:] for x in lines[index+1:end]))
    return blocks

class WorkflowGuardTests(unittest.TestCase):
    def run_execution(self,stage='draft',approval=None,state='',expect_error=None):
        events=[]
        with tempfile.TemporaryDirectory() as tmp:
            env={'RUNNER_TEMP':tmp,'APPROVAL_JSON':approval or '{}','PRIOR_STATE_BASE64':state,'REQUEST_STAGE':stage}
            with patch.dict(os.environ,env,clear=True), patch('subprocess.run',side_effect=lambda *a,**k:events.append((a,k))):
                if expect_error:
                    with self.assertRaises(expect_error):exec(compile(inline_blocks()[1],str(WORKFLOW),'exec'),{})
                else:exec(compile(inline_blocks()[1],str(WORKFLOW),'exec'),{})
            return events

    def test_dispatch_only_and_default_no_execute(self):
        raw=WORKFLOW.read_text(encoding='utf-8')
        self.assertNotIn('\n  push:',raw)
        self.assertNotIn('\n  pull_request:',raw)
        self.assertIn('default: check',raw)
        self.assertIn('default: false',raw)
        self.assertIn("inputs.execute && inputs.stage != 'check' && github.ref == 'refs/heads/main'",raw)
        self.assertIn('GITHUB_TOKEN: ${{ github.token }}',raw)
        self.assertIn('GH_TOKEN: ${{ github.token }}',raw)
        self.assertNotIn('secrets.',raw)

    def test_execute_off_main_rejected(self):
        with patch.dict(os.environ,{'REQUEST_EXECUTE':'true','GITHUB_REF':'refs/heads/topic','REQUEST_STAGE':'draft'},clear=True):
            with self.assertRaises(AssertionError):exec(inline_blocks()[0],{})

    def test_duplicate_approval_no_child_action(self):
        events=self.run_execution(approval='{"publish":false,"publish":true}',expect_error=ValueError)
        self.assertEqual(events,[])

    def test_changed_state_no_child_action(self):
        events=self.run_execution(stage='publish',approval='{"inputStateSha256":"wrong"}',state=base64.b64encode(b'{}').decode(),expect_error=ValueError)
        self.assertEqual(events,[])

    def test_draft_orders_collect_before_writes_and_readback(self):
        events=self.run_execution()
        self.assertEqual([call[0][0][3] for call in events],['collect','stage-draft','verify-remote'])
        self.assertTrue(all(call[1]['check'] for call in events))

    def test_release_places_publication_last(self):
        events=self.run_execution(stage='release')
        self.assertEqual([call[0][0][3] for call in events],['collect','stage-draft','verify-remote','publish'])

    def test_existing_draft_requires_exact_original_state(self):
        raw=b'{"releaseId":123}'
        approval=json.dumps({'inputStateSha256':hashlib.sha256(raw).hexdigest()})
        events=self.run_execution(stage='publish',approval=approval,state=base64.b64encode(raw).decode())
        self.assertEqual([call[0][0][3] for call in events],['publish'])

if __name__=='__main__':unittest.main()
