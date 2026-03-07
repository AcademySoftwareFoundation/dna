"""
Seed the mock SQLite database from a real ShotGrid project.

Usage:
    python -m dna.prodtrack_providers.mock_data.seed_db \\
        --project-id 123 \\
        --url https://yoursite.shotgrid.autodesk.com \\
        --script-name YourScript \\
        --api-key YOUR_API_KEY

Output: overwrites mock_data/mock.db with extracted entities.
Thumbnails are downloaded to mock_data/thumbnails/ and stored as __local__;
they are served at /api/mock-thumbnails/{version_id}. Use --skip-thumbnails
to skip downloads (faster seed, no local thumbnails).
"""

import argparse
import logging
import sqlite3
import sys
import urllib.request
from pathlib import Path

LOG = logging.getLogger(__name__)

THUMBNAIL_SENTINEL = "__local__"


def _link_id(link) -> int | None:
    if isinstance(link, dict) and "id" in link:
        return link["id"]
    return None


def _link_type(link) -> str | None:
    if isinstance(link, dict) and "type" in link:
        return link["type"]
    return None


def _link_name(link) -> str | None:
    if isinstance(link, dict) and "name" in link:
        return link["name"]
    return None


def _serialize_dt(val):
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _sg_type_to_entity_type(sg_type: str) -> str | None:
    mapping = {
        "Project": "project",
        "Shot": "shot",
        "Asset": "asset",
        "Task": "task",
        "Version": "version",
        "Playlist": "playlist",
        "Note": "note",
        "HumanUser": "user",
    }
    return mapping.get(sg_type)


def _download_thumbnail(url: str, version_id: int, thumbnails_dir: Path) -> str | None:
    """Download image from url and save under thumbnails_dir/{version_id}.{ext}. Returns THUMBNAIL_SENTINEL on success, None on failure."""
    if not url or not isinstance(url, str):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "DNA-seed/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content_type = (
                resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
            )
            ext = ".jpg"
            if "png" in content_type:
                ext = ".png"
            elif "gif" in content_type:
                ext = ".gif"
            elif "webp" in content_type:
                ext = ".webp"
            path = thumbnails_dir / f"{version_id}{ext}"
            path.write_bytes(resp.read())
            return THUMBNAIL_SENTINEL
    except Exception as e:
        LOG.warning("Thumbnail download failed for version %s: %s", version_id, e)
        return None


def create_schema(conn: sqlite3.Connection) -> None:
    schema_path = Path(__file__).parent / "schema.sql"
    conn.executescript(schema_path.read_text())
    conn.execute("DELETE FROM version_statuses")
    conn.execute("DELETE FROM note_links")
    conn.execute("DELETE FROM notes")
    conn.execute("DELETE FROM playlist_versions")
    conn.execute("DELETE FROM playlists")
    conn.execute("DELETE FROM versions")
    conn.execute("DELETE FROM tasks")
    conn.execute("DELETE FROM assets")
    conn.execute("DELETE FROM shots")
    conn.execute("DELETE FROM project_users")
    conn.execute("DELETE FROM users")
    conn.execute("DELETE FROM projects")
    conn.commit()


