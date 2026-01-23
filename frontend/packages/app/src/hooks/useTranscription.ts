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

export interface ParsedMeetingUrl {
  platform: Platform;
  meetingId: string;
}

export function parseMeetingUrl(url: string): ParsedMeetingUrl | null {
  const trimmedUrl = url.trim();

  const googleMeetMatch = trimmedUrl.match(
    /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i
  );
  if (googleMeetMatch) {
    return {
      platform: 'google_meet',
      meetingId: googleMeetMatch[1].toLowerCase(),
    };
  }

  const teamsMatch = trimmedUrl.match(/teams\.microsoft\.com.*meetup-join/i);
  if (teamsMatch) {
    return {
      platform: 'teams',
      meetingId: trimmedUrl,
    };
  }

  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(trimmedUrl)) {
    return {
      platform: 'google_meet',
      meetingId: trimmedUrl.toLowerCase(),
    };
  }

  return null;
}

export interface UseTranscriptionOptions {
  playlistId: number | null;
}

export interface UseTranscriptionReturn {
  session: BotSession | null;
  status: BotStatus | null;
  isDispatching: boolean;
  isStopping: boolean;
  isPollingStatus: boolean;
  error: Error | null;
  dispatchBot: (meetingUrl: string, passcode?: string) => Promise<BotSession>;
  stopBot: () => Promise<void>;
  clearSession: () => void;
}

const POLL_INTERVAL_CONNECTING = 1000;
const POLL_INTERVAL_CONNECTED = 30000;

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

  const { data: metadata, isLoading: isLoadingMetadata } = usePlaylistMetadata(playlistId);

  const meetingPlatform = session?.platform ?? (metadata?.platform as Platform | null);
  const meetingId = session?.meeting_id ?? metadata?.meeting_id;

  const isActiveStatus = (statusValue: BotStatusEnum): boolean => {
    return ['joining', 'waiting_room', 'in_call', 'transcribing'].includes(statusValue);
  };

  const isConnectingStatus = (statusValue: BotStatusEnum): boolean => {
    return ['joining', 'waiting_room'].includes(statusValue);
  };

  const shouldPollStatus = !!(meetingPlatform && meetingId);

  const {
    data: status,
    isFetching: isPollingStatus,
    refetch: refetchStatus,
  } = useQuery<BotStatus, Error>({
    queryKey: ['botStatus', meetingPlatform, meetingId],
    queryFn: () =>
      apiHandler.getBotStatus({
        platform: meetingPlatform!,
        meetingId: meetingId!,
      }),
    enabled: shouldPollStatus,
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status ?? session?.status;
      if (!currentStatus) {
        return POLL_INTERVAL_CONNECTING;
      }
      if (isConnectingStatus(currentStatus)) {
        return POLL_INTERVAL_CONNECTING;
      }
      if (isActiveStatus(currentStatus)) {
        return POLL_INTERVAL_CONNECTED;
      }
      return false;
    },
    retry: 1,
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
      shouldPollStatus,
    });
  }

  useEffect(() => {
    const currentStatus = status?.status ?? session?.status;
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
  }, [status?.status, session?.status, showToast, dismissToast]);

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
    if (!eventClient || !meetingPlatform || !meetingId) return;

    const handleBotStatusEvent = (event: DNAEvent<BotStatusEventPayload>) => {
      const payload = event.payload;
      if (
        payload.platform === meetingPlatform &&
        payload.meeting_id === meetingId
      ) {
        refetchStatus();

        if (session) {
          setSession({
            ...session,
            status: payload.status as BotStatusEnum,
            updated_at: new Date().toISOString(),
          });
        }
      }
    };

    const unsubscribe = eventClient.subscribe<BotStatusEventPayload>(
      'bot.status_changed',
      handleBotStatusEvent
    );

    return unsubscribe;
  }, [eventClient, meetingPlatform, meetingId, session, refetchStatus]);

  const dispatchMutation = useMutation<
    BotSession,
    Error,
    DispatchBotRequest
  >({
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
      queryClient.invalidateQueries({
        queryKey: ['botStatus', newSession.platform, newSession.meeting_id],
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
      queryClient.invalidateQueries({
        queryKey: ['botStatus', meetingPlatform, meetingId],
      });
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
        throw new Error('Invalid meeting URL format');
      }

      const request: DispatchBotRequest = {
        platform: parsed.platform,
        meeting_id: parsed.meetingId,
        playlist_id: playlistId,
        passcode,
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
    isPollingStatus,
    error,
    dispatchBot,
    stopBot,
    clearSession,
  };
}
