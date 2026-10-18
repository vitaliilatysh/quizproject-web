import copy
import io
import json
import os
from pathlib import Path
import runpy
import unittest
from unittest import mock
import urllib.error
from urllib.parse import parse_qs, urlsplit

import dependabot_auto_merge as automation

REPO = "owner/repo"
SHA = "a" * 40
MERGED_SHA = "b" * 40
WORKFLOWS = ["ci.yml", "container.yml", "sonarqube.yml", "e2e.yml"]
SKIPPABLE = ["sonarqube.yml"]


def pull():
    return {
        "number": 1,
        "title": "deps: bump an example dependency",
        "user": {"login": "dependabot[bot]", "id": automation.BOT_ID, "type": "Bot"},
        "head": {"sha": SHA, "repo": {"full_name": REPO}},
        "base": {"ref": "main", "repo": {"full_name": REPO}},
        "draft": False,
        "state": "open",
        "mergeable": True,
    }


def workflow(name, **changes):
    return {
        **{
            "id": WORKFLOWS.index(name) + 1,
            "path": ".github/workflows/" + name,
            "head_sha": SHA,
            "event": "pull_request",
            "status": "completed",
            "conclusion": "skipped" if name in SKIPPABLE else "success",
        },
        **changes,
    }


def check(**changes):
    return {
        **{"id": 1, "app": {"id": 1}, "name": "tests", "status": "completed", "conclusion": "success"},
        **changes,
    }


class FakeGitHub:
    items = automation.GitHub.items

    def __init__(self):
        self.pull = pull()
        self.summary = None
        self.fresh = None
        self.pulls = None
        self.reads = 0
        self.runs = [workflow(name) for name in WORKFLOWS]
        self.checks = [check()]
        self.status = {"total_count": 0, "state": "pending"}
        self.reviews = []
        self.dispatched = []
        self.commit = {"sha": MERGED_SHA, "commit": {"message": "A human commit"}}
        self.merge_result = {"merged": True, "sha": MERGED_SHA}
        self.merge_error = None
        self.dispatch_error = None
        self.calls = []

    def request(self, method, url, body=None):
        self.calls.append((method, url, body))
        target = urlsplit(url)
        path, query = target.path, parse_qs(target.query)
        if method == "GET":
            if path == f"/repos/{REPO}/commits/main":
                return copy.deepcopy(self.commit)
            if path == f"/repos/{REPO}/pulls":
                return copy.deepcopy(self.pulls if self.pulls is not None else [self.summary or self.pull])
            if path == f"/repos/{REPO}/pulls/1":
                self.reads += 1
                return copy.deepcopy(self.fresh if self.fresh is not None and self.reads > 1 else self.pull)
            if path.endswith("/actions/runs"):
                rows = self.dispatched if query["event"] == ["workflow_dispatch"] else self.runs
                return {"workflow_runs": copy.deepcopy(rows)}
            if path.endswith("/check-runs"):
                return {"check_runs": copy.deepcopy(self.checks)}
            if path.endswith("/status"):
                return copy.deepcopy(self.status)
            if path.endswith("/reviews"):
                return copy.deepcopy(self.reviews)
        if method == "PUT" and path.endswith("/merge"):
            if self.merge_error:
                raise automation.ApiError(self.merge_error)
            return copy.deepcopy(self.merge_result)
        if method == "POST" and path.endswith("/dispatches"):
            if self.dispatch_error:
                raise automation.ApiError(self.dispatch_error)
            return None
        raise AssertionError(f"Unexpected request: {method} {url}")

    def writes(self, method):
        return [(path, body) for verb, path, body in self.calls if verb == method]


