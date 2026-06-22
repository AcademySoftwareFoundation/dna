import { useCallback, useEffect, useState } from 'react';
import type { Platform } from '@dna/core';
import { toExtensionTranscriptionPayload } from '@dna/core';
import { apiHandler } from '../api';
import {
  connectTranscriptionExtension,
  disconnectTranscriptionExtension,
  getTranscriptionExtensionStatus,
  meetUrlFromId,
  pingTranscriptionExtension,
  startTranscriptionExtension,
  waitForExtensionReady,
  type ExtensionTranscriptionPayload,
  type TranscriptionExtensionPhase,
} from '../transcriptionExtension/sendTranscriptionExtension';

export type ExtensionUiStatus =
  | 'not_installed'
  | 'disconnected'
  | 'awaiting_tab'
  | 'awaiting_capture'
  | 'connecting'
  | 'connected'
  | 'paused';

export interface UseExtensionTranscriptionBridgeOptions {
  extensionId: string;
  playlistId: number | null;
  backendUrl: string;
  authToken: string | null;
  enabled: boolean;
  isPaused: boolean;
  isBotActive: boolean;
  onConnectMeeting: (meetingUrl: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export interface UseExtensionTranscriptionBridgeReturn {
  extensionUiStatus: ExtensionUiStatus;
  extensionError: string | null;
  installUrl: string;
  refreshExtensionStatus: () => Promise<void>;
  connectExtension: () => Promise<void>;
  isConnecting: boolean;
}

const installUrl =
  import.meta.env.VITE_TRANSCRIPTION_EXTENSION_INSTALL_URL?.trim() ||
  'https://github.com/AcademySoftwareFoundation/dna/blob/main/chrome-extension/README.md';

const sttNotConfiguredMessage =
  'Transcription is not configured on the DNA server. Set TRANSCRIPTION_STT_API_KEY for the backend.';

function phaseToUiStatus(
  phase: TranscriptionExtensionPhase | null,
  isPaused: boolean,
  isBotActive: boolean,
): ExtensionUiStatus {
  if (phase === 'awaiting_tab') {
    return 'awaiting_tab';
  }
  if (phase === 'awaiting_capture') {
    return 'awaiting_capture';
  }
  if (isBotActive && isPaused) {
    return 'paused';
  }
  if (phase === 'capturing' || isBotActive) {
    return 'connected';
  }
  if (phase === 'ready') {
    return 'disconnected';
  }
  return 'disconnected';
}

async function loadServerTranscriptionConfig(): Promise<ExtensionTranscriptionPayload | null> {
  try {
    const config = await apiHandler.getExtensionTranscriptionConfig();
    return toExtensionTranscriptionPayload(config);
  } catch {
    return null;
  }
}

export function useExtensionTranscriptionBridge({
  extensionId,
  playlistId,
  backendUrl,
  authToken,
  enabled,
  isPaused,
  isBotActive,
  onConnectMeeting,
  onDisconnect,
}: UseExtensionTranscriptionBridgeOptions): UseExtensionTranscriptionBridgeReturn {
  const [extensionUiStatus, setExtensionUiStatus] =
    useState<ExtensionUiStatus>('disconnected');
  const [extensionError, setExtensionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const refreshExtensionStatus = useCallback(async () => {
    if (!enabled || !extensionId || !playlistId) {
      setExtensionUiStatus('disconnected');
      return;
    }

    const ping = await pingTranscriptionExtension(extensionId);
    if (!ping.ok) {
      setExtensionUiStatus('not_installed');
      return;
    }

    const status = await getTranscriptionExtensionStatus(extensionId, playlistId);
    if (!('phase' in status)) {
      setExtensionUiStatus('not_installed');
      return;
    }

    setExtensionUiStatus(
      phaseToUiStatus(status.phase, isPaused, isBotActive),
    );
  }, [enabled, extensionId, playlistId, isPaused, isBotActive]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshExtensionStatus();
  }, [enabled, refreshExtensionStatus]);

  const connectExtension = useCallback(async () => {
    if (!playlistId || !authToken) {
      setExtensionError('Sign in to DNA before connecting transcription.');
      return;
    }

    setIsConnecting(true);
    setExtensionError(null);

    try {
      const transcription = await loadServerTranscriptionConfig();
      if (!transcription?.sttApiKey) {
        setExtensionError(sttNotConfiguredMessage);
        return;
      }

      const connectResult = await connectTranscriptionExtension({
        extensionId,
        playlistId,
        backendUrl,
        authToken,
        transcription,
      });

      if (!connectResult.ok) {
        if (connectResult.reason === 'no_meet_tab') {
          setExtensionError(
            'Open a Google Meet tab in this window, then try Connect again.',
          );
        } else if (connectResult.reason === 'no_extension') {
          setExtensionUiStatus('not_installed');
          setExtensionError('DNA Meet Transcription extension is not installed.');
        } else if (connectResult.reason === 'stt_not_configured') {
          setExtensionError(sttNotConfiguredMessage);
        } else {
          setExtensionError(
            connectResult.detail ?? 'Could not connect to the extension.',
          );
        }
        return;
      }

      let meetingId = connectResult.meetingId;
      let platform = connectResult.platform as Platform | null | undefined;
      let tabId = connectResult.tabId;

      if (connectResult.status === 'select_tab' || connectResult.phase === 'awaiting_tab') {
        setExtensionUiStatus('awaiting_tab');
        setExtensionError(
          'Multiple Meet tabs found. Open the extension icon and choose a tab.',
        );

        const ready = await waitForExtensionReady(extensionId, playlistId);
        if (!('phase' in ready) || ready.phase !== 'ready') {
          setExtensionError(
            'Timed out waiting for a Meet tab selection in the extension.',
          );
          return;
        }
        meetingId = ready.meetingId;
        platform = ready.platform as Platform | null | undefined;
        tabId = ready.tabId;
      }

      if (!meetingId || !platform) {
        setExtensionError('Could not resolve a Google Meet meeting.');
        return;
      }

      await onConnectMeeting(meetUrlFromId(meetingId));

      const startResult = await startTranscriptionExtension({
        extensionId,
        playlistId,
        platform,
        meetingId,
        backendUrl,
        authToken,
        tabId,
        transcription,
      });

      if (!startResult.ok) {
        if (startResult.reason === 'stt_not_configured') {
          setExtensionError(sttNotConfiguredMessage);
        } else {
          setExtensionError(
            startResult.detail ?? 'Extension failed to start capture.',
          );
        }
        return;
      }

      setExtensionUiStatus('awaiting_capture');
      setExtensionError(
        'Click the DNA extension icon on your Google Meet tab, then choose Enable tab + mic capture. Allow microphone access when Chrome prompts you.',
      );
    } finally {
      setIsConnecting(false);
      void refreshExtensionStatus();
    }
  }, [
    authToken,
    backendUrl,
    extensionId,
    isPaused,
    onConnectMeeting,
    playlistId,
    refreshExtensionStatus,
  ]);

  useEffect(() => {
    if (!enabled || !isBotActive) {
      return;
    }
    setExtensionUiStatus(isPaused ? 'paused' : 'connected');
  }, [enabled, isBotActive, isPaused]);

  return {
    extensionUiStatus,
    extensionError,
    installUrl,
    refreshExtensionStatus,
    connectExtension,
    isConnecting,
  };
}

export async function disconnectExtensionCapture(
  extensionId: string,
): Promise<void> {
  if (!extensionId.trim()) {
    return;
  }
  await disconnectTranscriptionExtension(extensionId);
}
