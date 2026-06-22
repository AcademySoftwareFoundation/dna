# DNA Meet Transcription Chrome Extension

Chrome MV3 extension that replaces the Vexa bot for Google Meet transcription. It captures **Meet tab audio plus your microphone**, sends chunks to a server-configured OpenAI Whisper-compatible STT service, and pushes Vexa-shaped transcript frames to the DNA backend.

## Prerequisites

- DNA backend running with `TRANSCRIPTION_PROVIDER=browser_extension`
- `TRANSCRIPTION_STT_API_KEY` set on the DNA backend (and related STT env vars as needed)
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

3. Configure the DNA backend (not the extension):
   - `TRANSCRIPTION_PROVIDER=browser_extension`
   - `TRANSCRIPTION_STT_API_KEY` — required
   - `TRANSCRIPTION_STT_URL` — optional (defaults to Vexa transcription)
   - `TRANSCRIPTION_STT_MODEL`, `TRANSCRIPTION_CHUNK_DURATION_MS`, `TRANSCRIPTION_STT_LANGUAGE` — optional

## Usage

1. Set `VITE_TRANSCRIPTION_MODE=extension` and `VITE_TRANSCRIPTION_EXTENSION_ID` in the DNA frontend.
2. Set `TRANSCRIPTION_PROVIDER=browser_extension` and STT env vars on the backend.
3. Open a playlist in DNA and click **Transcription → Connect**.
   - DNA fetches STT settings from `GET /transcription/extension-config` and passes them to the extension.
   - If one Google Meet tab is open in the same window, DNA uses it automatically.
   - If several Meet tabs are open, DNA prompts you to open this extension and pick a tab.
4. **Enable capture on Meet:** switch to the Google Meet tab, click the DNA extension icon, then click **Enable tab + mic capture**. Chrome will ask for tab audio and microphone access. Tab capture alone does not include your own voice — the extension mixes in your mic so you are transcribed too.
5. Transcripts appear in DNA in real time. Stop from DNA or disconnect via the extension.

## DNA ↔ extension messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `PING` | DNA → extension | Detect installed |
| `GET_STATUS` | DNA → extension | `idle`, `awaiting_tab`, `ready`, `capturing` |
| `CONNECT` | DNA → extension | Pass `playlistId`, `backendUrl`, `authToken`, and `transcription` config; resolve Meet tab |
| `START` | DNA → extension | Begin capture after backend bot dispatch |
| `DISCONNECT` | DNA → extension | Stop capture |

The extension does not persist STT credentials. All transcription settings are supplied by DNA on connect.

## Development

```bash
npm run test-ci   # unit tests (Vitest)
npm run build     # production bundle to dist/
node esbuild.config.mjs --watch  # watch mode
```

## Architecture

- `src/background/service-worker.ts` — session orchestration
- `src/config/runtime-config.ts` — in-memory STT settings from DNA connect payloads
- `src/audio/mix-streams.ts` — mixes Meet tab audio with microphone input
- `src/audio/offscreen-document.ts` — offscreen document lifecycle for capture
- `src/offscreen/offscreen.ts` — `getUserMedia` + chunked `MediaRecorder` (MV3-safe)
- `src/content/meet-dom.ts` — active speaker detection from Meet DOM
- `src/transcription/transcriber.ts` — STT client (OpenAI-compatible)
- `src/transcription/segment-builder.ts` — Vexa-shaped segment IDs and timestamps
- `src/dna/ws-client.ts` — authenticated WebSocket to `/transcription/extension/ws`
