import { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  AlertCircle,
  Clapperboard,
  ExternalLink,
  Loader2,
  MonitorX,
} from 'lucide-react';
import { Button, Popover, Text } from '@radix-ui/themes';
import type { RVSyncStatusEnum } from '@dna/core';
import { useRvSync } from '../hooks/useRvSync';

interface RvSyncMenuProps {
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

const StatusIndicator = styled.div<{ $status: RVSyncStatusEnum }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $status }) => {
    switch ($status) {
      case 'connecting':
        return theme.colors.status.warning;
      case 'connected':
        return theme.colors.status.success;
      case 'error':
        return theme.colors.status.error;
      default:
        return theme.colors.text.muted;
    }
  }};
  animation: ${({ $status }) => ($status === 'connecting' ? pulse : 'none')}
    1.5s ease-in-out infinite;
`;

const StatusText = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  flex: 1;
`;

const DetailText = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
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

const ButtonRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TriggerButton = styled.button<{ $syncStatus: RVSyncStatusEnum | null }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  height: 32px;
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $syncStatus }) =>
    $syncStatus === 'connected'
      ? theme.colors.text.primary
      : theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  svg.rv-icon {
    color: ${({ theme, $syncStatus }) => {
      switch ($syncStatus) {
        case 'connected':
          return theme.colors.status.success;
        case 'connecting':
          return theme.colors.status.warning;
        default:
          return theme.colors.text.muted;
      }
    }};
  }
`;

const CollapsedTriggerButton = styled(TriggerButton)`
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 48px;
  height: 48px;
  padding: 6px;
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

function getStatusLabel(
  status: RVSyncStatusEnum,
  versionName: string | null
): string {
  switch (status) {
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return versionName ? `In review: ${versionName}` : 'Connected to RV';
    case 'error':
      return 'Connection failed';
    default:
      return 'Not connected';
  }
}

export function RvSyncMenu({ playlistId, collapsed = false }: RvSyncMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    status,
    scanResults,
    isBusy,
    isLaunching,
    error,
    scanAndConnect,
    connect,
    disconnect,
    openInRv,
  } = useRvSync(playlistId);

  const syncStatus = status?.status ?? null;
  const isConnected = syncStatus === 'connected';

  const renderTrigger = () => {
    const icon = <Clapperboard size={collapsed ? 18 : 14} className="rv-icon" />;
    if (collapsed) {
      return (
        <CollapsedTriggerButton $syncStatus={syncStatus}>
          {icon}
        </CollapsedTriggerButton>
      );
    }
    return (
      <TriggerButton $syncStatus={syncStatus}>
        {icon}
        {isConnected ? 'RV Live' : 'RV Sync'}
      </TriggerButton>
    );
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <div style={{ display: 'inline-block' }}>{renderTrigger()}</div>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" sideOffset={8}>
        <MenuContainer>
          <Text size="2" weight="medium">
            RV In-Review Sync
          </Text>

          {status && (
            <StatusRow>
              <StatusIndicator $status={status.status} />
              <StatusText>
                {getStatusLabel(status.status, status.version_name)}
                {status.detail && !isConnected && (
                  <>
                    <br />
                    <DetailText>{status.detail}</DetailText>
                  </>
                )}
                {isConnected && status.detail && !status.version_id && (
                  <>
                    <br />
                    <DetailText>{status.detail}</DetailText>
                  </>
                )}
              </StatusText>
            </StatusRow>
          )}

          {error && (
            <ErrorMessage>
              <AlertCircle size={14} />
              {error.message}
            </ErrorMessage>
          )}

          <ButtonRow>
            {scanResults &&
              scanResults.map((r) => (
                <Button
                  key={r.port}
                  variant="soft"
                  onClick={() => connect(r.port)}
                  disabled={isBusy}
                >
                  Connect to {r.greeting} (port {r.port})
                </Button>
              ))}

            {isConnected ? (
              <Button
                color="red"
                variant="soft"
                onClick={disconnect}
                disabled={isBusy}
              >
                <MonitorX size={14} />
                Disconnect
              </Button>
            ) : (
              <>
                <Button
                  onClick={scanAndConnect}
                  disabled={isBusy || isLaunching || !playlistId}
                >
                  {isBusy ? <SpinnerIcon size={14} /> : <Clapperboard size={14} />}
                  Connect to RV
                </Button>
                <Button
                  variant="soft"
                  onClick={openInRv}
                  disabled={isBusy || isLaunching || !playlistId}
                >
                  {isLaunching ? (
                    <SpinnerIcon size={14} />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  {isLaunching ? 'Opening RV…' : 'Open playlist in RV'}
                </Button>
              </>
            )}
          </ButtonRow>
        </MenuContainer>
      </Popover.Content>
    </Popover.Root>
  );
}
