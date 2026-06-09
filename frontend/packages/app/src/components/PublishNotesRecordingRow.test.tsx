import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../test/render';
import userEvent from '@testing-library/user-event';
import { Dialog } from '@radix-ui/themes';
import type { RecordingClipInfo, Version } from '@dna/core';
import { PublishNotesTabContent } from './PublishNotesDialog';

const mockPublishVideoSegments = vi.fn();
const mockPublishNotes = vi.fn();
const mockPublishTranscript = vi.fn();
// Stable identity: the reset-on-open effect depends on `reset`, so a fresh fn
// per render would re-fire it and wipe the success summary.
const mockReset = vi.fn();

vi.mock('../hooks/usePublishVideoSegments', () => ({
  usePublishVideoSegments: () => ({ mutateAsync: mockPublishVideoSegments }),
}));
vi.mock('../hooks/usePublishTranscript', () => ({
  usePublishTranscript: () => ({ mutateAsync: mockPublishTranscript }),
}));
vi.mock('../hooks/usePublishNotes', () => ({
  usePublishNotes: () => ({
    mutateAsync: mockPublishNotes,
    isPending: false,
    isError: false,
    error: null,
    reset: mockReset,
  }),
}));
vi.mock('../hooks/useNoteQCChecks', () => ({
  useNoteQCChecks: () => ({
    results: {},
    loading: false,
    ignored: new Set<string>(),
    toggleIgnore: vi.fn(),
    refreshDraft: vi.fn().mockResolvedValue(undefined),
    hasBlockingErrors: () => false,
    refreshingDraftKey: null,
  }),
}));

// useSegments pulls in EventContext (websocket); stub it out for these tests.
vi.mock('../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks')>();
  return {
    ...actual,
    useSegments: () => ({
      segments: [],
      isLoading: false,
      isError: false,
      error: null,
    }),
  };
});

import { apiHandler } from '../api';

const version10: Version = { type: 'Version', id: 10, name: 'Shot 010' };

function clip(over: Partial<RecordingClipInfo> = {}): RecordingClipInfo {
  return {
    clip_id: 'c1',
    version_id: 10,
    thumb_id: 't1',
    duration_seconds: 12,
    video_in_seconds: 300,
    video_out_seconds: 312,
    ...over,
  };
}

function renderContent(clips: RecordingClipInfo[]) {
  return render(
    <Dialog.Root open>
      <Dialog.Content>
        <PublishNotesTabContent
          open
          onClose={() => {}}
          playlistId={42}
          userEmail="me@test.com"
          notes={[]}
          versions={[version10]}
          recordingId="rec-1"
          recordingClips={clips}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}

describe('PublishNotesTabContent recording row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(apiHandler, 'getAttachmentBlobUrl').mockResolvedValue(
      'blob:thumb-url'
    );
    mockPublishNotes.mockResolvedValue({
      published_count: 0,
      republished_count: 0,
      failed_count: 0,
    });
    mockPublishTranscript.mockResolvedValue({
      transcript_entity_id: 1,
      outcome: 'skipped',
      segments_count: 0,
    });
    mockPublishVideoSegments.mockResolvedValue({
      video_segment_entity_id: 7000,
      outcome: 'created',
      clips_count: 1,
    });
  });

  it('renders a Recording row for a version that has clips', async () => {
    renderContent([clip()]);
    expect(screen.getByText('Recording')).toBeInTheDocument();
    expect(screen.getByText(/1 clip/)).toBeInTheDocument();
    // Thumbnail is fetched via the attachment endpoint (Dialog portals to body).
    await waitFor(() =>
      expect(document.querySelector('img')).toHaveAttribute(
        'src',
        'blob:thumb-url'
      )
    );
  });

  it('counts the checked recording in the publish button', () => {
    renderContent([clip()]);
    expect(
      screen.getByRole('button', { name: /Publish selected \(1\)/ })
    ).toBeInTheDocument();
  });

  it('publishes the recording and reports it in the summary', async () => {
    renderContent([clip()]);

    await userEvent.click(
      screen.getByRole('button', { name: /Publish selected/ })
    );

    await waitFor(() =>
      expect(mockPublishVideoSegments).toHaveBeenCalledWith({
        playlistId: 42,
        request: { version_id: 10, recording_id: 'rec-1' },
      })
    );
    expect(
      await screen.findByText('Publishing Complete!', {}, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(screen.getByText(/Recordings Published:/)).toHaveTextContent(
      'Recordings Published: 1'
    );
  });

  it('unchecking the recording removes it from the count and publish', async () => {
    renderContent([clip()]);

    // The recording checkbox is the only checkbox (no notes, transcription off).
    const checkbox = screen.getByRole('checkbox');
    await userEvent.click(checkbox);

    expect(
      screen.getByRole('button', { name: 'Publish selected' })
    ).toBeDisabled();
    expect(mockPublishVideoSegments).not.toHaveBeenCalled();
  });
});
