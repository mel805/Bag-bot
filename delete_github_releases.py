#!/usr/bin/env python3
"""
Delete all GitHub releases for the current repository.

Auth priority:
1) GITHUB_TOKEN env var
2) Token extracted from `git remote get-url origin` (x-access-token)

Repository detection from `git remote get-url origin`.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from typing import Optional

import requests


def _run(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True).strip()


def get_origin_url() -> str:
    return _run(["git", "remote", "get-url", "origin"])  # raises if missing


def extract_owner_repo(url: str) -> tuple[str, str]:
    # Supports https and ssh forms
    m = re.search(r"github.com[:/]+([^/]+)/([^/.]+)(?:\.git)?", url)
    if not m:
        raise RuntimeError(f"Cannot parse owner/repo from URL: {url}")
    return m.group(1), m.group(2)


def extract_token_from_url(url: str) -> Optional[str]:
    m = re.search(r"x-access-token:([^@]+)@", url)
    if m:
        return m.group(1)
    return None


def get_token() -> str:
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    url = get_origin_url()
    token = extract_token_from_url(url)
    if not token:
        raise RuntimeError("GITHUB_TOKEN not set and no x-access-token found in origin URL")
    return token


def delete_all_releases(owner: str, repo: str, token: str) -> int:
    session = requests.Session()
    session.headers.update(
        {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "repo-reset-script/1.0",
        }
    )

    total_deleted = 0
    page = 1
    while True:
        resp = session.get(f"https://api.github.com/repos/{owner}/{repo}/releases", params={"per_page": 100, "page": page}, timeout=30)
        resp.raise_for_status()
        releases = resp.json()
        if not isinstance(releases, list) or not releases:
            break
        for rel in releases:
            rel_id = rel.get("id")
            if not rel_id:
                continue
            del_resp = session.delete(f"https://api.github.com/repos/{owner}/{repo}/releases/{rel_id}", timeout=30)
            # 204 No Content or 200 OK acceptable
            if del_resp.status_code in (200, 204):
                total_deleted += 1
            else:
                del_resp.raise_for_status()
        page += 1
    return total_deleted


def main() -> int:
    url = get_origin_url()
    owner, repo = extract_owner_repo(url)
    token = get_token()

    deleted = delete_all_releases(owner, repo, token)
    print(f"Deleted {deleted} releases from {owner}/{repo}")
    # Verify none remain
    session = requests.Session()
    session.headers.update({"Authorization": f"token {token}", "Accept": "application/vnd.github+json"})
    verify = session.get(f"https://api.github.com/repos/{owner}/{repo}/releases", params={"per_page": 1}, timeout=30)
    verify.raise_for_status()
    remaining = len(verify.json()) if isinstance(verify.json(), list) else 0
    print(f"Remaining releases: {remaining}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

