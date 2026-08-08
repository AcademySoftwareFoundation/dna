import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DNAEvent, RVScanResult, RVSyncStatus } from '@dna/core';
import { apiHandler } from '../api';
import { useEventSubscription } from './useDNAEvents';

export interface UseRvSyncResult {
  status: RVSyncStatus | null;
  scanResults: RVScanResult[] | null;
  isBusy: boolean;
  isLaunching: boolean;
  error: Error | null;
  scanAndConnect: () => Promise<void>;
  connect: (port: number) => Promise<RVSyncStatus | null>;
  disconnect: () => Promise<void>;
  openInRv: () => Promise<void>;
}

/**
 * Keeps a playlist's in-review version synced to a local RV session.
 *
 * Scan finds networked RV sessions on the backend's configured host; when
 * exactly one is found we connect immediately, otherwise the caller gets
 * scanResults to render a picker. Status updates stream in over the app
 * WebSocket; each one also invalidates the playlist metadata query so
 * RV-driven in_review changes render without a manual refresh.
 */
export function useRvSync(playlistId: number | null): UseRvSyncResult {
  const [status, setStatus] = useState<RVSyncStatus | null>(null);
  const [scanResults, setScanResults] = useState<RVScanResult[] | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setStatus(null);
    setScanResults(null);
    setError(null);
    if (playlistId == null) return;
    apiHandler
      .rvSyncStatus(playlistId)
      .then((s) => setStatus(s))
      .catch(() => {
        // No session is a normal state; leave status null.
      });
  }, [playlistId]);

  const onStatusEvent = useCallback(
    (event: DNAEvent<RVSyncStatus>) => {
      if (playlistId == null || event.payload.playlist_id !== playlistId) {
        return;
      }
      setStatus(
        event.payload.status === 'disconnected' ? null : event.payload
      );
      queryClient.invalidateQueries({
        queryKey: ['playlistMetadata', playlistId],
      });
    },
    [playlistId, queryClient]
  );

  useEventSubscription<RVSyncStatus>('rv_sync.status_changed', onStatusEvent, {
    enabled: playlistId != null,
  });

  const connect = useCallback(
    async (port: number): Promise<RVSyncStatus | null> => {
      if (playlistId == null) return null;
      setIsBusy(true);
      setError(null);
      setScanResults(null);
      try {
        const result = await apiHandler.rvSyncConnect({ playlistId, port });
        setStatus(result);
        if (result.status === 'error') {
          setError(new Error(result.detail ?? 'Failed to connect to RV'));
        }
        return result;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        return null;
      } finally {
        setIsBusy(false);
      }
    },
    [playlistId]
  );

  const scanAndConnect = useCallback(async () => {
    if (playlistId == null) return;
    setIsBusy(true);
    setError(null);
    setScanResults(null);
    try {
      const found = await apiHandler.rvSyncScan();
      if (found.length === 0) {
        setError(
          new Error(
            'No networked RV found. In RV: RV → Networking… → Start Network.'
          )
        );
      } else if (found.length === 1) {
        await connect(found[0].port);
      } else {
        setScanResults(found);
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsBusy(false);
    }
  }, [playlistId, connect]);

  const disconnect = useCallback(async () => {
    if (playlistId == null) return;
    setIsBusy(true);
    setError(null);
    try {
      await apiHandler.rvSyncDisconnect(playlistId);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsBusy(false);
    }
  }, [playlistId]);

  const openInRv = useCallback(async () => {
    if (playlistId == null) return;
    setIsLaunching(true);
    setError(null);
    try {
      const { url, port } = await apiHandler.rvSyncLaunchUrl(playlistId);
      // Hand the rvlink URL to the OS; RV.app is its registered handler.
      window.location.href = url;
      // RV boot + tk-engine bootstrap takes a while; poll until a network
      // port answers, then bind the sync session to it. An already-running
      // RV consumes the rvlink itself and keeps its existing port, so accept
      // any session if the requested port never appears.
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const found = await apiHandler.rvSyncScan().catch(() => []);
        const target =
          found.find((s) => s.port === port) ?? found[0];
        if (target) {
          const result = await connect(target.port);
          if (result?.status === 'connected' && result.version_id == null) {
            // Cold-started RV ignores the rvlink -eval (the SG machinery
            // isn't up when it fires), so the session is empty. Resend the
            // same URL — a *running* RV consumes it and loads reliably.
            window.location.href = url;
          }
          return;
        }
      }
      setError(new Error('RV did not come up within 90s — try Connect once it finishes loading.'));
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setIsLaunching(false);
    }
  }, [playlistId, connect]);

  return {
    status,
    scanResults,
    isBusy,
    isLaunching,
    error,
    scanAndConnect,
    connect,
    disconnect,
    openInRv,
  };
}
