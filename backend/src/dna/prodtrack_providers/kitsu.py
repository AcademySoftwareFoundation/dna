# SPDX-License-Identifier: Apache-2.0
# Copyright Contributors to the Dailies Notes Assistant Project.
"""
Kitsu production tracking provider implementation.

How the DNA model maps onto Kitsu:

- Version: a preview file (one revision on a task). Its status is the status of
  its task, because Kitsu tracks status on the task, not on the revision.
- Note: a comment on the version's task. It belongs to the revision published
  by the last comment with a preview before it, unless its ``preview_file_id``
  names one, as DNA does. The subject, which Kitsu comments do not have, is
  kept in ``data``.
- Transcript: a comment on the version's task, with the text as an attachment.
- User: a person. Additional fields: the entity's ``data`` metadata.
"""

import itertools
import json
import logging
import os
import tempfile
import time
import uuid
from collections import defaultdict
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, cast

import gazu
from gazu.exception import ParameterException, RouteNotFoundException

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
from dna.models.schema import SchemaField, SchemaFieldOption
from dna.prodtrack_providers.prodtrack_provider_base import (
    ProdtrackProviderBase,
    UserNotFoundError,
)
from dna.transcription_publish import transcript_entity_name

logger = logging.getLogger(__name__)

ROW_GETTERS = {
    "project": gazu.project.get_project,
    "shot": gazu.shot.get_shot,
    "asset": gazu.asset.get_asset,
    "note": gazu.task.get_comment,
    "task": gazu.task.get_task,
    "version": gazu.files.get_preview_file,
    "playlist": gazu.playlist.get_playlist,
    "user": gazu.person.get_person,
}
ROW_UPDATERS = {
    "project": gazu.project.update_project,
    "shot": gazu.shot.update_shot,
    "asset": gazu.asset.update_asset,
    "note": gazu.task.update_comment,
    "task": gazu.task.update_task,
    "playlist": gazu.playlist.update_playlist,
    "user": gazu.person.update_person,
}

# DNA field -> Kitsu column. Status and subject have their own write paths. Shot
# names are excluded: DNA shows "SQ01_SH010" and Kitsu stores "SH010".
WRITABLE_FIELDS: dict[str, dict[str, str]] = {
    "project": {"name": "name"},
    "shot": {"description": "description"},
    "asset": {"name": "name", "description": "description"},
    "note": {"content": "text"},
    "task": {},
    "version": {"description": "description"},
    "playlist": {"code": "name"},
    "user": {},
}
STATUS_ENTITY_TYPES = ("task", "version")

# Entity types that have tasks but are neither a shot nor an asset in DNA.
NON_ASSET_ENTITY_TYPES = {"Concept", "Edit", "Episode", "Scene", "Sequence"}

# The DNA model attributes that are not plain text, for get_schema.
DNA_FIELD_TYPES = {
    "status": "status_list",
    "created_at": "date_time",
    "updated_at": "date_time",
    "author": "entity",
    "entity": "entity",
    "note_links": "multi_entity",
    "notes": "multi_entity",
    "project": "entity",
    "task": "entity",
    "tasks": "multi_entity",
    "user": "entity",
    "versions": "multi_entity",
}
READ_ONLY_DNA_FIELDS = {"id", "additional_fields"}
# Reading every task and preview of a project takes seconds: search reuses
# them for a while instead of redoing it on each keystroke.
SEARCH_CACHE_SECONDS = 300
# Ids per filtered read: 50 keep the URL under the 4 KB request line limit of
# common servers.
ID_BATCH_SIZE = 50


