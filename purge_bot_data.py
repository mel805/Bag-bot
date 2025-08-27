#!/usr/bin/env python3
"""
Purge bot data from PostgreSQL and MongoDB.

This script reads connection info from environment variables and attempts to:
- Reset the PostgreSQL database schema by dropping and recreating the `public` schema
- Drop the MongoDB database named `discord_bot`

Environment variables used:
- DATABASE_URL (preferred for PostgreSQL)
- PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE (fallback for PostgreSQL)
- MONGODB_URI (may include `<MONGODB_PASSWORD>` placeholder)
- MONGODB_PASSWORD (used to replace `<MONGODB_PASSWORD>` in MONGODB_URI)

Exit code is 0 even if one of the databases is unreachable, but the script will
print a clear status for each datastore. This is intentional to allow partial
successes without terminating the whole run.
"""

from __future__ import annotations

import os
import sys
import traceback
from typing import Tuple

POSTGRES_DB_NAME = os.environ.get("PGDATABASE", "discord_bot")
MONGODB_DB_NAME = "discord_bot"


def _build_postgres_dsn() -> str | None:
    dsn = os.environ.get("DATABASE_URL")
    if dsn:
        return dsn.strip().strip("'\"")

    host = os.environ.get("PGHOST", "localhost")
    port = os.environ.get("PGPORT", "5432")
    user = os.environ.get("PGUSER", "username")
    password = os.environ.get("PGPASSWORD", "password")
    dbname = os.environ.get("PGDATABASE", "discord_bot")
    return f"postgresql://{user}:{password}@{host}:{port}/{dbname}"


def _redact_secret(text: str) -> str:
    # Redact password between : and @ in connection strings
    out = []
    i = 0
    while i < len(text):
        colon = text.find(":", i)
        at = text.find("@", i)
        if colon == -1 or at == -1 or at < colon:
            out.append(text[i:])
            break
        out.append(text[i:colon + 1])
        out.append("***")
        i = at
    return "".join(out)


def purge_postgres() -> Tuple[bool, str]:
    try:
        import psycopg
    except Exception as exc:  # pragma: no cover
        return False, f"psycopg not available: {exc}"

    dsn = _build_postgres_dsn()
    if not dsn:
        return False, "No PostgreSQL DSN provided"

    try:
        # Connect with autocommit so DROP/CREATE schema run outside tx
        with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as conn:
            with conn.cursor() as cur:
                # Reset the public schema
                cur.execute("DROP SCHEMA IF EXISTS public CASCADE;")
                cur.execute("CREATE SCHEMA public;")
                # Ensure privileges are sane for public schema
                cur.execute("GRANT ALL ON SCHEMA public TO public;")
        return True, "PostgreSQL schema 'public' dropped and recreated"
    except Exception as exc:  # pragma: no cover
        return (
            False,
            "PostgreSQL purge failed: " + str(exc) + "\n" + traceback.format_exc(),
        )


def _build_mongodb_uri() -> str | None:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        # Build from discrete parts if available
        username = os.environ.get("MONGODB_USERNAME")
        password = os.environ.get("MONGODB_PASSWORD")
        cluster = os.environ.get("MONGODB_CLUSTER_URL")
        if username and password and cluster:
            return (
                f"mongodb+srv://{username}:{password}@{cluster}/"
                "?retryWrites=true&w=majority"
            )
        return None

    uri = uri.strip().strip("'\"")
    password = os.environ.get("MONGODB_PASSWORD", "")
    if "<MONGODB_PASSWORD>" in uri:
        uri = uri.replace("<MONGODB_PASSWORD>", password)
    return uri


def purge_mongodb() -> Tuple[bool, str]:
    try:
        from pymongo import MongoClient
    except Exception as exc:  # pragma: no cover
        return False, f"pymongo not available: {exc}"

    uri = _build_mongodb_uri()
    if not uri:
        return False, "No MongoDB URI provided"

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=10000)
        # Force server selection early
        _ = client.admin.command("ping")
        client.drop_database(MONGODB_DB_NAME)
        # Verify drop
        databases = client.list_database_names()
        if MONGODB_DB_NAME in databases:
            return False, f"MongoDB database '{MONGODB_DB_NAME}' still present after drop"
        return True, f"MongoDB database '{MONGODB_DB_NAME}' dropped"
    except Exception as exc:  # pragma: no cover
        return (
            False,
            "MongoDB purge failed: " + str(exc) + "\n" + traceback.format_exc(),
        )


def main() -> int:
    print("Starting bot data purge...")

    # PostgreSQL
    pg_dsn = _build_postgres_dsn()
    if pg_dsn:
        print(f"PostgreSQL DSN: {_redact_secret(pg_dsn)}")
    ok_pg, msg_pg = purge_postgres()
    print(msg_pg)

    # MongoDB
    mongo_uri = _build_mongodb_uri()
    if mongo_uri:
        print(f"MongoDB URI: {_redact_secret(mongo_uri)}")
    ok_mongo, msg_mongo = purge_mongodb()
    print(msg_mongo)

    # Summarize
    print("\nSummary:")
    print(f"- PostgreSQL: {'OK' if ok_pg else 'FAILED'}")
    print(f"- MongoDB: {'OK' if ok_mongo else 'FAILED'}")

    # Do not fail hard if one backend is unreachable
    return 0


if __name__ == "__main__":
    sys.exit(main())

