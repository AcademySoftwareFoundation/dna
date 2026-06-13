# DNA Meet Transcription Chrome Extension

Chrome MV3 extension that replaces the Vexa bot for Google Meet transcription. It captures tab audio, sends chunks to a configurable OpenAI Whisper-compatible STT service, and pushes Vexa-shaped transcript frames to the DNA backend.

## Prerequisites

- DNA backend running with `TRANSCRIPTION_PROVIDER=browser_extension`
- A Whisper-compatible STT endpoint (e.g. Vexa transcription service)
- Google Chrome

## Setup

1. Build the extension:

   ```bash
   cd chrome-extension
   npm install
   npm run build
   ```

2. Load in Chrome:
   - Open `chrome://extensions`
   - Enable Developer mode
   - Click **Load unpacked**
   - Select `chrome-extension/dist`

3. Configure options (extension icon → right-click → Options):
   - **DNA backend URL** — e.g. `http://localhost:8000`
   - **DNA auth token** — same Bearer token used by the DNA web app
   - **STT URL** — e.g. `https://transcription.vexa.ai/v1/audio/transcriptions`
   - **STT API key** — your transcription service API key

## Usage

1. Set `VITE_TRANSCRIPTION_MODE=extension` and `VITE_TRANSCRIPTION_EXTENSION_ID` in the DNA frontend.
2. Set `TRANSCRIPTION_PROVIDER=browser_extension` on the backend.
3. Configure **STT URL** and **STT API key** in the extension options (DNA URL and auth token are passed from DNA on Connect).
4. Open a playlist in DNA and click **Transcription → Connect**.
   - If one Google Meet tab is open in the same window, DNA uses it automatically.
   - If several Meet tabs are open, DNA prompts you to open this extension and pick a tab.
5. Transcripts appear in DNA in real time. Stop from DNA or disconnect via the extension.

## DNA ↔ extension messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `PING` | DNA → extension | Detect installed |
| `GET_STATUS` | DNA → extension | `idle`, `awaiting_tab`, `ready`, `capturing` |
| `CONNECT` | DNA → extension | Pass `playlistId`, `backendUrl`, `authToken`; resolve Meet tab |
| `START` | DNA → extension | Begin capture after backend bot dispatch |
| `DISCONNECT` | DNA → extension | Stop capture |

## Development

```bash
npm run test-ci   # unit tests (Vitest)
npm run build     # production bundle to dist/
node esbuild.config.mjs --watch  # watch mode
```

## Architecture

- `src/background/service-worker.ts` — session orchestration
- `src/audio/capture.ts` — `tabCapture` + chunked `MediaRecorder`
- `src/content/meet-dom.ts` — active speaker detection from Meet DOM
- `src/transcription/transcriber.ts` — STT client (OpenAI-compatible)
- `src/transcription/segment-builder.ts` — Vexa-shaped segment IDs and timestamps
- `src/dna/ws-client.ts` — authenticated WebSocket to `/transcription/extension/ws`
