import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { useUploadRecording } from './useUploadRecording';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    uploadRecording: vi.fn(),
  },
}));

const mockedApiHandler = vi.mocked(apiHandler);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useUploadRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls apiHandler.uploadRecording and resolves with the response', async () => {
    mockedApiHandler.uploadRecording.mockResolvedValue({
      recording_id: 'rec-1',
      clips: [
        {
          clip_id: 'c1',
          version_id: 101,
          thumb_id: 't1',
          duration_seconds: 10,
          video_in_seconds: 300,
          video_out_seconds: 310,
        },
      ],
    });
    const file = new File(['x'], 'zoom_0.mp4', { type: 'video/mp4' });

    const { result } = renderHook(() => useUploadRecording(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        playlistId: 42,
        folderName: '2026-05-27 06.44.49 Meeting',
        file,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiHandler.uploadRecording).toHaveBeenCalledWith({
      playlistId: 42,
      folderName: '2026-05-27 06.44.49 Meeting',
      file,
    });
    expect(result.current.data?.recording_id).toBe('rec-1');
    expect(result.current.data?.clips[0].thumb_id).toBe('t1');
  });

  it('surfaces errors back to the caller', async () => {
    mockedApiHandler.uploadRecording.mockRejectedValue(new Error('boom'));
    const file = new File(['x'], 'zoom_0.mp4', { type: 'video/mp4' });

    const { result } = renderHook(() => useUploadRecording(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          playlistId: 42,
          folderName: '2026-05-27 06.44.49 Meeting',
          file,
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});
