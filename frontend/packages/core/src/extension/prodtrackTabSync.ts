/**
 * Messaging bridge between a DNA client and the DNA browser extension for
 * production-tracking tab sync (opening/steering a ShotGrid/Flow tab):
 *
 *   - PING          -> is the tab-sync capability installed?
 *   - OPEN_VERSION  -> open/steer the controlled tab to a version URL
 *
 * These are pure functions with no framework dependency; React orchestration
 * lives in the `useProdtrackTabSync` hook in the app package.
 */

import { getChromeRuntime, sendExternalMessage } from './chromeMessaging';

export type ProdtrackTabSyncResult =
  | { ok: true; tabId?: number }
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

export type OpenVersionOptions = {
  /** Last known controlled tab id from a prior OPEN_VERSION; forwarded to the extension */
  tabId?: number;
  /** Defaults to 800 */
  timeoutMs?: number;
};

function parseOpenVersionResponse(
  raw: unknown
): { ok: true; tabId?: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) return null;
  if (typeof o.tabId === 'number' && Number.isFinite(o.tabId)) {
    return { ok: true, tabId: o.tabId };
  }
  return { ok: true };
}

function parsePingResponse(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as { ok?: unknown }).ok === true;
}

/** Opens the production-tracking URL in a normal new browser tab (not extension-controlled). */
export function openProdtrackUrlInUncontrolledNewTab(url: string): void {
  if (!url.startsWith('http')) return;
  if (typeof window === 'undefined' || typeof window.open !== 'function')
    return;
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
  if (raw === undefined || !parsePingResponse(raw)) {
    return { ok: false, reason: 'no_extension' };
  }
  return { ok: true };
}

/**
 * @param timeoutOrOptions — A millisecond timeout (default 800) or open options
 *  including `tabId` (last known controlled tab) and `timeoutMs`.
 */
export async function openProdtrackVersionInExtension(
  extensionId: string,
  url: string,
  timeoutOrOptions: number | OpenVersionOptions = 800
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

  const openOpts =
    typeof timeoutOrOptions === 'number'
      ? { timeoutMs: timeoutOrOptions }
      : timeoutOrOptions;
  const timeoutMs = openOpts.timeoutMs ?? 800;
  const lastKnownTabId = openOpts.tabId;

  const message: { type: string; url: string; tabId?: number } = {
    type: 'OPEN_VERSION',
    url,
  };
  if (typeof lastKnownTabId === 'number' && lastKnownTabId > 0) {
    message.tabId = lastKnownTabId;
  }

  const raw = await sendExternalMessage(trimmed, message, timeoutMs);

  if (raw && typeof raw === 'object' && '__error' in raw) {
    return {
      ok: false,
      reason: 'error',
      detail: String((raw as { __error: string }).__error),
    };
  }

  const ack = parseOpenVersionResponse(raw);
  if (ack != null) {
    return { ok: true, tabId: ack.tabId };
  }

  return { ok: false, reason: 'no_extension' };
}

export async function openProdtrackVersionViaExtensionOrNewTab(
  extensionId: string,
  url: string,
  timeoutOrOptions: number | OpenVersionOptions = 800
): Promise<ProdtrackTabSyncResult> {
  const result = await openProdtrackVersionInExtension(
    extensionId,
    url,
    timeoutOrOptions
  );
  if (!result.ok) {
    openProdtrackUrlInUncontrolledNewTab(url);
  }
  return result;
}
