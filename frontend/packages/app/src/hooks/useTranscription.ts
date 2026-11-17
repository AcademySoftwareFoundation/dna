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
  Session,
} from '@dna/core';
import { apiHandler } from '../api';
import { useSession } from './useSessions';
import { useEventClient, useNomenclature, useToast } from '../contexts';
import {
  describeInvalidMeetingUrl,
  parseMeetingUrl,
} from '../transcription/meetingPlatforms';

export interface UseTranscriptionOptions {
  sessionId: string | null;
  playlistId?: string | null;
}

export interface UseTranscriptionReturn {
  session: BotSession | null;
  status: BotStatus | null;
  isDispatching: boolean;
  isStopping: boolean;
  isLoadingStatus: boolean;
  error: Error | null;
  dispatchBot: (
    meetingUrl: string,
    passcode?: string,
    language?: string | null
  ) => Promise<BotSession>;
  stopBot: () => Promise<void>;
  clearSession: () => void;
}

export function useTranscription({
  sessionId,
  playlistId = null,
}: UseTranscriptionOptions): UseTranscriptionReturn {
  const t = useNomenclature();
  const queryClient = useQueryClient();
  const eventClient = useEventClient();
  const { showToast, dismissToast } = useToast();
  const [session, setSession] = useState<BotSession | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const previousStatusRef = useRef<BotStatusEnum | null>(null);
  const waitingRoomToastIdRef = useRef<string | null>(null);

  const { data: dnaSession } = useSession(sessionId);

  const meetingPlatform =
    session?.platform ?? (dnaSession?.platform as Platform | null | undefined) ?? null;
  const meetingId = session?.meeting_id ?? dnaSession?.meeting_id ?? null;

  const isActiveStatus = (statusValue: BotStatusEnum): boolean => {
    return ['joining', 'waiting_room', 'in_call', 'transcribing'].includes(
      statusValue
    );
  };

  const shouldFetchInitialStatus = !!(sessionId && meetingPlatform && meetingId && !session);

  const {
    data: status,
    isLoading: isLoadingStatus,
  } = useQuery<BotStatus, Error>({
    queryKey: ['botStatus', sessionId],
    queryFn: () => apiHandler.getBotStatus({ sessionId: sessionId! }),
    enabled: shouldFetchInitialStatus,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

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
    if (status && !session && meetingPlatform && meetingId && playlistId) {
      if (isActiveStatus(status.status)) {
        setSession({
          platform: meetingPlatform,
          meeting_id: meetingId,
          playlist_id: playlistId,
          status: status.status,
          created_at: new Date().toISOString(),
          updated_at: status.updated_at,
        });
      }
    }
  }, [status, session, meetingPlatform, meetingId, playlistId]);

  useEffect(() => {
    if (!eventClient || !sessionId) return;

    const handleBotStatusEvent = (event: DNAEvent<BotStatusEventPayload>) => {
      const payload = event.payload;

      const matchesSession =
        payload.session_id === sessionId ||
        (meetingPlatform &&
          meetingId &&
          payload.platform === meetingPlatform &&
          payload.meeting_id === meetingId);

      if (!matchesSession) {
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
          playlist_id: payload.playlist_id ?? playlistId ?? '',
          status: newStatus,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      queryClient.setQueryData<BotStatus>(
        ['botStatus', sessionId],
        (old) =>
          old
            ? { ...old, status: newStatus, updated_at: new Date().toISOString() }
            : {
                platform: payload.platform as Platform,
                meeting_id: payload.meeting_id,
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
  }, [eventClient, meetingPlatform, meetingId, sessionId, playlistId, session, queryClient]);

  const dispatchMutation = useMutation<BotSession, Error, DispatchBotRequest>({
    mutationFn: (request) =>
      apiHandler.dispatchBot({ sessionId: sessionId!, request }),
    onMutate: (request) => {
      setSession({
        platform: request.platform,
        meeting_id: request.meeting_id,
        playlist_id: request.playlist_id ?? playlistId ?? '',
        status: 'joining',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setError(null);
    },
    onSuccess: (newSession) => {
      setSession(newSession);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({
        queryKey: ['sessionPlaylists', sessionId],
      });
    },
    onError: (err) => {
      setSession(null);
      setError(err);
    },
  });

  const stopMutation = useMutation<boolean, Error, void>({
    mutationFn: async () => {
      if (!sessionId) throw new Error('No active session');
      return apiHandler.stopBot({ sessionId });
    },
    onSuccess: () => {
      if (session) {
        setSession({ ...session, status: 'stopped' });
      }
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.setQueryData<Session | undefined>(
        ['session', sessionId],
        (current) =>
          current
            ? {
                ...current,
                meeting_id: null,
                platform: null,
                vexa_meeting_id: null,
              }
            : current
      );
    },
    onError: (err) => {
      setError(err);
    },
  });

  const dispatchBot = useCallback(
    async (
      meetingUrl: string,
      passcode?: string,
      language?: string | null
    ): Promise<BotSession> => {
      if (!sessionId) {
        throw new Error(`No ${t.session.lower} selected`);
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
        ...(playlistId ? { playlist_id: playlistId } : {}),
        passcode: parsed.passcode ?? passcode,
        meeting_url: parsed.meetingUrl,
        ...(language ? { language } : {}),
      };

      return dispatchMutation.mutateAsync(request);
    },
    [sessionId, playlistId, dispatchMutation, t.session.lower]
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
