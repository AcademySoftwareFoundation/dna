export type LogScope = 'sw' | 'popup' | 'offscreen' | 'ws' | 'stt' | 'capture';

export interface DebugLogEntry {
  ts: string;
  scope: LogScope;
  message: string;
  detail?: string;
}

const MAX_LOG_ENTRIES = 200;
const logBuffer: DebugLogEntry[] = [];

function summarizeDetail(detail: unknown): string | undefined {
  if (detail === undefined) {
    return undefined;
  }
  if (detail instanceof Blob) {
    return `Blob(${detail.size} bytes, ${detail.type || 'unknown'})`;
  }
  if (detail instanceof Error) {
    return detail.message;
  }
  if (typeof detail === 'string') {
    return detail;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function appendLog(
  scope: LogScope,
  message: string,
  detail?: unknown,
): DebugLogEntry {
  const entry: DebugLogEntry = {
    ts: new Date().toISOString(),
    scope,
    message,
    detail: summarizeDetail(detail),
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
  console.log(
    `[DNA Meet TX][${scope}] ${message}`,
    detail !== undefined ? detail : '',
  );
  return entry;
}

export function getRecentLogs(limit = MAX_LOG_ENTRIES): DebugLogEntry[] {
  return logBuffer.slice(-limit);
}

export function clearLogs(): void {
  logBuffer.length = 0;
}

/** Use in popup/offscreen; forwards to the service worker log buffer. */
export function logRemote(
  scope: LogScope,
  message: string,
  detail?: unknown,
): void {
  const detailText = summarizeDetail(detail);
  console.log(`[DNA Meet TX][${scope}] ${message}`, detail !== undefined ? detail : '');
  try {
    void chrome.runtime.sendMessage({
      type: 'debug.log',
      scope,
      message,
      detail: detailText,
    });
  } catch {
    /* popup may be closing */
  }
}

export function logInServiceWorker(
  scope: LogScope,
  message: string,
  detail?: unknown,
): void {
  appendLog(scope, message, detail);
}

export function logFromForward(entry: {
  scope: LogScope;
  message: string;
  detail?: string;
}): void {
  logBuffer.push({
    ts: new Date().toISOString(),
    scope: entry.scope,
    message: entry.message,
    detail: entry.detail,
  });
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
}

export function chunkFromMessagePayload(chunk: unknown): Blob | null {
  if (chunk instanceof Blob) {
    return chunk;
  }
  if (chunk instanceof ArrayBuffer) {
    return new Blob([chunk], { type: 'audio/webm' });
  }
  return null;
}

/** Parse audio chunk payloads from the offscreen recorder message. */
export function chunkFromOffscreenMessage(
  message: Record<string, unknown>,
): Blob | null {
  const buffer = message.chunkBuffer;
  if (buffer instanceof ArrayBuffer && buffer.byteLength > 0) {
    const mimeType =
      typeof message.mimeType === 'string' ? message.mimeType : 'audio/webm';
    return new Blob([buffer], { type: mimeType });
  }

  return chunkFromMessagePayload(message.chunk);
}
