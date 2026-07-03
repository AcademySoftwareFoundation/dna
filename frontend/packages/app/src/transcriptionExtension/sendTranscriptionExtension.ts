/**
 * Messaging bridge between the DNA web app and the DNA browser extension for
 * the transcription route. Mirrors the prodtrack tab-sync bridge but for the
 * transcription handshake/activation protocol:
 *
 *   - PING_TRANSCRIPTION       -> is the transcription capability installed?
 *   - ACTIVATE_TRANSCRIPTION   -> hand the extension the server info + playlist
 *   - GET_STATUS               -> current extension connection status
 *
 * All React-specific orchestration lives in `useTranscriptionExtension`; these
 * are pure functions so they can be unit-tested without a browser.
 */

export type TranscriptionExtensionReason =
  | 'no_chrome'
  | 'no_extension_id'
  | 'no_extension'
  | 'invalid_payload'
  | 'error';

export type TranscriptionExtensionResult =
  | { ok: true; detail?: string }
  | { ok: false; reason: TranscriptionExtensionReason; detail?: string };

export interface ExtensionActivationPayload {
  /** DNA REST base URL, e.g. http://localhost:8000 */
  dnaApiUrl: string;
  /** DNA inbound ingest WebSocket URL, e.g. ws://localhost:8000/transcription/extension/ingest */
  dnaIngestWsUrl: string;
  /** WhisperLive WebSocket URL the extension streams audio to */
  whisperLiveUrl: string;
  /** Playlist currently being viewed in DNA */
  playlistId: number;
  /** Optional in-review version id (backend resolves it too) */
  versionId?: number;
  /** Logged-in user's auth token, forwarded to DNA as a bearer credential */
  token?: string | null;
}

export type ExtensionConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'needs_permission'
  | 'connected';

export interface ExtensionStatus {
  connection: ExtensionConnectionStatus;
  meetTabId?: number;
  detail?: string;
}

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: object,
    responseCallback?: (response: unknown) => void
  ) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntime | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const chromeApi = (
    globalThis as {
      chrome?: { runtime?: ChromeRuntime };
    }
  ).chrome;
  return chromeApi?.runtime;
}

function sendExternalMessage(
  extensionId: string,
  message: object,
  timeoutMs: number
): Promise<unknown> {
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), timeoutMs);
    try {
      runtime.sendMessage(extensionId, message, (response: unknown) => {
        window.clearTimeout(timer);
        if (runtime.lastError?.message) {
          resolve({ __error: runtime.lastError.message });
          return;
        }
        resolve(response);
      });
    } catch (e) {
      window.clearTimeout(timer);
      resolve({ __error: e instanceof Error ? e.message : String(e) });
    }
  });
}

function isOkResponse(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as { ok?: unknown }).ok === true;
}

/** Probe whether the extension is installed and exposes the transcription capability. */
export async function pingTranscriptionExtension(
  extensionId: string,
  timeoutMs = 400
): Promise<TranscriptionExtensionResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: 'no_chrome' };
  }

  const raw = await sendExternalMessage(
    trimmed,
    { type: 'PING_TRANSCRIPTION' },
    timeoutMs
  );
  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'no_extension',
      detail: String((raw as { __error: string }).__error),
    };
  }
  if (raw === undefined || !isOkResponse(raw)) {
    return { ok: false, reason: 'no_extension' };
  }
  return { ok: true };
}

function validateActivationPayload(payload: ExtensionActivationPayload): boolean {
  if (!payload) return false;
  if (typeof payload.playlistId !== 'number' || !Number.isFinite(payload.playlistId)) {
    return false;
  }
  if (!payload.dnaApiUrl || !payload.dnaIngestWsUrl || !payload.whisperLiveUrl) {
    return false;
  }
  return true;
}

/** Hand the extension the server info + playlist so it can start transcribing. */
export async function activateTranscriptionExtension(
  extensionId: string,
  payload: ExtensionActivationPayload,
  timeoutMs = 1500
): Promise<TranscriptionExtensionResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  if (!validateActivationPayload(payload)) {
    return { ok: false, reason: 'invalid_payload' };
  }
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: 'no_chrome' };
  }

  const raw = await sendExternalMessage(
    trimmed,
    { type: 'ACTIVATE_TRANSCRIPTION', ...payload },
    timeoutMs
  );
  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'error',
      detail: String((raw as { __error: string }).__error),
    };
  }
  if (raw === undefined || !isOkResponse(raw)) {
    return { ok: false, reason: 'no_extension' };
  }
  return { ok: true };
}

function parseStatusResponse(raw: unknown): ExtensionStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) return null;
  const connection = o.connection;
  const valid: ExtensionConnectionStatus[] = [
    'disconnected',
    'connecting',
    'needs_permission',
    'connected',
  ];
  if (typeof connection !== 'string' || !valid.includes(connection as ExtensionConnectionStatus)) {
    return null;
  }
  const status: ExtensionStatus = {
    connection: connection as ExtensionConnectionStatus,
  };
  if (typeof o.meetTabId === 'number' && Number.isFinite(o.meetTabId)) {
    status.meetTabId = o.meetTabId;
  }
  if (typeof o.detail === 'string') {
    status.detail = o.detail;
  }
  return status;
}

/** Ask the extension for its current transcription connection status. */
export async function getTranscriptionExtensionStatus(
  extensionId: string,
  timeoutMs = 400
): Promise<ExtensionStatus | null> {
  const trimmed = extensionId.trim();
  if (!trimmed) return null;
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) return null;

  const raw = await sendExternalMessage(trimmed, { type: 'GET_STATUS' }, timeoutMs);
  return parseStatusResponse(raw);
}

/** Derive the inbound ingest WebSocket URL from the DNA REST base URL. */
export function deriveIngestWsUrl(apiBaseUrl: string): string {
  const base = (apiBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}/transcription/extension/ingest`;
}
