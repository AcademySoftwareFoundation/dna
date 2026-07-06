# DNA Production Tracking Tab Sync (Chrome extension)

Chrome extension (Manifest V3) that pairs with the DNA web app ([issue #136](https://github.com/AcademySoftwareFoundation/dna/issues/136)): DNA sends the ShotGrid / production-tracking version detail URL, and this extension opens or updates a **single controlled tab** next to your DNA tab when possible.

This extension also provides an optional **browser transcription route**: it
captures Google Meet **tab audio**, transcribes it via a **WhisperLive** service,
and streams segments directly into DNA — an alternative to the server-side Vexa
bot. See [Transcription capability](#transcription-capability) below.

## Install (development)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder `dna-chrome-extension/`.
3. Copy the extension **ID** from the card (32-char string).
4. In DNA frontend, set `VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID` to that ID in `frontend/packages/app/.env` and restart the dev server.

## Package (distribution)

From the repository root:

```bash
make package-extension
```

This writes `dist/dna-chrome-extension-<version>.zip` (version from `manifest.json`). Upload that zip to the Chrome Web Store, or unzip and load the folder unpacked for testing.

## Allow DNA origins

The extension accepts external messages from:

- **`https://*/*`** — any HTTPS origin (typical production deployments on arbitrary domains).
- **`http://localhost/*`** and **`http://127.0.0.1/*`** — local dev on any port.
- **`*://localhost/*`** and **`*://127.0.0.1/*`** — same hosts, any scheme (legacy/local tooling).

[`externally_connectable`](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable) cannot use a catch‑all like `http://*/*` for every hostname; Chrome treats that pattern as invalid for web pages. So **HTTP deployments that are not** `localhost` / `127.0.0.1` (for example `http://dna.corp.local/`) must add an explicit entry to `matches` in [`manifest.json`](./manifest.json), then reload the extension in `chrome://extensions`.

Because `https://*/*` lets any HTTPS page reach the extension, activation is gated by a **DNA key** (see below): the extension refuses to start unless the calling app presents the same key the user saved.

## DNA key (deployment binding)

To tie the extension to one DNA deployment (and reject other sites), the extension asks for a **key** the first time it is used:

1. Set the same secret in three places:
   - Frontend: `VITE_TRANSCRIPTION_EXTENSION_KEY` in `frontend/packages/app/.env`.
   - Backend: `DNA_EXTENSION_KEY` in the API environment.
   - Extension: paste it into the **DNA key** field in the popup and click **Save** (stored in `chrome.storage.local`, entered once).
2. On `ACTIVATE_TRANSCRIPTION`, the extension compares the key the DNA app sends against the saved key and refuses to start on a mismatch or when no key is saved.
3. The extension forwards the saved key to the DNA backend on the ingest socket (`?key=…`), which validates it against `DNA_EXTENSION_KEY`. When `DNA_EXTENSION_KEY` is unset, the backend gate is disabled (dev only).

## Host permissions

Host access to the DNA backend and WhisperLive is declared as an **optional** permission (`optional_host_permissions`) and requested at runtime when you click **Grant permission & start**, so no fixed deployment URL is baked into the manifest. Chrome prompts for the specific origins derived from the activation payload (for example `https://dna.example.com/*` and the WhisperLive host).

## Chrome Web Store

When published, the install prompt in DNA can point users to the listing URL via `VITE_PRODTRACK_TAB_SYNC_INSTALL_URL` (see DNA `.env.example`).

## Split view

Chrome exposes [`tabs.Tab.splitViewId`](https://developer.chrome.com/docs/extensions/reference/api/tabs#property-Tab-splitViewId) and [`tabs.SPLIT_VIEW_ID_NONE`](https://developer.chrome.com/docs/extensions/reference/api/tabs#property-SPLIT_VIEW_ID_NONE) (Chrome 140+) so extensions can **see** which tabs share a split; it does **not** yet expose a supported way to **create** a split from an extension (see [WECG discussion](https://github.com/w3c/webextensions/issues/967)).

This extension therefore:

1. Opens the production-tracking tab in the **same window**, **immediately after** the active (DNA) tab, and sets **`openerTabId`** to the DNA tab when possible so the browser can treat it as a related tab.
2. **Best-effort only:** if the DNA tab is **already** in a split view (`splitViewId` not `SPLIT_VIEW_ID_NONE`), the extension tries `chrome.tabs.update` on the controlled tab with that `splitViewId`. That call is **not** part of the published `tabs.update` schema today; it is wrapped in `try/catch` and ignored on failure. If Chrome adds support later, the same code may start attaching without changes.
3. Otherwise behavior matches a **normal adjacent tab** (manual split via Chrome UI if you want a tiled layout).

## Message protocol (DNA → extension)

- `{ "type": "PING" }` → `{ "ok": true, "pong": true }` (presence check).
- `{ "type": "OPEN_VERSION", "url": "<https://...>", "tabId"?: <number> }` — `tabId` is optional: last known Chrome **tab** id of the production-tracking window from a prior `OPEN_VERSION` success. The extension **tries that id first** (if still open); if it is missing, it uses split-view heuristics, the extension’s in-memory id, or creates a new tab. Response: `{ "ok": true, "tabId": <number> }` (the id that was navigated) or `{ "ok": false, "error": "..." }`.

### Transcription messages (DNA → extension)

- `{ "type": "PING_TRANSCRIPTION" }` → `{ "ok": true, "pong": true, "capability": "transcription" }` (capability check).
- `{ "type": "ACTIVATE_TRANSCRIPTION", "dnaApiUrl", "dnaIngestWsUrl", "whisperLiveUrl", "playlistId", "token"?, "key"? }` → `{ "ok": true }`. Stores the server info and moves the status to *needs Meet permission*. `key` must match the key saved in the extension or activation is rejected (`{ "ok": false, "error": "key_mismatch" | "extension_not_configured" }`). The target version is resolved server-side (the playlist's in-review version), so no `versionId` is sent.
- `{ "type": "GET_STATUS" }` → `{ "ok": true, "connection": "disconnected" | "connecting" | "needs_permission" | "connected", "meetTabId"?, "detail"? }`.

## Transcription capability

When DNA activates the extension, the user picks their Google Meet tab from the
extension **popup** and grants capture permission. The pipeline is:

```
tabCapture audio -> offscreen AudioContext(16kHz) -> WhisperLive WS
  -> DNA ingest WS ({type:"transcript", confirmed, pending, speaker, playlist_id, ts})
```

- **Popup** (`popup/`): a **Status** tab (Meet-tab selector, permission button,
  live status) and a **Debug** tab (server info + streaming log). The toolbar
  icon shows a status dot: red (disconnected), orange/blinking (connecting or
  needs Meet permission), green (connected & streaming).
- **Service worker** (`transcription.js`, `capture.js`): handshake handling,
  status/log ring buffer, badge control, and tabCapture orchestration.
- **Offscreen document** (`offscreen/`): Web Audio capture and the WhisperLive
  ↔ DNA WebSocket bridge (MV3 service workers can't use Web Audio).
- **Content script** (`content/meetSpeaker.js`): scrapes the active speaker from
  the Meet DOM for attribution.
- **Microphone** (optional, off by default): pass `captureMic: true` in the
  activation payload to mix the operator's mic with the tab audio.

### Setup

1. Load the extension unpacked and copy its **ID**.
2. In DNA frontend `.env` set `VITE_TRANSCRIPTION_EXTENSION_ID` to that ID and
   `VITE_WHISPERLIVE_URL` (e.g. `ws://localhost:9090`); optionally
   `VITE_TRANSCRIPTION_EXTENSION_INSTALL_URL`.
3. Backend: set `DNA_ENABLE_EXTENSION_TRANSCRIPTION=true`. Start WhisperLive:
   `docker compose -f docker-compose.yml -f docker-compose.whisperlive.yml up whisperlive`.
4. In DNA, open a playlist and click **Transcribe via Extension**, then grant
   the Meet-tab permission from the popup.

Full architecture and handshake details: `backend/docs/TRANSCRIPTION_PIPELINE.md`
(*Browser Extension Transcription Route*).
