export type TranscriptionExtensionResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'no_chrome'
        | 'no_extension_id'
        | 'no_extension'
        | 'no_meet_tab'
        | 'no_window'
        | 'already_active'
        | 'stt_not_configured'
        | 'select_tab'
        | 'timeout'
        | 'error';
      detail?: string;
    };

export type TranscriptionExtensionPhase =
  | 'idle'
  | 'awaiting_tab'
  | 'ready'
  | 'awaiting_capture'
  | 'capturing';

export interface TranscriptionExtensionStatus {
  ok: true;
  phase: TranscriptionExtensionPhase;
  playlistId?: number | null;
  meetingId?: string | null;
  platform?: string | null;
  tabId?: number | null;
}

export interface ExtensionTranscriptionPayload {
  sttUrl: string;
  sttApiKey: string;
  sttModel: string;
  chunkDurationMs: number;
  language?: string;
}

export interface ConnectTranscriptionExtensionParams {
  extensionId: string;
  playlistId: number;
  backendUrl: string;
  authToken: string;
  transcription: ExtensionTranscriptionPayload;
  timeoutMs?: number;
}

export interface StartTranscriptionExtensionParams {
  extensionId: string;
  playlistId: number;
  platform: string;
  meetingId: string;
  backendUrl: string;
  authToken: string;
  transcription: ExtensionTranscriptionPayload;
  tabId?: number | null;
  timeoutMs?: number;
}

const DEFAULT_START_TIMEOUT_MS = 15_000;

type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: object,
    responseCallback?: (response: unknown) => void,
  ) => void;
  lastError?: { message?: string };
};

function getChromeRuntime(): ChromeRuntime | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  return (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
}

function sendExternalMessage(
  extensionId: string,
  message: object,
  timeoutMs: number,
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
    } catch (error) {
      window.clearTimeout(timer);
      resolve({
        __error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function parseOkResponse(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as { ok?: unknown }).ok === true;
}

function parseStatus(raw: unknown): TranscriptionExtensionStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) return null;
  const phase = o.phase;
  if (
    phase !== 'idle' &&
    phase !== 'awaiting_tab' &&
    phase !== 'ready' &&
    phase !== 'awaiting_capture' &&
    phase !== 'capturing'
  ) {
    return null;
  }
  return {
    ok: true,
    phase,
    playlistId: typeof o.playlistId === 'number' ? o.playlistId : null,
    meetingId: typeof o.meetingId === 'string' ? o.meetingId : null,
    platform: typeof o.platform === 'string' ? o.platform : null,
    tabId: typeof o.tabId === 'number' ? o.tabId : null,
  };
}

function parseFailureReason(
  body: Record<string, unknown>,
): TranscriptionExtensionResult {
  const reason = body.reason;
  if (reason === 'no_meet_tab') {
    return { ok: false, reason: 'no_meet_tab' };
  }
  if (reason === 'stt_not_configured') {
    return { ok: false, reason: 'stt_not_configured' };
  }
  return {
    ok: false,
    reason: 'error',
    detail: String(reason ?? 'request_failed'),
  };
}

export async function pingTranscriptionExtension(
  extensionId: string,
  timeoutMs = 400,
): Promise<TranscriptionExtensionResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  if (!getChromeRuntime()?.sendMessage) {
    return { ok: false, reason: 'no_chrome' };
  }

  const raw = await sendExternalMessage(trimmed, { type: 'PING' }, timeoutMs);
  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'no_extension',
      detail: String((raw as { __error: string }).__error),
    };
  }
  if (!parseOkResponse(raw)) {
    return { ok: false, reason: 'no_extension' };
  }
  return { ok: true };
}

