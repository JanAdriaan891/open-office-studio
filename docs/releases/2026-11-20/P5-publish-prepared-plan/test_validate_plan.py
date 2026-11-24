"""Small local negative controls; no network, publishing code or user approvals."""
import copy
import json
from pathlib import Path
import unittest
from validate_plan import validate

HERE = Path(__file__).resolve().parent


class DisabledPlanIntegrity(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads((HERE/'plan.json').read_bytes())
        self.approval = json.loads((HERE/'approval.disabled.json').read_bytes())

    def rejects(self, change):
        plan = copy.deepcopy(self.plan)
        change(plan)
        with self.assertRaises(ValueError): validate(plan,self.approval)

    def test_real60_asset_disabled_plan(self):
        self.assertEqual(validate(self.plan,self.approval)['checksumRows'],58)

    def test_duplicate_or_extra_name_rejected(self):
        self.rejects(lambda p:p['assets'].__setitem__(1,copy.deepcopy(p['assets'][0])))
        self.rejects(lambda p:p['assets'].append(copy.deepcopy(p['assets'][0])))

    def test_installer_digest_size_and_member_changes_rejected(self):
        for field,value in [('sha256','0'*64),('bytes',123),('sourceMember','wrong/member')]:
            with self.subTest(field=field): self.rejects(lambda p:p['assets'][0].__setitem__(field,value))

    def test_prepared_signature_digest_rejected(self):
        self.rejects(lambda p:next(a for a in p['assets'] if a['name'].endswith('.asc')).__setitem__('sha256','0'*64))

    def test_old_mac_origin_cannot_borrow_new_success(self):
        self.rejects(lambda p:p['producerChains']['macOS'].__setitem__('run',45177730188))
        self.rejects(lambda p:p['producerChains']['macOS']['applicationSourceWitness'].__setitem__('sha256','0'*64))

    def test_approval_execution_and_invented_public_url_rejected(self):
        self.rejects(lambda p:p.__setitem__('executionEnabled',True))
        self.rejects(lambda p:p['assets'][0].__setitem__('publicURL','https://example.invalid/fake.exe'))
        approval=copy.deepcopy(self.approval);approval['publishAuthorized']=True
        with self.assertRaises(ValueError): validate(self.plan,approval)

    def test_tag_target_and_checksum_scope_rejected(self):
        self.rejects(lambda p:p.__setitem__('proposedTestedTagTarget',p['producerChains']['macOS']['producerCommit']))
        self.rejects(lambda p:p.__setitem__('sha256sumEntryCount',60))


if __name__ == '__main__': unittest.main()
