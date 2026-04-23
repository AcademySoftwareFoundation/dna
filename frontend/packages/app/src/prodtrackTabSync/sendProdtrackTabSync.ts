export type ProdtrackTabSyncResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'no_chrome'
        | 'no_extension_id'
        | 'no_extension'
        | 'invalid_url'
        | 'error';
      detail?: string;
    };

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

function parseAck(raw: unknown): { ok: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.ok === true) return { ok: true };
  return null;
}

/** Opens the production-tracking URL in a normal new browser tab (not extension-controlled). */
export function openProdtrackUrlInUncontrolledNewTab(url: string): void {
  if (!url.startsWith('http')) return;
  if (typeof window === 'undefined' || typeof window.open !== 'function') return;
  const opened = window.open(url, '_blank');
  if (opened) {
    opened.opener = null;
  }
}

export async function pingProdtrackTabExtension(
  extensionId: string,
  timeoutMs = 400
): Promise<ProdtrackTabSyncResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
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
  if (raw === undefined || parseAck(raw)?.ok !== true) {
    return { ok: false, reason: 'no_extension' };
  }
  return { ok: true };
}

export async function openProdtrackVersionInExtension(
  extensionId: string,
  url: string,
  timeoutMs = 800
): Promise<ProdtrackTabSyncResult> {
  const trimmed = extensionId.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_extension_id' };
  }
  if (!url.startsWith('http')) {
    return { ok: false, reason: 'invalid_url' };
  }
  const runtime = getChromeRuntime();
  if (!runtime?.sendMessage) {
    return { ok: false, reason: 'no_chrome' };
  }

  const raw = await sendExternalMessage(
    trimmed,
    { type: 'OPEN_VERSION', url },
    timeoutMs
  );

  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'error',
      detail: String((raw as { __error: string }).__error),
    };
  }

  if (parseAck(raw)?.ok === true) {
    return { ok: true };
  }

  return { ok: false, reason: 'no_extension' };
}

export async function openProdtrackVersionViaExtensionOrNewTab(
  extensionId: string,
  url: string,
  timeoutMs = 800
): Promise<void> {
  const result = await openProdtrackVersionInExtension(
    extensionId,
    url,
    timeoutMs
  );
  if (!result.ok) {
    openProdtrackUrlInUncontrolledNewTab(url);
  }
}
