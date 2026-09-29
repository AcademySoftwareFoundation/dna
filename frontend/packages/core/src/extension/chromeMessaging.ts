/**
 * Low-level messaging bridge to a Chrome (MV3) browser extension via
 * `chrome.runtime.sendMessage`. Framework-agnostic so any consumer of
 * `@dna/core` can talk to the DNA extension without pulling in React.
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
