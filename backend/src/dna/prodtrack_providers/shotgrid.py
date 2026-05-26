"""ShotGrid production tracking provider implementation.

Authentication modes
--------------------
**User-token mode** (``user_token`` provided — production):
    Opens ``Shotgun(url, session_token=user_token)``.  ShotGrid natively
    enforces that user's project permissions on every API call.  The
    connection is retrieved from ``ShotGridConnectionPool`` — no new TCP
    handshake per request.

**Script-auth mode** (``user_token`` is None — dev / background jobs):
    Uses ``SHOTGRID_SCRIPT_NAME`` + ``SHOTGRID_API_KEY`` credentials.
    Never use for user-facing requests in production.

Connection pool
---------------
When ``user_token`` and ``session_id`` are both provided, the provider
uses ``ShotGridConnectionPool.get()`` instead of constructing a new
``Shotgun()`` instance.  This is the fast path for all authenticated
user requests.
"""

import contextlib
import os
from datetime import date
from typing import Any, Optional, cast

from shotgun_api3 import Shotgun

from dna.models.entity import (
    ENTITY_MODELS,
    EntityBase,
    Playlist,
    Project,
    User,
    Version,
)
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    UserNotFoundError,
)

FIELD_MAPPING = {
    "project": {
        "entity_id": "Project",
        "fields": {"id": "id", "name": "name"},
        "linked_fields": {},
    },
    "shot": {
        "entity_id": "Shot",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "project": "project",
        },
        "linked_fields": {"tasks": "tasks"},
    },
    "asset": {
        "entity_id": "Asset",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "project": "project",
        },
        "linked_fields": {"tasks": "tasks"},
    },
    "note": {
        "entity_id": "Note",
        "fields": {
            "id": "id",
            "subject": "subject",
            "content": "content",
            "project": "project",
        },
        "linked_fields": {"note_links": "note_links", "created_by": "author"},
    },
    "task": {
        "entity_id": "Task",
        "fields": {
            "id": "id",
            "sg_status_list": "status",
            "step": "pipeline_step",
            "content": "name",
            "project": "project",
        },
        "linked_fields": {"entity": "entity"},
    },
    "version": {
        "entity_id": "Version",
        "fields": {
            "id": "id",
            "code": "name",
            "description": "description",
            "sg_status_list": "status",
            "user": "user",
            "created_at": "created_at",
            "updated_at": "updated_at",
            "sg_path_to_movie": "movie_path",
            "sg_path_to_frames": "frame_path",
            "project": "project",
            "image": "thumbnail",
        },
        "linked_fields": {"entity": "entity", "sg_task": "task", "notes": "notes"},
    },
    "playlist": {
        "entity_id": "Playlist",
        "fields": {
            "id": "id",
            "code": "code",
            "description": "description",
            "project": "project",
            "created_at": "created_at",
            "updated_at": "updated_at",
        },
        "linked_fields": {"versions": "versions"},
    },
    "user": {
        "entity_id": "HumanUser",
        "fields": {
            "id": "id",
            "name": "name",
            "email": "email",
            "login": "login",
        },
        "linked_fields": {},
    },
}