def extract_and_seed(
    project_id: int,
    url: str,
    script_name: str,
    api_key: str,
    db_path: Path,
    skip_thumbnails: bool = False,
) -> dict[str, int]:
    from shotgun_api3 import Shotgun

    sg = Shotgun(url, script_name, api_key)
    project_ref = {"type": "Project", "id": project_id}

    project = sg.find_one(
        "Project",
        [["id", "is", project_id]],
        ["id", "name", "users"],
    )
    if not project:
        raise ValueError(f"Project {project_id} not found")

    conn = sqlite3.connect(db_path)
    create_schema(conn)
    counts: dict[str, int] = {}

    conn.execute(
        "INSERT INTO projects (id, name) VALUES (?, ?)",
        (project["id"], project.get("name") or ""),
    )
    counts["projects"] = 1

    project_user_ids = set()
    sg_users = sg.find(
        "HumanUser",
        [["projects", "is", project_ref]],
        ["id", "name", "email", "login"],
    )
    for u in sg_users:
        project_user_ids.add(u["id"])
        conn.execute(
            "INSERT OR REPLACE INTO users (id, name, email, login) VALUES (?, ?, ?, ?)",
            (
                u["id"],
                u.get("name") or "",
                u.get("email") or "",
                u.get("login") or "",
            ),
        )
        conn.execute(
            "INSERT OR IGNORE INTO project_users (project_id, user_id) VALUES (?, ?)",
            (project_id, u["id"]),
        )

    extra_user_ids: set[int] = set()

    for row in sg.find(
        "Shot",
        [["project", "is", project_ref]],
        ["id", "code", "description", "project"],
    ):
        conn.execute(
            "INSERT INTO shots (id, name, description, project_id) VALUES (?, ?, ?, ?)",
            (
                row["id"],
                row.get("code") or "",
                row.get("description") or "",
                project_id,
            ),
        )
    counts["shots"] = conn.execute("SELECT COUNT(*) FROM shots").fetchone()[0]

    for row in sg.find(
        "Asset",
        [["project", "is", project_ref]],
        ["id", "code", "description", "project"],
    ):
        conn.execute(
            "INSERT INTO assets (id, name, description, project_id) VALUES (?, ?, ?, ?)",
            (
                row["id"],
                row.get("code") or "",
                row.get("description") or "",
                project_id,
            ),
        )
    counts["assets"] = conn.execute("SELECT COUNT(*) FROM assets").fetchone()[0]

    for row in sg.find(
        "Task",
        [["project", "is", project_ref]],
        ["id", "content", "sg_status_list", "step", "entity", "project"],
    ):
        step = row.get("step")
        entity = row.get("entity")
        conn.execute(
            """INSERT INTO tasks (id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["id"],
                row.get("content") or "",
                row.get("sg_status_list") or "",
                _link_id(step),
                _link_name(step),
                project_id,
                _link_type(entity) if entity else None,
                _link_id(entity),
            ),
        )
    counts["tasks"] = conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]

    version_fields = [
        "id",
        "code",
        "description",
        "sg_status_list",
        "user",
        "created_at",
        "updated_at",
        "sg_path_to_movie",
        "sg_path_to_frames",
        "image",
        "project",
        "entity",
        "sg_task",
    ]
    thumbnails_dir = db_path.parent / "thumbnails"
    if not skip_thumbnails:
        thumbnails_dir.mkdir(parents=True, exist_ok=True)
    for row in sg.find("Version", [["project", "is", project_ref]], version_fields):
        user_id = _link_id(row.get("user"))
        if user_id:
            extra_user_ids.add(user_id)
        entity = row.get("entity")
        task_id = _link_id(row.get("sg_task"))
        thumb = row.get("image")
        if isinstance(thumb, dict):
            thumb = thumb.get("url") or thumb.get("name")
        thumb_url = thumb if isinstance(thumb, str) else None
        if skip_thumbnails:
            thumbnail_value = thumb_url
        elif thumb_url:
            thumbnail_value = _download_thumbnail(thumb_url, row["id"], thumbnails_dir)
            if thumbnail_value is None:
                thumbnail_value = thumb_url
        else:
            thumbnail_value = None
        conn.execute(
            """INSERT INTO versions (id, name, description, status, user_id, created_at, updated_at,
               movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                row["id"],
                row.get("code") or "",
                row.get("description") or "",
                row.get("sg_status_list") or "",
                user_id,
                _serialize_dt(row.get("created_at")),
                _serialize_dt(row.get("updated_at")),
                row.get("sg_path_to_movie"),
                row.get("sg_path_to_frames"),
                thumbnail_value,
                project_id,
                _link_type(entity) if entity else None,
                _link_id(entity),
                task_id,
            ),
        )
    counts["versions"] = conn.execute("SELECT COUNT(*) FROM versions").fetchone()[0]

    for row in sg.find(
        "Playlist",
        [["project", "is", project_ref]],
        [
            "id",
            "code",
            "description",
            "project",
            "created_at",
            "updated_at",
            "versions",
        ],
    ):
        conn.execute(
            """INSERT INTO playlists (id, code, description, project_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                row["id"],
                row.get("code") or "",
                row.get("description") or "",
                project_id,
                _serialize_dt(row.get("created_at")),
                _serialize_dt(row.get("updated_at")),
            ),
        )
        for v in row.get("versions") or []:
            vid = _link_id(v)
            if vid:
                conn.execute(
                    "INSERT OR IGNORE INTO playlist_versions (playlist_id, version_id) VALUES (?, ?)",
                    (row["id"], vid),
                )
    counts["playlists"] = conn.execute("SELECT COUNT(*) FROM playlists").fetchone()[0]

    for row in sg.find(
        "Note",
        [["project", "is", project_ref]],
        ["id", "subject", "content", "project", "note_links", "created_by"],
    ):
        author = row.get("created_by")
        author_id = _link_id(author) if author else None
        if author_id:
            extra_user_ids.add(author_id)
        conn.execute(
            "INSERT INTO notes (id, subject, content, project_id, author_id) VALUES (?, ?, ?, ?, ?)",
            (
                row["id"],
                row.get("subject") or "",
                row.get("content") or "",
                project_id,
                author_id,
            ),
        )
        for link in row.get("note_links") or []:
            if isinstance(link, dict) and link.get("type") and link.get("id"):
                conn.execute(
                    "INSERT OR IGNORE INTO note_links (note_id, entity_type, entity_id) VALUES (?, ?, ?)",
                    (row["id"], link["type"], link["id"]),
                )
    counts["notes"] = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]

    need_user_ids = extra_user_ids - project_user_ids
    if need_user_ids:
        for u in sg.find(
            "HumanUser",
            [["id", "in", list(need_user_ids)]],
            ["id", "name", "email", "login"],
        ):
            conn.execute(
                "INSERT OR REPLACE INTO users (id, name, email, login) VALUES (?, ?, ?, ?)",
                (
                    u["id"],
                    u.get("name") or "",
                    u.get("email") or "",
                    u.get("login") or "",
                ),
            )

    counts["users"] = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    project_entity = {"type": "Project", "id": project_id}
    schema = sg.schema_field_read("Version", "sg_status_list", project_entity)
    if schema and "sg_status_list" in schema:
        props = schema["sg_status_list"].get("properties", {})
        valid = props.get("valid_values", {}).get("value", [])
        display = props.get("display_values", {}).get("value", {})
        for code in valid:
            conn.execute(
                "INSERT INTO version_statuses (code, name, project_id) VALUES (?, ?, ?)",
                (code, display.get(code, code), project_id),
            )
    counts["version_statuses"] = conn.execute(
        "SELECT COUNT(*) FROM version_statuses"
    ).fetchone()[0]

    conn.commit()
    conn.close()
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed mock SQLite DB from a ShotGrid project.",
    )
    parser.add_argument("--project-id", type=int, help="ShotGrid project ID")
    parser.add_argument("--url", help="ShotGrid site URL")
    parser.add_argument("--script-name", help="ShotGrid API script name")
    parser.add_argument("--api-key", help="ShotGrid API key")
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output DB path (default: mock_data/mock.db next to this script)",
    )
    parser.add_argument(
        "--schema-only",
        action="store_true",
        help="Only create the schema (empty DB); do not connect to ShotGrid.",
    )
    parser.add_argument(
        "--skip-thumbnails",
        action="store_true",
        help="Do not download thumbnails (faster seed; thumbnails will not work after URL expiry).",
    )
    args = parser.parse_args()

    db_path = args.output or (Path(__file__).parent / "mock.db")
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.schema_only:
        conn = sqlite3.connect(db_path)
        create_schema(conn)
        conn.close()
        print(f"Created empty schema at {db_path}")
        return 0

    if not all([args.project_id, args.url, args.script_name, args.api_key]):
        parser.error(
            "--project-id, --url, --script-name, and --api-key are required unless --schema-only is set"
        )
    try:
        counts = extract_and_seed(
            args.project_id,
            args.url,
            args.script_name,
            args.api_key,
            db_path,
            skip_thumbnails=args.skip_thumbnails,
        )
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    print(f"Wrote {db_path}")
    for entity, count in sorted(counts.items()):
        print(f"  {entity}: {count}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
