# ftrack provider — status and handoff

Working notes for picking this up in a fresh session. Written 2026-09-23.

**Bottom line:** the provider is written and self-consistent, but it has never
run against a real ftrack server, and the repo's own test suite has never run
against it either. Treat everything below marked "unverified" as a claim, not a
fact.

---

## 1. What exists

### New files

| File | Lines | What it is |
|---|---|---|
| `src/dna/prodtrack_providers/ftrack.py` | ~2060 | The provider, playlist adapters, layered hydration |
| `src/dna/prodtrack_providers/ftrack_id_map.py` | ~420 | UUID ↔ int surrogate id store (memory / sqlite / mongodb) |
| `tests/providers/test_ftrack_provider.py` | ~1795 | Provider tests + a fake ftrack session with a query engine |
| `tests/providers/test_ftrack_id_map.py` | ~264 | Id map tests, incl. batching and collisions |

### Modified files

| File | Change |
|---|---|
| `prodtrack_provider_base.py` | Registers `PRODTRACK_PROVIDER=ftrack`; adds `transcript_entity_type()` to the base contract |
| `shotgrid.py` | Implements `transcript_entity_type()` (returns its existing env-driven slot) |
| `src/main.py` | `publish_transcript` asks the provider for the entity type instead of reading `SHOTGRID_TRANSCRIPT_ENTITY`; adds `GET /api/ftrack-thumbnails/{version_id}` |
| `tests/test_publish_transcript_endpoint.py` | Mock provider answers `transcript_entity_type()` |
| `tests/providers/test_prodtrack_provider_base.py` | Base-contract test for the new method |
| `requirements.txt` | `ftrack-python-api==3.0.6` |
| `README.md`, `QUICKSTART.md`, `DEPLOYMENT.md`, `example.docker-compose.local.yml` | ftrack section + env tables |

### Feature coverage

Full `ProdtrackProviderBase` surface: `get_entity`, `add_entity` (notes only),
`find`, `search`, `get_user_by_email`, `get_projects_for_user`,
`get_playlists_for_project`, `create_playlist`, `get_versions_for_playlist`,
`add_version_to_playlist`, `get_version_statuses`, `update_version_status`,
`publish_note`, `publish_playlist_note`, `attach_file_to_note`,
`publish_transcript`, `update_transcript`, `transcript_entity_type`.

---

## 2. The three design decisions worth knowing

### 2.1 Surrogate int ids (user-chosen)

ftrack keys entities by UUID; DNA ids are `int` throughout `EntityBase`, the
FastAPI path params, the Mongo bookkeeping rows and the frontend TS interfaces.
The user chose **surrogate ints with a persistent map** over widening DNA's
types.

`ftrack_id_map.py` derives a stable int (truncated blake2b, inside the 2^53
range JS can represent) and persists the pairing so the *reverse* lookup works
on any instance after any restart. Collisions re-salt and probe.

> **Operational constraint:** the map must outlive the process. Draft notes,
> transcripts and stored segments all reference these ids; losing the map
> orphans them. `FTRACK_ID_MAP=mongodb` (default) shares one map across
> instances. `sqlite` is single-host only. Cloud Run with sqlite would silently
> break.

### 2.2 Playlist entity type is a setting

ftrack has two candidates: `AssetVersionList` (Lists, the default) and
`ReviewSession` (Client Reviews). Both are implemented as `PlaylistAdapter`
subclasses. `FtrackProvider.playlist_adapter()` resolves the type **per call**,
so a change takes effect without a restart.

**This is the seam for the eventual user-facing setting.** When that lands, only
`playlist_adapter()` needs to learn how to read the preference — nothing built
on top of it changes. `FTRACK_PLAYLIST_ENTITY` accepts schema names and UI names
(`Lists`, `ClientReviews`).

### 2.3 Flat queries, hydrated in layers (user-directed)

Projections never use a dotted path. Per the user: deep projections like
`asset.parent.object_type.name` make the ftrack server build the joins and are
reliably slower than several shallow queries.

`_hydrate_versions` walks the layers — versions → assets → parent contexts →
object types, with statuses, users, tasks and projects alongside — and stitches
the nested shape the converters expect via a small `_Stitched` dict subclass.
Each layer is one `id in (...)` query for the whole batch, so a playlist costs
~10 queries whatever its size.

Filters use flat foreign keys (`project_id`) for the same reason. **One join
remains**: a version's `entity` filter is `asset.context_id`, because a version
reaches its context through the asset in between. Flattening that would need a
two-step query in `_filter_clause`; not done.

