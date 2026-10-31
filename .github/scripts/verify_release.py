"""Fail closed unless every required workflow passed on the release commit."""
import argparse
import itertools
import json
import os
import re
import time
import urllib.parse
import urllib.request

RELEASE_EVENTS = ("push", "workflow_dispatch")


def verdict(runs, sha, branch, repo):
    matching = [run for run in runs if run["head_sha"] == sha
                and run["head_branch"] == branch and run["event"] in RELEASE_EVENTS
                and (run.get("head_repository") or {}).get("full_name") == repo]
    if not matching:
        return "pending"
    latest = max(matching, key=lambda run: run["id"])
    if latest["status"] != "completed":
        return "pending"
    return "success" if latest["conclusion"] == "success" else "failure"

def fetch_runs(repo, workflow, sha, branch):
    runs = []
    # GITHUB_TOKEN merges need explicitly dispatched checks. Query each allowed
    # event separately so unrelated PR/scheduled runs cannot crowd them out.
    for event in RELEASE_EVENTS:
        query = urllib.parse.urlencode({"head_sha": sha, "branch": branch, "event": event, "per_page": 100})
        url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow}/runs?{query}"
        request = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        with urllib.request.urlopen(request, timeout=30) as response:
            runs.extend(json.load(response)["workflow_runs"])
    return runs

def check_inputs(repo, shas):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
        raise ValueError("Invalid repository.")
    if not shas or any(not re.fullmatch(r"[0-9a-f]{40}", sha) for sha in shas):
        raise ValueError("A full image/manifest source commit SHA is required.")

def pending_checks(repo, shas, branch, workflows, fetch):
    pending = []
    for sha, workflow in itertools.product(dict.fromkeys(shas), workflows):
        state = verdict(fetch(repo, workflow, sha, branch), sha, branch, repo)
        label = f"{sha[:12]} / {workflow}"
        if state == "failure":
            raise RuntimeError(f"Production blocked: latest release check failed or was skipped: {label}")
        if state == "pending":
            pending.append(label)
    return pending

def verify(repo, shas, branch, workflows, wait_seconds, fetch=fetch_runs, clock=time.monotonic, sleep=time.sleep):
    check_inputs(repo, shas)
    deadline = clock() + wait_seconds
    while True:
        pending = pending_checks(repo, shas, branch, workflows, fetch)
        if not pending:
            print("All required release workflows passed for the image and deployment manifests.")
            return
        if clock() >= deadline:
            raise RuntimeError("Production blocked: missing or unfinished checks: " + ", ".join(pending))
        print("Waiting for: " + ", ".join(pending), flush=True)
        sleep(min(10, max(0, deadline - clock())))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--sha", required=True, action="append")
    parser.add_argument("--branch", required=True)
    parser.add_argument("--workflow", required=True, action="append")
    parser.add_argument("--wait-seconds", type=int, default=300)
    args = parser.parse_args()
    verify(args.repo, args.sha, args.branch, args.workflow, args.wait_seconds)

if __name__ == "__main__":
    main()
