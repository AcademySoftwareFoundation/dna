<!-- SPDX-License-Identifier: CC-BY-4.0 -->
<!-- Copyright Contributors to the Dailies Notes Assistant Project. -->
<!-- https://github.com/AcademySoftwareFoundation/dna -->

# DNA Desktop App Plan

Make DNA available as a downloadable desktop application that runs the FastAPI
backend as a local "engine", while keeping the browser deployment working from
the same codebase. The model is Griptape Nodes: one UI, one engine, two ways to
package them.

## Decisions (v1)

| Question | Decision |
|---|---|
| Desktop shell | **Tauri 2.** Lightweight shell; Rust side handles sidecar lifecycle and keychain. |
| Transcription | **Vexa cloud only.** Local/on-device transcription is out of scope for v1 (see [v2](#v2-candidates)). |
| Code signing | **Unsigned initially.** Apple Developer ID / Windows Authenticode later; users will see Gatekeeper / SmartScreen warnings until then. |
| Auth | **`AUTH_PROVIDER=none`.** Identity is the email entered at login, gated by a ShotGrid `HumanUser` lookup (`backend/src/dna/prodtrack_providers/shotgrid.py:560`). No Google OAuth on desktop. |
| Local storage | **SQLite** provider alongside the existing MongoDB provider. |
| UI | **Reuse the React app** (`frontend/packages/app`). The PySide6 prototypes in `experimental/cameron/frontend_v2,v3` are not continued; a second UI would diverge from the browser build. |
| UI origin in desktop | **Tauri serves the UI from its bundled `frontendDist`** (`tauri://localhost`); the engine is reached over HTTP on a local port. See [UI origin](#ui-origin-why-tauri-serves-the-ui) for why, rather than loading the UI from the engine. |
| Implementation model | **Claude Code on Opus 5.5, high effort, one session per phase**, each session starting from this document. |

## Target architecture

```
┌──────────────── dna-desktop (Tauri 2) ────────────────┐
│  WebView  ←  same Vite build as the browser app        │
│  Rust shell: spawn sidecar · keychain · settings       │
│        │  http://127.0.0.1:<free port>                 │
│        ▼                                               │
│  dna-engine  (PyInstaller'd FastAPI)                   │
│   ├─ serves the UI as static files (same-origin)       │
│   ├─ storage:        sqlite (local) | mongodb (server) │
│   ├─ prodtrack:      shotgrid | mock                   │
│   ├─ llm:            openai | anthropic | gemini | custom
│   ├─ transcription:  vexa (cloud or studio-hosted)     │
│   └─ auth:           none (email → ShotGrid user)      │
└────────────────────────────────────────────────────────┘
```

Three deployment shapes come out of the same two artifacts:

- **Browser (hosted):** engine on Cloud Run / studio server with MongoDB; UI served by nginx or by the engine. This is today's deployment.
- **Browser (local engine):** download `dna-engine`, run it, open `http://localhost:8000`. No Tauri involved.
- **Standalone:** Tauri shell bundles `dna-engine` as a sidecar. Settings exposes **Engine: Local / Remote URL** so the same app can point at a studio-hosted engine instead of the bundled one.

## What is already in place

The backend is already structured as an engine. Every external dependency sits
behind an env-selected factory:

- `STORAGE_PROVIDER` — `backend/src/dna/storage_providers/storage_provider_base.py:178`
- `TRANSCRIPTION_PROVIDER` — `backend/src/dna/transcription_providers/transcription_provider_base.py:106`
- `PRODTRACK_PROVIDER` — `backend/src/dna/prodtrack_providers/prodtrack_provider_base.py:307`
- `LLM_PROVIDER` — `backend/src/dna/llm_providers/llm_provider_base.py:362`
- `AUTH_PROVIDER` — `backend/src/dna/auth_providers/auth_provider_base.py:58`

Nothing outside `storage_providers/mongodb.py` touches Mongo (no `ObjectId` or
collection access elsewhere), so a second storage provider is one file plus tests.

## What blocks a desktop build today

| Blocker | Where | Why it matters |
|---|---|---|
| Backend URL baked at build time | `frontend/packages/app/src/api/index.ts:4`, `src/contexts/EventContext.tsx:34`, `frontend/Dockerfile` `ARG VITE_*` | One UI build must work against localhost, a studio server, or hosted |
| Mongo is the only storage provider | `STORAGE_PROVIDER` accepts only `mongodb` | Desktop users will not run a database server |
| ~30 scattered `os.getenv` calls, no `main()` | `backend/src/main.py` and every provider; runs via `uvicorn src.main:app` | PyInstaller needs an entrypoint; a Settings screen needs one config object |
| Attachments written to `/tmp` | `backend/src/main.py:433` | Needs a per-user app data directory |
| CORS defaults to `localhost:5173/3000` | `backend/src/dna/cors_settings.py:36` | Tauri's origin is `tauri://localhost` (macOS/Linux) / `http://tauri.localhost` (Windows); both must be allowed |
| Several more `VITE_*` values baked at build time | `frontend/packages/app/src/vite-env.d.ts` | `VITE_AUTH_PROVIDER`, `VITE_FEATURE_*`, extension IDs/keys, `VITE_WHISPERLIVE_URL` all need the same runtime treatment as the API URL |
| Mock prodtrack builds URLs from `API_BASE_URL` | `backend/src/dna/prodtrack_providers/mock_provider.py:65` | Defaults to `localhost:8000`; must be the sidecar's actual URL |
| `@app.on_event` startup/shutdown | `backend/src/main.py:354,366` | Deprecated in FastAPI; lifespan is cleaner for sidecar start/stop |

## Phases

### Phase 1 — Make the web app deployment-agnostic

No desktop code. Everything here also simplifies the Cloud Run deploy and
`bootstrap.sh`, so it ships value on its own.

1. **Runtime config in the frontend.** Add a `RuntimeConfig` type and resolver
   in `@dna/core` (business logic belongs in core, see repo rules) resolving,
   in order: `window.__DNA_CONFIG__` → fetched `/config.json` →
   `import.meta.env.VITE_*`. Carry every value in `vite-env.d.ts`, not just the
   API URL: `apiBaseUrl`, `authProvider`, `googleClientId`, feature overrides,
   extension IDs/keys, `whisperLiveUrl`. Derive the WebSocket URL from
   `apiBaseUrl` (`http→ws`, `https→wss`, path `/ws`) and drop `VITE_WS_URL`.
   Make `apiHandler` (`app/src/api/index.ts:4`) lazy rather than module-scope;
   `EventContext.tsx:34` and `AuthContext.tsx:38` read from the resolver.
   Remove the `VITE_*` build args from `frontend/Dockerfile` and have nginx
   serve a `config.json` instead.
2. **Centralised backend settings.** `pydantic-settings` is already pinned in
   `backend/requirements.txt` but unused. Add `backend/src/dna/settings.py`
   with one `Settings` model and replace the scattered `os.getenv` calls.
   Add `DNA_DATA_DIR` (attachments, SQLite file, caches) with a
   platform-appropriate default.
3. **Entrypoint.** `python -m dna` / `main.py:run()` accepting
   `--host --port --data-dir --ui-dir`; prints `READY <port>` once the server
   is listening. Migrate `on_event` handlers to a lifespan context.
4. **Engine serves the UI.** When `--ui-dir` is set, mount the Vite `dist/` as
   `StaticFiles` at `/` with an SPA fallback and serve `/config.json` generated
   from settings. Same-origin means no CORS config in this mode and enables the
   "download, run, open localhost" shape. (The Tauri shell does *not* use this
   path — see [UI origin](#ui-origin-why-tauri-serves-the-ui).)
5. **`GET /engine/info`.** Version, configured providers, data dir, storage
   backend. Used by the desktop shell for the startup handshake and by the
   Settings screen. Adding a route means regenerating `backend/docs/openapi.json`
   (`make openapi` in `backend/`); `tests/test_openapi_spec.py` fails otherwise.
6. **CORS.** Add `tauri://localhost` and `http://tauri.localhost` to the default
   allow-list in `cors_settings.py`, or have the shell pass
   `CORS_ALLOWED_ORIGINS` explicitly.

### Phase 2 — SQLite storage provider

- `backend/src/dna/storage_providers/sqlite.py` implementing the 22 methods on
  `StorageProviderBase` with `aiosqlite`. Seven tables mirroring the seven Mongo
  collections (`draft_notes`, `playlist_metadata`, `segments`, `user_settings`,
  `published_transcripts`, `qc_checks`, `project_glossaries`), JSON columns for
  nested bodies, and the same unique keys `mongodb.py:ensure_indexes` creates.
- `STORAGE_PROVIDER=sqlite`; file lives at `$DNA_DATA_DIR/dna.sqlite`. Enable
  WAL mode; the engine is single-process so no further locking is needed.
- A provider-conformance test suite in `backend/tests` parametrised over
  `{mongodb, sqlite}` so the two implementations cannot drift. The existing
  Mongo tests mock the client with `unittest.mock` (see
  `tests/test_storage_providers.py`); the SQLite tests can run against a real
  temp file, which makes them the more trustworthy half. MongoDB stays the
  default for server deployments.
- Behaviours to preserve exactly (read `mongodb.py` before writing):
  - `qc_checks.check_id` is a string (Mongo ObjectId hex). Use `uuid4().hex`;
    keep the type `str` end to end.
  - `get_qc_checks` seeds `DEFAULT_ACTION_ITEM_CHECK` when the user has none.
  - `upsert_segment` returns `(segment, is_new)`; `get_segments_for_version`
    orders by `absolute_start_time`.
  - `clear_draft_version_status` clears pending `version_status` only — must
    not touch publish/edited state.
  - `upsert_published_transcript` upserts on `(playlist_id, version_id,
    meeting_id)`; a different `body_hash` overwrites rather than inserts.
  - `upsert_project_glossary` is unique per `project_id`.
- Add `aiosqlite` to `backend/requirements.txt`. `sqlite3` is already used by
  the mock prodtrack provider (`mock_provider.py`) for reference on style.

### Phase 3 — Tauri shell

- New top-level `desktop/` package (`src-tauri/`, Tauri config, build scripts).
  `frontendDist` points at `../frontend/packages/app/dist`; the Vite build is
  unchanged (its `vite.config.ts` already aliases `@dna/core` to source, so no
  separate core build step).

#### UI origin: why Tauri serves the UI

Two options were considered for where the desktop WebView loads the UI from:

| | Load UI from engine (`http://127.0.0.1:<port>`) | Load UI from Tauri `frontendDist` (`tauri://localhost`) |
|---|---|---|
| Origin stability | Changes with the port → `localStorage` (auth token, `AuthContext.tsx:12`) and user prefs are lost whenever the port changes | Stable across launches |
| Tauri IPC (`invoke`) for keychain / restart-engine | Needs remote-URL capability grants | Works by default |
| CORS | None needed | Engine must allow the Tauri origins |
| Reuse for "browser, local engine" shape | Yes | N/A (that shape uses Phase 1.4) |

**Decision: Tauri `frontendDist`.** Stable origin and working IPC outweigh the
CORS line. `tauri://localhost` is a secure context and `127.0.0.1` is exempt
from mixed-content blocking, so plain `http://` to the engine is fine. The
shell injects `window.__DNA_CONFIG__` via Tauri's `initialization_script`
once the engine reports ready.

- **Sidecar.** PyInstaller `--onedir` build of the engine per platform. Tauri's
  `externalBin` expects a single file named with a target-triple suffix
  (`dna-engine-aarch64-apple-darwin`), which does not fit `--onedir`; ship the
  onedir folder under `bundle.resources` and spawn the binary inside it with
  `tauri::process::Command` / `std::process::Command` resolved via
  `app.path().resource_dir()`. (`--onefile` would fit `externalBin` but extracts
  to a temp dir on every launch — slower start, more antivirus false positives.)
  On launch the shell picks a port (prefer a fixed default such as `48271`
  and fall back to a free port only if taken, so URLs stay predictable), spawns
  the engine with env assembled from saved settings, waits for the `READY`
  line on stdout (timeout → show the engine log), then injects config and
  navigates. Kills the sidecar on exit (also on SIGTERM / window close); on
  crash, restart once and surface the log if it fails again.
- **Secrets.** ShotGrid script key, LLM API key, Vexa API key stored in the OS
  keychain (`tauri-plugin-stronghold` or the `keyring` crate), injected into the
  sidecar's environment at spawn. Never written to a config file.
- **Settings screen.** Provider selection (prodtrack, LLM, Vexa URL), API keys,
  engine Local / Remote URL toggle, data directory, "restart engine". Backed by
  `/engine/info`.
- **Auth.** `AUTH_PROVIDER=none`; login screen is the existing email form; the
  email must resolve to a ShotGrid `HumanUser`. The Google OAuth code path is
  left in place for browser deployments but is not reachable on desktop.
- **Transcription.** `TRANSCRIPTION_PROVIDER=vexa` with `VEXA_API_URL` pointing
  at `https://api.cloud.vexa.ai` by default, overridable to a studio-hosted
  Vexa. The bot-dispatch flow in `transcription_providers/vexa.py` is unchanged.
- **Chrome extension on desktop.** The extension (`dna-chrome-extension/`)
  keeps running in the user's real Chrome — that is where the ShotGrid and
  Google Meet tabs it acts on live, so bundling it into the app (Electron or
  otherwise) would not help; Electron's `loadExtension` also lacks
  `tabCapture`, `offscreen`, and `onMessageExternal`. What changes is the
  transport: today the DNA page calls `chrome.runtime.sendMessage(extId, …)`
  (`core/src/extension/chromeMessaging.ts`), which does not exist in the Tauri
  WebView. Flip it so the extension connects to the local engine instead:
  - Extension holds a WebSocket to the engine (`/ws`, with the existing
    `DNA_EXTENSION_KEY` gate) and acts on `open_version` events the engine
    emits when the UI calls a new `POST /prodtrack/open-version`. The
    `optional_host_permissions` for `http://*/*` already covers `127.0.0.1`.
  - Transcription ingest already works this way (`offscreen.js` opens
    `serverInfo.dnaIngestWsUrl`); for v2 it is a URL change.
  - Pairing: the extension popup gets an engine URL field (default
    `http://127.0.0.1:48271`) and key, alongside the current server-info view.
  - The split-view "anchor beside the DNA tab" behaviour has no DNA tab on
    desktop; open/focus the ShotGrid tab only.
  - Keep `chrome.runtime` messaging for the browser deployment; `@dna/core`
    picks the transport from runtime config (`extensionTransport:
    "chrome" | "engine"`).
- **Engine defaults in desktop mode.** `DNA_TESTING_ENABLED` unset (the
  dev-only broadcast endpoint at `main.py:414` stays off), `DISABLE_DOCS=true`,
  `API_BASE_URL` set to the sidecar's own URL (mock prodtrack thumbnails),
  `ATTACHMENT_STORE_DIR` under `DNA_DATA_DIR`.

Exit criteria: a usable macOS build that logs in against ShotGrid, shows
playlists and versions, takes notes stored in SQLite, generates notes with the
configured LLM, dispatches a Vexa cloud bot, and publishes to ShotGrid.

### Phase 4 — Packaging and release

- GitHub Actions matrix: macOS arm64 + x86_64, Windows x64, Linux x64.
  PyInstaller step → `tauri-apps/tauri-action` → GitHub Release artifacts.
  Sits alongside the existing `backend-tests.yml` / `deploy-gcp.yml`. Linux
  runners need the webkit2gtk / libayatana-appindicator dev packages Tauri
  documents.
- **PyInstaller spec** lives in `backend/` and must carry these as data files,
  preserving the package layout so `Path(__file__)`-relative lookups keep
  working in `--onedir`:
  - `dna/config/default_note_prompt.yaml`, `dna/config/glossary_global.yaml`
    (`note_prompt_config.py`, `glossary_config.py`)
  - `dna/prodtrack_providers/mock_data/mock.db`, `schema.sql`, `thumbnails/`
    (`mock_provider.py`, `main.py:MOCK_THUMBNAILS_DIR`)
  - `shotgun_api3`'s bundled `cacert.pem` (a known PyInstaller omission)
  - hidden imports for `uvicorn[standard]` extras (`uvloop`, `httptools`,
    `websockets`) — or run `uvicorn.run(app, ...)` with the pure-Python loop
    and skip them.
  Debug the PyInstaller build locally on macOS first; iterating on it through
  CI is slow.
- **Unsigned for now.** Document the Gatekeeper (`xattr -d com.apple.quarantine`
  or right-click → Open) and SmartScreen steps in the release notes. Add
  Developer ID signing + notarization and Authenticode when a signing identity
  exists; the workflow should be written so that signing is a matter of adding
  secrets, not restructuring.
- Tauri updater with signed update manifests (the updater key is independent of
  OS code signing and can be set up immediately).

### Phase 5 — Hybrid / studio mode

Desktop app pointing at a studio-hosted engine (FastAPI + MongoDB + Vexa) with
the bundled sidecar idle. Mostly falls out of Phase 1 and the Settings toggle;
remaining work is making the remote-engine case carry the auth token the same
way the browser does and surfacing engine reachability in the UI.

## Sequencing and size

| Phase | Depends on | Size |
|---|---|---|
| 1 Deployment-agnostic web app | — | small |
| 2 SQLite provider | 1.2 | medium |
| 3 Tauri shell | 1, 2 | medium–large |
| 4 Packaging / release | 3 | medium |
| 5 Hybrid mode | 1, 3 | small |

Phases 1 and 2 are worth doing regardless of the desktop app. A usable desktop
build exists at the end of Phase 3.

## v2 candidates

Deliberately out of scope for v1:

- **Local transcription.** Native capture in the Rust shell (`cpal` for mic;
  ScreenCaptureKit / WASAPI loopback / PipeWire for system audio) streaming
  16 kHz PCM to the engine, transcribed with `faster-whisper` as an optional
  extra. The seam already exists: `ExtensionTranscriptionProvider`
  (`backend/src/dna/transcription_providers/extension.py`) and
  `/transcription/extension/ingest` (`backend/src/main.py:2037`) already model
  "segments pushed in by a client"; generalise that to a `client` provider.
  Speaker attribution is the open problem — the Chrome extension gets names by
  scraping Meet's DOM, which does not exist here.
- **Google OAuth on desktop** via system browser + loopback redirect, if a
  studio needs SSO rather than the email-matches-ShotGrid check.
- **Signed builds** once an Apple Developer / Windows cert is available.
- **Direct RV / OpenRV integration** from the shell, which is simpler from a
  desktop process than from a browser tab.

## Open items

- Choose the default `DNA_DATA_DIR` per platform (`~/Library/Application Support/DNA`,
  `%APPDATA%\DNA`, `$XDG_DATA_HOME/dna`).
- Decide whether `dna-engine` is published as its own release artifact (for the
  "browser, local engine" shape) or only inside the Tauri bundle.
- Confirm the PyInstaller build of `shotgun_api3`, `instructor`, and the LLM
  SDKs on all three platforms before committing to `--onedir` vs `--onefile`.

## Implementation notes for working sessions

Facts a fresh session would otherwise have to rediscover. Work is on branch
`download_version`.

### Repo conventions (from `.cursor/rules/`)

- **Tests always.** Backend: `cd backend && python -m pytest` (runs natively;
  no Mongo needed — the Mongo client is mocked; CI sets dummy `SHOTGRID_*`
  env). Coverage gate is **90%** (`--cov-fail-under=90` in CI). Frontend:
  `cd frontend && npm run test-ci` and `npm run typecheck`.
- **Formatting.** Backend: `cd backend && make format-python` (black + isort,
  line length 88, py311). Frontend: `cd frontend && npm run format`. Both are
  CI-checked (`backend-formatting.yml`, `frontend-formatting.yml`).
- **OpenAPI spec is checked in.** Any route or model change →
  `cd backend && make openapi` (needs Docker) or run
  `backend/scripts/export_openapi.py` directly; `test_openapi_spec.py` fails
  when stale.
- **App vs core.** API calls, interfaces, and business logic live in
  `frontend/packages/core`; React and visuals in `frontend/packages/app`.
- **Providers only.** Anything that talks to an external system goes through a
  provider under `backend/src/dna/*_providers/`.
- **Comments only when needed**; no comments describing the change itself.
- **UI kit.** Radix Themes/primitives and styled-components; match existing
  components.
- **Commits** carry a DCO sign-off (`git commit -s`). The maintainer commits
  and pushes; sessions should leave changes staged/unstaged and summarise.

### Running things locally

- Full stack: `./bootstrap.sh --start` (Docker; see `QUICKSTART.md`), then
  `cd frontend && npm run dev` → `http://localhost:5173`.
- Backend outside Docker: `cd backend && uvicorn src.main:app --reload` with
  `PRODTRACK_PROVIDER=mock STORAGE_PROVIDER=mongodb MONGODB_URL=...` — after
  Phase 2, `STORAGE_PROVIDER=sqlite` removes the Mongo dependency entirely and
  is the fastest loop for engine work.
- `PRODTRACK_PROVIDER=mock` + `AUTH_PROVIDER=none` is the no-credentials path;
  the mock DB ships with users whose emails the login form accepts.

### Session plan and budget

One Claude Code session per phase, Opus 5.5 at **high** effort (the model's
default is `medium`). Each session starts by reading this file and the files
it cites for that phase. Rough spend per phase at Opus 5.5 rates: Phase 1
$5–15, Phase 2 $10–25, Phase 3 $30–80, Phase 4 $25–60, Phase 5 $5–10. Phase 1
is the calibration point — compare its actual cost against this before
planning the rest.

### Done-checks per phase

- **Phase 1:** `npm run build` in `frontend/` produces a `dist/` with no
  `VITE_API_BASE_URL` baked in (grep the bundle for `localhost:8000` → none);
  the same `dist/` works via nginx `config.json` and via `python -m dna
  --ui-dir`; `GET /engine/info` is in `openapi.json`; backend coverage ≥ 90%.
- **Phase 2:** conformance suite green for both providers; a full note
  round-trip (draft → QC → publish) against `STORAGE_PROVIDER=sqlite` with
  the mock prodtrack provider.
- **Phase 3:** `cargo tauri dev` launches, spawns the engine, reaches login,
  completes the exit criteria listed in the phase; quitting leaves no orphan
  `dna-engine` process (`pgrep dna-engine`).
- **Phase 4:** a tagged push produces artifacts for all four targets; the macOS
  `.dmg` runs on a clean machine after the documented Gatekeeper step.
- **Phase 5:** Settings → Remote engine URL against a running Docker stack
  works with the sidecar stopped.
