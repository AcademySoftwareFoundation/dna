import { useState, useCallback, useEffect } from 'react';
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
  parseMeetingUrl,
  usePlaylistMetadata,
  useUpsertPlaylistMetadata,
  useTranscriptionExtension,
} from '../hooks';
import type { ExtensionConnectionStatus } from '../transcriptionExtension/sendTranscriptionExtension';
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

const ExtensionSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const InstallLink = styled.a`
  color: ${({ theme }) => theme.colors.status.error};
  text-decoration: underline;
  margin-left: 4px;
`;

const ConnectionDot = styled.div<{ $connection: ExtensionConnectionStatus }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $connection }) => {
    switch ($connection) {
      case 'connected':
        return theme.colors.status.success;
      case 'connecting':
      case 'needs_permission':
        return theme.colors.status.warning;
      case 'disconnected':
      default:
        return theme.colors.status.error;
    }
  }};
  animation: ${({ $connection }) =>
      $connection === 'connecting' || $connection === 'needs_permission'
        ? pulse
        : 'none'}
    1.5s ease-in-out infinite;
`;

function getExtensionPhoneStatus(
  connection: ExtensionConnectionStatus,
  awaitingExtension: boolean
): PhoneStatus {
  if (connection === 'connected') return 'connected';
  if (
    connection === 'connecting' ||
    connection === 'needs_permission' ||
    awaitingExtension
  ) {
    return 'connecting';
  }
  return 'disconnected';
}

function getExtensionStatusLabel(connection: ExtensionConnectionStatus): string {
  switch (connection) {
    case 'connected':
      return 'Connected — sending transcripts';
    case 'connecting':
      return 'Extension connecting…';
    case 'needs_permission':
      return 'Waiting for extension permission';
    case 'disconnected':
    default:
      return 'Disconnected';
  }
}

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

  const {
    available: extAvailable,
    installState: extInstallState,
    connection: extConnection,
    installUrl: extInstallUrl,
    isActivating: extActivating,
    error: extError,
    activate: activateExtension,
  } = useTranscriptionExtension(playlistId, metadata?.in_review ?? null);
  const [extPromptPermission, setExtPromptPermission] = useState(false);

  useEffect(() => {
    if (!extAvailable) return;
    if (extConnection === 'needs_permission' || extConnection === 'connecting') {
      setExtPromptPermission(true);
    } else if (extConnection === 'disconnected') {
      setExtPromptPermission(false);
    }
  }, [extAvailable, extConnection]);

  const handleActivateExtension = useCallback(async () => {
    const ok = await activateExtension();
    if (ok) setExtPromptPermission(true);
    else setExtPromptPermission(false);
  }, [activateExtension]);

  const currentStatus = status?.status ?? session?.status ?? 'idle';
  const isActive = [
    'joining',
    'waiting_room',
    'in_call',
    'transcribing',
  ].includes(currentStatus);
  const phoneStatus = getPhoneStatus(currentStatus);
  const needsPasscode = parseMeetingUrl(meetingUrl)?.platform === 'teams';
  const isPaused = metadata?.transcription_paused ?? false;
  const isLiveButPaused =
    isPaused && ['in_call', 'transcribing'].includes(currentStatus);
  const isAwaitingAdmission = currentStatus === 'waiting_room';

  const extensionMode = extAvailable;
  const extAwaiting =
    extPromptPermission && extConnection !== 'connected';
  const effectivePhoneStatus = extensionMode
    ? getExtensionPhoneStatus(extConnection, extAwaiting)
    : phoneStatus;
  const isExtConnected = extensionMode && extConnection === 'connected';
  const showActiveState = extensionMode ? isExtConnected : isActive;
  const shouldPulseExtension =
    extensionMode &&
    (extConnection === 'connecting' ||
      extConnection === 'needs_permission' ||
      extAwaiting);
  const shouldPulseYellow = extensionMode
    ? shouldPulseExtension
    : isLiveButPaused || isAwaitingAdmission;

  const getPhoneIconColor = () => {
    if (shouldPulseYellow) {
      return theme.colors.status.warning;
    }
    switch (effectivePhoneStatus) {
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
      await stopBot();
    } catch {
      // Error is handled by the hook
    }
  }, [stopBot]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && !isActive) {
      clearSession();
      setMeetingUrl('');
      setPasscode('');
    }
  };

  const renderMainButtonContent = () => {
    if (collapsed) {
      return (
        <PulsingPhone
          size={18}
          color={phoneIconColor}
          $shouldPulse={shouldPulseYellow}
        />
      );
    }

    if (extensionMode && isExtConnected) {
      return (
        <>
          <PulsingPhone size={14} color={phoneIconColor} $shouldPulse={false} />
          <ConnectionDot $connection="connected" />
          Live
        </>
      );
    }

    return (
      <>
        <PulsingPhone size={14} color={phoneIconColor} $shouldPulse={shouldPulseYellow} />
        {showActiveState && !extensionMode ? (
          <>
            <StatusIndicator $status={currentStatus} />
            {getButtonStatusLabel(currentStatus, isPaused)}
          </>
        ) : extensionMode && effectivePhoneStatus === 'connecting' ? (
          'Connecting…'
        ) : (
          'Transcription'
        )}
      </>
    );
  };

  const renderTrigger = () => {
    if (showActiveState && !extensionMode) {
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
        <CollapsedTriggerButton $phoneStatus={effectivePhoneStatus}>
          {extensionMode ? (
            <PulsingPhone
              size={18}
              color={phoneIconColor}
              $shouldPulse={shouldPulseYellow}
            />
          ) : (
            <Phone size={18} className="phone-icon" />
          )}
        </CollapsedTriggerButton>
      );
    }

    return (
      <TriggerButton $isActive={showActiveState} $phoneStatus={effectivePhoneStatus}>
        {extensionMode ? (
          renderMainButtonContent()
        ) : (
          <>
            <Phone size={14} className="phone-icon" />
            Transcription
          </>
        )}
      </TriggerButton>
    );
  };

  const renderExtensionPanel = () => (
    <ExtensionSection>
      <StatusRow>
        <ConnectionDot $connection={extConnection} />
        <StatusText>{getExtensionStatusLabel(extConnection)}</StatusText>
      </StatusRow>

      {extInstallState === 'not_installed' && (
        <ErrorMessage>
          <AlertCircle size={14} />
          DNA extension not detected.
          {extInstallUrl && (
            <InstallLink href={extInstallUrl} target="_blank" rel="noreferrer">
              Install
            </InstallLink>
          )}
        </ErrorMessage>
      )}

      {extError && (
        <ErrorMessage>
          <AlertCircle size={14} />
          {extError}
        </ErrorMessage>
      )}

      <Button
        variant="soft"
        onClick={handleActivateExtension}
        disabled={extActivating || !playlistId || extConnection === 'connected'}
      >
        {extActivating ? (
          <>
            <SpinnerIcon size={14} />
            Activating...
          </>
        ) : (
          <>
            <Radio size={14} />
            Transcribe via Extension
          </>
        )}
      </Button>

      {(extConnection === 'needs_permission' || extAwaiting) && (
        <Text size="1" color="amber">
          Open the DNA extension from your browser toolbar, select your Google
          Meet tab, and click &quot;Grant permission &amp; start&quot;.
        </Text>
      )}
    </ExtensionSection>
  );

  const renderVexaPanel = () => (
    <>
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

      {!isActive && (
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
    </>
  );

  return (
    <Popover.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <div style={{ display: 'inline-block' }}>{renderTrigger()}</div>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" sideOffset={8}>
        <MenuContainer>
          <Text size="2" weight="medium">
            {extensionMode ? 'Extension Transcription' : 'Meeting Transcription'}
          </Text>

          {extensionMode ? renderExtensionPanel() : renderVexaPanel()}

          {!playlistId && (
            <Text size="1" color="gray">
              Select a playlist to enable transcription
            </Text>
          )}
        </MenuContainer>
      </Popover.Content>
    </Popover.Root>
  );
}
