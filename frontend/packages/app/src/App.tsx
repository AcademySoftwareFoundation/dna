import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Playlist,
  PlaylistMetadata,
  Project,
  Session,
  Version,
  preferredPlaylistVersion,
} from '@dna/core';
import {
  Layout,
  ContentArea,
  ProjectSelector,
} from './components';
import { SessionTabs } from './components/SessionTabs';
import { useAuth } from './contexts';
import { useGetVersionsForPlaylist } from './api';
import {
  useInReviewChangedEvents,
  usePlaylistMetadata,
} from './hooks/usePlaylistMetadata';
import {
  useAddPlaylistToSession,
  useSessionPlaylists,
} from './hooks/useSessions';
import { usePrefetchPlaylistVersions } from './hooks/usePrefetchPlaylistVersions';

function App() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
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

  const { data: playlistMetadata } = usePlaylistMetadata(
    selectedPlaylist?.id ?? null
  );
  const { data: sessionPlaylists } = useSessionPlaylists(
    selectedSession?.id ?? null
  );
  const sessionPlaylistIds = sessionPlaylists?.playlist_ids ?? [];
  const playlistIds = selectedPlaylist
    ? [...new Set([selectedPlaylist.id, ...sessionPlaylistIds])]
    : sessionPlaylistIds;
  usePrefetchPlaylistVersions(playlistIds);
  const addPlaylistToSession = useAddPlaylistToSession();
  useInReviewChangedEvents(
    selectedSession && sessionPlaylistIds.length > 0
      ? sessionPlaylistIds
      : (selectedPlaylist?.id ?? null)
  );

  useEffect(() => {
    if (versions.length === 0) return;

    if (!selectedVersion) {
      setSelectedVersion(
        preferredPlaylistVersion(versions, playlistMetadata?.in_review)
      );
      return;
    }

    // Keep the selected version in sync with refetched playlist data so
    // upstream changes (e.g. a status updated in the tracking system) are
    // reflected after a reload. React Query's structural sharing preserves
    // object identity for unchanged versions, so this only fires on change.
    const updatedVersion = versions.find((v) => v.id === selectedVersion.id);
    if (updatedVersion && updatedVersion !== selectedVersion) {
      setSelectedVersion(updatedVersion);
    }
  }, [versions, selectedVersion, playlistMetadata]);

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
    const metadata = queryClient.getQueryData<PlaylistMetadata | null>([
      'playlistMetadata',
      playlist.id,
    ]);
    setSelectedPlaylist(playlist);
    setSelectedVersion(
      preferredPlaylistVersion(cachedVersions, metadata?.in_review)
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

  return (
    <Layout
      playlistTabs={
        selectedSession ? (
          <SessionTabs
            sessionId={selectedSession.id}
            projectId={selectedProject.id}
            activePlaylist={selectedPlaylist}
            onPlaylistChange={handlePlaylistChange}
          />
        ) : null
      }
      onPlaylistChange={handlePlaylistChange}
      playlistId={selectedPlaylist.id}
      sessionPlaylistIds={selectedSession ? sessionPlaylistIds : null}
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
        sessionPlaylistIds={selectedSession ? sessionPlaylistIds : null}
        userEmail={userEmail}
        onVersionSelect={handleVersionSelect}
        onRefresh={handleRefresh}
      />
    </Layout>
  );
}

export default App;