class MergePolicyTest(unittest.TestCase):
    def setUp(self):
        self.api = FakeGitHub()
        self.output = mock.patch("sys.stdout", new_callable=io.StringIO)
        self.output.start()
        self.addCleanup(self.output.stop)

    def run_automation(self):
        return automation.run(self.api, REPO, "main", WORKFLOWS, SKIPPABLE)

    def assert_blocked(self):
        self.assertEqual(0, self.run_automation())
        self.assertEqual([], self.api.writes("PUT"))
        self.assertEqual([], self.api.writes("POST"))

    def test_merges_only_the_tested_head_and_dispatches_every_pipeline(self):
        self.assertEqual(1, self.run_automation())
        merge = self.api.writes("PUT")
        self.assertEqual(1, len(merge))
        self.assertEqual(SHA, merge[0][1]["sha"])
        self.assertEqual("squash", merge[0][1]["merge_method"])
        self.assertIn(automation.MERGE_MARKER, merge[0][1]["commit_message"])
        self.assertEqual(
            [(f"/repos/{REPO}/actions/workflows/{name}/dispatches", {"ref": "main"}) for name in WORKFLOWS],
            self.api.writes("POST"),
        )

    def test_non_bot_spoofed_bot_fork_draft_and_other_base_do_not_merge(self):
        mutations = [
            lambda p: p["user"].update(login="a-person"),
            lambda p: p["user"].update(id=123),
            lambda p: p["user"].update(type="User"),
            lambda p: p["head"]["repo"].update(full_name="attacker/fork"),
            lambda p: p["base"]["repo"].update(full_name="other/repo"),
            lambda p: p["base"].update(ref="release"),
            lambda p: p.update(draft=True),
            lambda p: p.update(state="closed"),
            lambda p: p["head"].update(sha="not-a-commit"),
        ]
        for change in mutations:
            with self.subTest(change=change):
                self.api = FakeGitHub()
                change(self.api.pull)
                self.assert_blocked()

    def test_conflicts_and_uncomputed_mergeability_wait(self):
        for mergeable in (False, None):
            with self.subTest(mergeable=mergeable):
                self.api = FakeGitHub()
                self.api.pull["mergeable"] = mergeable
                self.assert_blocked()

    def test_a_handover_between_listing_and_detail_is_rechecked(self):
        self.api.summary = pull()
        self.api.pull["draft"] = True
        self.assert_blocked()

    def test_every_required_workflow_must_exist(self):
        for name in WORKFLOWS:
            with self.subTest(name=name):
                self.api = FakeGitHub()
                self.api.runs = [row for row in self.api.runs if not row["path"].endswith("/" + name)]
                self.assert_blocked()

    def test_pending_failed_cancelled_and_skipped_tests_block(self):
        for result in ("failure", "cancelled", "skipped", "neutral", "timed_out"):
            with self.subTest(result=result):
                self.api = FakeGitHub()
                self.api.runs[0]["conclusion"] = result
                self.assert_blocked()
        self.api = FakeGitHub()
        self.api.runs[0]["status"] = "in_progress"
        self.assert_blocked()

    def test_sonar_can_be_skipped_but_a_failed_sonar_still_blocks(self):
        self.api.runs[2]["conclusion"] = "failure"
        self.assert_blocked()

    def test_old_sha_and_non_pr_workflows_do_not_satisfy_checks(self):
        for changes in ({"head_sha": MERGED_SHA}, {"event": "push"}):
            with self.subTest(changes=changes):
                self.api = FakeGitHub()
                self.api.runs[0].update(changes)
                self.assert_blocked()

    def test_latest_workflow_failure_wins_over_an_older_success(self):
        self.api.runs.extend([workflow("ci.yml", id=20, conclusion="failure"), workflow("ci.yml", id=0)])
        self.assert_blocked()

    def test_all_head_checks_must_finish_without_failure(self):
        for changes in ({"status": "queued"}, {"conclusion": "failure"}, {"conclusion": "cancelled"}):
            with self.subTest(changes=changes):
                self.api = FakeGitHub()
                self.api.checks.append(check(id=2, **changes))
                self.assert_blocked()
        self.api = FakeGitHub()
        self.api.checks = []
        self.assert_blocked()

    def test_latest_check_success_replaces_old_failure_and_neutral_is_allowed(self):
        self.api.checks = [check(conclusion="failure"), check(id=2), check(id=0), check(id=3, name="CodeQL", conclusion="neutral")]
        self.assertEqual(1, self.run_automation())

    def test_legacy_commit_statuses_also_block(self):
        for state in ("pending", "failure", "error"):
            with self.subTest(state=state):
                self.api = FakeGitHub()
                self.api.status = {"total_count": 1, "state": state}
                self.assert_blocked()
        self.api = FakeGitHub()
        self.api.status = {"total_count": 1, "state": "success"}
        self.assertEqual(1, self.run_automation())

    def test_changes_requested_is_not_cleared_by_a_comment(self):
        self.api.reviews = [
            {"id": 1, "user": {"id": 42}, "state": "CHANGES_REQUESTED"},
            {"id": 2, "user": {"id": 42}, "state": "COMMENTED"},
        ]
        self.assert_blocked()

    def test_an_approval_or_dismissal_clears_that_reviewers_old_request(self):
        for state in ("APPROVED", "DISMISSED"):
            with self.subTest(state=state):
                self.api = FakeGitHub()
                self.api.reviews = [
                    {"id": 2, "user": {"id": 42}, "state": state},
                    {"id": 1, "user": {"id": 42}, "state": "CHANGES_REQUESTED"},
                ]
                self.assertEqual(1, self.run_automation())

    def test_new_commits_drafts_or_conflicts_just_before_merge_block(self):
        for changes in ({"draft": True}, {"mergeable": False}, {"head": {"sha": MERGED_SHA, "repo": {"full_name": REPO}}}):
            with self.subTest(changes=changes):
                self.api = FakeGitHub()
                self.api.fresh = {**pull(), **changes}
                self.assert_blocked()

    def test_githubs_atomic_sha_or_merge_rejection_leaves_pr_open(self):
        for status in (405, 409, 422):
            with self.subTest(status=status):
                self.api = FakeGitHub()
                self.api.merge_error = status
                self.assertEqual(0, self.run_automation())
                self.assertEqual([], self.api.writes("POST"))
        self.api = FakeGitHub()
        self.api.merge_result = {"merged": False}
        self.assertEqual(0, self.run_automation())

    def test_permission_failure_is_visible_instead_of_silently_succeeding(self):
        self.api.merge_error = 403
        with self.assertRaises(automation.ApiError):
            self.run_automation()

    def test_dispatch_failure_is_visible_and_the_next_run_repairs_missing_pipelines(self):
        self.api.dispatch_error = 503
        with self.assertRaises(automation.ApiError):
            self.run_automation()
        self.assertEqual(1, len(self.api.writes("PUT")))
        recovery = FakeGitHub()
        recovery.pulls = []
        recovery.commit["commit"]["message"] = automation.MERGE_MARKER
        recovery.dispatched = [workflow("ci.yml", head_sha=MERGED_SHA, event="workflow_dispatch")]
        self.api = recovery
        self.assertEqual(0, self.run_automation())
        self.assertEqual(3, len(self.api.writes("POST")))
        self.assertFalse(any("/ci.yml/" in path for path, _ in self.api.writes("POST")))
        self.assertEqual([], self.api.writes("PUT"))

    def test_runs_from_another_commit_do_not_hide_a_missing_dispatch(self):
        self.api.commit["commit"]["message"] = automation.MERGE_MARKER
        self.api.pulls = []
        self.api.dispatched = [workflow(name, head_sha=SHA) for name in WORKFLOWS]
        self.assertEqual(0, self.run_automation())
        self.assertEqual(4, len(self.api.writes("POST")))

    def test_configuration_is_validated_before_any_requests(self):
        for repo, branch, required, allowed in (
            ("bad", "main", WORKFLOWS, SKIPPABLE),
            (REPO, "", WORKFLOWS, SKIPPABLE),
            (REPO, "main", [], []),
            (REPO, "main", ["../anything.yml"], []),
            (REPO, "main", WORKFLOWS, ["unknown.yml"]),
        ):
            with self.subTest(repo=repo, branch=branch, required=required):
                with self.assertRaises(ValueError):
                    automation.run(self.api, repo, branch, required, allowed)
        self.assertEqual([], self.api.calls)


