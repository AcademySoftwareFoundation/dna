import { useRef, useState } from 'react';
import styled from 'styled-components';
import {
  Dialog,
  Flex,
  Text,
  Button,
  TextField,
  Callout,
  Progress,
} from '@radix-ui/themes';
import { Info, UploadCloud } from 'lucide-react';
import type { RecordingClipInfo } from '@dna/core';
import { useUploadRecording } from '../hooks/useUploadRecording';

interface RecordingUploadModalProps {
  open: boolean;
  onClose: () => void;
  playlistId: number;
  onComplete: (recordingId: string, clips: RecordingClipInfo[]) => void;
}

const DropZone = styled.div<{ $dragging: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 28px 16px;
  border: 2px dashed
    ${({ theme, $dragging }) =>
      $dragging ? theme.colors.border.strong : theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme, $dragging }) =>
    $dragging ? theme.colors.bg.surfaceHover : theme.colors.bg.surface};
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  text-align: center;
`;

const HiddenInput = styled.input`
  display: none;
`;

// Zoom names the recording folder in local time; that name carries the
// recording start. Pull it from the file's relative path when the browser
// provides one (directory selection); otherwise the user supplies it.
function deriveFolderName(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  if (rel && rel.includes('/')) {
    return rel.split('/')[0];
  }
  return '';
}

export function RecordingUploadModal({
  open,
  onClose,
  playlistId,
  onComplete,
}: RecordingUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [folderName, setFolderName] = useState('');
  const [offset, setOffset] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutateAsync, isPending, isError, error, reset } =
    useUploadRecording();

  const acceptFile = (picked: File | null) => {
    if (!picked) return;
    setFile(picked);
    const derived = deriveFolderName(picked);
    if (derived) setFolderName(derived);
  };

  const resetState = () => {
    setFile(null);
    setFolderName('');
    setOffset('');
    setDragging(false);
    reset();
  };

  const handleClose = () => {
    if (isPending) return;
    resetState();
    onClose();
  };

  const handleProcess = async () => {
    if (!file) return;
    const parsedOffset = offset.trim() ? Number(offset) : undefined;
    const data = await mutateAsync({
      playlistId,
      file,
      folderName: folderName.trim() || undefined,
      offsetSeconds:
        parsedOffset !== undefined && !Number.isNaN(parsedOffset)
          ? parsedOffset
          : undefined,
    });
    onComplete(data.recording_id, data.clips);
    resetState();
    onClose();
  };

  // The recording start is derived from when the bot left the meeting; only a
  // file is required. Folder name / offset are optional refinements.
  const canProcess = !!file && !isPending;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => !isOpen && handleClose()}
    >
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>Add Recording</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Upload the meeting MP4. DNA aligns it using when the bot left the
          meeting, then cuts it into per-version clips from the transcript
          timing captured during the review.
        </Dialog.Description>

        <Flex direction="column" gap="3">
          <DropZone
            $dragging={dragging}
            onClick={() => !isPending && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isPending) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (isPending) return;
              acceptFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <UploadCloud size={28} />
            {file ? (
              <Text size="2" weight="medium">
                {file.name}
              </Text>
            ) : (
              <>
                <Text size="2" weight="medium">
                  Drag a recording here
                </Text>
                <Text size="1">or click to browse (.mp4)</Text>
              </>
            )}
            <HiddenInput
              ref={inputRef}
              type="file"
              accept=".mp4,video/*"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
          </DropZone>

          <label>
            <Text as="div" size="2" weight="medium" mb="1">
              Start offset (seconds, optional)
            </Text>
            <TextField.Root
              type="number"
              placeholder="0"
              value={offset}
              disabled={isPending}
              onChange={(e) => setOffset(e.target.value)}
            />
            <Text as="div" size="1" color="gray" mt="1">
              Nudge the alignment if clips land early or late. Positive shifts
              clips later.
            </Text>
          </label>

          <label>
            <Text as="div" size="2" weight="medium" mb="1">
              Zoom folder name (optional)
            </Text>
            <TextField.Root
              placeholder="2026-05-27 06.44.49 Cameron Target's Zoom Meeting"
              value={folderName}
              disabled={isPending}
              onChange={(e) => setFolderName(e.target.value)}
            />
            <Text as="div" size="1" color="gray" mt="1">
              Only used as a fallback when the meeting has no recorded end time.
            </Text>
          </label>

          {isPending && (
            <Flex direction="column" gap="2">
              <Text size="1" color="gray">
                Processing recording…
              </Text>
              <Progress duration="60s" />
            </Flex>
          )}

          {isError && (
            <Callout.Root color="red">
              <Callout.Icon>
                <Info size={16} />
              </Callout.Icon>
              <Callout.Text>
                {error?.message || 'Failed to process the recording'}
              </Callout.Text>
            </Callout.Root>
          )}
        </Flex>

        <Flex gap="3" mt="4" justify="end">
          <Button
            variant="soft"
            color="gray"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleProcess()} disabled={!canProcess}>
            Process recording
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
