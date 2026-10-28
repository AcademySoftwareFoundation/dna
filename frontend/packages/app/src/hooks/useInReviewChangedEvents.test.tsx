import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import type {
  DNAEvent,
  InReviewChangedEventPayload,
  PlaylistMetadata,
} from '@dna/core';
import { useInReviewChangedEvents } from './usePlaylistMetadata';

type Subscription = {
  eventType: string;
  callback: (event: DNAEvent<InReviewChangedEventPayload>) => void;
};

const { subscriptions } = vi.hoisted(() => ({
  subscriptions: [] as Subscription[],
}));

vi.mock('../contexts', () => ({
  useEventClient: () => ({
    subscribe: (
      eventType: string,
      callback: Subscription['callback']
    ) => {
      const subscription = { eventType, callback };
      subscriptions.push(subscription);
      return () => {
        const index = subscriptions.indexOf(subscription);
        if (index >= 0) {
          subscriptions.splice(index, 1);
        }
      };
    },
  }),
}));

function metadata(inReview: string | null): PlaylistMetadata {
  return {
    _id: 'abc',
    playlist_id: '10',
    in_review: inReview,
    meeting_id: null,
    platform: null,
    transcription_paused: false,
    has_scratch: false,
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderInReviewEvents(
  playlistId: string | null,
  queryClient: QueryClient
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return renderHook(() => useInReviewChangedEvents(playlistId), {
    wrapper: Wrapper,
  });
}

function emit(playlistId: string, inReview: string) {
  const subscription = subscriptions.find(
    (item) => item.eventType === 'playlist.in_review_changed'
  );
  if (!subscription) {
    throw new Error('expected an in-review subscription');
  }
  act(() => {
    subscription.callback({
      type: 'playlist.in_review_changed',
      payload: { playlist_id: playlistId, in_review: inReview },
    });
  });
}

describe('useInReviewChangedEvents', () => {
  beforeEach(() => {
    subscriptions.length = 0;
  });

  it('updates the cached in-review version for the matching playlist', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));

    renderInReviewEvents('10', queryClient);
    emit('10', '200');

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('200')
    );
  });

  it('ignores events for a different playlist', () => {
    const queryClient = createClient();
    queryClient.setQueryData(['playlistMetadata', '10'], metadata('100'));

    renderInReviewEvents('10', queryClient);
    emit('99', '200');

    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toEqual(
      metadata('100')
    );
  });

  it('invalidates the query when no cached metadata exists', () => {
    const queryClient = createClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    renderInReviewEvents('10', queryClient);
    emit('10', '200');

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['playlistMetadata', '10'],
    });
    expect(queryClient.getQueryData(['playlistMetadata', '10'])).toBeUndefined();
  });
});
