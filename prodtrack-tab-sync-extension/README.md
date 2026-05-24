# DNA Production Tracking Tab Sync (Chrome extension)

Chrome extension (Manifest V3) that pairs with the DNA web app ([issue #136](https://github.com/AcademySoftwareFoundation/dna/issues/136)): DNA sends the ShotGrid / production-tracking version detail URL, and this extension opens or updates a **single controlled tab** next to your DNA tab when possible.

## Install (development)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder `prodtrack-tab-sync-extension/`.
3. Copy the extension **ID** from the card (32-char string).
4. In DNA frontend, set `VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID` to that ID in `frontend/packages/app/.env` and restart the dev server.

## Allow DNA origins

The extension accepts external messages from:

- **`https://*/*`** — any HTTPS origin (typical production deployments on arbitrary domains).
- **`*://localhost/*`** and **`*://127.0.0.1/*`** — local dev on any port (`http` or `https`).

[`externally_connectable`](https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable) cannot use a catch‑all like `http://*/*` for every hostname; Chrome treats that pattern as invalid for web pages. So **HTTP deployments that are not** `localhost` / `127.0.0.1` (for example `http://dna.corp.local/`) must add an explicit entry to `matches` in [`manifest.json`](./manifest.json), then reload the extension in `chrome://extensions`.

`"ids": ["*"]` allows other extensions to message this one; it does not change which **websites** can connect (still governed by `matches` only).

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