Two tests guard the invariant: one rejects a dotted path in any `*_PROJECTION`
constant, another rejects one in any query a playlist load issues.

---

## 3. Other batching

- **Id warming.** `_warm_ids(entities)` pre-maps every uuid a batch will need
  (a version touches 6: itself, project, user, task, task type, parent context)
  in one store read. It is **type-aware** — it walks each type's own references
  rather than probing attribute names, because a blind probe is only safe while
  no type carries an unprojected attribute by that name. Wired into playlist
  reads, `find`, all three `search` helpers, project and playlist listings.
- **Component paths** go through `pick_locations` / `get_filesystem_paths`: one
  availability request plus one per location, not two per version.
- **Note recipients** resolve in one `where id in (...)` query.
- **Project and status lookups** are cached for `FTRACK_CACHE_SECONDS`
  (default 300, `0` disables). The TTL exists because the provider is a
  process-lifetime `lru_cache` singleton — a schema edit must not need a
  redeploy.
- **version → project** is cached without expiry (a version never moves), and
  filled in by every playlist read, so a publish round skips the lookup.

---

## 4. Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PRODTRACK_PROVIDER` | `shotgrid` | Set to `ftrack` |
| `FTRACK_SERVER` | – | Required |
| `FTRACK_API_KEY` | – | Required |
| `FTRACK_API_USER` | – | Required |
| `FTRACK_PLAYLIST_ENTITY` | `AssetVersionList` | Or `ReviewSession` / `ClientReviews` / `Lists` |
| `FTRACK_ID_MAP` | `mongodb` | `mongodb` \| `sqlite` \| `memory` |
| `FTRACK_ID_MAP_PATH` | `/tmp/dna_ftrack_id_map.db` | sqlite backend only |
| `FTRACK_CACHE_SECONDS` | `300` | Project + status lookups; `0` disables |
| `FTRACK_LIST_CATEGORY` | – | ListCategory name for created Lists; falls back to the first on the server |
| `FTRACK_MOVIE_COMPONENTS` | *(empty)* | Comma-separated, most preferred first. Empty = no `movie_path` |
| `FTRACK_FRAME_COMPONENTS` | *(empty)* | Same, for `frame_path` |

---

## 5. Known behavioural gaps vs ShotGrid

These are deliberate and documented in the README, not bugs — but they are
places the UI may look different on ftrack.

| Area | Behaviour |
|---|---|
| Note subject | ftrack notes have no subject field; DNA's round-trips through note `metadata` under `dna_subject`. If a server rejects note metadata it is dropped (content is kept). |
| Note cc | ftrack has one recipient list; `cc_users` merge into `to_users`. |
| Note links | ftrack notes attach to exactly one parent; extra `links` are dropped. |
| `updated_at` | Always `None` — `AssetVersion` records creation only. |
| `movie_path` / `frame_path` | Empty unless opted into. `ftrackreview-*` components live in the ftrack.server location, whose `ServerAccessor` has no `get_filesystem_path` at all; `movie`/`main` resolve to studio mounts a containerised DNA cannot read. |
| Thumbnails | Proxied via `GET /api/ftrack-thumbnails/{version_id}` — ftrack's own URL carries the API key in the query string. **The endpoint is unauthenticated**, mirroring the existing `/api/mock-thumbnails/` pattern (an `<img src>` cannot send a bearer token). Revisit if that is not acceptable. |
| Transcripts | Stored as a Note on the version with `dna_*` metadata; ftrack has no equivalent of ShotGrid's spare custom-entity slots. `transcript_entity_type()` returns `"Note"`. |
| `get_projects_for_user` | Returns all active projects after confirming the user exists — ftrack grants access by security role, not a per-project member list. |
| Playlist notes | If the configured playlist type has no `notes` relation on that server's schema, the note lands on the **project** with `[playlist name]` as the first line. |
| Status codes | ftrack statuses have no short code; the name doubles as the code and is resolved back by name. |
| `search` | Silently skips `project`/`task`/`note`/`playlist` types (matches ShotGrid, which skips types with no name field). Raises for genuinely unknown types. |

---

## 6. What is NOT verified — read this before trusting anything

### 6.1 Schema names checked; nothing has actually run

Every ftrack interaction is asserted against a fake, so the schema names the
provider uses started out as assumptions. All of them have since been checked by
hand against a real server (2026-09-23), and two were wrong — both foreign keys,
listed below.

