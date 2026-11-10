#!/usr/bin/env python3
"""One-time reset of DNA's MongoDB data.

Releases after v0.3.4 store playlist and version ids as strings instead of
integers and do not migrate older documents, so data written by v0.3.4 or
earlier no longer matches any query. This drops every collection in the DNA
database and recreates the indexes the backend expects, leaving an empty
database in the current shape.

It is a dry run unless --apply is given, and it only runs against the database
named by MONGODB_URL: there is no default, so it cannot fall back to a local
development database by accident.

Usage, through the backend image (which has the dependencies installed):
  MONGODB_URL=... make reset-mongo-data            # show what would be dropped
  MONGODB_URL=... make reset-mongo-data APPLY=1    # drop it

Or directly, from an environment with the backend requirements installed:
  MONGODB_URL=... python3 scripts/reset_mongo_data.py [--apply]
"""

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

from pymongo.errors import PyMongoError

BACKEND_DIR = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(BACKEND_DIR / "src"))

from dna.storage_providers.mongodb import MongoDBStorageProvider  # noqa: E402


def describe_target(mongo_url: str) -> str:
    """Return the host part of a MongoDB URL.

    Only text after the last "@" is used, so credentials are never included
    even when the password contains characters that should have been escaped.
    """
    after_credentials = mongo_url.partition("://")[2].rpartition("@")[2]
    return re.split(r"[/?]", after_credentials, maxsplit=1)[0]


async def reset_database(
    provider: MongoDBStorageProvider, apply: bool
) -> dict[str, int]:
    """Count the documents in every collection and, with ``apply``, drop them.

    Returns the document count per collection as found before anything was
    dropped. System collections are left alone. After dropping, the backend's
    own index definitions are applied so the database matches what the current
    release creates on startup.
    """
    db = provider.db
    names = sorted(
        name
        for name in await db.list_collection_names()
        if not name.startswith("system.")
    )
    counts = {name: await db[name].count_documents({}) for name in names}

    if apply:
        for name in names:
            await db.drop_collection(name)
        await provider.ensure_indexes()

    return counts


async def _run(mongo_url: str, apply: bool) -> None:
    provider = MongoDBStorageProvider()
    print(f"Target: {describe_target(mongo_url)} (database: {provider.db.name})")

    counts = await reset_database(provider, apply)

    for name, count in counts.items():
        print(f"  {name:<32} {count:>9} documents")
    if not counts:
        print("  (no collections)")

    if apply:
        print(f"Dropped {len(counts)} collection(s) and recreated the indexes.")
    else:
        print(
            "Dry run: nothing was changed. "
            f"Re-run with --apply to drop these {len(counts)} collection(s)."
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Drop all DNA data in MongoDB and recreate the indexes."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually drop the collections. Without this flag nothing is changed.",
    )
    args = parser.parse_args(argv)

    mongo_url = os.environ.get("MONGODB_URL")
    if not mongo_url:
        print(
            "MONGODB_URL is not set. Set it to the database you want to reset.",
            file=sys.stderr,
        )
        return 2

    try:
        asyncio.run(_run(mongo_url, args.apply))
    except PyMongoError as error:
        print(
            f"Could not reset {describe_target(mongo_url)}: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