class GitHubClientTest(unittest.TestCase):
    def test_auth_headers_json_body_timeout_and_empty_dispatch_response(self):
        api = automation.GitHub("fixture-token")
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO()) as send:
            self.assertIsNone(api.request("POST", "/repos/owner/repo/actions/workflows/ci.yml/dispatches", {"ref": "main"}))
        request = send.call_args.args[0]
        self.assertEqual("Bearer fixture-token", request.get_header("Authorization"))
        self.assertEqual("2022-11-28", request.get_header("X-github-api-version"))
        self.assertEqual({"ref": "main"}, json.loads(request.data))
        self.assertEqual({"timeout": 30}, send.call_args.kwargs)

    def test_pagination_reads_all_pages(self):
        api = automation.GitHub("fixture-token")
        responses = [io.BytesIO(json.dumps({"workflow_runs": list(range(100))}).encode()), io.BytesIO(b'{"workflow_runs": [100]}')]
        with mock.patch("urllib.request.urlopen", side_effect=responses) as send:
            self.assertEqual(list(range(101)), list(api.items("/runs?head_sha=abc", "workflow_runs")))
        self.assertEqual(["2"], parse_qs(urlsplit(send.call_args.args[0].full_url).query)["page"])

    def test_invalid_collection_and_api_errors_are_not_success(self):
        api = automation.GitHub("fixture-token")
        with mock.patch("urllib.request.urlopen", return_value=io.BytesIO(b'{}')):
            with self.assertRaises(ValueError):
                list(api.items("/pulls"))
        error = urllib.error.HTTPError("https://api.github.com/pulls", 403, "forbidden", {}, None)
        with mock.patch("urllib.request.urlopen", side_effect=error):
            with self.assertRaisesRegex(automation.ApiError, "HTTP 403"):
                api.request("GET", "/pulls")

    def test_cli_requires_token_and_surfaces_network_errors(self):
        args = ["--repo", REPO, "--branch", "main", "--workflow", "ci.yml"]
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(1, automation.main(args))
            self.assertIn("GH_TOKEN is required", output.getvalue())
        with mock.patch.dict(os.environ, {"GH_TOKEN": "fixture-token"}), mock.patch.object(automation, "run", side_effect=OSError("network unavailable")), mock.patch("sys.stderr", new_callable=io.StringIO):
            self.assertEqual(1, automation.main(args))

    def test_script_entry_point_handles_an_empty_queue(self):
        def response(request, timeout):
            rows = {"sha": SHA, "commit": {"message": "human commit"}} if "/commits/" in request.full_url else []
            return io.BytesIO(json.dumps(rows).encode())

        args = ["dependabot_auto_merge.py", "--repo", REPO, "--branch", "main", "--workflow", "ci.yml"]
        with mock.patch.dict(os.environ, {"GH_TOKEN": "fixture-token"}), mock.patch("sys.argv", args), mock.patch("urllib.request.urlopen", response), mock.patch("sys.stdout", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as exited:
                runpy.run_path(str(Path(automation.__file__)), run_name="__main__")
        self.assertEqual(0, exited.exception.code)


if __name__ == "__main__":
    unittest.main()
