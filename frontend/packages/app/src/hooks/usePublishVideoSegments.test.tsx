import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { usePublishVideoSegments } from './usePublishVideoSegments';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    publishVideoSegments: vi.fn(),
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

describe('usePublishVideoSegments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls apiHandler.publishVideoSegments and resolves with the response', async () => {
    mockedApiHandler.publishVideoSegments.mockResolvedValue({
      video_segment_entity_id: 7000,
      outcome: 'created',
      clips_count: 3,
    });

    const { result } = renderHook(() => usePublishVideoSegments(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        playlistId: 42,
        request: { version_id: 101, recording_id: 'rec-1' },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiHandler.publishVideoSegments).toHaveBeenCalledWith({
      playlistId: 42,
      request: { version_id: 101, recording_id: 'rec-1' },
    });
    expect(result.current.data?.outcome).toBe('created');
    expect(result.current.data?.clips_count).toBe(3);
  });

  it('surfaces errors back to the caller', async () => {
    mockedApiHandler.publishVideoSegments.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => usePublishVideoSegments(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          playlistId: 42,
          request: { version_id: 101, recording_id: 'rec-1' },
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});
