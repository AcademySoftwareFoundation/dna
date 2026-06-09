import { useState } from 'react';
import { Dialog, Flex } from '@radix-ui/themes';
import type { DraftNote, RecordingClipInfo, Version } from '@dna/core';
import { PublishNotesTabContent } from './PublishNotesDialog';
import { AddRecordingButton } from './AddRecordingButton';
import { RecordingUploadModal } from './RecordingUploadModal';

export interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
}

const videoSegmentPublishEnabled =
  import.meta.env.VITE_ENABLE_VIDEO_SEGMENT_PUBLISH === 'true';

export function PublishDialog({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
}: PublishDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const [recordingModalOpen, setRecordingModalOpen] = useState(false);
  const [recordingId, setRecordingId] = useState<string | undefined>(undefined);
  const [recordingClips, setRecordingClips] = useState<RecordingClipInfo[]>([]);

  const handleRecordingComplete = (
    newRecordingId: string,
    clips: RecordingClipInfo[]
  ) => {
    setRecordingId(newRecordingId);
    setRecordingClips(clips);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}
    >
      <Dialog.Content
        maxWidth="900px"
        style={{
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
        }}
      >
        <Dialog.Description style={{ display: 'none' }}>
          Review and publish notes and transcripts to production tracking.
        </Dialog.Description>
        <Flex
          align="center"
          justify="between"
          gap="3"
          p="4"
          style={{ borderBottom: '1px solid var(--gray-a6)', flexShrink: 0 }}
        >
          <Dialog.Title style={{ margin: 0 }}>Publish</Dialog.Title>
          {videoSegmentPublishEnabled && (
            <AddRecordingButton
              onClick={() => setRecordingModalOpen(true)}
              disabled={isPending}
            />
          )}
        </Flex>
        <PublishNotesTabContent
          open={open}
          onClose={onClose}
          playlistId={playlistId}
          userEmail={userEmail}
          notes={notes}
          versions={versions}
          onPendingChange={setIsPending}
          showTitle={false}
          recordingId={recordingId}
          recordingClips={recordingClips}
        />
        {videoSegmentPublishEnabled && (
          <RecordingUploadModal
            open={recordingModalOpen}
            onClose={() => setRecordingModalOpen(false)}
            playlistId={playlistId}
            onComplete={handleRecordingComplete}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}
