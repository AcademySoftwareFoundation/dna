import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Playlist,
  Project,
  Session,
  Version,
  preferredPlaylistVersion,
  sessionInReviewForPlaylist,
} from '@dna/core';
import {
  Layout,
  ContentArea,
  ProjectSelector,
} from './components';
import { SessionTabs } from './components/SessionTabs';
import { useAuth, useFeatureFlags } from './contexts';
import { apiHandler, useGetVersionsForPlaylist } from './api';
import {
  useAddPlaylistToSession,
  useSession,
  useSessionPlaylists,
} from './hooks/useSessions';
import { useSessionInReviewEvents } from './hooks/useSessionInReview';
import { usePrefetchPlaylistVersions } from './hooks/usePrefetchPlaylistVersions';

async function apiEnsure(projectId: string, playlistId: string) {
  return apiHandler.ensureSessionForPlaylist({ projectId, playlistId });
}

function App() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { sessionsEnabled } = useFeatureFlags();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  const { data: versions = [], refetch } = useGetVersionsForPlaylist(
    selectedPlaylist?.id ?? null
  );

  const addPlaylistToSession = useAddPlaylistToSession();

  // Playlist-first mode: ensure an implicit DNA session for the selected playlist.
  useEffect(() => {
    if (sessionsEnabled || !selectedProject || !selectedPlaylist) return;
    if (
      selectedSession &&
      selectedSession.playlist_ids?.length === 1 &&
      selectedSession.playlist_ids[0] === selectedPlaylist.id &&
      !selectedSession.external_id
    ) {
      return;
    }
    let cancelled = false;
    void apiEnsure(selectedProject.id, selectedPlaylist.id).then((session) => {
      if (!cancelled) setSelectedSession(session);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-ensure on selection change
  }, [sessionsEnabled, selectedProject?.id, selectedPlaylist?.id]);

  const sessionId = selectedSession?.id ?? null;
  const { data: liveSession } = useSession(sessionId);
  const activeSession = liveSession ?? selectedSession;

  const { data: sessionPlaylists } = useSessionPlaylists(sessionId);
  const sessionPlaylistIds =
    sessionPlaylists?.playlist_ids ?? activeSession?.playlist_ids ?? [];
  const playlistIds = selectedPlaylist
    ? [...new Set([selectedPlaylist.id, ...sessionPlaylistIds])]
    : sessionPlaylistIds;
  usePrefetchPlaylistVersions(playlistIds);
  useSessionInReviewEvents(sessionId);

  const inReviewForPlaylist = sessionInReviewForPlaylist(
    activeSession,
    selectedPlaylist?.id
  );

  useEffect(() => {
    if (versions.length === 0) return;

    if (!selectedVersion) {
      setSelectedVersion(
        preferredPlaylistVersion(versions, inReviewForPlaylist.versionId)
      );
      return;
    }

    const updatedVersion = versions.find((v) => v.id === selectedVersion.id);
    if (updatedVersion && updatedVersion !== selectedVersion) {
      setSelectedVersion(updatedVersion);
    }
  }, [versions, selectedVersion, inReviewForPlaylist.versionId]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allDraftNotes'] });
    await queryClient.invalidateQueries({ queryKey: ['draftNote'] });
    await refetch();
  };

  const handleSelectionComplete = (
    project: Project,
    playlist: Playlist,
    email: string,
    session?: Session
  ) => {
    setSelectedProject(project);
    setSelectedPlaylist(playlist);
    setUserEmail(email);
    setSelectedSession(session ?? null);
    if (session) {
      addPlaylistToSession.mutate({
        sessionId: session.id,
        playlistId: playlist.id,
      });
    }
  };

  const handlePlaylistChange = (playlist: Playlist) => {
    const cachedVersions =
      queryClient.getQueryData<Version[]>(['versions', playlist.id]) ?? [];
    const review = sessionInReviewForPlaylist(activeSession, playlist.id);
    setSelectedPlaylist(playlist);
    setSelectedVersion(
      preferredPlaylistVersion(cachedVersions, review.versionId)
    );
  };

  const handleLogout = () => {
    signOut();
    setSelectedProject(null);
    setSelectedPlaylist(null);
    setSelectedSession(null);
    setUserEmail(null);
    setSelectedVersion(null);
  };

  const handleVersionSelect = (version: Version) => {
    setSelectedVersion(version);
  };

  if (!selectedProject || !selectedPlaylist || !userEmail) {
    return <ProjectSelector onSelectionComplete={handleSelectionComplete} />;
  }

  const showSessionTabs = sessionsEnabled && !!selectedSession;

  return (
    <Layout
      playlistTabs={
        showSessionTabs ? (
          <SessionTabs
            sessionId={selectedSession!.id}
            projectId={selectedProject.id}
            activePlaylist={selectedPlaylist}
            onPlaylistChange={handlePlaylistChange}
          />
        ) : null
      }
      onPlaylistChange={handlePlaylistChange}
      playlistId={selectedPlaylist.id}
      sessionId={sessionId}
      projectId={selectedProject.id}
      selectedVersionId={selectedVersion?.id}
      onVersionSelect={handleVersionSelect}
      userEmail={userEmail}
      onLogout={handleLogout}
    >
      <ContentArea
        version={selectedVersion}
        versions={versions}
        playlistId={selectedPlaylist.id}
        sessionId={sessionId}
        userEmail={userEmail}
        onVersionSelect={handleVersionSelect}
        onRefresh={handleRefresh}
      />
    </Layout>
  );
}

export default App;
