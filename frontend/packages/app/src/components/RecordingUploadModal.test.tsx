import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../test/render';
import userEvent from '@testing-library/user-event';
import { RecordingUploadModal } from './RecordingUploadModal';

const mockMutateAsync = vi.fn();
let hookState: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
};

vi.mock('../hooks/useUploadRecording', () => ({
  useUploadRecording: () => ({
    mutateAsync: mockMutateAsync,
    isPending: hookState.isPending,
    isError: hookState.isError,
    error: hookState.error,
    reset: vi.fn(),
  }),
}));

function setup(onComplete = vi.fn(), onClose = vi.fn()) {
  render(
    <RecordingUploadModal
      open
      onClose={onClose}
      playlistId={42}
      onComplete={onComplete}
    />
  );
  return { onComplete, onClose };
}

const mp4 = () => new File(['data'], 'zoom_0.mp4', { type: 'video/mp4' });

describe('RecordingUploadModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState = { isPending: false, isError: false, error: null };
  });

  it('disables Process until a file is provided', async () => {
    setup();
    const process = screen.getByRole('button', { name: 'Process recording' });
    expect(process).toBeDisabled();

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    await userEvent.upload(input, mp4());
    // A file is all that's required; alignment comes from the meeting end.
    expect(process).toBeEnabled();
  });

  it('calls uploadRecording with just the file and onComplete on process', async () => {
    mockMutateAsync.mockResolvedValue({
      recording_id: 'rec-1',
      clips: [{ clip_id: 'c1', version_id: 10, thumb_id: 't1' }],
    });
    const { onComplete } = setup();

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = mp4();
    await userEvent.upload(input, file);
    await userEvent.click(
      screen.getByRole('button', { name: 'Process recording' })
    );

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        playlistId: 42,
        file,
        folderName: undefined,
        offsetSeconds: undefined,
      })
    );
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith('rec-1', [
        { clip_id: 'c1', version_id: 10, thumb_id: 't1' },
      ])
    );
  });

  it('passes a manual offset when provided', async () => {
    mockMutateAsync.mockResolvedValue({ recording_id: 'rec-1', clips: [] });
    setup();

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = mp4();
    await userEvent.upload(input, file);
    await userEvent.type(screen.getByPlaceholderText('0'), '5');
    await userEvent.click(
      screen.getByRole('button', { name: 'Process recording' })
    );

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        playlistId: 42,
        file,
        folderName: undefined,
        offsetSeconds: 5,
      })
    );
  });

  it('shows a progress indicator while processing', () => {
    hookState.isPending = true;
    setup();
    expect(screen.getByText('Processing recording…')).toBeInTheDocument();
  });

  it('shows an error callout on failure', () => {
    hookState.isError = true;
    hookState.error = new Error('ffmpeg blew up');
    setup();
    expect(screen.getByText('ffmpeg blew up')).toBeInTheDocument();
  });
});
