# DNA Production Tracking Tab Sync (Chrome extension)

Chrome extension (Manifest V3) that pairs with the DNA web app ([issue #136](https://github.com/AcademySoftwareFoundation/dna/issues/136)): DNA sends the ShotGrid / production-tracking version detail URL, and this extension opens or updates a **single controlled tab** next to your DNA tab when possible.

## Install (development)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select this folder `prodtrack-tab-sync-extension/`.
3. Copy the extension **ID** from the card (32-char string).
4. In DNA frontend, set `VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID` to that ID in `frontend/packages/app/.env` and restart the dev server.

## Allow DNA origins

The extension only accepts messages from origins listed under `externally_connectable.matches` in [`manifest.json`](./manifest.json).

For local development, `http://localhost:*` and `http://127.0.0.1:*` are included by default.

**For production or other hosts**, add your DNA site pattern to `manifest.json`, for example:

```json
"matches": [
  "http://127.0.0.1:*/*",
  "http://localhost:*/*",
  "https://your-dna-host.example.com/*"
]
```

Then reload the extension in `chrome://extensions`.

## Chrome Web Store

When published, the install prompt in DNA can point users to the listing URL via `VITE_PRODTRACK_TAB_SYNC_INSTALL_URL` (see DNA `.env.example`).

## Split view

Chrome does not expose a stable API for extensions to force two arbitrary tabs into split view. This extension opens the production-tracking tab **in the same window, immediately after the active tab**, so you can use Chrome’s built-in split controls if you want a tiled layout.

## Message protocol (DNA → extension)

- `{ "type": "PING" }` → `{ "ok": true, "pong": true }` (presence check).
- `{ "type": "OPEN_VERSION", "url": "<https://...>" }` → `{ "ok": true }` or `{ "ok": false, "error": "..." }`.
