import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../test/render';
import userEvent from '@testing-library/user-event';
import { PublishTranscriptDialog } from './PublishTranscriptDialog';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    publishTranscript: vi.fn(),
    setUser: vi.fn(),
    getUser: vi.fn().mockReturnValue(null),
  },
}));

const mockedApiHandler = vi.mocked(apiHandler);

describe('PublishTranscriptDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render the body when closed', () => {
    render(
      <PublishTranscriptDialog
        open={false}
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={12}
      />
    );

    expect(screen.queryByText(/Publish transcript/i)).not.toBeInTheDocument();
  });

  it('shows the summary counts when open', () => {
    render(
      <PublishTranscriptDialog
        open
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={12}
      />
    );

    expect(screen.getByText(/Publish transcript/i)).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it('disables the publish button when there are no segments', () => {
    render(
      <PublishTranscriptDialog
        open
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={0}
      />
    );

    const button = screen.getByRole('button', { name: /^Publish$/i });
    expect(button).toBeDisabled();
  });

  it('calls publishTranscript and shows the created outcome', async () => {
    mockedApiHandler.publishTranscript.mockResolvedValue({
      transcript_entity_id: 9001,
      outcome: 'created',
      segments_count: 12,
    });

    render(
      <PublishTranscriptDialog
        open
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={12}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));

    await waitFor(() =>
      expect(mockedApiHandler.publishTranscript).toHaveBeenCalledWith({
        playlistId: 42,
        request: { version_id: 101 },
      })
    );
    await waitFor(() =>
      expect(screen.getByText(/Published/i)).toBeInTheDocument()
    );
  });

  it('renders the skipped callout when backend returns skipped', async () => {
    mockedApiHandler.publishTranscript.mockResolvedValue({
      transcript_entity_id: 9001,
      outcome: 'skipped',
      skipped_reason: 'no_changes_since_last_publish',
      segments_count: 12,
    });

    render(
      <PublishTranscriptDialog
        open
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={12}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));

    await waitFor(() =>
      expect(screen.getByText(/No changes/i)).toBeInTheDocument()
    );
  });

  it('surfaces server errors in a red callout', async () => {
    mockedApiHandler.publishTranscript.mockRejectedValue(
      new Error('Server error')
    );

    render(
      <PublishTranscriptDialog
        open
        onClose={vi.fn()}
        playlistId={42}
        versionId={101}
        segmentsCount={12}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Publish$/i }));

    await waitFor(() =>
      expect(screen.getByText(/Server error/i)).toBeInTheDocument()
    );
  });
});
