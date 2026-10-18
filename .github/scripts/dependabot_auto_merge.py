"""Merge verified Dependabot updates without repository-admin credentials."""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BOT_ID = 49699333
MERGE_MARKER = "[dependabot-auto-merge]"
PASSING_CHECKS = {"success", "neutral", "skipped"}


class ApiError(RuntimeError):
    def __init__(self, status):
        super().__init__(f"GitHub API request failed: HTTP {status}")
        self.status = status


class GitHub:
    def __init__(self, token):
        self.token = token

    def request(self, method, path, body=None):
        request = urllib.request.Request(
            "https://api.github.com" + path,
            data=None if body is None else json.dumps(body).encode(),
            method=method,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            raise ApiError(error.code) from error

    def items(self, path, key=None):
        separator = "&" if "?" in path else "?"
        page = 1
        while True:
            response = self.request("GET", f"{path}{separator}per_page=100&page={page}")
            rows = response[key] if key else response
            if not isinstance(rows, list):
                raise ValueError("GitHub returned an invalid collection")
            yield from rows
            if len(rows) < 100:
                return
            page += 1


def workflow_path(run):
    return run.get("path", "").split("@", 1)[0]


def workflows_ready(runs, sha, required, allow_skipped):
    latest = {}
    for run in runs:
        if run.get("head_sha") != sha or run.get("event") != "pull_request":
            continue
        path = workflow_path(run)
        if run.get("id", 0) > latest.get(path, {}).get("id", -1):
            latest[path] = run
    for name in required:
        run = latest.get(".github/workflows/" + name, {})
        allowed = {"success", "skipped"} if name in allow_skipped else {"success"}
        if run.get("status") != "completed" or run.get("conclusion") not in allowed:
            return False
    return True


def checks_ready(checks, status):
    latest = {}
    for check in checks:
        key = (check.get("app", {}).get("id"), check.get("name"))
        if check.get("id", 0) > latest.get(key, {}).get("id", -1):
            latest[key] = check
    return (
        bool(latest)
        and all(
            check.get("status") == "completed" and check.get("conclusion") in PASSING_CHECKS
            for check in latest.values()
        )
        and (status.get("total_count") == 0 or status.get("state") == "success")
    )


def changes_requested(reviews):
    latest = {}
    for review in reviews:
        if review.get("state") not in {"APPROVED", "CHANGES_REQUESTED", "DISMISSED"}:
            continue
        user = review["user"]["id"]
        if review.get("id", 0) > latest.get(user, {}).get("id", -1):
            latest[user] = review
    return any(review["state"] == "CHANGES_REQUESTED" for review in latest.values())


def eligible(pull, repo, branch):
    user = pull.get("user", {})
    head = pull.get("head", {})
    base = pull.get("base", {})
    return (
        user.get("login") == "dependabot[bot]"
        and user.get("id") == BOT_ID
        and user.get("type") == "Bot"
        and pull.get("state") == "open"
        and not pull.get("draft")
        and head.get("repo", {}).get("full_name") == repo
        and base.get("repo", {}).get("full_name") == repo
        and base.get("ref") == branch
        and re.fullmatch(r"[0-9a-f]{40}", head.get("sha", "")) is not None
    )


def dispatch_missing(api, repo, branch, sha, workflows):
    runs = api.items(
        f"/repos/{repo}/actions/runs?event=workflow_dispatch&head_sha={sha}", "workflow_runs"
    )
    present = {workflow_path(run) for run in runs if run.get("head_sha") == sha}
    for name in workflows:
        if ".github/workflows/" + name not in present:
            api.request("POST", f"/repos/{repo}/actions/workflows/{name}/dispatches", {"ref": branch})
            print(f"Dispatched {name} for {branch} after {sha[:12]}")


def recover_dispatches(api, repo, branch, workflows):
    ref = urllib.parse.quote(branch, safe="")
    commit = api.request("GET", f"/repos/{repo}/commits/{ref}")
    if MERGE_MARKER in commit.get("commit", {}).get("message", ""):
        dispatch_missing(api, repo, branch, commit["sha"], workflows)


def ready(api, repo, branch, pull, required, allow_skipped):
    number, sha = pull["number"], pull["head"]["sha"]
    if pull.get("mergeable") is not True:
        return False
    runs = api.items(f"/repos/{repo}/actions/runs?event=pull_request&head_sha={sha}", "workflow_runs")
    if not workflows_ready(runs, sha, required, allow_skipped):
        return False
    checks = api.items(f"/repos/{repo}/commits/{sha}/check-runs?filter=latest", "check_runs")
    status = api.request("GET", f"/repos/{repo}/commits/{sha}/status")
    if not checks_ready(checks, status):
        return False
    if changes_requested(api.items(f"/repos/{repo}/pulls/{number}/reviews")):
        return False
    fresh = api.request("GET", f"/repos/{repo}/pulls/{number}")
    return eligible(fresh, repo, branch) and fresh["head"]["sha"] == sha and fresh.get("mergeable") is True


def merge_candidate(api, repo, branch, pull, workflows):
    number = pull["number"]
    try:
        result = api.request(
            "PUT",
            f"/repos/{repo}/pulls/{number}/merge",
            {
                "sha": pull["head"]["sha"],
                "merge_method": "squash",
                "commit_title": f"{pull['title']} (#{number})",
                "commit_message": "Verified Dependabot update.\n\n" + MERGE_MARKER,
            },
        )
    except ApiError as error:
        if error.status not in {405, 409, 422}:
            raise
        print(f"PR #{number}: changed or blocked during merge; left open")
        return False
    if not result.get("merged"):
        print(f"PR #{number}: GitHub declined the merge; left open")
        return False
    print(f"Merged Dependabot PR #{number} at {result['sha']}")
    # GITHUB_TOKEN merges do not emit another Actions push run. Explicitly
    # dispatch the normal default-branch pipelines, including image publication.
    dispatch_missing(api, repo, branch, result["sha"], workflows)
    return True


def validate_config(repo, branch, required, allow_skipped):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or not branch:
        raise ValueError("A repository and default branch are required")
    if not required or any(not re.fullmatch(r"[A-Za-z0-9_-]+\.yml", name) for name in required):
        raise ValueError("Required workflows must be workflow filenames")
    if not set(allow_skipped).issubset(required):
        raise ValueError("Only a required workflow can explicitly allow a skipped run")


def run(api, repo, branch, required, allow_skipped=()):
    validate_config(repo, branch, required, allow_skipped)
    # Repair a partial dispatch failure on the next scheduled run, even though
    # the PR has already been merged and is no longer in the open-PR collection.
    recover_dispatches(api, repo, branch, required)
    base = urllib.parse.quote(branch, safe="")
    pulls = list(api.items(f"/repos/{repo}/pulls?state=open&base={base}"))
    merged = 0
    for summary in pulls:
        if not eligible(summary, repo, branch):
            continue
        pull = api.request("GET", f"/repos/{repo}/pulls/{summary['number']}")
        if not eligible(pull, repo, branch) or not ready(api, repo, branch, pull, required, allow_skipped):
            print(f"PR #{summary['number']}: waiting for the current head, checks, or conflict resolution")
            continue
        merged += merge_candidate(api, repo, branch, pull, required)
    print(f"Merged {merged} Dependabot pull request(s)")
    return merged


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--workflow", action="append", required=True)
    parser.add_argument("--allow-skipped", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        token = os.environ.get("GH_TOKEN")
        if not token:
            raise ValueError("GH_TOKEN is required")
        run(GitHub(token), args.repo, args.branch, args.workflow, args.allow_skipped)
        return 0
    except (ApiError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
