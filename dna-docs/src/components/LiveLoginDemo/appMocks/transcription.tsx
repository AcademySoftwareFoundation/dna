import {createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode} from 'react';

// Stands in for frontend/packages/app/src/hooks when TranscriptionMenu
// imports it in docs demos (see plugins/dna-app-embed.ts). Only the hooks the
// menu uses, with the same return shapes, driven by timers instead of the
// backend: Start joins a pretend meeting bot, which goes live a moment later;
// pause/resume flips the playlist's paused flag; Stop ends the session.

/** The bot statuses the menu shows (BotStatusEnum in @dna/core). */
export type DemoBotStatus = 'idle' | 'joining' | 'transcribing' | 'stopped';

/** Start Transcription's "Connecting..." before the bot is joining. */
const DISPATCH_MS = 700;
/** Joining... before the bot is in the call and transcribing. */
const JOIN_MS = 1800;
/** Stopping... before the bot has left. */
const STOP_MS = 700;

interface TranscriptionDemoState {
  /** null before Start, and again once the menu clears a finished session. */
  status: DemoBotStatus | null;
  paused: boolean;
  isDispatching: boolean;
  isStopping: boolean;
  dispatchBot: (meetingUrl: string) => Promise<void>;
  stopBot: () => Promise<void>;
  clearSession: () => void;
  setPaused: (paused: boolean) => void;
}

const TranscriptionDemoContext = createContext<TranscriptionDemoState | null>(null);

/** Holds the pretend session; the demo remounts it to start over. */
export function TranscriptionDemoProvider({children}: {children: ReactNode}) {
  const [status, setStatus] = useState<DemoBotStatus | null>(null);
  const [paused, setPaused] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const dispatchBot = useCallback(
    (_meetingUrl: string) =>
      new Promise<void>((resolve) => {
        setIsDispatching(true);
        later(DISPATCH_MS, () => {
          setIsDispatching(false);
          setPaused(false);
          setStatus('joining');
          resolve();
          later(JOIN_MS, () => setStatus((s) => (s === 'joining' ? 'transcribing' : s)));
        });
      }),
    [],
  );

  const stopBot = useCallback(
    () =>
      new Promise<void>((resolve) => {
        setIsStopping(true);
        later(STOP_MS, () => {
          setIsStopping(false);
          setStatus('stopped');
          resolve();
        });
      }),
    [],
  );

  const clearSession = useCallback(() => setStatus(null), []);

  const value = useMemo(
    () => ({status, paused, isDispatching, isStopping, dispatchBot, stopBot, clearSession, setPaused}),
    [status, paused, isDispatching, isStopping, dispatchBot, stopBot, clearSession],
  );
  return (
    <TranscriptionDemoContext.Provider value={value}>{children}</TranscriptionDemoContext.Provider>
  );
}

/** The pretend session, for the demo around the menu (guide and transcript feed). */
export function useTranscriptionDemo(): TranscriptionDemoState {
  const ctx = useContext(TranscriptionDemoContext);
  if (!ctx) throw new Error('useTranscriptionDemo must be used within TranscriptionDemoProvider');
  return ctx;
}

export function useTranscription(_options: {playlistId: string | null}) {
  const {status, isDispatching, isStopping, dispatchBot, stopBot, clearSession} = useTranscriptionDemo();
  const session = status ? {status} : null;
  return {
    session,
    status: session,
    isDispatching,
    isStopping,
    isLoadingStatus: false,
    error: null as Error | null,
    dispatchBot,
    stopBot,
    clearSession,
  };
}

export function usePlaylistMetadata(_playlistId: string | null) {
  const {paused} = useTranscriptionDemo();
  return {data: {transcription_paused: paused}};
}

export function useUpsertPlaylistMetadata(_playlistId: string | null) {
  const {setPaused} = useTranscriptionDemo();
  return {
    mutate: (update: {transcription_paused?: boolean}) => {
      if (update.transcription_paused !== undefined) setPaused(update.transcription_paused);
    },
  };
}

/** No browser extension in the docs: the menu shows its meeting-bot panel. */
export function useTranscriptionExtension(_playlistId: string | null) {
  return {
    available: false,
    installState: 'not_installed' as const,
    connection: 'disconnected' as const,
    installUrl: null,
    isActivating: false,
    error: null,
    activate: async () => false,
  };
}
