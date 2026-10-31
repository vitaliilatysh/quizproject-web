import io
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import verify_release
from verify_release import fetch_runs, verdict, verify

SHA = "a" * 40
REPO = "owner/repo"

def run(**changes):
    return dict({"id": 1, "head_sha": SHA, "head_branch": "main", "event": "push",
                 "head_repository": {"full_name": REPO},
                 "status": "completed", "conclusion": "success"}, **changes)

class ReleaseGateTest(unittest.TestCase):
    def test_only_exact_commit_default_branch_and_own_repository_count(self):
        for changes in ({"head_sha": "b" * 40}, {"head_branch": "other"},
                        {"head_repository": {"full_name": "fork/repo"}},
                        {"head_repository": None}, {"head_repository": {}}):
            for event in ("push", "workflow_dispatch"):
                with self.subTest(changes=changes, event=event):
                    self.assertEqual("pending", verdict([run(event=event, **changes)], SHA, "main", REPO))

    def test_untrusted_events_cannot_approve_or_override_release_checks(self):
        for event in ("pull_request", "pull_request_target", "schedule", "workflow_run"):
            with self.subTest(event=event):
                ignored = run(id=2, event=event)
                self.assertEqual("pending", verdict([ignored], SHA, "main", REPO))
                self.assertEqual("failure", verdict([run(conclusion="failure"), ignored], SHA, "main", REPO))

    def test_missing_repository_metadata_cannot_approve_release(self):
        row = run()
        del row["head_repository"]
        self.assertEqual("pending", verdict([row], SHA, "main", REPO))

    def test_latest_failure_overrides_old_success(self):
        for first, latest in (("push", "workflow_dispatch"), ("workflow_dispatch", "push")):
            self.assertEqual("failure", verdict([
                run(event=first), run(id=2, event=latest, conclusion="failure")], SHA, "main", REPO))

    def test_latest_pending_overrides_old_success(self):
        for status in ("queued", "in_progress", "waiting"):
            self.assertEqual("pending", verdict([
                run(), run(id=2, event="workflow_dispatch", status=status)], SHA, "main", REPO))

    def test_latest_successful_retry_replaces_failure_regardless_of_response_order(self):
        self.assertEqual("success", verdict([
            run(id=2, event="workflow_dispatch"), run(conclusion="failure")], SHA, "main", REPO))

    def test_only_success_is_allowed(self):
        for event in ("push", "workflow_dispatch"):
            self.assertEqual("success", verdict([run(event=event)], SHA, "main", REPO))
            for result in ("failure", "cancelled", "skipped", "neutral", "timed_out", "action_required", None):
                self.assertEqual("failure", verdict([run(event=event, conclusion=result)], SHA, "main", REPO))

    def test_all_workflows_for_image_and_manifest_are_required(self):
        calls = []
        def fetch(repo, workflow, sha, branch):
            calls.append((workflow, sha))
            return [run(head_sha=sha, event="workflow_dispatch")]
        verify("owner/repo", [SHA, "b" * 40], "main", ["ci.yml", "sonarqube.yml"], 0, fetch=fetch)
        self.assertEqual(4, len(calls))

    def test_missing_or_failed_run_blocks(self):
        for rows in ([], [run(conclusion="failure")]):
            with self.assertRaises(RuntimeError):
                verify("owner/repo", [SHA], "main", ["ci.yml"], 0, fetch=lambda *args, rows=rows: rows)

    def test_invalid_metadata_is_rejected_before_requests(self):
        for repo, sha in ((REPO, "main"), (REPO, ""), ("bad", SHA)):
            with self.assertRaises(ValueError):
                verify(repo, [sha], "main", ["ci.yml"], 0)
        with self.assertRaises(ValueError):
            verify(REPO, [], "main", ["ci.yml"], 0)

    def test_waits_for_running_check(self):
        rows = iter([[], [run()]])
        sleeps = []
        verify("owner/repo", [SHA], "main", ["ci.yml"], 20,
               fetch=lambda *args: next(rows), clock=lambda: 0, sleep=sleeps.append)
        self.assertEqual([10], sleeps)

    def test_api_error_is_not_treated_as_success(self):
        def unavailable(*args):
            raise OSError("GitHub unavailable")
        with self.assertRaises(OSError):
            verify("owner/repo", [SHA], "main", ["ci.yml"], 0, fetch=unavailable)

    def test_fetch_queries_both_allowed_events_for_exact_commit_branch_and_workflow(self):
        seen = []
        def urlopen(request, timeout):
            seen.append((request, timeout))
            event = parse_qs(urlsplit(request.full_url).query)["event"][0]
            return io.BytesIO(json.dumps({"workflow_runs": [run(event=event)]}).encode())
        with mock.patch.dict(os.environ, {"GH_TOKEN": "test-token"}), mock.patch("urllib.request.urlopen", urlopen):
            runs = fetch_runs(REPO, "ci.yml", SHA, "main")
        self.assertEqual(2, len(seen))
        for (request, timeout), event in zip(seen, ("push", "workflow_dispatch")):
            url = urlsplit(request.full_url)
            self.assertEqual("https", url.scheme)
            self.assertEqual("api.github.com", url.netloc)
            self.assertEqual("/repos/owner/repo/actions/workflows/ci.yml/runs", url.path)
            self.assertEqual({"head_sha": [SHA], "branch": ["main"], "event": [event], "per_page": ["100"]},
                             parse_qs(url.query))
            self.assertEqual("Bearer test-token", request.get_header("Authorization"))
            self.assertEqual(30, timeout)
        self.assertEqual([run(), run(event="workflow_dispatch")], runs)

    def test_failed_dispatch_lookup_cannot_be_replaced_with_successful_push_result(self):
        responses = [io.BytesIO(json.dumps({"workflow_runs": [run()]}).encode()), OSError("unavailable")]
        with mock.patch.dict(os.environ, {"GH_TOKEN": "test-token"}), \
                mock.patch("urllib.request.urlopen", side_effect=responses), self.assertRaises(OSError):
            fetch_runs(REPO, "ci.yml", SHA, "main")

    def test_every_sha_and_workflow_on_the_command_line_is_checked(self):
        argv = ["verify_release.py", "--repo", "owner/repo", "--sha", SHA, "--sha", "b" * 40,
                "--branch", "main", "--workflow", "ci.yml", "--workflow", "container.yml"]
        with mock.patch("sys.argv", argv), mock.patch.object(verify_release, "verify") as checked:
            verify_release.main()
        checked.assert_called_once_with("owner/repo", [SHA, "b" * 40], "main", ["ci.yml", "container.yml"], 300)

    def test_script_entry_point_accepts_successful_dispatched_checks(self):
        argv = ["verify_release.py", "--repo", REPO, "--sha", SHA, "--branch", "main", "--workflow", "ci.yml"]
        def response(request, timeout):
            event = parse_qs(urlsplit(request.full_url).query)["event"][0]
            rows = [] if event == "push" else [run(event=event)]
            return io.BytesIO(json.dumps({"workflow_runs": rows}).encode())
        with mock.patch.dict(os.environ, {"GH_TOKEN": "test-token"}), \
                mock.patch("sys.argv", argv), mock.patch("urllib.request.urlopen", response):
            runpy.run_path(str(Path(verify_release.__file__)), run_name="__main__")

if __name__ == "__main__":
    unittest.main()
