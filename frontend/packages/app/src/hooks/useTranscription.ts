import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BotSession,
  BotStatus,
  BotStatusEnum,
  DispatchBotRequest,
  Platform,
  BotStatusEventPayload,
  DNAEvent,
} from '@dna/core';
import { apiHandler } from '../api';
import { usePlaylistMetadata } from './usePlaylistMetadata';
import { useEventClient, useToast } from '../contexts';
import {
  describeInvalidMeetingUrl,
  parseMeetingUrl,
} from '../transcription/meetingPlatforms';

export interface UseTranscriptionOptions {
  playlistId: string | null;
}

export interface UseTranscriptionReturn {
  session: BotSession | null;
  status: BotStatus | null;
  isDispatching: boolean;
  isStopping: boolean;
  isLoadingStatus: boolean;
  error: Error | null;
  dispatchBot: (meetingUrl: string, passcode?: string) => Promise<BotSession>;
  stopBot: () => Promise<void>;
  clearSession: () => void;
}

export function useTranscription({
  playlistId,
}: UseTranscriptionOptions): UseTranscriptionReturn {
  const queryClient = useQueryClient();
  const eventClient = useEventClient();
  const { showToast, dismissToast } = useToast();
  const [session, setSession] = useState<BotSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const previousStatusRef = useRef<BotStatusEnum | null>(null);
  const waitingRoomToastIdRef = useRef<string | null>(null);

  const { data: metadata, isLoading: isLoadingMetadata } =
    usePlaylistMetadata(playlistId);

  const meetingPlatform =
    session?.platform ?? (metadata?.platform as Platform | null);
  const meetingId = session?.meeting_id ?? metadata?.meeting_id;

  const isActiveStatus = (statusValue: BotStatusEnum): boolean => {
    return ['joining', 'waiting_room', 'in_call', 'transcribing'].includes(
      statusValue
    );
  };

  const shouldFetchInitialStatus = !!(
    meetingPlatform &&
    meetingId &&
    !session
  );

  const {
    data: status,
    isLoading: isLoadingStatus,
  } = useQuery<BotStatus, Error>({
    queryKey: ['botStatus', meetingPlatform, meetingId],
    queryFn: () =>
      apiHandler.getBotStatus({
        platform: meetingPlatform!,
        meetingId: meetingId!,
      }),
    enabled: shouldFetchInitialStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  if (import.meta.env.DEV) {
    console.log('[useTranscription]', {
      playlistId,
      metadata,
      isLoadingMetadata,
      meetingPlatform,
      meetingId,
      session,
      status,
      shouldFetchInitialStatus,
    });
  }

  useEffect(() => {
    const currentStatus = session?.status ?? status?.status;
    const previousStatus = previousStatusRef.current;

    if (currentStatus === 'waiting_room' && previousStatus !== 'waiting_room') {
      const toastId = showToast({
        title: 'Agent Waiting for Admission',
        description:
          'The transcription agent is waiting to be admitted to the call. Please admit the agent on the call platform.',
        type: 'warning',
        duration: 30000,
      });
      waitingRoomToastIdRef.current = toastId;
    }

    if (
      previousStatus === 'waiting_room' &&
      (currentStatus === 'in_call' || currentStatus === 'transcribing') &&
      waitingRoomToastIdRef.current
    ) {
      dismissToast(waitingRoomToastIdRef.current);
      waitingRoomToastIdRef.current = null;
    }

    previousStatusRef.current = currentStatus ?? null;
  }, [session?.status, status?.status, showToast, dismissToast]);

  useEffect(() => {
    if (status && !session && meetingPlatform && meetingId) {
      if (isActiveStatus(status.status)) {
        setSession({
          platform: meetingPlatform,
          meeting_id: meetingId,
          playlist_id: playlistId!,
          status: status.status,
          created_at: new Date().toISOString(),
          updated_at: status.updated_at,
        });
      }
    }
  }, [status, session, meetingPlatform, meetingId, playlistId]);

  useEffect(() => {
    if (!eventClient || !playlistId) return;

    const handleBotStatusEvent = (event: DNAEvent<BotStatusEventPayload>) => {
      const payload = event.payload;

      const matchesMeeting =
        meetingPlatform &&
        meetingId &&
        payload.platform === meetingPlatform &&
        payload.meeting_id === meetingId;

      const matchesPlaylist = payload.playlist_id === playlistId;

      if (!matchesMeeting && !matchesPlaylist) {
        return;
      }

      const newStatus = payload.status as BotStatusEnum;

      if (session) {
        setSession({
          ...session,
          status: newStatus,
          updated_at: new Date().toISOString(),
        });
      } else if (isActiveStatus(newStatus)) {
        setSession({
          platform: payload.platform as Platform,
          meeting_id: payload.meeting_id,
          playlist_id: payload.playlist_id ?? playlistId,
          status: newStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      queryClient.setQueryData<BotStatus>(
        ['botStatus', payload.platform, payload.meeting_id],
        (old) =>
          old
            ? { ...old, status: newStatus, updated_at: new Date().toISOString() }
            : {
                status: newStatus,
                updated_at: new Date().toISOString(),
              }
      );
    };

    const unsubscribe = eventClient.subscribe<BotStatusEventPayload>(
      'bot.status_changed',
      handleBotStatusEvent
    );

    return unsubscribe;
  }, [eventClient, meetingPlatform, meetingId, playlistId, session, queryClient]);

  const dispatchMutation = useMutation<BotSession, Error, DispatchBotRequest>({
    mutationFn: (request) => apiHandler.dispatchBot({ request }),
    onMutate: (request) => {
      setSession({
        platform: request.platform,
        meeting_id: request.meeting_id,
        playlist_id: request.playlist_id,
        status: 'joining',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setError(null);
    },
    onSuccess: (newSession) => {
      setSession(newSession);
      setError(null);
      queryClient.invalidateQueries({
        queryKey: ['playlistMetadata', playlistId],
      });
    },
    onError: (err) => {
      setSession(null);
      setError(err);
    },
  });

  const stopMutation = useMutation<boolean, Error, void>({
    mutationFn: async () => {
      if (!meetingPlatform || !meetingId) throw new Error('No active session');
      return apiHandler.stopBot({
        platform: meetingPlatform,
        meetingId: meetingId,
      });
    },
    onSuccess: () => {
      if (session) {
        setSession({ ...session, status: 'stopped' });
      }
    },
    onError: (err) => {
      setError(err);
    },
  });

  const dispatchBot = useCallback(
    async (meetingUrl: string, passcode?: string): Promise<BotSession> => {
      if (!playlistId) {
        throw new Error('No playlist selected');
      }

      const parsed = parseMeetingUrl(meetingUrl);
      if (!parsed) {
        const invalidUrlError = new Error(describeInvalidMeetingUrl(meetingUrl));
        setError(invalidUrlError);
        throw invalidUrlError;
      }

      const request: DispatchBotRequest = {
        platform: parsed.platform,
        meeting_id: parsed.meetingId,
        playlist_id: playlistId,
        // A passcode embedded in the link wins, matching Vexa's own precedence.
        passcode: parsed.passcode ?? passcode,
        meeting_url: parsed.meetingUrl,
      };

      return dispatchMutation.mutateAsync(request);
    },
    [playlistId, dispatchMutation]
  );

  const stopBot = useCallback(async (): Promise<void> => {
    await stopMutation.mutateAsync();
  }, [stopMutation]);

  const clearSession = useCallback(() => {
    setSession(null);
    setError(null);
  }, []);

  return {
    session,
    status: status ?? null,
    isDispatching: dispatchMutation.isPending,
    isStopping: stopMutation.isPending,
    isLoadingStatus,
    error,
    dispatchBot,
    stopBot,
    clearSession,
  };
}