class ShotgridProvider(ProdtrackProviderBase):
    """ShotGrid provider for production tracking operations."""

    def __init__(
        self,
        url: Optional[str] = None,
        script_name: Optional[str] = None,
        api_key: Optional[str] = None,
        sudo_user: Optional[str] = None,
        connect: bool = True,
        user_token: Optional[str] = None,
        session_id: Optional[str] = None,
        login=None,
        password=None, 
    ):
        """Initialize the ShotGrid connection.

        Args:
            url:          ShotGrid server URL. Defaults to SHOTGRID_URL.
            script_name:  API script name. Defaults to SHOTGRID_SCRIPT_NAME.
            api_key:      API key. Defaults to SHOTGRID_API_KEY.
            sudo_user:    Sudo user login (script-auth only).
            connect:      Whether to connect immediately (script-auth only).
            user_token:   ShotGrid session token for the authenticated user.
                          Takes priority over script credentials.
            session_id:   The user's session ID from the DNA JWT.
                          When provided alongside user_token, connections are
                          retrieved from the pool instead of created fresh.
        """
        super().__init__()

        self.url: str = (url or os.getenv("SHOTGRID_URL") or "").rstrip("/")
        self._sudo_connection: Optional[Shotgun] = None

        if not self.url:
            raise ValueError("SHOTGRID_URL is required.")

        # ── User-token mode (production) ──────────────────────────────── #
        if user_token:
            # user_token is not used for connection — sudo_user is set instead
            # This branch is no longer reached after prodtrack_provider_base change
            pass

        if login and password:
            self.user_token = None
            self.session_id = session_id
            self.script_name = None
            self.api_key = None
            self.sudo_user = None
            self.sg = Shotgun(self.url, login=login, password=password)
            return

        # ── Script-auth mode (background jobs / dev) ──────────────────── #
        self.user_token = None
        self.session_id = None
        self.script_name = script_name or os.getenv("SHOTGRID_SCRIPT_NAME")
        self.api_key = api_key or os.getenv("SHOTGRID_API_KEY")
        self.sudo_user = sudo_user or os.getenv("SHOTGRID_SUDO_USER")

        if not all([self.script_name, self.api_key]):
            raise ValueError(
                "ShotGrid script credentials not provided. Set SHOTGRID_SCRIPT_NAME "
                "and SHOTGRID_API_KEY, or pass user_token for user-scoped auth."
            )

        self.sg: Optional[Shotgun] = None
        if connect:
            self.connect()

    def _get_connection(
        self, user_token: str, session_id: Optional[str]
    ) -> Shotgun:
        """Get a SG connection from the pool (if session_id given) or create fresh."""
        if session_id:
            try:
                from dna.auth.connection_pool import get_connection_pool
                return get_connection_pool().get(
                    session_id=session_id, sg_token=user_token
                )
            except Exception:
                pass  # Pool unavailable — fall through to direct connection
        # Direct connection fallback (no session_id, or pool error)
        return Shotgun(self.url, session_token=user_token)

    def connect(self, sudo_user: Optional[str] = None) -> None:
        """Connect using script credentials."""
        self.sg = Shotgun(
            self.url,
            self.script_name,
            self.api_key,
            sudo_as_login=sudo_user or self.sudo_user,
        )

    def set_sudo_user(self, sudo_user: str) -> None:
        """Set sudo user and re-connect (script-auth only)."""
        self.sudo_user = sudo_user
        self.connect()

    @contextlib.contextmanager
    def sudo(self, user_login: str):
        """Context manager to perform actions as a specific user.

        In user-token mode: the connection IS already the authenticated user,
        so ShotGrid will record the correct author automatically.  The sudo
        context is a no-op in this mode.

        In script-auth mode: creates a temporary sudo connection.
        """
        if self.user_token:
            # User-token mode: SG enforces identity natively — no sudo needed.
            yield
            return

        # Script-auth mode: create a temporary sudo connection.
        original = self._sudo_connection
        try:
            self._sudo_connection = Shotgun(
                self.url,
                self.script_name,
                self.api_key,
                sudo_as_login=user_login,
            )
            yield
        finally:
            self._sudo_connection = original

    @property
    def _sg(self) -> Shotgun:
        """Return the active ShotGrid connection (sudo override or main)."""
        return self._sudo_connection or self.sg

    # ── Entity conversion ─────────────────────────────────────────────── #

    def _convert_sg_entity_to_dna_entity(
        self,
        sg_entity: dict,
        entity_mapping: Optional[dict] = None,
        entity_type: Optional[str] = None,
        resolve_links: bool = True,
    ) -> EntityBase:
        if entity_mapping is None:
            entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"No field mapping for entity type: {entity_type}")

        linked_fields_map = entity_mapping.get("linked_fields", {})
        entity_data: dict = {}

        for sg_name, dna_name in entity_mapping["fields"].items():
            entity_data[dna_name] = sg_entity.get(sg_name)

        for sg_field_name, dna_field_name in linked_fields_map.items():
            linked_data = sg_entity.get(sg_field_name)
            entity_data[dna_field_name] = (
                self._resolve_linked_field(linked_data)
                if resolve_links
                else self._convert_shallow_link(linked_data)
            )

        model_class = ENTITY_MODELS[entity_type]
        return model_class(**entity_data)

    def _convert_shallow_link(self, data):
        if data is None:
            return None
        if isinstance(data, dict):
            return self._create_shallow_entity(data)
        elif isinstance(data, list):
            return [self._create_shallow_entity(item) for item in data if item]
        return None

    def _create_shallow_entity(self, sg_link: dict) -> EntityBase:
        sg_type = sg_link.get("type")
        entity_id = sg_link.get("id")
        name = sg_link.get("name")
        dna_type = _get_dna_entity_type(sg_type)
        model_class = ENTITY_MODELS[dna_type]
        if dna_type == "playlist":
            return model_class(id=entity_id, code=name)
        return model_class(id=entity_id, name=name)

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> EntityBase:
        """
        Get an entity by its ID.

        Using the field mapping, we get the entity from ShotGrid and then
        create the Pydantic entity object.

        Args:
            entity_type: The type of entity to fetch
            entity_id: The ID of the entity
            resolve_links: If True, recursively fetch linked entities.
                If False, only include shallow links with id/name.
        """
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        # Get the field mapping for this entity type
        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unknown entity type: {entity_type}")

        # Compose all field names from fields and linked fields
        fields = list(entity_mapping["fields"].keys())
        linked_fields_map = entity_mapping.get("linked_fields", {})
        linked_field_sg_names = list(linked_fields_map.keys())
        all_field_names = list(set(fields + linked_field_sg_names))

        # Query entity from ShotGrid
        sg_entity = self._sg.find_one(
            entity_mapping["entity_id"],
            filters=[["id", "is", entity_id]],
            fields=all_field_names,
        )

        if not sg_entity:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")

        entity = self._convert_sg_entity_to_dna_entity(
            sg_entity, entity_mapping, entity_type, resolve_links=resolve_links
        )
        if entity_type == "version":
            version = cast(Version, entity)
            base = (self.url or "").rstrip("/")
            if base:
                version.prodtrack_detail_url = f"{base}/detail/Version/{version.id}"
        return entity

    def _resolve_linked_field(self, data):
        if isinstance(data, dict):
            dna_type = _get_dna_entity_type(data["type"])
            return self.get_entity(dna_type, data["id"], resolve_links=False)
        elif isinstance(data, list):
            return [
                self.get_entity(
                    _get_dna_entity_type(item["type"]), item["id"], resolve_links=False
                )
                for item in data
            ]
        return None

    def _convert_entities_to_sg_links(self, entities):
        if isinstance(entities, EntityBase):
            return {"type": entities.__class__.__name__, "id": entities.id}
        elif isinstance(entities, list):
            return [
                {"type": e.__class__.__name__, "id": e.id}
                for e in entities
                if isinstance(e, EntityBase)
            ]
        return None

    # ── CRUD ──────────────────────────────────────────────────────────── #

    def get_entity(
        self, entity_type: str, entity_id: int, resolve_links: bool = True
    ) -> EntityBase:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unknown entity type: {entity_type}")
        fields = list(entity_mapping["fields"].keys())
        linked_field_sg_names = list(entity_mapping.get("linked_fields", {}).keys())
        all_fields = list(set(fields + linked_field_sg_names))
        sg_entity = self._sg.find_one(
            entity_mapping["entity_id"],
            filters=[["id", "is", entity_id]],
            fields=all_fields,
        )
        if not sg_entity:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")
        return self._convert_sg_entity_to_dna_entity(
            sg_entity, entity_mapping, entity_type, resolve_links=resolve_links
        )

    def add_entity(self, entity_type: str, entity: EntityBase) -> EntityBase:
        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unknown entity type: {entity_type}")
        sg_entity_data = {}
        for sg_field_name, dna_field_name in entity_mapping["fields"].items():
            if sg_field_name == "id":
                continue
            value = entity.model_dump().get(dna_field_name)
            if value is not None:
                sg_entity_data[sg_field_name] = value
        linked_fields_to_preserve = {}
        for sg_field_name, dna_field_name in entity_mapping.get("linked_fields", {}).items():
            linked_entities = getattr(entity, dna_field_name, None)
            if linked_entities is None:
                continue
            linked_fields_to_preserve[dna_field_name] = linked_entities
            sg_linked = self._convert_entities_to_sg_links(linked_entities)
            if sg_linked:
                sg_entity_data[sg_field_name] = sg_linked
        result = self._sg.create(entity_mapping["entity_id"], sg_entity_data)
        created_entity = self._convert_sg_entity_to_dna_entity(
            result, entity_mapping, entity_type, resolve_links=False
        )
        for dna_field_name, linked_entities in linked_fields_to_preserve.items():
            setattr(created_entity, dna_field_name, linked_entities)
        return created_entity

    def find(
        self, entity_type: str, filters: list[dict[str, Any]], limit: int = 0
    ) -> list[EntityBase]:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        entity_mapping = FIELD_MAPPING.get(entity_type)
        if entity_mapping is None:
            raise ValueError(f"Unsupported entity type: {entity_type}")
        dna_to_sg = {v: k for k, v in entity_mapping["fields"].items()}
        dna_to_sg.update(
            {v: k for k, v in entity_mapping.get("linked_fields", {}).items()}
        )
        sg_filters = []
        for f in filters:
            sg_field = dna_to_sg.get(f.get("field"))
            if sg_field is None:
                raise ValueError(f"Unknown field '{f.get('field')}' for '{entity_type}'")
            sg_filters.append([sg_field, f.get("operator"), f.get("value")])
        sg_fields = list(entity_mapping["fields"].keys()) + list(
            entity_mapping.get("linked_fields", {}).keys()
        )
        sg_results = self._sg.find(
            entity_mapping["entity_id"],
            filters=sg_filters,
            fields=sg_fields,
            limit=limit,
        )
        return [
            self._convert_sg_entity_to_dna_entity(r, entity_mapping, entity_type)
            for r in sg_results
        ]

    def search(
        self,
        query: str,
        entity_types: list[str],
        project_id: int | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")
        results = []
        for entity_type in entity_types:
            entity_mapping = FIELD_MAPPING.get(entity_type)
            if entity_mapping is None:
                raise ValueError(f"Unsupported entity type: {entity_type}")
            sg_entity_type = entity_mapping["entity_id"]
            fields_mapping = entity_mapping["fields"]
            name_sg_field = next(
                (sg for sg, dna in fields_mapping.items() if dna == "name"), None
            )
            if name_sg_field is None:
                continue
            sg_fields = ["id", name_sg_field]
            if entity_type == "user":
                sg_fields.append("email")
            else:
                if "description" in fields_mapping:
                    sg_fields.append("description")
                if "project" in fields_mapping:
                    sg_fields.append("project")
            q = (query or "").strip()
            sg_filters: list = []
            if q:
                sg_filters.append([name_sg_field, "contains", q])
            if entity_type != "user" and project_id is not None:
                sg_filters.append(
                    ["project", "is", {"type": "Project", "id": project_id}]
                )
            sg_results = self.sg.find(
                sg_entity_type, filters=sg_filters, fields=sg_fields, limit=limit
            )
            model_class = ENTITY_MODELS.get(entity_type)
            dna_type = model_class.__name__ if model_class else entity_type.capitalize()
            for sg_entity in sg_results:
                result = {
                    "type": dna_type,
                    "id": sg_entity.get("id"),
                    "name": sg_entity.get(name_sg_field),
                }
                if entity_type == "user":
                    result["email"] = sg_entity.get("email")
                else:
                    if "description" in sg_entity:
                        result["description"] = sg_entity.get("description")
                    project_data = sg_entity.get("project")
                    if project_data:
                        result["project"] = {
                            "type": project_data.get("type"),
                            "id": project_data.get("id"),
                        }
                results.append(result)
        return results

    def get_user_by_email(self, user_email: str) -> User:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        sg_user = self._sg.find_one(
            "HumanUser",
            filters=[["email", "is", user_email]],
            fields=["id", "name", "email", "login"],
        )
        if not sg_user:
            raise ValueError(f"User not found: {user_email}")
        return self._convert_sg_entity_to_dna_entity(
            sg_user, FIELD_MAPPING["user"], "user", resolve_links=False
        )

    def get_projects_for_user(self, user_email: str) -> list[Project]:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        user = self._sg.find_one(
            "HumanUser",
            filters=[["email", "is", user_email]],
            fields=["id", "email", "name"],
        )
        if not user:
            raise ValueError(f"User not found: {user_email}")
        sg_projects = self._sg.find(
            "Project",
            filters=[["users", "is", user]],
            fields=["id", "name"],
        )
        return [
            self._convert_sg_entity_to_dna_entity(
                p, FIELD_MAPPING["project"], "project", resolve_links=False
            )
            for p in sg_projects
        ]

    def get_playlists_for_project(self, project_id: int) -> list[Playlist]:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        sg_playlists = self._sg.find(
            "Playlist",
            filters=[["project", "is", {"type": "Project", "id": project_id}]],
            fields=["id", "code", "description", "project", "created_at", "updated_at"],
        )
        return [
            self._convert_sg_entity_to_dna_entity(
                p, FIELD_MAPPING["playlist"], "playlist", resolve_links=False
            )
            for p in sg_playlists
        ]

    def get_versions_for_playlist(self, playlist_id: int) -> list[Version]:
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        sg_playlist = self._sg.find_one(
            "Playlist", filters=[["id", "is", playlist_id]], fields=["versions"]
        )
        if not sg_playlist or not sg_playlist.get("versions"):
            return []
        version_ids = [v["id"] for v in sg_playlist["versions"]]
        entity_mapping = FIELD_MAPPING["version"]
        version_fields = list(entity_mapping["fields"].keys()) + list(
            entity_mapping["linked_fields"].keys()
        )
        sg_versions = self._sg.find(
            "Version",
            filters=[["id", "in", version_ids]],
            fields=version_fields,
        )
        task_ids = list(
            {
                v["sg_task"]["id"]
                for v in sg_versions
                if v.get("sg_task") and v["sg_task"].get("id")
            }
        )
        tasks_by_id: dict[int, dict] = {}
        if task_ids:
            task_fields = list(FIELD_MAPPING["task"]["fields"].keys())
            for sg_task in self._sg.find(
                "Task", filters=[["id", "in", task_ids]], fields=task_fields
            ):
                tasks_by_id[sg_task["id"]] = sg_task

        sg_notes = self._sg.find(
            "Note",
            filters=[["note_links", "is", {"type": "Playlist", "id": playlist_id}]],
            fields=[
                "id", "subject", "content", "note_links",
                "created_by", "created_by.HumanUser.email", "created_at",
            ],
        )
        notes_by_version_id: dict[int, list] = {}
        note_mapping = FIELD_MAPPING["note"]
        for sg_note in sg_notes:
            dna_note = self._convert_sg_entity_to_dna_entity(
                sg_note, note_mapping, "note", resolve_links=False
            )
            if sg_note.get("created_by") and sg_note["created_by"].get("type") == "HumanUser":
                email = sg_note.get("created_by.HumanUser.email")
                if email and dna_note.author:
                    dna_note.author.email = email
            links = sg_note.get("note_links", [])
            linked_vids = (
                [l["id"] for l in links if l["type"] == "Version"]
                if isinstance(links, list)
                else ([links["id"]] if isinstance(links, dict) and links["type"] == "Version" else [])
            )
            for vid in linked_vids:
                if vid in version_ids:
                    notes_by_version_id.setdefault(vid, []).append(dna_note)

        versions = []
        for sg_version in sg_versions:
            version = self._convert_sg_entity_to_dna_entity(
                sg_version, entity_mapping, "version", resolve_links=False
            )
            if sg_version.get("sg_task") and sg_version["sg_task"].get("id"):
                task_id = sg_version["sg_task"]["id"]
                if task_id in tasks_by_id:
                    version.task = self._convert_sg_entity_to_dna_entity(
                        tasks_by_id[task_id], FIELD_MAPPING["task"], "task", resolve_links=False
                    )
            if version.id in notes_by_version_id:
                version.notes = notes_by_version_id[version.id]

            base = (self.url or "").rstrip("/")
            if base:
                version.prodtrack_detail_url = f"{base}/detail/Version/{version.id}"

            versions.append(version)
        return versions

    def get_version_statuses(self, project_id: int | None = None) -> list[dict[str, str]]:
        if not self.sg:
            raise ValueError("Not connected to ShotGrid")
        project_entity = {"type": "Project", "id": project_id} if project_id else None
        schema = self.sg.schema_field_read("Version", "sg_status_list", project_entity)
        if not schema or "sg_status_list" not in schema:
            return []
        props = schema["sg_status_list"].get("properties", {})
        valid_values = props.get("valid_values", {}).get("value", [])
        display_values = props.get("display_values", {}).get("value", {})
        return [{"code": c, "name": display_values.get(c, c)} for c in valid_values]

    def update_version_status(self, version_id: int, status: str) -> bool:
        if not self._sg:
            return False
        try:
            self._sg.update("Version", version_id, {"sg_status_list": status})
            return True
        except Exception:
            return False

    def update_note(
        self,
        note_id: int,
        content: str,
        subject: Optional[str] = None,
        version_id: Optional[int] = None,
        version_status: Optional[str] = None,
    ) -> bool:
        if not self._sg:
            return False
        data = {"content": content}
        if subject:
            data["subject"] = subject
        try:
            self._sg.update("Note", note_id, data)
            if version_status and version_id:
                self._sg.update("Version", version_id, {"sg_status_list": version_status})
            return True
        except Exception as e:
            print(f"Error updating note {note_id}: {e}")
            return False

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
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")
        version_data = self._sg.find_one(
            "Version", filters=[["id", "is", version_id]], fields=["project"]
        )
        if not version_data:
            raise ValueError(f"Version {version_id} not found")
        project = version_data.get("project")
        if not project:
            raise ValueError(f"Version {version_id} has no project assigned")

        # Duplicate check
        existing = self._sg.find_one(
            "Note",
            filters=[
                ["project", "is", project],
                ["note_links", "is", {"type": "Version", "id": version_id}],
                ["subject", "is", subject],
                ["content", "is", content],
            ],
            fields=["id"],
        )
        if existing:
            if version_status:
                self._sg.update("Version", version_id, {"sg_status_list": version_status})
            return existing["id"]

        note_links = [{"type": "Version", "id": version_id}]
        if links:
            extra = self._convert_entities_to_sg_links(links)
            if isinstance(extra, dict):
                note_links.append(extra)
            elif isinstance(extra, list):
                note_links.extend(extra)

        note_data = {
            "project": project,
            "subject": subject,
            "content": content,
            "note_links": note_links,
            "addressings_to": [{"type": "HumanUser", "id": uid} for uid in to_users],
            "addressings_cc": [{"type": "HumanUser", "id": uid} for uid in cc_users],
        }

        # In user-token mode ShotGrid auto-records the authenticated user as author.
        # In script-auth mode, use sudo to record the correct author.
        if self.user_token:
            result = self._sg.create("Note", note_data)
        else:
            author_login = None
            if author_email:
                try:
                    author_user = self.get_user_by_email(author_email)
                    author_login = author_user.login if author_user else None
                except ValueError as e:
                    raise UserNotFoundError(f"Author not found in ShotGrid: {author_email}") from e
            if author_login:
                with self.sudo(author_login):
                    result = self._sg.create("Note", note_data)
            else:
                result = self._sg.create("Note", note_data)

        if version_status:
            self._sg.update("Version", version_id, {"sg_status_list": version_status})
        return result["id"]

    def attach_file_to_note(self, note_id: int, file_path: str, display_name: str) -> bool:
        if not self._sg:
            return False
        try:
            self._sg.upload(
                "Note", note_id, file_path,
                field_name="attachments", display_name=display_name
            )
            return True
        except Exception:
            return False

    def publish_transcript(
        self,
        *,
        project_id: int,
        playlist_id: int,
        version_id: int,
        meeting_id: str,
        meeting_date: date,
        platform: str,
        body: str,
    ) -> int:
        """Create a transcript row in the configured SG custom entity."""
        if not self._sg:
            raise ValueError("Not connected to ShotGrid")

        entity_type = _transcript_entity_type()
        # Human-readable code so the row is identifiable on the SG entity page.
        code = f"transcript-{version_id}-{meeting_date.isoformat()}"
        payload: dict[str, Any] = {
            "code": code,
            "project": {"type": "Project", "id": project_id},
            "sg_playlist": {"type": "Playlist", "id": playlist_id},
            "sg_version_in_review": {"type": "Version", "id": version_id},
            "sg_meeting_id": meeting_id,
            "sg_meeting_date": meeting_date.isoformat(),
            "sg_platform": platform,
            "sg_transcript_body": body,
        }
        result = self._sg.create(entity_type, payload)
        return result["id"]

    def update_transcript(
        self,
        *,
        entity_type: str,
        entity_id: int,
        body: str,
        meeting_date: date,
    ) -> bool:
        """Patch body + date on an existing transcript; other fields untouched."""
        if not self._sg:
            return False
        try:
            self._sg.update(
                entity_type,
                entity_id,
                {
                    "sg_transcript_body": body,
                    "sg_meeting_date": meeting_date.isoformat(),
                },
            )
            return True
        except Exception:
            return False


def _get_dna_entity_type(sg_entity_type: str) -> str:
    for entity_type, entity_data in FIELD_MAPPING.items():
        if entity_data["entity_id"] == sg_entity_type:
            return entity_type
    raise ValueError(f"Unknown entity type: {sg_entity_type}")


def _transcript_entity_type() -> str:
    """Site-specific custom-entity slot, switchable per deployment via env."""
    return os.getenv("SHOTGRID_TRANSCRIPT_ENTITY", "CustomEntity01")