What remains unverified is *behaviour*, not names: no read or write has yet been
executed against a live server. See §6.2 and §7.

Both corrections were also wrong in the test fixtures, so the suite stayed green
through both. A fake written from the same assumptions cannot catch a wrong
assumption — which is the whole reason §7 step 2 exists.

**Confirmed:**

- `Project.project_schema_id` — verified by manual check against a real server,
  2026-09-23. The `get_statuses("AssetVersion")` helper it feeds is also sound:
  `ftrack_api/entity/project_schema.py` handles that schema name explicitly, via
  the `_version_workflow` branch.
- `Asset` links to its context through **`context_id`**, not `parent_id` —
  corrected 2026-09-23 after it was flagged as wrong. Worth remembering that
  ftrack is not uniform here: `Task` and `Note` do use `parent_id`, and those
  uses in the provider are correct. When checking the rest of this list, verify
  each foreign key by name rather than assuming the pattern carries over.
- `Component.version_id` — confirmed 2026-09-23. `_hydrate_components` groups on
  it.
- `TypedContext` is queryable by id and returns concrete subclasses (`Shot`,
  `AssetBuild`) carrying a usable `entity_type` — confirmed 2026-09-23. This is
  what lets `_stitch_contexts` fetch every parent in one query and still pick
  the right DNA model.
- `ObjectType`, `Type` and `Status` are queryable by id with `id, name` —
  confirmed 2026-09-23.
- `AssetVersionList.items` is the member collection, `ListCategory` exists, and
  `owner` / `category` are accepted on create — confirmed 2026-09-23. Covers the
  default (Lists) playlist adapter end to end.
- `Note.metadata` is projectable and writable — confirmed 2026-09-23. This is
  where the DNA note subject lives (`dna_subject`) and where transcripts keep
  their `dna_*` bookkeeping.
- `NoteComponent` with `component_id` / `note_id` is the attachment join —
  confirmed 2026-09-23.
- `Project` supports `where status is active` — confirmed 2026-09-23.
- `User.is_active` exists — confirmed 2026-09-23. Used to scope user search.
- `ReviewSessionObject` links to the version through **`version_id`**, not
  `asset_version_id` — corrected 2026-09-23 after it was flagged as wrong.
  `review_session_id` and the writable `name` / `version` / `description`
  display fields are confirmed, as are the `review_session` / `asset_version`
  relationship attributes (confirmed 2026-09-23). Two things to keep straight
  when reading this entity: the relationship is `asset_version` while its column
  is `version_id`, and that column sits beside a separate string field also
  called `version` holding the display copy of the version number. `add_version`
  links by column, matching how the rest of the adapter queries; either form
  works.

### 6.2 The repo's test suite has never run

At the time this was written no `fastapi` or `pydantic` was installable on the
host (the configured devpi index has neither) and Docker was unavailable, so
`make test` never ran. The flake added since (§9) supplies the interpreter and
both prodtrack SDKs, but the rest of `requirements.txt` still needs a working
index — so this is not resolved yet, only made easier.

The 123 new tests pass under a **throwaway pydantic shim** in a scratchpad —
which exercises logic, query shape and round-trip counts, but **not pydantic
field-type validation**. The entity models are the part this cannot vouch for:
if e.g. `Version.created_at` gets a type the model rejects, only the real suite
will show it.

**First action in a new session: run `make test` in `backend/`.**

Also unrun: the modified `test_publish_transcript_endpoint.py` and
`test_prodtrack_provider_base.py`.

### 6.3 Performance is unmeasured

The layered-query design follows the user's stated experience that deep
projections are slow. Tests verify query *shape and count*, never latency.
Worth timing one real playlist load to confirm the win.

### 6.4 Formatting

Local `black` is 22.8; the repo was formatted with a newer version. Running
`black` on `src/main.py` will try to reformat one pre-existing, untouched line
(`Strict-Transport-Security`). That was deliberately left in the repo's style —
don't "fix" it.

---

## 7. Suggested order of work

1. **Run `make test`.** Fix whatever pydantic validation surfaces.
2. **Run it against a sandbox project.** The schema names are checked (§6.1) but
   nothing has actually executed: load a playlist, publish a note with a subject
   and an attachment, set a status, create a playlist. Reading is the low-risk
   half; the writes are where a wrong assumption still bites.
3. **Time a playlist load** with a realistic version count; confirm the layered
   fetch beats a deep projection on that server.
4. **Decide on the thumbnail endpoint's auth** (§5) before anything ships
   externally.