export async function getTranscriptionExtensionStatus(
  extensionId: string,
  playlistId: number,
  timeoutMs = 400,
): Promise<TranscriptionExtensionStatus | TranscriptionExtensionResult> {
  const ping = await pingTranscriptionExtension(extensionId, timeoutMs);
  if (!ping.ok) {
    return ping;
  }

  const raw = await sendExternalMessage(
    extensionId,
    { type: 'GET_STATUS', playlistId },
    timeoutMs,
  );
  const status = parseStatus(raw);
  if (!status) {
    return { ok: false, reason: 'error', detail: 'Invalid status response' };
  }
  return status;
}

export async function connectTranscriptionExtension(
  params: ConnectTranscriptionExtensionParams,
): Promise<
  | (TranscriptionExtensionStatus & { ok: true; status?: string })
  | TranscriptionExtensionResult
> {
  const trimmed = params.extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  if (!getChromeRuntime()?.sendMessage) {
    return { ok: false, reason: 'no_chrome' };
  }
  if (!params.transcription.sttApiKey) {
    return { ok: false, reason: 'stt_not_configured' };
  }

  const timeoutMs = params.timeoutMs ?? 800;
  const raw = await sendExternalMessage(
    trimmed,
    {
      type: 'CONNECT',
      playlistId: params.playlistId,
      backendUrl: params.backendUrl,
      authToken: params.authToken,
      transcription: params.transcription,
    },
    timeoutMs,
  );

  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'error',
      detail: String((raw as { __error: string }).__error),
    };
  }

  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'no_extension' };
  }

  const body = raw as Record<string, unknown>;
  if (body.ok !== true) {
    return parseFailureReason(body);
  }

  const status = parseStatus(body);
  if (!status) {
    return { ok: false, reason: 'error', detail: 'Invalid connect response' };
  }

  return {
    ...status,
    ok: true,
    status: typeof body.status === 'string' ? body.status : undefined,
  };
}

export async function startTranscriptionExtension(
  params: StartTranscriptionExtensionParams,
): Promise<TranscriptionExtensionResult> {
  const trimmed = params.extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }

  const raw = await sendExternalMessage(
    trimmed,
    {
      type: 'START',
      playlistId: params.playlistId,
      platform: params.platform,
      meetingId: params.meetingId,
      backendUrl: params.backendUrl,
      authToken: params.authToken,
      tabId: params.tabId ?? undefined,
      transcription: params.transcription,
    },
    params.timeoutMs ?? DEFAULT_START_TIMEOUT_MS,
  );

  if (raw === undefined) {
    return {
      ok: false,
      reason: 'error',
      detail: 'Extension did not respond in time. Reload the extension and try again.',
    };
  }

  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'error',
      detail: String((raw as { __error: string }).__error),
    };
  }

  if (!parseOkResponse(raw)) {
    const body = raw as { reason?: string; detail?: string };
    const reason = body.reason;
    if (reason === 'stt_not_configured') {
      return { ok: false, reason: 'stt_not_configured' };
    }
    return {
      ok: false,
      reason: 'error',
      detail: body.detail ?? reason ?? 'Extension failed to start capture.',
    };
  }

  return { ok: true };
}

export async function disconnectTranscriptionExtension(
  extensionId: string,
  timeoutMs = 400,
): Promise<TranscriptionExtensionResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }

  const raw = await sendExternalMessage(
    trimmed,
    { type: 'DISCONNECT' },
    timeoutMs,
  );
  if (!parseOkResponse(raw)) {
    return { ok: false, reason: 'error' };
  }
  return { ok: true };
}

export async function waitForExtensionReady(
  extensionId: string,
  playlistId: number,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<TranscriptionExtensionStatus | TranscriptionExtensionResult> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getTranscriptionExtensionStatus(
      extensionId,
      playlistId,
      400,
    );
    if (!('phase' in status)) {
      return status;
    }
    if (status.phase === 'ready' && status.meetingId && status.platform) {
      return status;
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  return { ok: false, reason: 'timeout' };
}

export function meetUrlFromId(meetingId: string): string {
  return `https://meet.google.com/${meetingId}`;
}
