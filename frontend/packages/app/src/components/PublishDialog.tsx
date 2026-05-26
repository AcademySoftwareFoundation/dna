import { useState } from 'react';
import { Dialog, Flex } from '@radix-ui/themes';
import type { DraftNote, Version } from '@dna/core';
import { PublishNotesTabContent } from './PublishNotesDialog';

export interface PublishDialogProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  userEmail: string;
  notes: DraftNote[];
  versions?: Version[];
}

export function PublishDialog({
  open,
  onClose,
  playlistId,
  userEmail,
  notes,
  versions = [],
}: PublishDialogProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}>
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
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}
