import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@radix-ui/themes';
import { Loader2, MessageSquare, AlertCircle, Upload } from 'lucide-react';
import { useSegments } from '../hooks';
import { useConnectionStatus } from '../hooks/useDNAEvents';
import { PublishTranscriptDialog } from './PublishTranscriptDialog';

interface TranscriptPanelProps {
  playlistId: number | null;
  versionId: number | null;
}

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 300px;
  overflow: hidden;
`;

const SegmentList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
`;

const SegmentItem = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
  }
`;

const SegmentHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
`;

const SpeakerName = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Timestamp = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const SegmentText = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const StateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  gap: 12px;
`;

const StateText = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const StatusBar = styled.div<{ $isConnected: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  background: ${({ theme }) => theme.colors.bg.surface};
`;

const PublishBar = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 6px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

function publishEnabled(): boolean {
  // 部署時用 VITE_ENABLE_TRANSCRIPT_PUBLISH=true 打開，才會出現 Publish 按鈕
  const flag = import.meta.env.VITE_ENABLE_TRANSCRIPT_PUBLISH;
  return flag === 'true' || flag === true;
}

const StatusDot = styled.div<{ $isConnected: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $isConnected, theme }) =>
    $isConnected ? theme.colors.accent.success : theme.colors.accent.warning};
`;

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function TranscriptPanel({
  playlistId,
  versionId,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const { isConnected } = useConnectionStatus();
  const { segments, isLoading, isError, error } = useSegments({
    playlistId,
    versionId,
  });
  const showPublish = publishEnabled() && !!playlistId && !!versionId;

  useEffect(() => {
    if (scrollRef.current && segments.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments.length]);

  if (!playlistId || !versionId) {
    return (
      <StateContainer>
        <MessageSquare size={32} opacity={0.3} />
        <StateText>Select a version to view transcript</StateText>
      </StateContainer>
    );
  }

  if (isLoading) {
    return (
      <StateContainer>
        <Loader2 size={24} className="animate-spin" />
        <StateText>Loading transcript...</StateText>
      </StateContainer>
    );
  }

  if (isError) {
    return (
      <StateContainer>
        <AlertCircle size={24} />
        <StateText>{error?.message || 'Failed to load transcript'}</StateText>
      </StateContainer>
    );
  }

  if (segments.length === 0) {
    return (
      <PanelContainer>
        <StatusBar $isConnected={isConnected}>
          <StatusDot $isConnected={isConnected} />
          {isConnected ? 'Connected - waiting for transcript' : 'Connecting...'}
        </StatusBar>
        <StateContainer>
          <MessageSquare size={32} opacity={0.3} />
          <StateText>No transcript segments yet</StateText>
        </StateContainer>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <StatusBar $isConnected={isConnected}>
        <StatusDot $isConnected={isConnected} />
        {isConnected ? 'Live' : 'Reconnecting...'} • {segments.length} segments
      </StatusBar>
      {showPublish && (
        <PublishBar>
          <Button
            size="1"
            variant="soft"
            onClick={() => setPublishOpen(true)}
            disabled={segments.length === 0}
          >
            <Upload size={14} />
            Publish transcript
          </Button>
        </PublishBar>
      )}
      <SegmentList ref={scrollRef}>
        {segments.map((segment) => (
          <SegmentItem key={segment.segment_id}>
            <SegmentHeader>
              <SpeakerName>{segment.speaker || 'Unknown'}</SpeakerName>
              <Timestamp>{formatTime(segment.absolute_start_time)}</Timestamp>
            </SegmentHeader>
            <SegmentText>{segment.text}</SegmentText>
          </SegmentItem>
        ))}
      </SegmentList>
      {showPublish && playlistId !== null && versionId !== null && (
        <PublishTranscriptDialog
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          playlistId={playlistId}
          versionId={versionId}
          segmentsCount={segments.length}
        />
      )}
    </PanelContainer>
  );
}
