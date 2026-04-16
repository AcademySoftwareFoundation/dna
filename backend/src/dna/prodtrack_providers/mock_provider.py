"""Read-only mock production tracking provider backed by SQLite."""

import os
import sqlite3
from pathlib import Path
from typing import Any, Optional

THUMBNAIL_LOCAL = "__local__"

from dna.models.entity import (
    ENTITY_MODELS,
    Asset,
    EntityBase,
    Note,
    Playlist,
    Project,
    Shot,
    Task,
    User,
    Version,
)
from dna.prodtrack_providers.prodtrack_provider_base import ProdtrackProviderBase

_SG_TYPE_TO_DNA: dict[str, str] = {
    "Project": "project",
    "Shot": "shot",
    "Asset": "asset",
    "Task": "task",
    "Version": "version",
    "Playlist": "playlist",
    "Note": "note",
    "HumanUser": "user",
}


def _project_link(project_id: int) -> dict[str, Any]:
    return {"type": "Project", "id": project_id}


def _shallow_entity(
    entity_type: str, entity_id: int, name: Optional[str] = None
) -> EntityBase:
    model_class = ENTITY_MODELS.get(entity_type)
    if not model_class:
        return EntityBase(id=entity_id)
    if entity_type == "playlist":
        return model_class(id=entity_id, code=name)
    return model_class(id=entity_id, name=name)


