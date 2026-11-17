import {createContext, useContext, useMemo, useState, type ReactNode} from 'react';
import {SESSION_TABS_PLAYLISTS} from './playlists';

// Stands in for frontend/packages/app/src/hooks when SessionTabs imports it
// in docs demos (see plugins/dna-app-embed.ts). Only the hooks the tabs use,
// with the same shapes, over one pretend session held in React state: which
// playlists it has, and where its single in-review version is.

/** The pretend session the tabs belong to. */
export const DEMO_TABS_SESSION_ID = 'demo-tabs-session';

interface InReview {
  playlistId: string;
  versionId: string;
}

interface SessionTabsDemoState {
  playlistIds: string[];
  inReview: InReview | null;
  pinned: boolean;
  addPlaylist: (playlistId: string) => void;
  removePlaylist: (playlistId: string) => void;
  setInReview: (inReview: InReview) => void;
  setPinned: (pinned: boolean) => void;
}

const SessionTabsDemoContext = createContext<SessionTabsDemoState | null>(null);

/** Holds the pretend session; the demo remounts it to start over. */
export function SessionTabsDemoProvider({
  initialInReview,
  children,
}: {
  initialInReview: InReview;
  children: ReactNode;
}) {
  // Two of the project's playlists to begin with, leaving one to add.
  const [playlistIds, setPlaylistIds] = useState(() =>
    SESSION_TABS_PLAYLISTS.slice(0, 2).map((playlist) => playlist.id),
  );
  const [inReview, setInReview] = useState<InReview | null>(initialInReview);
  const [pinned, setPinned] = useState(false);

  const value = useMemo(
    (): SessionTabsDemoState => ({
      playlistIds,
      inReview,
      pinned,
      addPlaylist: (id) => setPlaylistIds((ids) => (ids.includes(id) ? ids : [...ids, id])),
      removePlaylist: (id) => {
        setPlaylistIds((ids) => ids.filter((other) => other !== id));
        // In review leaves the session with its playlist.
        setInReview((current) => (current?.playlistId === id ? null : current));
        if (inReview?.playlistId === id) setPinned(false);
      },
      setInReview,
      setPinned,
    }),
    [playlistIds, inReview, pinned],
  );
  return <SessionTabsDemoContext.Provider value={value}>{children}</SessionTabsDemoContext.Provider>;
}

/** The pretend session, for the demo around the tabs (version cards and guide). */
export function useSessionTabsDemo(): SessionTabsDemoState {
  const state = useContext(SessionTabsDemoContext);
  if (!state) throw new Error('useSessionTabsDemo must be used within SessionTabsDemoProvider');
  return state;
}

export function useSessionPlaylists(sessionId: string | null) {
  const {playlistIds} = useSessionTabsDemo();
  return {
    data: sessionId ? {session_id: sessionId, playlist_ids: playlistIds} : undefined,
    isPending: false,
    isError: false,
  };
}

export function useSession(sessionId: string | null) {
  const {inReview, pinned} = useSessionTabsDemo();
  return {
    data: sessionId
      ? {
          id: sessionId,
          in_review_playlist_id: inReview?.playlistId ?? null,
          in_review_version_id: inReview?.versionId ?? null,
          in_review_pinned: pinned,
        }
      : undefined,
  };
}

type Mutate = (
  variables: {sessionId: string; playlistId: string},
  options?: {onSuccess?: () => void},
) => void;

export function useAddPlaylistToSession(): {mutate: Mutate} {
  const {addPlaylist} = useSessionTabsDemo();
  return {
    mutate: ({playlistId}, options) => {
      addPlaylist(playlistId);
      options?.onSuccess?.();
    },
  };
}

export function useRemovePlaylistFromSession(): {mutate: Mutate} {
  const {removePlaylist} = useSessionTabsDemo();
  return {
    mutate: ({playlistId}, options) => {
      removePlaylist(playlistId);
      options?.onSuccess?.();
    },
  };
}