5. **Wire the playlist-type user setting** — the seam is `playlist_adapter()`;
   see §2.2. Exercise the Client Reviews adapter against a sandbox as part of
   that work: it is the least-tried path, and its `ReviewSessionObject` create
   is the one write still resting on a partly-unverified entity (§6.1).
6. Consider the remaining `asset.context_id` filter join (§2.3) only if `/find`
   with an `entity` filter turns out to be a hot path.

---

## 8. Running the new tests without Docker

The scratchpad harness used during development:

```
<scratchpad>/shim/pydantic.py   # minimal pydantic v2 stand-in
<scratchpad>/shim/conftest.py   # puts the shim on sys.path
PYTHONPATH=<shim>:backend/src python3.9 -m pytest test_ftrack_provider.py -c /dev/null
```

It is deliberately **not** committed — it is a crutch for an environment without
the real dependencies, and it would rot. `make test` is the real check.

---

## 9. Nix development environment

`flake.nix` / `flake.lock` at the repo root (nixpkgs pinned to `b6c98e9e6633`).
Added because the missing host dependencies above are what blocked `make test`
for the whole of the first session.

```
git add flake.nix flake.lock   # flakes only see git-tracked files
nix develop
```

**What the shell gives you:** `python311` (3.11.16, matching
`backend/Dockerfile`) with `shotgun_api3` and `ftrack_api` already importable,
plus `uv`, `nodejs_22`, `mongodb-ce`, `black`, `isort` and `docker-compose`.

**What it deliberately does not do:** install the backend's pinned dependencies.
The shellHook prints the commands rather than running them, so entering the
shell is fast and works offline:

```
uv venv --system-site-packages backend/.venv
uv pip install --python backend/.venv -r backend/requirements.txt
```

`--system-site-packages` is what lets the venv see the two nix-built SDKs.

### Why four derivations for two SDKs

Neither `shotgun_api3` nor `ftrack-python-api` is in nixpkgs, and ftrack drags
in two more that are missing or wrong-versioned:

| Package | Source | Why |
|---|---|---|
| `shotgun_api3` 3.9.2 | GitHub `shotgunsoftware/python-api` | Plain setuptools, vendors its own httplib2 |
| `ftrack-python-api` 3.0.6 | GitHub `ftrackhq/ftrack-python-api` | Needs patching, see below |
| `clique` 1.6.1 | **PyPI** | ftrack pins `==1.6.1`; `4degrees/clique`'s GitHub tags stop at 1.5.0, so 1.6.1 exists only on PyPI. Hard dependency — `import clique` at `ftrack_api/session.py:29` |
| `arrow` 0.17.0 | GitHub `arrow-py/arrow` | See below |

**arrow is pinned on purpose.** ftrack's `arrow>=0.4.4,<1` is not conservative:
`ftrack_api/entity/user.py:92` calls `arrow.now().replace(tzinfo="utc")`, and
arrow 1.0 removed `tzinfo` from `.replace()` (it moved to `.to()`). nixpkgs
ships arrow 1.4, which would raise at runtime on a code path
`get_versions_for_playlist` reaches. Do not "upgrade" this without rechecking
that call.

**pyparsing and websocket-client are relaxed on purpose.** ftrack pins them `<3`
and `<1`; nixpkgs has 3.3 and 1.9. Both are used only by the event hub
(`ftrack_api/event/expression.py`, `event/hub.py`), and the provider connects
with `auto_connect_event_hub=False` — see `FtrackProvider.connect`. They still
have to import, and they do; only the event-subscription paths would be at risk
and nothing in DNA reaches them.

**ftrack needs build patching.** Upstream builds through
`poetry-dynamic-versioning`, which reads the version from a git tag; a source
tarball has no `.git`, so an unpatched build produces `0.1.0`. The derivation
pins the version, swaps the backend to plain `poetry-core`, and drops
`sphinx-notfound-page` — listed as a runtime dependency but docs-only, and it
would pull all of sphinx into the closure.

### Verified

Built and imported successfully on `x86_64-linux`, 2026-09-23:

```
python 3.11.16 | shotgun_api3 3.9.2 | ftrack_api 3.0.6
arrow 0.17.0   | clique 1.6.1
ftrack_api.session, event.hub, event.expression all import
arrow.now().replace(tzinfo="utc") works
```

### Note on nodejs

`nodejs_20` has been **removed** from nixpkgs (upstream EOL 2026-04-30). The
flake uses `nodejs_22`. Anything still assuming Node 20 needs to move.