class MockProdtrackProvider(ProdtrackProviderBase):
    """Read-only prodtrack provider backed by a pre-seeded SQLite database."""

    def __init__(
        self,
        db_path: Optional[Path] = None,
        base_url: Optional[str] = None,
    ):
        super().__init__()
        if db_path is None:
            db_path = Path(__file__).parent / "mock_data" / "mock.db"
        self._db_path = Path(db_path)
        self._base_url = (
            base_url or os.getenv("API_BASE_URL", "http://localhost:8000")
        ).rstrip("/")
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            uri = f"file:{self._db_path}?mode=ro"
            self._conn = sqlite3.connect(uri, uri=True)
            self._conn.row_factory = sqlite3.Row
        return self._conn

    def _project_from_row(self, row: sqlite3.Row) -> Project:
        return Project(id=row["id"], name=row["name"])

    def _user_from_row(self, row: sqlite3.Row) -> User:
        return User(
            id=row["id"],
            name=row["name"],
            email=row["email"],
            login=row["login"],
        )

    def _shot_from_row(
        self, row: sqlite3.Row, project_id: int, tasks: Optional[list[Task]] = None
    ) -> Shot:
        return Shot(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            project=_project_link(project_id),
            tasks=tasks or [],
        )

    def _asset_from_row(
        self, row: sqlite3.Row, project_id: int, tasks: Optional[list[Task]] = None
    ) -> Asset:
        return Asset(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            project=_project_link(project_id),
            tasks=tasks or [],
        )

    def _task_from_row(
        self, row: sqlite3.Row, project_id: int, entity: Optional[EntityBase] = None
    ) -> Task:
        step = None
        if row["pipeline_step_id"] or row["pipeline_step_name"]:
            step = {"id": row["pipeline_step_id"], "name": row["pipeline_step_name"]}
        return Task(
            id=row["id"],
            name=row["name"],
            status=row["status"],
            pipeline_step=step,
            project=_project_link(project_id),
            entity=entity,
        )

    def _note_from_row(
        self, row: sqlite3.Row, project_id: int, author: Optional[User] = None
    ) -> Note:
        return Note(
            id=row["id"],
            subject=row["subject"],
            content=row["content"],
            project=_project_link(project_id),
            note_links=[],
            author=author,
        )

    def _version_from_row(
        self,
        row: sqlite3.Row,
        project_id: int,
        entity: Optional[EntityBase] = None,
        task: Optional[Task] = None,
        notes: Optional[list[Note]] = None,
        user: Optional[User] = None,
    ) -> Version:
        thumb = row["thumbnail"]
        if thumb == THUMBNAIL_LOCAL or (thumb and "/api/mock-thumbnails/" in thumb):
            thumb = f"{self._base_url}/api/mock-thumbnails/{row['id']}"
        return Version(
            id=row["id"],
            name=row["name"],
            description=row["description"],
            status=row["status"],
            user=user,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            movie_path=row["movie_path"],
            frame_path=row["frame_path"],
            thumbnail=thumb,
            project=_project_link(project_id),
            entity=entity,
            task=task,
            notes=notes or [],
            prodtrack_detail_url=(
                f"https://mock-shotgrid.example.com/detail/Version/{row['id']}"
            ),
        )

    def _playlist_from_row(
        self,
        row: sqlite3.Row,
        project_id: int,
        versions: Optional[list[Version]] = None,
    ) -> Playlist:
        return Playlist(
            id=row["id"],
            code=row["code"],
            description=row["description"],
            project=_project_link(project_id),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            versions=versions or [],
        )

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> EntityBase:
        conn = self._get_conn()
        if entity_type == "project":
            row = conn.execute(
                "SELECT id, name FROM projects WHERE id = ?", (entity_id,)
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            return self._project_from_row(row)
        if entity_type == "user":
            row = conn.execute(
                "SELECT id, name, email, login FROM users WHERE id = ?", (entity_id,)
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            return self._user_from_row(row)
        if entity_type == "shot":
            row = conn.execute(
                "SELECT id, name, description, project_id FROM shots WHERE id = ?",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            tasks = []
            if resolve_links:
                for t in conn.execute(
                    "SELECT id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id FROM tasks WHERE entity_type = 'Shot' AND entity_id = ?",
                    (entity_id,),
                ).fetchall():
                    tasks.append(self._task_from_row(t, t["project_id"], None))
            return self._shot_from_row(row, row["project_id"], tasks)
        if entity_type == "asset":
            row = conn.execute(
                "SELECT id, name, description, project_id FROM assets WHERE id = ?",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            tasks = []
            if resolve_links:
                for t in conn.execute(
                    "SELECT id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id FROM tasks WHERE entity_type = 'Asset' AND entity_id = ?",
                    (entity_id,),
                ).fetchall():
                    tasks.append(self._task_from_row(t, t["project_id"], None))
            return self._asset_from_row(row, row["project_id"], tasks)
        if entity_type == "task":
            row = conn.execute(
                "SELECT id, name, status, pipeline_step_id, pipeline_step_name, project_id, entity_type, entity_id FROM tasks WHERE id = ?",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            entity = None
            if resolve_links and row["entity_type"] and row["entity_id"]:
                dna_type = _SG_TYPE_TO_DNA.get(row["entity_type"], "shot")
                if dna_type in ("shot", "asset"):
                    entity = self.get_entity(
                        dna_type, row["entity_id"], resolve_links=False
                    )
            return self._task_from_row(row, row["project_id"], entity)
        if entity_type == "version":
            row = conn.execute(
                """SELECT id, name, description, status, user_id, created_at, updated_at,
                   movie_path, frame_path, thumbnail, project_id, entity_type, entity_id, task_id
                   FROM versions WHERE id = ?""",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            entity = None
            task = None
            user = None
            notes = []
            if resolve_links:
                if row["entity_type"] and row["entity_id"]:
                    dna_type = _SG_TYPE_TO_DNA.get(row["entity_type"], "shot")
                    if dna_type in ("shot", "asset"):
                        entity = self.get_entity(
                            dna_type, row["entity_id"], resolve_links=False
                        )
                if row["task_id"]:
                    task = self.get_entity("task", row["task_id"], resolve_links=False)
                if row["user_id"]:
                    user = self.get_entity("user", row["user_id"], resolve_links=False)
                for n in conn.execute(
                    "SELECT nl.note_id FROM note_links nl WHERE nl.entity_type = 'Version' AND nl.entity_id = ?",
                    (entity_id,),
                ).fetchall():
                    notes.append(
                        self.get_entity("note", n["note_id"], resolve_links=False)
                    )
            return self._version_from_row(
                row, row["project_id"], entity, task, notes, user
            )
        if entity_type == "playlist":
            row = conn.execute(
                "SELECT id, code, description, project_id, created_at, updated_at FROM playlists WHERE id = ?",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            versions = []
            if resolve_links:
                for vrow in conn.execute(
                    "SELECT version_id FROM playlist_versions WHERE playlist_id = ? ORDER BY version_id",
                    (entity_id,),
                ).fetchall():
                    versions.append(
                        self.get_entity(
                            "version", vrow["version_id"], resolve_links=False
                        )
                    )
            return self._playlist_from_row(row, row["project_id"], versions)
        if entity_type == "note":
            row = conn.execute(
                "SELECT id, subject, content, project_id, author_id FROM notes WHERE id = ?",
                (entity_id,),
            ).fetchone()
            if not row:
                raise ValueError(f"Entity not found: {entity_type} {entity_id}")
            author = None
            note_links = []
            if resolve_links:
                if row["author_id"]:
                    author = self.get_entity(
                        "user", row["author_id"], resolve_links=False
                    )
                for link in conn.execute(
                    "SELECT entity_type, entity_id FROM note_links WHERE note_id = ?",
                    (entity_id,),
                ).fetchall():
                    dna_type = _SG_TYPE_TO_DNA.get(link["entity_type"])
                    if dna_type:
                        note_links.append(_shallow_entity(dna_type, link["entity_id"]))
            note = self._note_from_row(row, row["project_id"], author)
            note.note_links = note_links
            return note
        raise ValueError(f"Unknown entity type: {entity_type}")

    def add_entity(self, entity_type: str, entity: EntityBase) -> EntityBase:
        raise NotImplementedError(
            "MockProdtrackProvider is read-only. Writes (add_entity) are not supported."
        )

    def _dna_field_to_sql(self, entity_type: str, dna_field: str) -> Optional[str]:
        mapping = {
            "project": {"id": "id", "name": "name"},
            "user": {"id": "id", "name": "name", "email": "email", "login": "login"},
            "shot": {
                "id": "id",
                "name": "name",
                "description": "description",
                "project": "project_id",
            },
            "asset": {
                "id": "id",
                "name": "name",
                "description": "description",
                "project": "project_id",
            },
            "task": {
                "id": "id",
                "name": "name",
                "status": "status",
                "project": "project_id",
                "entity": "entity_id",
            },
            "version": {
                "id": "id",
                "name": "name",
                "description": "description",
                "status": "status",
                "project": "project_id",
            },
            "playlist": {
                "id": "id",
                "code": "code",
                "description": "description",
                "project": "project_id",
            },
            "note": {
                "id": "id",
                "subject": "subject",
                "content": "content",
                "project": "project_id",
            },
        }
        return mapping.get(entity_type, {}).get(dna_field)

    def _build_where(
        self, entity_type: str, filters: list[dict]
    ) -> tuple[str, list[Any]]:
        conditions = []
        params: list[Any] = []
        for f in filters:
            field = f.get("field")
            operator = f.get("operator", "is")
            value = f.get("value")
            if isinstance(value, dict) and "id" in value:
                value = value["id"]
            sql_col = self._dna_field_to_sql(entity_type, field)
            if sql_col is None:
                raise ValueError(
                    f"Unknown field '{field}' for entity type '{entity_type}'"
                )
            if operator == "is":
                conditions.append(f"{sql_col} = ?")
                params.append(value)
            elif operator == "in":
                ids = [
                    v["id"] if isinstance(v, dict) and "id" in v else v for v in value
                ]
                placeholders = ",".join("?" * len(ids))
                conditions.append(f"{sql_col} IN ({placeholders})")
                params.extend(ids)
            elif operator == "contains":
                conditions.append(f"{sql_col} LIKE ?")
                params.append(f"%{value}%")
            else:
                raise ValueError(f"Unsupported filter operator: {operator}")
        where = " AND ".join(conditions) if conditions else "1=1"
        return where, params

    def _table_for_entity_type(self, entity_type: str) -> str:
        return f"{entity_type}s"

    def find(
        self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0
    ) -> list[EntityBase]:
        conn = self._get_conn()
        table = self._table_for_entity_type(entity_type)
        where, params = self._build_where(entity_type, filters)
        limit_clause = f" LIMIT {limit}" if limit > 0 else ""
        rows = conn.execute(
            f"SELECT * FROM {table} WHERE {where}{limit_clause}", params
        ).fetchall()
        return [
            self.get_entity(entity_type, row["id"], resolve_links=False) for row in rows
        ]

    def search(
        self,
        query: str,
        entity_types: list[str],
        project_id: int | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        conn = self._get_conn()
        results: list[dict[str, Any]] = []
        name_col = "name"
        for entity_type in entity_types:
            if entity_type == "user":
                rows = conn.execute(
                    "SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? LIMIT ?",
                    (f"%{query}%", f"%{query}%", limit),
                ).fetchall()
                for row in rows:
                    results.append(
                        {
                            "type": "User",
                            "id": row["id"],
                            "name": row["name"],
                            "email": row["email"],
                        }
                    )
            elif entity_type == "shot":
                sql = "SELECT id, name, description, project_id FROM shots WHERE name LIKE ?"
                params: list[Any] = [f"%{query}%"]
                if project_id is not None:
                    sql += " AND project_id = ?"
                    params.append(project_id)
                sql += " LIMIT ?"
                params.append(limit)
                rows = conn.execute(sql, params).fetchall()
                for row in rows:
                    results.append(
                        {
                            "type": "Shot",
                            "id": row["id"],
                            "name": row["name"],
                            "description": row["description"],
                            "project": {"type": "Project", "id": row["project_id"]},
                        }
                    )
            elif entity_type == "asset":
                sql = "SELECT id, name, description, project_id FROM assets WHERE name LIKE ?"
                params = [f"%{query}%"]
                if project_id is not None:
                    sql += " AND project_id = ?"
                    params.append(project_id)
                sql += " LIMIT ?"
                params.append(limit)
                rows = conn.execute(sql, params).fetchall()
                for row in rows:
                    results.append(
                        {
                            "type": "Asset",
                            "id": row["id"],
                            "name": row["name"],
                            "description": row["description"],
                            "project": {"type": "Project", "id": row["project_id"]},
                        }
                    )
            elif entity_type == "version":
                sql = "SELECT id, name, description, project_id FROM versions WHERE name LIKE ?"
                params = [f"%{query}%"]
                if project_id is not None:
                    sql += " AND project_id = ?"
                    params.append(project_id)
                sql += " LIMIT ?"
                params.append(limit)
                rows = conn.execute(sql, params).fetchall()
                for row in rows:
                    results.append(
                        {
                            "type": "Version",
                            "id": row["id"],
                            "name": row["name"],
                            "description": row["description"],
                            "project": {"type": "Project", "id": row["project_id"]},
                        }
                    )
            else:
                pass
        return results

    def get_user_by_email(self, user_email: str) -> User:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT id, name, email, login FROM users WHERE email = ?",
            (user_email,),
        ).fetchone()
        if not row:
            return User(
                id=-1,
                name=user_email,
                email=user_email,
                login=user_email,
            )
        return self._user_from_row(row)

    def get_projects_for_user(self, user_email: str) -> list[Project]:
        conn = self._get_conn()
        rows = conn.execute("SELECT id, name FROM projects").fetchall()
        return [self._project_from_row(r) for r in rows]

    def get_playlists_for_project(self, project_id: int) -> list[Playlist]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT id, code, description, project_id, created_at, updated_at FROM playlists WHERE project_id = ?",
            (project_id,),
        ).fetchall()
        return [self._playlist_from_row(r, r["project_id"]) for r in rows]

    def get_versions_for_playlist(self, playlist_id: int) -> list[Version]:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT id FROM playlists WHERE id = ?", (playlist_id,)
        ).fetchone()
        if not row:
            return []
        version_ids = [
            r["version_id"]
            for r in conn.execute(
                "SELECT version_id FROM playlist_versions WHERE playlist_id = ? ORDER BY version_id",
                (playlist_id,),
            ).fetchall()
        ]
        if not version_ids:
            return []
        versions = []
        for vid in version_ids:
            versions.append(self.get_entity("version", vid, resolve_links=True))
        return versions

    def get_version_statuses(
        self, project_id: int | None = None
    ) -> list[dict[str, str]]:
        conn = self._get_conn()
        if project_id is not None:
            rows = conn.execute(
                "SELECT code, name FROM version_statuses WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT code, name FROM version_statuses").fetchall()
        seen: set[str] = set()
        out = []
        for row in rows:
            if row["code"] not in seen:
                seen.add(row["code"])
                out.append({"code": row["code"], "name": row["name"]})
        return out

    def publish_note(
        self,
        version_id: int,
        content: str,
        subject: str,
        to_users: list[int],
        cc_users: list[int],
        links: list[EntityBase],
        author_email: Optional[str] = None,
        version_status: Optional[str] = None,
    ) -> int:
        raise NotImplementedError(
            "MockProdtrackProvider is read-only. publish_note is not supported."
        )

    def update_version_status(self, version_id: int, status: str) -> bool:
        return True

    def attach_file_to_note(
        self, note_id: int, file_path: str, display_name: str
    ) -> bool:
        return True
