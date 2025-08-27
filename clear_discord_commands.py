#!/usr/bin/env python3
"""
Clear Discord application commands (global and guild) using the REST API.

Environment variables required:
- DISCORD_TOKEN: Bot token for the application (e.g., '...')
- CLIENT_ID: Application (bot) client ID
- GUILD_ID: Guild ID to clear guild-scoped commands (optional; if omitted, only global commands are cleared)

This script performs bulk overwrite with an empty list, which deletes all commands
for the specified scope.
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

API_BASE = "https://discord.com/api/v10"


def discord_request(method: str, url: str, token: str, **kwargs) -> requests.Response:
    headers = kwargs.pop("headers", {})
    headers.update(
        {
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
            "User-Agent": "discord-bot-clear-commands (clear, 1.0)",
        }
    )
    timeout = kwargs.pop("timeout", 30)

    while True:
        resp = requests.request(method, url, headers=headers, timeout=timeout, **kwargs)
        if resp.status_code != 429:
            return resp
        # Handle rate limit
        retry_after = resp.headers.get("Retry-After")
        if not retry_after:
            try:
                data = resp.json()
                retry_after = data.get("retry_after")
            except Exception:
                retry_after = None
        try:
            sleep_seconds = float(retry_after) if retry_after is not None else 1.5
        except Exception:
            sleep_seconds = 1.5
        time.sleep(sleep_seconds)


def get_commands(token: str, application_id: str, guild_id: Optional[str] = None) -> List[Dict[str, Any]]:
    if guild_id:
        url = f"{API_BASE}/applications/{application_id}/guilds/{guild_id}/commands"
    else:
        url = f"{API_BASE}/applications/{application_id}/commands"
    resp = discord_request("GET", url, token)
    if resp.status_code != 200:
        raise RuntimeError(f"GET commands failed ({resp.status_code}): {resp.text}")
    return resp.json()


def clear_commands(token: str, application_id: str, guild_id: Optional[str] = None) -> Tuple[int, int]:
    """Bulk overwrite the command list with an empty list. Returns (before_count, after_count)."""
    before = get_commands(token, application_id, guild_id)
    if guild_id:
        url = f"{API_BASE}/applications/{application_id}/guilds/{guild_id}/commands"
    else:
        url = f"{API_BASE}/applications/{application_id}/commands"

    resp = discord_request("PUT", url, token, data=json.dumps([]))
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"PUT clear failed ({resp.status_code}): {resp.text}")

    after = get_commands(token, application_id, guild_id)
    return len(before), len(after)


def main() -> int:
    token = os.environ.get("DISCORD_TOKEN")
    app_id = os.environ.get("CLIENT_ID")
    guild_id = os.environ.get("GUILD_ID")

    if not token or not app_id:
        print("Missing DISCORD_TOKEN or CLIENT_ID environment variables.")
        return 2

    # Global commands
    try:
        g_before, g_after = clear_commands(token, app_id, None)
        print(f"Global commands: {g_before} -> {g_after}")
    except Exception as exc:
        print(f"Global clear failed: {exc}")

    # Guild commands
    if guild_id:
        try:
            gg_before, gg_after = clear_commands(token, app_id, guild_id)
            print(f"Guild {guild_id} commands: {gg_before} -> {gg_after}")
        except Exception as exc:
            print(f"Guild clear failed: {exc}")
    else:
        print("No GUILD_ID provided; skipped guild command clear.")

    return 0


if __name__ == "__main__":
    sys.exit(main())

