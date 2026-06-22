import { useState, useCallback } from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import {
  Phone,
  PhoneOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Radio,
  Pause,
  Play,
} from 'lucide-react';
import { Button, TextField, Popover, Text } from '@radix-ui/themes';
import type { BotStatusEnum } from '@dna/core';
import {
  useTranscription,
  useExtensionTranscriptionBridge,
  disconnectExtensionCapture,
  parseMeetingUrl,
  usePlaylistMetadata,
  useUpsertPlaylistMetadata,
} from '../hooks';
import { useAuth } from '../contexts';
import { SplitButton } from './SplitButton';

interface TranscriptionMenuProps {
  playlistId: number | null;
  collapsed?: boolean;
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const MenuContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 280px;
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const StatusIndicator = styled.div<{ $status: BotStatusEnum }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $status }) => {
    switch ($status) {
      case 'joining':
      case 'waiting_room':
        return theme.colors.status.warning;
      case 'in_call':
      case 'transcribing':
        return theme.colors.status.success;
      case 'failed':
        return theme.colors.status.error;
      case 'stopped':
      case 'completed':
        return theme.colors.text.muted;
      default:
        return theme.colors.text.muted;
    }
  }};
  animation: ${({ $status }) =>
      $status === 'joining' ||
      $status === 'transcribing' ||
      $status === 'waiting_room'
        ? pulse
        : 'none'}
    1.5s ease-in-out infinite;
`;

const ExtensionInstructions = styled.div`
  padding: 8px 12px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 12px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const isExtensionTranscriptionMode =
  import.meta.env.VITE_TRANSCRIPTION_MODE === 'extension';

const transcriptionExtensionId =
  import.meta.env.VITE_TRANSCRIPTION_EXTENSION_ID?.trim() ?? '';

const extensionStatusLabel: Record<string, string> = {
  not_installed: 'Extension not installed',
  disconnected: 'Extension disconnected',
  awaiting_tab: 'Choose Meet tab in extension',
  awaiting_capture: 'Enable capture on Meet tab',
  connecting: 'Connecting extension…',
  connected: 'Extension connected',
  paused: 'Extension paused',
};

const StatusText = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  flex: 1;
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.status.error};
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
`;

type PhoneStatus = 'disconnected' | 'connecting' | 'connected';

const TriggerButton = styled.button<{
  $isActive: boolean;
  $phoneStatus: PhoneStatus;
}>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $isActive }) =>
    $isActive ? theme.colors.text.primary : theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  svg.phone-icon {
    color: ${({ theme, $phoneStatus }) => {
      switch ($phoneStatus) {
        case 'connected':
          return theme.colors.status.success;
        case 'connecting':
          return theme.colors.status.warning;
        case 'disconnected':
        default:
          return theme.colors.status.error;
      }
    }};
  }
`;

const SpinnerIcon = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const PulsingPhone = styled(Phone)<{ $shouldPulse: boolean }>`
  animation: ${({ $shouldPulse }) => ($shouldPulse ? pulse : 'none')} 1.5s
    ease-in-out infinite;
`;

const CollapsedTriggerButton = styled.button<{ $phoneStatus: PhoneStatus }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 48px;
  height: 48px;
  padding: 6px;
  font-size: 10px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  svg.phone-icon {
    color: ${({ theme, $phoneStatus }) => {
      switch ($phoneStatus) {
        case 'connected':
          return theme.colors.status.success;
        case 'connecting':
          return theme.colors.status.warning;
        case 'disconnected':
        default:
          return theme.colors.status.error;
      }
    }};
  }
