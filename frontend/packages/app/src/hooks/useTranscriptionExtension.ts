import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  activateTranscriptionExtension,
  deriveIngestWsUrl,
  getTranscriptionExtensionStatus,
  pingTranscriptionExtension,
  type ExtensionConnectionStatus,
  type ExtensionStatus,
} from '@dna/core';

const EXTENSION_ID = import.meta.env.VITE_TRANSCRIPTION_EXTENSION_ID ?? '';
const INSTALL_URL =
  import.meta.env.VITE_TRANSCRIPTION_EXTENSION_INSTALL_URL ?? '';
const WHISPERLIVE_URL = import.meta.env.VITE_WHISPERLIVE_URL ?? '';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const EXTENSION_KEY = import.meta.env.VITE_TRANSCRIPTION_EXTENSION_KEY ?? '';

export type ExtensionInstallState = 'unknown' | 'installed' | 'not_installed';

export interface UseTranscriptionExtensionResult {
  /** True when a transcription extension id is configured for this build. */
  available: boolean;
  installState: ExtensionInstallState;
  status: ExtensionStatus | null;
  connection: ExtensionConnectionStatus;
  installUrl: string;
  isActivating: boolean;
  error: string | null;
  /** Re-check whether the extension is installed. */
  checkInstalled: () => Promise<boolean>;
  /** Hand the extension the server info + playlist. Returns true on ack. */
  activate: () => Promise<boolean>;
}

export function useTranscriptionExtension(
  playlistId: number | null
): UseTranscriptionExtensionResult {
  const { token } = useAuth();
  const available = EXTENSION_ID.trim().length > 0;

  const [installState, setInstallState] =
    useState<ExtensionInstallState>('unknown');
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const checkInstalled = useCallback(async () => {
    if (!available) {
      setInstallState('not_installed');
      return false;
    }
    const result = await pingTranscriptionExtension(EXTENSION_ID);
    setInstallState(result.ok ? 'installed' : 'not_installed');
    return result.ok;
  }, [available]);

  const activate = useCallback(async () => {
    setError(null);
    if (!available) {
      setError('Transcription extension is not configured.');
      return false;
    }
    if (playlistId == null) {
      setError('Select a playlist first.');
      return false;
    }
    const ping = await pingTranscriptionExtension(EXTENSION_ID);
    setInstallState(ping.ok ? 'installed' : 'not_installed');
    if (!ping.ok) {
      setError(
        ping.detail ||
          'The DNA extension is not installed or could not be reached. Reload the extension in chrome://extensions and try again.'
      );
      return false;
    }
    if (!WHISPERLIVE_URL) {
      setError('WhisperLive URL is not configured (VITE_WHISPERLIVE_URL).');
      return false;
    }

    setIsActivating(true);
    try {
      const result = await activateTranscriptionExtension(EXTENSION_ID, {
        dnaApiUrl: API_BASE_URL,
        dnaIngestWsUrl: deriveIngestWsUrl(API_BASE_URL),
        whisperLiveUrl: WHISPERLIVE_URL,
        playlistId,
        token,
        key: EXTENSION_KEY || null,
      });
      if (!result.ok) {
        setError(result.detail || `Activation failed (${result.reason}).`);
        return false;
      }
      // Extension acked; it now needs Meet-tab permission from the user.
      const next = await getTranscriptionExtensionStatus(EXTENSION_ID);
      if (next) setStatus(next);
      return true;
    } finally {
      setIsActivating(false);
    }
  }, [available, playlistId, token]);

  // Probe for the extension on mount and periodically so the UI reflects
  // install state without requiring an activation attempt first. The key gate
  // only applies to ACTIVATE_TRANSCRIPTION — PING_TRANSCRIPTION is always open.
  useEffect(() => {
    if (!available) {
      setInstallState('not_installed');
      return;
    }
    let cancelled = false;

    const probeInstall = async () => {
      const result = await pingTranscriptionExtension(EXTENSION_ID);
      if (!cancelled) {
        setInstallState(result.ok ? 'installed' : 'not_installed');
      }
    };

    void probeInstall();
    const installPoll = window.setInterval(probeInstall, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(installPoll);
    };
  }, [available]);

  // Poll extension status while it is configured so the UI reflects the live
  // connection state (disconnected -> connecting -> needs_permission -> connected).
  useEffect(() => {
    if (!available) return;
    let cancelled = false;

    const tick = async () => {
      const next = await getTranscriptionExtensionStatus(EXTENSION_ID);
      if (!cancelled && next) setStatus(next);
    };

    void tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current != null) window.clearInterval(pollRef.current);
    };
  }, [available]);

  return {
    available,
    installState,
    status,
    connection: status?.connection ?? 'disconnected',
    installUrl: INSTALL_URL,
    isActivating,
    error,
    checkInstalled,
    activate,
  };
}
