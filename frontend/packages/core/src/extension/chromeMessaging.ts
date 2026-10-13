/**
 * Low-level messaging bridge to the DNA browser extension. Two transports:
 *
 *   - external: `chrome.runtime.sendMessage(extensionId, …)` via the
 *     extension's `externally_connectable` (Chrome).
 *   - page bridge: `window.postMessage` to the extension's content script on
 *     the DNA origin, for browsers without `externally_connectable` for web
 *     pages (Firefox). The user enables it by saving the DNA URL in the
 *     extension popup.
 *
 * Framework-agnostic so any consumer of `@dna/core` can talk to the DNA
 * extension without pulling in React.
 */

export type ChromeRuntime = {
  sendMessage: (
    extensionId: string,
    message: object,
    responseCallback?: (response: unknown) => void
  ) => void;
  lastError?: { message?: string };
};

export function getChromeRuntime(): ChromeRuntime | undefined {
  if (typeof globalThis === 'undefined') return undefined;
  const chromeApi = (
    globalThis as {
      chrome?: { runtime?: ChromeRuntime };
    }
  ).chrome;
  return chromeApi?.runtime;
}

/**
 * Sends a message to an external extension and resolves with its response,
 * `undefined` on timeout, or `{ __error }` when `chrome.runtime.lastError` is
 * set. Never rejects so callers can branch on the resolved value.
 */
export function sendExternalMessage(
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

/** Fired on `window` when the extension's page bridge is injected after load. */
export const EXTENSION_BRIDGE_READY_EVENT = 'dna-extension-bridge-ready';

/** True when the extension's content-script bridge is present on this page. */
export function hasExtensionPageBridge(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement?.dataset.dnaExtensionBridge === '1';
}

let bridgeRequestSeq = 0;

/**
 * Sends a message through the extension's page bridge. Resolves like
 * {@link sendExternalMessage}: the response, `undefined` on timeout, or
 * `{ __error }`. Never rejects.
 */
export function sendPageBridgeMessage(
  message: object,
  timeoutMs: number
): Promise<unknown> {
  if (!hasExtensionPageBridge()) {
    return Promise.resolve(undefined);
  }

  bridgeRequestSeq += 1;
  const id = `${Date.now()}-${bridgeRequestSeq}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve) => {
    const finish = (value: unknown) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        source?: unknown;
        id?: unknown;
        response?: unknown;
        error?: unknown;
      } | null;
      if (!data || data.source !== 'dna-extension' || data.id !== id) return;
      if (typeof data.error === 'string') {
        finish({ __error: data.error });
        return;
      }
      finish(data.response);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage(
      { source: 'dna-page', id, message },
      window.location.origin
    );
  });
}

export type ExtensionTransport = 'external' | 'bridge';

/**
 * Picks how to reach the extension: `externally_connectable` when an extension
 * id is configured and the browser exposes `chrome.runtime` to the page,
 * otherwise the page bridge if it is injected, otherwise `null`.
 */
export function getExtensionTransport(
  extensionId: string
): ExtensionTransport | null {
  if (extensionId.trim() && getChromeRuntime()?.sendMessage) {
    return 'external';
  }
  if (hasExtensionPageBridge()) {
    return 'bridge';
  }
  return null;
}

/** Sends a message over whichever transport {@link getExtensionTransport} picks. */
export function sendExtensionMessage(
  extensionId: string,
  message: object,
  timeoutMs: number
): Promise<unknown> {
  const transport = getExtensionTransport(extensionId);
  if (transport === 'external') {
    return sendExternalMessage(extensionId.trim(), message, timeoutMs);
  }
  if (transport === 'bridge') {
    return sendPageBridgeMessage(message, timeoutMs);
  }
  return Promise.resolve(undefined);
}