`;

function getStatusLabel(status: BotStatusEnum, isPaused: boolean): string {
  switch (status) {
    case 'idle':
      return 'Ready';
    case 'joining':
      return 'Joining...';
    case 'waiting_room':
      return 'Awaiting Admission';
    case 'in_call':
      return isPaused ? 'Paused' : 'In Call';
    case 'transcribing':
      return isPaused ? 'Paused' : 'Transcribing';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return 'Stopped';
    case 'completed':
      return 'Completed';
    default:
      return 'Unknown';
  }
}

function getButtonStatusLabel(
  status: BotStatusEnum,
  isPaused: boolean
): string {
  switch (status) {
    case 'joining':
      return 'Joining...';
    case 'waiting_room':
      return 'Waiting';
    case 'in_call':
    case 'transcribing':
      return isPaused ? 'Paused' : 'Live';
    default:
      return '';
  }
}

function getPhoneStatus(status: BotStatusEnum): PhoneStatus {
  switch (status) {
    case 'in_call':
    case 'transcribing':
      return 'connected';
    case 'joining':
    case 'waiting_room':
      return 'connecting';
    case 'idle':
    case 'failed':
    case 'stopped':
    case 'completed':
    default:
      return 'disconnected';
  }
}

function getStatusIcon(status: BotStatusEnum) {
  switch (status) {
    case 'joining':
    case 'waiting_room':
      return <SpinnerIcon size={14} />;
    case 'in_call':
    case 'transcribing':
      return <Radio size={14} />;
    case 'failed':
      return <AlertCircle size={14} />;
    case 'completed':
      return <CheckCircle2 size={14} />;
    default:
      return null;
  }
}

export function TranscriptionMenu({
  playlistId,
  collapsed = false,
}: TranscriptionMenuProps) {
  const [meetingUrl, setMeetingUrl] = useState('');
  const [passcode, setPasscode] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();
  const { token } = useAuth();
  const backendUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

  const {
    session,
    status,
    isDispatching,
    isStopping,
    error,
    dispatchBot,
    stopBot,
    clearSession,
  } = useTranscription({ playlistId });

  const { data: metadata } = usePlaylistMetadata(playlistId);
  const { mutate: upsertMetadata } = useUpsertPlaylistMetadata(playlistId);

  const currentStatus = status?.status ?? session?.status ?? 'idle';
  const isActive = [
    'joining',
    'waiting_room',
    'in_call',
    'transcribing',
  ].includes(currentStatus);
  const isPaused = metadata?.transcription_paused ?? false;

  const {
    extensionUiStatus,
    extensionError,
    installUrl,
    refreshExtensionStatus,
    connectExtension,
    isConnecting,
  } = useExtensionTranscriptionBridge({
    extensionId: transcriptionExtensionId,
    playlistId,
    backendUrl,
    authToken: token,
    enabled: isExtensionTranscriptionMode && isOpen,
    isPaused,
    isBotActive: isActive,
    onConnectMeeting: async (url) => {
      await dispatchBot(url, passcode || undefined);
    },
    onDisconnect: stopBot,
  });

  const phoneStatus = getPhoneStatus(currentStatus);
  const needsPasscode =
    !isExtensionTranscriptionMode &&
    parseMeetingUrl(meetingUrl)?.platform === 'teams';

  const isLiveButPaused =
    isPaused && ['in_call', 'transcribing'].includes(currentStatus);
  const isAwaitingAdmission = currentStatus === 'waiting_room';
  const shouldPulseYellow = isLiveButPaused || isAwaitingAdmission;

  const getPhoneIconColor = () => {
    if (shouldPulseYellow) {
      return theme.colors.status.warning;
    }
    switch (phoneStatus) {
      case 'connected':
        return theme.colors.status.success;
      case 'connecting':
        return theme.colors.status.warning;
      case 'disconnected':
      default:
        return theme.colors.status.error;
    }
  };

  const phoneIconColor = getPhoneIconColor();

  const handlePauseToggle = useCallback(() => {
    upsertMetadata({ transcription_paused: !isPaused });
  }, [upsertMetadata, isPaused]);

  const handleDispatch = useCallback(async () => {
    if (!meetingUrl.trim()) return;

    try {
      await dispatchBot(meetingUrl, passcode || undefined);
      setMeetingUrl('');
      setPasscode('');
    } catch {
      // Error is handled by the hook
    }
  }, [meetingUrl, passcode, dispatchBot]);

  const handleStop = useCallback(async () => {
    try {
      if (isExtensionTranscriptionMode && transcriptionExtensionId) {
        await disconnectExtensionCapture(transcriptionExtensionId);
      }
      await stopBot();
    } catch {
      // Error is handled by the hook
    }
  }, [stopBot]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && isExtensionTranscriptionMode) {
      void refreshExtensionStatus();
    }
    if (!open && !isActive) {
      clearSession();
      setMeetingUrl('');
      setPasscode('');
    }
  };

  const renderMainButtonContent = () => {
    if (collapsed) {
      return <PulsingPhone size={18} color={phoneIconColor} $shouldPulse={shouldPulseYellow} />;
    }

    return (
      <>
        <PulsingPhone size={14} color={phoneIconColor} $shouldPulse={shouldPulseYellow} />
        {isActive ? (
          <>
            <StatusIndicator $status={currentStatus} />
            {getButtonStatusLabel(currentStatus, isPaused)}
          </>
        ) : (
          'Transcription'
        )}
      </>
    );
  };

  const renderTrigger = () => {
    if (isActive) {
      return (
        <SplitButton
          onRightClick={handlePauseToggle}
          rightSlot={isPaused ? <Play size={14} /> : <Pause size={14} />}
        >
          {renderMainButtonContent()}
        </SplitButton>
      );
    }

    if (collapsed) {
      return (
        <CollapsedTriggerButton $phoneStatus={phoneStatus}>
          <Phone size={18} className="phone-icon" />
        </CollapsedTriggerButton>
      );
    }

    return (
      <TriggerButton $isActive={isActive} $phoneStatus={phoneStatus}>
        <Phone size={14} className="phone-icon" />
        Transcription
      </TriggerButton>
    );
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <div style={{ display: 'inline-block' }}>{renderTrigger()}</div>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" sideOffset={8}>
        <MenuContainer>
          <Text size="2" weight="medium">
            Meeting Transcription
          </Text>

          {session && (
            <StatusRow>
              <StatusIndicator $status={currentStatus} />
              {getStatusIcon(currentStatus)}
              <StatusText>{getStatusLabel(currentStatus, isPaused)}</StatusText>
            </StatusRow>
          )}

          {error && (
            <ErrorMessage>
              <AlertCircle size={14} />
              {error.message}
            </ErrorMessage>
          )}

          {isExtensionTranscriptionMode && extensionError && (
            <ErrorMessage>
              <AlertCircle size={14} />
              {extensionError}
            </ErrorMessage>
          )}

          {isExtensionTranscriptionMode && (
            <StatusRow>
              <StatusIndicator $status={isActive ? currentStatus : 'idle'} />
              <StatusText>
                {extensionStatusLabel[extensionUiStatus] ??
                  extensionUiStatus}
              </StatusText>
            </StatusRow>
          )}

          {isExtensionTranscriptionMode &&
            extensionUiStatus === 'not_installed' && (
              <Text size="1" as="p">
                <a href={installUrl} target="_blank" rel="noreferrer">
                  Install DNA Meet Transcription extension
                </a>
              </Text>
            )}

          {!isActive && !isExtensionTranscriptionMode && (
            <InputGroup>
              <TextField.Root
                placeholder="Paste meeting URL..."
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                disabled={isDispatching || !playlistId}
              />
              {needsPasscode && (
                <TextField.Root
                  placeholder="Passcode (if required)"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  disabled={isDispatching}
                />
              )}
            </InputGroup>
          )}

          <ButtonRow>
            {isActive ? (
              <Button
                color="red"
                variant="soft"
                onClick={handleStop}
                disabled={isStopping}
                style={{ flex: 1 }}
              >
                {isStopping ? (
                  <>
                    <SpinnerIcon size={14} />
                    Stopping...
                  </>
                ) : (
                  <>
                    <PhoneOff size={14} />
                    Stop Transcription
                  </>
                )}
              </Button>
            ) : isExtensionTranscriptionMode ? (
              <Button
                variant="solid"
                onClick={() => void connectExtension()}
                disabled={
                  isConnecting ||
                  isDispatching ||
                  !playlistId ||
                  extensionUiStatus === 'not_installed' ||
                  !token
                }
                style={{ flex: 1 }}
              >
                {isConnecting || isDispatching ? (
                  <>
                    <SpinnerIcon size={14} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone size={14} />
                    Connect
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="solid"
                onClick={handleDispatch}
                disabled={isDispatching || !meetingUrl.trim() || !playlistId}
                style={{ flex: 1 }}
              >
                {isDispatching ? (
                  <>
                    <SpinnerIcon size={14} />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Phone size={14} />
                    Start Transcription
                  </>
                )}
              </Button>
            )}
          </ButtonRow>

          {isExtensionTranscriptionMode && extensionUiStatus === 'awaiting_tab' && (
            <ExtensionInstructions>
              Multiple Meet tabs are open. Click the extension icon in your
              toolbar and choose the tab to transcribe.
            </ExtensionInstructions>
          )}

          {isExtensionTranscriptionMode && extensionUiStatus === 'awaiting_capture' && (
            <ExtensionInstructions>
              Switch to your Google Meet tab, click the DNA extension icon in
              the toolbar, then click Enable tab + mic capture. Allow microphone
              access when prompted.
            </ExtensionInstructions>
          )}

          {!isExtensionTranscriptionMode && !playlistId && (
            <Text size="1" color="gray">
              Select a playlist to enable transcription
            </Text>
          )}
        </MenuContainer>
      </Popover.Content>
    </Popover.Root>
  );
}
