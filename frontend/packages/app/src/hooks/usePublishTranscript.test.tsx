import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { usePublishTranscript } from './usePublishTranscript';
import { apiHandler } from '../api';

vi.mock('../api', () => ({
  apiHandler: {
    publishTranscript: vi.fn(),
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

describe('usePublishTranscript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls apiHandler.publishTranscript and resolves with the response', async () => {
    mockedApiHandler.publishTranscript.mockResolvedValue({
      transcript_entity_id: 9001,
      outcome: 'created',
      segments_count: 5,
    });

    const { result } = renderHook(() => usePublishTranscript(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        playlistId: 42,
        request: { version_id: 101 },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiHandler.publishTranscript).toHaveBeenCalledWith({
      playlistId: 42,
      request: { version_id: 101 },
    });
    expect(result.current.data?.outcome).toBe('created');
  });

  it('surfaces errors back to the caller', async () => {
    mockedApiHandler.publishTranscript.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => usePublishTranscript(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          playlistId: 42,
          request: { version_id: 101 },
        });
      } catch {
        // 預期會炸
      }
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('boom');
  });
});