class KitsuProvider(ProdtrackProviderBase):
    """
    Kitsu provider, authenticated with the API token of a Kitsu bot.

    The bot must have the Studio Manager role: it reads every production and
    posts comments on behalf of their authors.
    """

    def __init__(self, url: str | None = None, api_token: str | None = None):
        """
        Create the Kitsu client.

        Args:
            url: Kitsu URL. Defaults to the KITSU_URL env var.
            api_token: Bot API token. Defaults to the KITSU_API_TOKEN env var.
        """
        super().__init__()
        url = url or os.getenv("KITSU_URL")
        api_token = api_token or os.getenv("KITSU_API_TOKEN")
        if not url or not api_token:
            raise ValueError(
                "Kitsu credentials not provided. Set KITSU_URL and KITSU_API_TOKEN, "
                "or use PRODTRACK_PROVIDER=mock for the mock provider."
            )
        # Gazu users are used to the ".../api" form of the URL.
        self.url = url.rstrip("/").removesuffix("/api")
        self.client = gazu.client.KitsuClient(
            f"{self.url}/api", access_token=api_token, use_refresh_token=False
        )
        self.api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip(
            "/"
        )
        self._search_cache: dict[tuple, tuple[float, Any]] = {}

    def _get_row(self, entity_type: str, entity_id: str) -> dict[str, Any]:
        kitsu_id = _to_kitsu_id(entity_id)
        try:
            row = ROW_GETTERS[entity_type](kitsu_id, client=self.client)
        except (RouteNotFoundException, ParameterException) as exc:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}") from exc
        if row is None:
            raise ValueError(f"Entity not found: {entity_type} {entity_id}")
        return row

    def _get_persons(self) -> dict[str, dict[str, Any]]:
        persons = gazu.person.all_persons(client=self.client)
        return {person["id"]: person for person in persons}

    def _get_open_project_ids(self) -> list[str]:
        projects = gazu.project.all_open_projects(client=self.client)
        return [project["id"] for project in projects]

    def _get_status(self, code: str) -> dict[str, Any]:
        status = gazu.task.get_task_status_by_short_name(code, client=self.client)
        if status is None:
            raise ValueError(f"Unknown Kitsu task status: {code}")
        return status

    def _get_status_codes(self) -> dict[str, str]:
        statuses = gazu.task.all_task_statuses(client=self.client)
        return {status["id"]: status["short_name"] for status in statuses}

    def _get_project_shot_rows(self, project_id: str) -> list[dict[str, Any]]:
        """
        Add the sequence name, that the project-wide shot route leaves out.
        """
        sequences = gazu.shot.all_sequences_for_project(project_id, client=self.client)
        names = {sequence["id"]: sequence["name"] for sequence in sequences}
        return [
            {**row, "sequence_name": names.get(row.get("parent_id"))}
            for row in gazu.shot.all_shots_for_project(project_id, client=self.client)
        ]

    def _get_project_tasks(self, project_id: str) -> dict[str, Task]:
        """
        Read all the tasks of a project in a few requests, without per-task reads.
        """
        project_id = _to_kitsu_id(project_id)
        statuses = self._get_status_codes()
        task_types = {
            task_type["id"]: task_type["name"]
            for task_type in gazu.task.all_task_types(client=self.client)
        }
        entities: dict[str, EntityBase] = {
            row["id"]: _build_shot(row)
            for row in self._get_project_shot_rows(project_id)
        }
        for row in gazu.asset.all_assets_for_project(project_id, client=self.client):
            entities[row["id"]] = _build_asset(row)
        return {
            row["id"]: Task(
                id=row["id"],
                name=task_types.get(row["task_type_id"]),
                status=statuses.get(row["task_status_id"]),
                pipeline_step=_build_step(
                    row["task_type_id"], task_types.get(row["task_type_id"])
                ),
                project=_build_project_link(project_id),
                entity=entities.get(row["entity_id"]),
            )
            for row in gazu.task.all_tasks_for_project(project_id, client=self.client)
        }

    def _build_version(
        self,
        preview: dict[str, Any],
        task: Task,
        persons: dict[str, dict[str, Any]] | None = None,
        additional_fields: list[str] | None = None,
    ) -> Version:
        version_id = preview["id"]
        person_id = preview["person_id"]
        person = (persons or {}).get(person_id)
        entity = task.entity if isinstance(task.entity, (Shot, Asset)) else None
        project_id = (task.project or {}).get("id")
        name = "_".join(filter(None, [entity.name if entity else None, task.name]))
        revision = preview.get("revision") or 1

        route = "shots" if isinstance(entity, Shot) else "assets"
        web_root = f"{self.url}/productions/{project_id}"
        api_root = f"{self.url}/api"
        return Version(
            id=version_id,
            name=f"{name}_v{revision:03d}",
            description=preview.get("description"),
            status=task.status,
            user=(
                {
                    "type": "User",
                    "id": person_id,
                    "name": person["full_name"] if person else None,
                }
                if person_id
                else None
            ),
            created_at=_to_utc(preview.get("created_at")),
            updated_at=_to_utc(preview.get("updated_at")),
            movie_path=(
                f"{api_root}/movies/originals/preview-files/{version_id}.mp4"
                if preview.get("is_movie")
                else None
            ),
            # Kitsu needs the bot token, which an <img> cannot send: the backend
            # proxies the image through get_thumbnail.
            thumbnail=(
                f"{self.api_base_url}/api/kitsu-thumbnails/{version_id}"
                if preview.get("status") == "ready"
                else None
            ),
            project=task.project,
            entity=entity,
            task=task,
            prodtrack_detail_url=(
                f"{web_root}/{route}/tasks/{task.id}" if entity else None
            ),
            prodtrack_entity_detail_url=(
                f"{web_root}/{route}/{entity.id}" if entity else None
            ),
            additional_fields=_get_additional_fields(preview, additional_fields),
        )

    def _build_note(
        self,
        comment: dict[str, Any],
        task: Task,
        persons: dict[str, dict[str, Any]],
        additional_fields: list[str] | None = None,
    ) -> Note:
        version_id = comment.get("preview_file_id")
        person = persons.get(comment["person_id"])
        links: list[EntityBase] = [task]
        if version_id:
            links.insert(0, Version(id=version_id))
        return Note(
            id=comment["id"],
            subject=(comment.get("data") or {}).get("subject"),
            content=comment.get("text"),
            project=task.project,
            note_links=links,
            author=_build_user(person) if person else None,
            additional_fields=_get_additional_fields(comment, additional_fields),
        )

    def _build_playlist_versions(self, playlist: dict[str, Any]) -> list[Version]:
        """
        Read the rows of a playlist in batches: one request per row took a
        minute for a playlist of a few hundred versions.
        """
        items = [
            item for item in playlist.get("shots") or [] if item.get("preview_file_id")
        ]
        preview_ids = list(dict.fromkeys(item["preview_file_id"] for item in items))
        previews = {
            row["id"]: row
            for row in self._fetch_by_ids("preview-files", "id", preview_ids)
        }
        task_ids = list(dict.fromkeys(row["task_id"] for row in previews.values()))
        tasks = self._get_tasks_by_ids(task_ids)
        comments: dict[str, list[dict[str, Any]]] = defaultdict(list)
        # Newest first, as the task comment route returns them.
        for comment in sorted(
            _set_comment_versions(
                self._fetch_by_ids("comments", "object_id", task_ids),
                # Every revision of the tasks, not only the playlist ones.
                self._fetch_by_ids("preview-files", "task_id", task_ids),
            ),
            key=lambda comment: comment.get("created_at") or "",
            reverse=True,
        ):
            comments[comment["object_id"]].append(comment)
        persons = self._get_persons()

        versions = []
        for item in items:
            preview_id = item["preview_file_id"]
            preview = previews.get(preview_id)
            if preview is None:
                # Kitsu keeps playlist items whose preview was since deleted.
                logger.warning("Skipping missing preview file %s", preview_id)
                continue
            task = tasks[preview["task_id"]]
            version = self._build_version(preview, task, persons)
            version.notes = [
                self._build_note(comment, task, persons)
                for comment in comments[task.id]
                if comment.get("preview_file_id") == preview_id
            ]
            versions.append(version)
        return versions

    def _fetch_by_ids(
        self, model: str, field: str, ids: list[str], **params: str
    ) -> list[dict[str, Any]]:
        """
        Return the rows of a model whose field is one of the ids, a batch of
        ids per request.
        """
        rows: list[dict[str, Any]] = []
        for start in range(0, len(ids), ID_BATCH_SIZE):
            batch = json.dumps(ids[start : start + ID_BATCH_SIZE])
            rows += gazu.client.fetch_all(
                model, {field: batch, **params}, client=self.client
            )
        return rows

    def _get_tasks_by_ids(self, task_ids: list[str]) -> dict[str, Task]:
        """
        Build tasks from batched reads, with the linked rows that
        gazu.task.get_task embeds.
        """
        rows = self._fetch_by_ids("tasks", "id", task_ids)
        entities = {
            row["id"]: row
            for row in self._fetch_by_ids(
                "entities", "id", list(dict.fromkeys(r["entity_id"] for r in rows))
            )
        }
        parents = {
            row["id"]: row
            for row in self._fetch_by_ids(
                "entities",
                "id",
                list(
                    dict.fromkeys(
                        e["parent_id"] for e in entities.values() if e.get("parent_id")
                    )
                ),
            )
        }
        entity_types = {
            row["id"]: row
            for row in gazu.client.fetch_all("entity-types", client=self.client)
        }
        task_types = {
            row["id"]: row for row in gazu.task.all_task_types(client=self.client)
        }
        statuses = self._get_status_codes()
        projects = {
            project_id: gazu.project.get_project(project_id, client=self.client)
            for project_id in dict.fromkeys(r["project_id"] for r in rows)
        }
        tasks = {}
        for row in rows:
            entity = entities.get(row["entity_id"]) or {}
            entity_type = entity_types.get(entity.get("entity_type_id")) or {}
            sequence = (
                parents.get(entity.get("parent_id"))
                if entity_type.get("name") == "Shot"
                else None
            )
            tasks[row["id"]] = _build_task(
                {
                    **row,
                    "project": projects.get(row["project_id"]),
                    "entity": entity,
                    "entity_type": entity_type,
                    "sequence": sequence,
                    "task_type": task_types.get(row["task_type_id"]),
                    "task_status": {"short_name": statuses.get(row["task_status_id"])},
                }
            )
        return tasks

    def _iter_entities(
        self,
        entity_type: str,
        project_id: str | None = None,
        additional_fields: list[str] | None = None,
    ) -> Iterator[EntityBase]:
        """
        Yield the entities of a type, for one project or all the open ones.
        """
        if entity_type == "user":
            for person in gazu.person.all_persons(client=self.client):
                if person.get("active", True) and not person.get("is_bot"):
                    yield _build_user(person, additional_fields)
            return
        if entity_type == "project":
            for project in gazu.project.all_open_projects(client=self.client):
                yield _build_project(project, additional_fields)
            return

        project_ids = [project_id] if project_id else self._get_open_project_ids()
        for pid in map(_to_kitsu_id, project_ids):
            yield from self._iter_project_entities(entity_type, pid, additional_fields)

    def _iter_project_entities(
        self,
        entity_type: str,
        project_id: str,
        additional_fields: list[str] | None,
    ) -> Iterator[EntityBase]:
        if entity_type == "shot":
            for row in self._get_project_shot_rows(project_id):
                yield _build_shot(row, additional_fields)
        elif entity_type == "asset":
            for row in gazu.asset.all_assets_for_project(
                project_id, client=self.client
            ):
                yield _build_asset(row, additional_fields)
        elif entity_type == "playlist":
            for row in self._get_project_playlist_rows(project_id):
                yield _build_playlist(row)
        elif entity_type == "task":
            yield from self._get_project_tasks(project_id).values()
        elif entity_type == "version":
            tasks = self._get_project_tasks(project_id)
            for row in gazu.task.all_preview_files_for_project(
                project_id, client=self.client
            ):
                if row["task_id"] in tasks:
                    yield self._build_version(
                        row, tasks[row["task_id"]], None, additional_fields
                    )
        elif entity_type == "note":
            tasks = self._get_project_tasks(project_id)
            persons = self._get_persons()
            for row in _set_comment_versions(
                gazu.task.all_comments_for_project(project_id, client=self.client)
            ):
                if row["object_id"] in tasks:
                    yield self._build_note(
                        row, tasks[row["object_id"]], persons, additional_fields
                    )
        else:
            raise ValueError(f"Unsupported entity type: {entity_type}")

    def get_entity(
        self,
        entity_type: str,
        entity_id: str,
        resolve_links: bool = True,
        additional_fields: list[str] | None = None,
    ) -> EntityBase:
        if entity_type not in ROW_GETTERS:
            raise ValueError(f"Unknown entity type: {entity_type}")

        row = self._get_row(entity_type, entity_id)
        if entity_type == "task":
            return _build_task(row, additional_fields)
        if entity_type == "project":
            return _build_project(row, additional_fields)
        if entity_type == "user":
            return _build_user(row, additional_fields)
        if entity_type in ("shot", "asset"):
            entity = (_build_shot if entity_type == "shot" else _build_asset)(
                row, additional_fields
            )
            if resolve_links:
                entity.tasks = self._get_entity_tasks(entity_type, row["id"])
            return entity
        if entity_type == "playlist":
            playlist = _build_playlist(row)
            if resolve_links:
                playlist.versions = self._build_playlist_versions(row)
            else:
                playlist.versions = [
                    Version(id=item["preview_file_id"])
                    for item in row.get("shots") or []
                    if item.get("preview_file_id")
                ]
            return playlist
        if entity_type == "note":
            task = _build_task(self._get_row("task", row["object_id"]))
            # Its version depends on the comments posted before it on the task.
            versions = {
                comment["id"]: comment["preview_file_id"]
                for comment in _set_comment_versions(
                    gazu.task.all_comments_for_task(task.id, client=self.client)
                )
            }
            row = {
                **row,
                "preview_file_id": versions.get(row["id"], row.get("preview_file_id")),
            }
            return self._build_note(row, task, self._get_persons(), additional_fields)

        task = _build_task(self._get_row("task", row["task_id"]))
        persons = self._get_persons()
        version = self._build_version(row, task, persons, additional_fields)
        if resolve_links:
            version.notes = [
                self._build_note(comment, task, persons)
                for comment in _set_comment_versions(
                    gazu.task.all_comments_for_task(task.id, client=self.client)
                )
                if comment.get("preview_file_id") == version.id
            ]
        return version

    def _get_entity_tasks(self, entity_type: str, entity_id: str) -> list[Task]:
        statuses = self._get_status_codes()
        get_tasks = (
            gazu.task.all_tasks_for_shot
            if entity_type == "shot"
            else gazu.task.all_tasks_for_asset
        )
        return [
            Task(
                id=task["id"],
                name=task.get("task_type_name"),
                status=statuses.get(task["task_status_id"]),
                pipeline_step=_build_step(
                    task["task_type_id"], task.get("task_type_name")
                ),
                project=_build_project_link(
                    task["project_id"], task.get("project_name")
                ),
            )
            for task in get_tasks(entity_id, client=self.client)
        ]

    def get_schema(
        self,
        entity_type: str,
        project_id: str | None = None,
        include_dna_fields: bool = False,
    ) -> list[SchemaField]:
        """
        List the project's metadata descriptors for this entity type.

        Without a project, descriptors of all the open projects are merged, the
        same ``field_name`` being one field.
        """
        model = ENTITY_MODELS.get(entity_type)
        if model is None:
            raise ValueError(f"Unknown entity type: {entity_type}")

        fields: dict[str, SchemaField] = {}
        if include_dna_fields:
            for name in model.model_fields:
                if name not in READ_ONLY_DNA_FIELDS:
                    fields[name] = self._build_dna_schema_field(
                        entity_type, name, project_id
                    )

        project_ids = [project_id] if project_id else self._get_open_project_ids()
        for pid in map(_to_kitsu_id, project_ids):
            descriptors = gazu.project.all_metadata_descriptors(
                pid, client=self.client, entity_type=entity_type.capitalize()
            )
            for descriptor in descriptors:
                fields[descriptor["field_name"]] = _build_schema_field(descriptor)
        return sorted(fields.values(), key=lambda field: field.code)

    def _build_dna_schema_field(
        self, entity_type: str, name: str, project_id: str | None
    ) -> SchemaField:
        data_type = DNA_FIELD_TYPES.get(name, "text")
        acceptable = None
        if data_type == "status_list":
            acceptable = [
                SchemaFieldOption(value=status["code"], label=status["name"])
                for status in self.get_version_statuses(project_id)
            ]
        editable = (
            name in WRITABLE_FIELDS[entity_type]
            or (name == "status" and entity_type in STATUS_ENTITY_TYPES)
            or (name == "subject" and entity_type == "note")
        )
        return SchemaField(
            code=name,
            display_name=name.replace("_", " ").capitalize(),
            data_type=data_type,
            editable=editable,
            acceptable_values=acceptable,
            source="dna",
        )

    def update_entity(
        self,
        entity_type: str,
        entity_id: str,
        fields: dict[str, Any],
        additional_fields: dict[str, Any],
    ) -> EntityBase:
        """
        Update DNA fields and metadata, then re-read the entity.
        """
        writable = WRITABLE_FIELDS.get(entity_type)
        if writable is None:
            raise ValueError(f"Unknown entity type: {entity_type}")

        kitsu_id = _to_kitsu_id(entity_id)
        fields = dict(fields)
        status = None
        if entity_type in STATUS_ENTITY_TYPES and "status" in fields:
            status = fields.pop("status")
        subject = None
        if entity_type == "note" and "subject" in fields:
            subject = fields.pop("subject")

        payload: dict[str, Any] = {}
        for name, value in fields.items():
            if name not in writable:
                raise ValueError(
                    f"Field '{name}' cannot be updated on entity type '{entity_type}'"
                )
            payload[writable[name]] = value

        if additional_fields or subject is not None:
            row = self._get_row(entity_type, kitsu_id)
            if "data" not in row:
                raise ValueError(f"Entity type '{entity_type}' has no metadata")
            payload["data"] = {**(row["data"] or {}), **additional_fields}
            if subject is not None:
                payload["data"]["subject"] = subject

        if payload:
            if entity_type == "version":
                gazu.files.update_preview(kitsu_id, payload, client=self.client)
            else:
                ROW_UPDATERS[entity_type](
                    {"id": kitsu_id, **payload}, client=self.client
                )
        if status is not None:
            task_id = kitsu_id
            if entity_type == "version":
                task_id = self._get_row("version", kitsu_id)["task_id"]
            self._set_task_status(task_id, status)

        return self.get_entity(
            entity_type,
            kitsu_id,
            resolve_links=False,
            additional_fields=list(additional_fields),
        )

    def add_entity(self, entity_type: str, entity: EntityBase) -> EntityBase:
        """
        Create a note or a playlist. Kitsu's other entities stay managed there.
        """
        if entity_type == "playlist":
            playlist = cast(Playlist, entity)
            project_id = (playlist.project or {}).get("id")
            if not project_id or not playlist.code:
                raise ValueError("A playlist needs a project and a code")
            return self.create_playlist(project_id, playlist.code)
        if entity_type != "note":
            raise NotImplementedError(f"Kitsu provider cannot create {entity_type}")

        note = cast(Note, entity)
        version = next((x for x in note.note_links if isinstance(x, Version)), None)
        task = next((x for x in note.note_links if isinstance(x, Task)), None)
        if version:
            task_id = self._get_row("version", version.id)["task_id"]
        elif task:
            task_id = task.id
        else:
            raise ValueError("A note must link to a version or a task")

        comment = self._post_comment(
            self._get_row("task", task_id),
            note.content or "",
            note.subject,
            version_id=version.id if version else None,
            data=note.additional_fields,
        )
        return self.get_entity("note", comment["id"], resolve_links=False)

    def find(
        self,
        entity_type: str,
        filters: list[dict[str, Any]],
        limit: int = 0,
        additional_fields: list[str] | None = None,
    ) -> list[EntityBase]:
        """
        Find entities by reading them from Kitsu and filtering here.

        shortcut: filters run in Python because the Kitsu API has no equivalent
        of the DNA operators, narrow the read with a project filter on big sites.
        """
        model = ENTITY_MODELS.get(entity_type)
        if model is None:
            raise ValueError(f"Unsupported entity type: {entity_type}")
        for condition in filters:
            if condition.get("field") not in model.model_fields:
                raise ValueError(
                    f"Unknown field '{condition.get('field')}' "
                    f"for entity type '{entity_type}'"
                )
            if condition.get("operator", "is") not in FILTER_OPERATORS:
                raise ValueError(
                    f"Unsupported filter operator: {condition.get('operator')}"
                )

        results = []
        project_id = _get_project_filter(filters)
        for entity in self._iter_entities(entity_type, project_id, additional_fields):
            if all(_is_matching(entity, condition) for condition in filters):
                results.append(entity)
                if limit and len(results) == limit:
                    break
        return results

    def search(
        self,
        query: str,
        entity_types: list[str],
        project_id: str | None = None,
        limit: int = 10,
        playlist_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Search entities by name, and users by email too. With a playlist,
        versions are the ones the playlist can take.
        """
        needle = (query or "").strip().lower()
        results: list[dict[str, Any]] = []
        for entity_type in entity_types:
            if entity_type not in ENTITY_MODELS:
                raise ValueError(f"Unsupported entity type: {entity_type}")
            if entity_type == "note":
                continue  # Notes have no name to search on.
            if entity_type == "version" and playlist_id:
                versions = self._search_playlist_versions(needle, playlist_id, limit)
                if versions is not None:
                    results.extend(versions)
                    continue
            found = 0
            for haystack, result in self._get_search_index(entity_type, project_id):
                if needle in haystack:
                    results.append(result)
                    found += 1
                    if found == limit:
                        break
        return results

    def _cached(self, key: tuple, compute: Callable[[], Any]) -> Any:
        """
        Return compute(), reused for SEARCH_CACHE_SECONDS.
        """
        cached = self._search_cache.get(key)
        if cached and time.monotonic() - cached[0] < SEARCH_CACHE_SECONDS:
            return cached[1]
        value = compute()
        self._search_cache[key] = (time.monotonic(), value)
        return value

    def _get_search_index(
        self, entity_type: str, project_id: str | None
    ) -> list[tuple[str, dict[str, Any]]]:
        """
        Return the (searched text, result) pairs of an entity type.
        """

        def build() -> list[tuple[str, dict[str, Any]]]:
            index = []
            for entity in self._iter_entities(entity_type, project_id):
                name = _get_search_name(entity)
                haystack = f"{name} {getattr(entity, 'email', '') or ''}".lower()
                index.append((haystack, _build_search_result(entity, name)))
            return index

        return self._cached(("index", entity_type, project_id), build)

    def _search_playlist_versions(
        self, needle: str, playlist_id: str, limit: int
    ) -> list[dict[str, Any]] | None:
        """
        Return one version per element the playlist can take whose name
        matches: its latest preview for the task type of the playlist. A
        Kitsu playlist holds elements of one kind, from one episode. None for
        the kinds of elements this does not cover.
        """
        playlist = self._cached(
            ("playlist", playlist_id), lambda: self._get_row("playlist", playlist_id)
        )
        elements = self._cached(
            ("playlist-elements", playlist_id),
            lambda: self._get_playlist_elements(playlist),
        )
        if elements is None:
            return None
        task_types = self._cached(
            ("task-types",),
            lambda: {
                row["id"]: row["name"]
                for row in gazu.task.all_task_types(client=self.client)
            },
        )
        matches = [(name, id_) for name, id_ in elements if needle in name.lower()]
        results: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=max(limit, 1)) as pool:
            # Elements without a preview are skipped: read them a page at a time.
            for start in range(0, len(matches), max(limit, 1)):
                page = matches[start : start + max(limit, 1)]
                previews = pool.map(
                    self._get_element_previews, [id_ for _, id_ in page]
                )
                for (name, _), by_task_type in zip(page, previews):
                    preview = _get_latest_preview(
                        by_task_type, playlist.get("task_type_id")
                    )
                    if preview is None:
                        continue
                    task_type = task_types.get(preview["task_type_id"])
                    revision = preview.get("revision") or 1
                    results.append(
                        {
                            "type": "Version",
                            "id": preview["id"],
                            "name": "_".join(filter(None, [name, task_type]))
                            + f"_v{revision:03d}",
                            "description": None,
                            "project": {
                                "type": "Project",
                                "id": playlist["project_id"],
                            },
                        }
                    )
                    if len(results) == limit:
                        return results
        return results

    def _get_playlist_elements(
        self, playlist: dict[str, Any]
    ) -> list[tuple[str, str]] | None:
        """
        Return the (name, id) pairs of the elements a playlist can take, or
        None for a kind of element other than shots, assets and sequences.
        """
        project_id = playlist["project_id"]
        episode_id = playlist.get("episode_id")
        kind = playlist.get("for_entity") or "shot"
        if kind == "shot":
            if not episode_id:
                rows = self._get_project_shot_rows(project_id)
            else:
                sequences = gazu.shot.all_sequences_for_episode(
                    episode_id, client=self.client
                )
                names = {row["id"]: row["name"] for row in sequences}
                rows = [
                    {**row, "sequence_name": names.get(row.get("parent_id"))}
                    for row in gazu.shot.all_shots_for_episode(
                        episode_id, client=self.client
                    )
                ]
            return [
                (_build_shot_name(row.get("sequence_name"), row["name"]), row["id"])
                for row in rows
            ]
        if kind == "asset":
            # Assets of the episode, and the ones shared by all episodes.
            return [
                (row["name"], row["id"])
                for row in gazu.asset.all_assets_for_project(
                    project_id, client=self.client
                )
                if not episode_id or row.get("source_id") in (episode_id, None)
            ]
        if kind == "sequence":
            rows = (
                gazu.shot.all_sequences_for_episode(episode_id, client=self.client)
                if episode_id
                else gazu.shot.all_sequences_for_project(project_id, client=self.client)
            )
            return [(row["name"], row["id"]) for row in rows]
        return None

    def _get_element_previews(self, entity_id: str) -> dict[str, list[dict]]:
        """
        Return the previews of an element, by task type id.
        """
        return self._cached(
            ("element-previews", entity_id),
            lambda: gazu.client.fetch_all(
                f"playlists/entities/{entity_id}/preview-files", client=self.client
            ),
        )

    def get_thumbnail(self, version_id: str) -> bytes:
        """
        Return the PNG thumbnail of a version, fetched with the bot token.
        """
        kitsu_id = _to_kitsu_id(version_id)
        # The 1200px wide variant: the 150x100 "thumbnails" one is blurry in DNA.
        url = f"{self.url}/api/pictures/previews/preview-files/{kitsu_id}.png"
        try:
            # Full URL: a relative one resolves against gazu's default client.
            return gazu.client.get_file_data_from_url(
                url, full=True, client=self.client
            )
        except RouteNotFoundException as exc:
            raise ValueError(f"Thumbnail not found: {version_id}") from exc

    def get_user_by_email(self, user_email: str) -> User:
        person = gazu.person.get_person_by_email(user_email, client=self.client)
        if not person:
            raise ValueError(f"User not found: {user_email}")
        return _build_user(person)

    def get_projects_for_user(self, user_email: str) -> list[Project]:
        """
        Open projects the user can see: all for admins, else their teams.
        """
        person = gazu.person.get_person_by_email(user_email, client=self.client)
        if not person:
            raise ValueError(f"User not found: {user_email}")
        return [
            _build_project(project)
            for project in gazu.project.all_open_projects(client=self.client)
            if person.get("role") == "admin" or person["id"] in project.get("team", [])
        ]

    def get_playlists_for_project(self, project_id: str) -> list[Playlist]:
        rows = self._get_project_playlist_rows(_to_kitsu_id(project_id))
        return [_build_playlist(row) for row in rows]

    def _get_project_playlist_rows(self, project_id: str) -> Iterator[dict[str, Any]]:
        for page in itertools.count(1):
            rows = gazu.playlist.all_playlists_for_project(
                project_id, client=self.client, page=page
            )
            if not rows:
                return
            yield from rows

    def create_playlist(self, project_id: str, name: str) -> Playlist:
        row = gazu.playlist.new_playlist(
            _to_kitsu_id(project_id), name, client=self.client
        )
        return _build_playlist(row)

    def get_versions_for_playlist(self, playlist_id: str) -> list[Version]:
        try:
            playlist = self._get_row("playlist", playlist_id)
        except ValueError:
            return []
        return self._build_playlist_versions(playlist)

    def add_version_to_playlist(self, playlist_id: str, version_id: str) -> bool:
        playlist = self._get_row("playlist", playlist_id)
        preview = self._get_row("version", version_id)
        if any(
            item.get("preview_file_id") == preview["id"]
            for item in playlist.get("shots") or []
        ):
            return True
        task = self._get_row("task", preview["task_id"])
        gazu.playlist.add_entity_to_playlist(
            playlist, task["entity_id"], preview, client=self.client
        )
        return True

    def get_version_statuses(
        self, project_id: str | None = None
    ) -> list[dict[str, str]]:
        """
        Task statuses, because a version's status is the one of its task.
        """
        rows = []
        if project_id:
            rows = gazu.task.all_task_statuses_for_project(
                _to_kitsu_id(project_id), client=self.client
            )
        # A project without its own status list uses them all.
        rows = rows or gazu.task.all_task_statuses(client=self.client)
        return [
            {"code": row["short_name"], "name": row["name"]}
            for row in rows
            if not row.get("archived")
        ]

    def _set_task_status(self, task_id: str, code: str) -> None:
        """
        Kitsu changes a task status by commenting, here with an empty comment.
        """
        status = self._get_status(code)
        task = self._get_row("task", task_id)
        if task["task_status_id"] != status["id"]:
            gazu.task.add_comment(task["id"], status, "", client=self.client)

    def update_version_status(self, version_id: str, status: str) -> bool:
        try:
            preview = self._get_row("version", version_id)
            self._set_task_status(preview["task_id"], status)
            return True
        except Exception:
            logger.exception("Could not update the status of version %s", version_id)
            return False

    def _post_comment(
        self,
        task: dict[str, Any],
        content: str,
        subject: str | None,
        version_id: str | None = None,
        person_id: str | None = None,
        status_id: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        comment = gazu.task.add_comment(
            task["id"],
            {"id": status_id or task["task_status_id"]},
            content,
            person=person_id,
            client=self.client,
        )
        # The comment creation route accepts neither of these two fields.
        return gazu.task.update_comment(
            {
                "id": comment["id"],
                "preview_file_id": version_id,
                "data": {**(data or {}), "subject": subject},
            },
            client=self.client,
        )

    def publish_note(
        self,
        version_id: str,
        content: str,
        subject: str,
        to_users: list[str],
        cc_users: list[str],
        links: list[EntityBase],
        author_email: str | None = None,
        version_status: str | None = None,
    ) -> str:
        """
        Comment on the version's task, optionally changing its status.

        ``links`` has no equivalent: a Kitsu comment belongs to one task, which
        already gives its shot or asset.

        shortcut: to_users and cc_users are dropped, as the only caller sends
        empty lists. Write them as @mentions in the text when that changes.
        """
        preview = self._get_row("version", version_id)
        task = self._get_row("task", preview["task_id"])

        status_id = self._get_status(version_status)["id"] if version_status else None

        for comment in gazu.task.all_comments_for_task(task["id"], client=self.client):
            if (
                comment.get("preview_file_id") == preview["id"]
                and comment.get("text") == content
                and (comment.get("data") or {}).get("subject") == subject
            ):
                if version_status:
                    self._set_task_status(task["id"], version_status)
                return comment["id"]

        person_id = None
        if author_email:
            person = gazu.person.get_person_by_email(author_email, client=self.client)
            if not person:
                raise UserNotFoundError(f"Author not found in Kitsu: {author_email}")
            person_id = person["id"]

        comment = self._post_comment(
            task,
            content,
            subject,
            version_id=preview["id"],
            person_id=person_id,
            status_id=status_id,
        )
        return comment["id"]

    def publish_playlist_note(self, *args: Any, **kwargs: Any) -> str:
        raise NotImplementedError(
            "Kitsu comments belong to tasks, so notes cannot be linked to a playlist."
        )

    def update_note(
        self,
        note_id: str,
        content: str,
        subject: str | None = None,
        version_id: str | None = None,
        version_status: str | None = None,
        links: list[EntityBase] | None = None,
    ) -> bool:
        try:
            comment = self._get_row("note", note_id)
            payload: dict[str, Any] = {"id": comment["id"], "text": content}
            if subject:
                payload["data"] = {**(comment.get("data") or {}), "subject": subject}
            if version_id:
                payload["preview_file_id"] = _to_kitsu_id(version_id)
            gazu.task.update_comment(payload, client=self.client)
            if version_status:
                self._set_task_status(comment["object_id"], version_status)
            return True
        except Exception:
            logger.exception("Could not update note %s", note_id)
            return False

    def attach_file_to_note(
        self, note_id: str, file_path: str, display_name: str
    ) -> bool:
        """
        Attach a file to a comment. Kitsu names it after the file on disk.
        """
        try:
            comment = self._get_row("note", note_id)
            gazu.task.add_attachment_files_to_comment(
                comment["object_id"], comment["id"], file_path, client=self.client
            )
            return True
        except Exception:
            logger.exception("Could not attach %s to note %s", display_name, note_id)
            return False

    def _attach_transcript(
        self,
        task_id: str,
        comment_id: str,
        version_id: str,
        meeting_date: date,
        body: str,
    ) -> None:
        name = transcript_entity_name(version_id, meeting_date)
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, f"{name}.txt")
            with open(path, "w", encoding="utf-8") as transcript_file:
                transcript_file.write(body)
            gazu.task.add_attachment_files_to_comment(
                task_id, comment_id, path, client=self.client
            )

    def publish_transcript(
        self,
        *,
        project_id: str,
        playlist_id: str,
        version_id: str,
        meeting_id: str,
        meeting_date: date,
        platform: str,
        body: str,
    ) -> str:
        """
        Comment on the version's task, with the transcript as an attachment.

        Kitsu has no entity for transcripts. The comment is not tied to the
        revision, or DNA would sync it back as a note from the author.
        """
        preview = self._get_row("version", version_id)
        task_row = self._get_row("task", preview["task_id"])
        version_name = self._build_version(preview, _build_task(task_row)).name
        comment = self._post_comment(
            task_row,
            f"Transcript of {version_name}, {meeting_date.isoformat()} ({platform})",
            None,
            data={
                "transcript": {
                    "version_id": preview["id"],
                    "version_name": version_name,
                    "playlist_id": playlist_id,
                    "meeting_id": meeting_id,
                    "platform": platform,
                }
            },
        )
        try:
            self._attach_transcript(
                task_row["id"], comment["id"], preview["id"], meeting_date, body
            )
        except Exception:
            # main.py records nothing on failure, so a retry would add a second
            # comment next to this empty one.
            gazu.task.remove_comment(comment["id"], client=self.client)
            raise
        return comment["id"]

    def update_transcript(
        self,
        *,
        entity_type: str,
        entity_id: str,
        body: str,
        meeting_date: date,
    ) -> bool:
        """
        Replace the attached transcript. ``entity_type`` has no use on Kitsu.
        """
        try:
            comment = self._get_row("note", entity_id)
            info = comment["data"]["transcript"]
            old_files = comment.get("attachment_files") or []
            # Upload first: a failure must not leave the comment without transcript.
            self._attach_transcript(
                comment["object_id"],
                comment["id"],
                info["version_id"],
                meeting_date,
                body,
            )
            for old_file in old_files:
                if old_file["name"].startswith("transcript-"):
                    gazu.task.delete_comment_attachment(
                        comment["object_id"],
                        comment["id"],
                        old_file["id"],
                        client=self.client,
                    )
            gazu.task.update_comment(
                {
                    "id": comment["id"],
                    "text": (
                        f"Transcript of {info['version_name']}, "
                        f"{meeting_date.isoformat()} ({info['platform']})"
                    ),
                },
                client=self.client,
            )
            return True
        except Exception:
            logger.exception("Could not update transcript %s", entity_id)
            return False


def _to_kitsu_id(entity_id: Any) -> str:
    """
    Validate an opaque DNA ID as a UUID, as it ends up in API paths.
    """
    try:
        return str(uuid.UUID(str(entity_id)))
    except ValueError as exc:
        raise ValueError(f"Invalid Kitsu entity ID: {entity_id!r}") from exc


def _to_utc(value: str | None) -> str | None:
    """
    Kitsu returns UTC dates without saying so.
    """
    return f"{value}+00:00" if value else None


def _get_additional_fields(
    row: dict[str, Any], codes: list[str] | None
) -> dict[str, Any]:
    data = row.get("data") or {}
    return {code: data.get(code) for code in codes or []}


def _build_project_link(project_id: str, name: str | None = None) -> dict[str, Any]:
    return {"type": "Project", "id": project_id, "name": name}


def _build_step(task_type_id: str, name: str | None) -> dict[str, Any]:
    return {"type": "Step", "id": task_type_id, "name": name}


def _build_project(
    row: dict[str, Any], additional_fields: list[str] | None = None
) -> Project:
    return Project(
        id=row["id"],
        name=row.get("name"),
        additional_fields=_get_additional_fields(row, additional_fields),
    )


def _build_user(
    row: dict[str, Any], additional_fields: list[str] | None = None
) -> User:
    return User(
        id=row["id"],
        name=row.get("full_name"),
        email=row.get("email"),
        login=row.get("desktop_login") or row.get("email"),
        additional_fields=_get_additional_fields(row, additional_fields),
    )


def _build_shot_name(sequence_name: str | None, name: str | None) -> str | None:
    """
    Shot names repeat across sequences, so DNA shows them with their sequence.
    """
    return f"{sequence_name}_{name}" if sequence_name else name


def _build_shot(
    row: dict[str, Any], additional_fields: list[str] | None = None
) -> Shot:
    return Shot(
        id=row["id"],
        name=_build_shot_name(row.get("sequence_name"), row.get("name")),
        description=row.get("description"),
        project=_build_project_link(row["project_id"], row.get("project_name")),
        additional_fields=_get_additional_fields(row, additional_fields),
    )


def _build_asset(
    row: dict[str, Any], additional_fields: list[str] | None = None
) -> Asset:
    return Asset(
        id=row["id"],
        name=row.get("name"),
        description=row.get("description"),
        project=_build_project_link(row["project_id"], row.get("project_name")),
        additional_fields=_get_additional_fields(row, additional_fields),
    )


def _build_task(
    row: dict[str, Any], additional_fields: list[str] | None = None
) -> Task:
    """
    Convert the row of gazu.task.get_task, which embeds the linked rows.
    """
    project = _build_project_link(
        row["project_id"], (row.get("project") or {}).get("name")
    )
    source = row.get("entity") or {}
    kind = (row.get("entity_type") or {}).get("name")
    entity: EntityBase | None = None
    if kind == "Shot":
        entity = Shot(
            id=source["id"],
            name=_build_shot_name(
                (row.get("sequence") or {}).get("name"), source.get("name")
            ),
            description=source.get("description"),
            project=project,
        )
    elif kind not in NON_ASSET_ENTITY_TYPES:
        entity = Asset(
            id=source["id"],
            name=source.get("name"),
            description=source.get("description"),
            project=project,
        )
    task_type = row.get("task_type") or {}
    return Task(
        id=row["id"],
        name=task_type.get("name"),
        status=(row.get("task_status") or {}).get("short_name"),
        pipeline_step=_build_step(row["task_type_id"], task_type.get("name")),
        project=project,
        entity=entity,
        additional_fields=_get_additional_fields(row, additional_fields),
    )


def _build_playlist(row: dict[str, Any]) -> Playlist:
    return Playlist(
        id=row["id"],
        code=row.get("name"),
        project=_build_project_link(row["project_id"]),
        created_at=_to_utc(row.get("created_at")),
        updated_at=_to_utc(row.get("updated_at")),
    )


def _build_schema_field(descriptor: dict[str, Any]) -> SchemaField:
    choices = descriptor.get("choices") or None
    return SchemaField(
        code=descriptor["field_name"],
        display_name=descriptor.get("name") or descriptor["field_name"],
        data_type=descriptor.get("data_type") or "string",
        editable=True,
        acceptable_values=(
            [SchemaFieldOption(value=str(c), label=str(c)) for c in choices]
            if choices
            else None
        ),
    )


def _to_comparable(value: Any) -> Any:
    if isinstance(value, EntityBase):
        return value.id
    if isinstance(value, dict) and "id" in value:
        return value["id"]
    if isinstance(value, list):
        return [_to_comparable(item) for item in value]
    return value


def _is_equal(actual: Any, expected: Any) -> bool:
    return expected in actual if isinstance(actual, list) else actual == expected


def _is_containing(actual: Any, expected: Any) -> bool:
    if isinstance(actual, list):
        return expected in actual
    return str(expected).lower() in str(actual or "").lower()


def _is_in(actual: Any, expected: Any) -> bool:
    return actual in expected


FILTER_OPERATORS = {
    "is": _is_equal,
    "is_not": lambda actual, expected: not _is_equal(actual, expected),
    "contains": _is_containing,
    "in": _is_in,
    "not_in": lambda actual, expected: not _is_in(actual, expected),
}


def _is_matching(entity: EntityBase, condition: dict[str, Any]) -> bool:
    return FILTER_OPERATORS[condition.get("operator", "is")](
        _to_comparable(getattr(entity, condition["field"])),
        _to_comparable(condition.get("value")),
    )


def _get_project_filter(filters: list[dict[str, Any]]) -> str | None:
    for condition in filters:
        if condition.get("field") == "project" and (
            condition.get("operator", "is") == "is"
        ):
            return _to_comparable(condition.get("value"))
    return None


def _set_comment_versions(
    comments: list[dict[str, Any]], previews: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    """
    Return the comments, in the same order, with the version each belongs to
    as preview_file_id. A comment that publishes a preview opens its
    revision: the following comments on the task belong to it, up to the one
    that publishes the next preview. A note posted from DNA names its version.

    A comment lists the previews it publishes, except from the generic comment
    route, where listing them costs a query per comment. The previews then
    tell: Kitsu creates the comment first, so the one publishing a preview is
    the last posted on the task before the preview was created.
    shortcut: a comment posted in the same second as an upload can be taken
    for the publishing one, read the comment links once Zou serves them in
    batches.
    """

    def created(row: dict[str, Any]) -> str:
        return row.get("created_at") or ""

    ordered = sorted(comments, key=created)
    by_task: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for comment in ordered:
        by_task[comment["object_id"]].append(comment)
    published: dict[str, str] = {}  # Comment id to the preview it publishes.
    for preview in sorted(previews or [], key=created):
        earlier = [
            c for c in by_task[preview["task_id"]] if created(c) <= created(preview)
        ]
        if earlier:
            published[earlier[-1]["id"]] = preview["id"]

    versions: dict[str, str | None] = {}
    current: dict[str, str] = {}  # Task id to the preview of its last revision.
    for comment in ordered:
        if comment.get("previews"):
            last = comment["previews"][-1]
            current[comment["object_id"]] = (
                last["id"] if isinstance(last, dict) else last
            )
        elif comment["id"] in published:
            current[comment["object_id"]] = published[comment["id"]]
        versions[comment["id"]] = comment.get("preview_file_id") or current.get(
            comment["object_id"]
        )
    return [{**c, "preview_file_id": versions[c["id"]]} for c in comments]


def _get_latest_preview(
    by_task_type: dict[str, list[dict[str, Any]]], task_type_id: str | None
) -> dict[str, Any] | None:
    """
    Return the latest preview of a task type, or of any without one, with
    its task type id.
    """
    candidates = [
        {**preview, "task_type_id": type_id}
        for type_id, previews in (by_task_type or {}).items()
        if not task_type_id or type_id == task_type_id
        for preview in previews
    ]
    return max(
        candidates,
        key=lambda p: (p.get("revision") or 0, p.get("created_at") or ""),
        default=None,
    )


def _get_search_name(entity: EntityBase) -> str | None:
    if isinstance(entity, Playlist):
        return entity.code
    if isinstance(entity, Task):
        # A task name is its task type alone, which matches a whole project.
        return "_".join(
            filter(None, [getattr(entity.entity, "name", None), entity.name])
        )
    return getattr(entity, "name", None)


def _build_search_result(entity: EntityBase, name: str | None) -> dict[str, Any]:
    result: dict[str, Any] = {"type": entity.type, "id": entity.id, "name": name}
    if isinstance(entity, User):
        result["email"] = entity.email
    if hasattr(entity, "description"):
        result["description"] = entity.description
    project = getattr(entity, "project", None)
    if project:
        result["project"] = {"type": "Project", "id": project["id"]}
    return result
