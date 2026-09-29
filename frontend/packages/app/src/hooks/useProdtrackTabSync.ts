import { useCallback, useEffect, useRef, useState } from 'react';
import {
  openProdtrackVersionInExtension,
  openProdtrackVersionViaExtensionOrNewTab,
} from '@dna/core';

const EXTENSION_ID =
  import.meta.env.VITE_PRODTRACK_TAB_SYNC_EXTENSION_ID?.trim() ?? '';

export interface UseProdtrackTabSyncParams {
  /** URL to open/steer the production-tracking tab to (version- or entity-scoped). */
  activeProdtrackUrl?: string | null;
  /** Current version id; a change triggers an auto-sync into the controlled tab. */
  versionId?: number | null;
  /** Whether auto-sync on version change is enabled (per user settings). */
  autoSyncEnabled: boolean;
}

export interface UseProdtrackTabSyncResult {
  /** Configured tab-sync extension id ('' when not configured). */
  extensionId: string;
  /**
   * Manually open the active production-tracking URL. Opens in the tab-sync
   * extension when available; otherwise falls back to a new browser tab.
   */
  syncProdtrackTab: () => void;
}

export function useProdtrackTabSync({
  activeProdtrackUrl,
  versionId,
  autoSyncEnabled,
}: UseProdtrackTabSyncParams): UseProdtrackTabSyncResult {
  const [controlledTabId, setControlledTabId] = useState<number | null>(null);
  const controlledTabIdRef = useRef<number | null>(null);
  controlledTabIdRef.current = controlledTabId;

  const syncProdtrackTab = useCallback(() => {
    const url = activeProdtrackUrl;
    if (!url || !EXTENSION_ID) return;
    void openProdtrackVersionViaExtensionOrNewTab(EXTENSION_ID, url, {
      tabId: controlledTabId ?? undefined,
    }).then((result) => {
      if (result.ok && typeof result.tabId === 'number') {
        setControlledTabId(result.tabId);
      }
    });
  }, [activeProdtrackUrl, controlledTabId]);

  // Tracks the version id we last reacted to, so we only sync on an actual
  // version change (not on settings/url/mount re-renders for the same version).
  const lastVersionIdRef = useRef<number | null>(null);

  useEffect(() => {
    const currentVersionId = versionId ?? null;
    if (currentVersionId == null) return;

    const previousVersionId = lastVersionIdRef.current;
    lastVersionIdRef.current = currentVersionId;
    if (currentVersionId === previousVersionId) return;

    // Only sync into a PT tab the user already opened with the "PT tab" button.
    // We never open the tab automatically — not on launch, not on version change.
    const tabId = controlledTabIdRef.current;
    if (tabId == null) return;

    if (!activeProdtrackUrl) return;
    if (!autoSyncEnabled) return;
    if (!EXTENSION_ID) return;
    const url = activeProdtrackUrl;
    const timer = window.setTimeout(() => {
      // Extension-only (no new-tab fallback): if the controlled tab was closed,
      // a failed sync must not spawn a window on its own.
      void openProdtrackVersionInExtension(EXTENSION_ID, url, {
        tabId,
      }).then((result) => {
        if (result.ok && typeof result.tabId === 'number') {
          setControlledTabId(result.tabId);
        }
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [versionId, activeProdtrackUrl, autoSyncEnabled]);

  return { extensionId: EXTENSION_ID, syncProdtrackTab };
}
