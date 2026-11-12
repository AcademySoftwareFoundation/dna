import { useState, useEffect, useCallback } from 'react';
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
import { useAuth, useFeatureFlags, useToast } from './contexts';
import { apiHandler, useGetVersionsForPlaylist } from './api';
import {
  useAddPlaylistToSession,
  useSession,
  useSessionPlaylists,
} from './hooks/useSessions';
import { useSessionInReviewEvents } from './hooks/useSessionInReview';
import { usePrefetchPlaylistVersions } from './hooks/usePrefetchPlaylistVersions';
import {
  rememberRecentPlaylist,
  rememberRecentSession,
  type RecentSessionEntry,
} from './recentSessions';
import { useNomenclature } from './nomenclature';

async function apiEnsure(projectId: string, playlistId: string) {
  return apiHandler.ensureSessionForPlaylist({ projectId, playlistId });
}

function App() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const { sessionsEnabled } = useFeatureFlags();
  const { showToast } = useToast();
  const t = useNomenclature();
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

  const rememberSession = useCallback(
    (session: Session, project: Project) => {
      if (!sessionsEnabled) return;
      rememberRecentSession({
        id: session.id,
        name: session.name?.trim() || session.id,
        projectId: project.id,
        projectName: project.name,
      });
    },
    [sessionsEnabled]
  );

  const playlistDisplayName = useCallback(
    (playlist: Playlist) =>
      playlist.code?.trim() || `${t.playlist.singular} ${playlist.id}`,
    [t.playlist.singular]
  );

  const rememberPlaylist = useCallback(
    (playlist: Playlist, project: Project) => {
      if (sessionsEnabled) return;
      rememberRecentPlaylist({
        id: playlist.id,
        name: playlistDisplayName(playlist),
        projectId: project.id,
        projectName: project.name,
      });
    },
    [sessionsEnabled, playlistDisplayName]
  );

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
      rememberSession(session, project);
      addPlaylistToSession.mutate({
        sessionId: session.id,
        playlistId: playlist.id,
      });
    } else {
      rememberPlaylist(playlist, project);
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

  const handleChangeContext = () => {
    setSelectedProject(null);
    setSelectedPlaylist(null);
    setSelectedSession(null);
    setSelectedVersion(null);
  };

  const handleSelectRecentSession = useCallback(
    async (entry: RecentSessionEntry) => {
      if (entry.id === selectedSession?.id) return;
      try {
        const session = await apiHandler.getSession({ sessionId: entry.id });
        const playlists = await apiHandler.getPlaylistsForProject({
          projectId: entry.projectId,
        });
        const linked = session.playlist_ids ?? [];
        const playlist =
          linked
            .map((id) => playlists.find((item) => item.id.toString() === id))
            .find((item): item is Playlist => item != null) ?? null;
        if (!playlist) {
          showToast({
            type: 'error',
            title: `No ${t.playlist.lower} linked`,
            description: `Open this ${t.session.lower} from the selector and choose a ${t.playlist.lower}.`,
          });
          handleChangeContext();
          return;
        }
        const project: Project =
          selectedProject?.id === entry.projectId
            ? selectedProject
            : {
                id: entry.projectId,
                type: 'Project',
                name: entry.projectName,
              };
        setSelectedProject(project);
        setSelectedPlaylist(playlist);
        setSelectedSession(session);
        setSelectedVersion(null);
        rememberSession(session, project);
        queryClient.setQueryData(['session', session.id], session);
        queryClient.setQueryData(['sessionPlaylists', session.id], {
          session_id: session.id,
          playlist_ids: session.playlist_ids ?? [],
        });
      } catch (error) {
        showToast({
          type: 'error',
          title: `Could not open ${t.session.lower}`,
          description:
            error instanceof Error ? error.message : 'Please try again.',
        });
      }
    },
    [
      selectedSession?.id,
      selectedProject,
      showToast,
      t.playlist.lower,
      t.session.lower,
      rememberSession,
      queryClient,
    ]
  );

  const handleSelectRecentPlaylist = useCallback(
    async (entry: RecentSessionEntry) => {
      if (entry.id === selectedPlaylist?.id) return;
      try {
        const playlists = await apiHandler.getPlaylistsForProject({
          projectId: entry.projectId,
        });
        const playlist =
          playlists.find((item) => item.id.toString() === entry.id) ?? null;
        if (!playlist) {
          showToast({
            type: 'error',
            title: `${t.playlist.singular} not found`,
            description: `Open the selector and choose a ${t.playlist.lower}.`,
          });
          handleChangeContext();
          return;
        }
        const project: Project =
          selectedProject?.id === entry.projectId
            ? selectedProject
            : {
                id: entry.projectId,
                type: 'Project',
                name: entry.projectName,
              };
        setSelectedProject(project);
        setSelectedPlaylist(playlist);
        setSelectedSession(null);
        setSelectedVersion(null);
        rememberPlaylist(playlist, project);
      } catch (error) {
        showToast({
          type: 'error',
          title: `Could not open ${t.playlist.lower}`,
          description:
            error instanceof Error ? error.message : 'Please try again.',
        });
      }
    },
    [
      selectedPlaylist?.id,
      selectedProject,
      showToast,
      t.playlist.singular,
      t.playlist.lower,
      rememberPlaylist,
    ]
  );

  const handleVersionSelect = (version: Version) => {
    setSelectedVersion(version);
  };

  if (!selectedProject || !selectedPlaylist || !userEmail) {
    return <ProjectSelector onSelectionComplete={handleSelectionComplete} />;
  }

  const sessionMode = sessionsEnabled && !!selectedSession;
  const playlistMode = !sessionsEnabled;
  const contextMode = sessionMode ? 'session' : playlistMode ? 'playlist' : null;
  const contextName = sessionMode
    ? selectedSession?.name?.trim() || selectedSession?.id || null
    : playlistMode
      ? playlistDisplayName(selectedPlaylist)
      : null;
  const currentContextId = sessionMode
    ? selectedSession!.id
    : playlistMode
      ? selectedPlaylist.id
      : null;
  const changeContextLabel = sessionMode
    ? `Change ${t.session.lower}`
    : playlistMode
      ? `Change ${t.playlist.lower}`
      : null;

  return (
    <Layout
      playlistTabs={
        sessionMode ? (
          <SessionTabs
            sessionId={selectedSession!.id}
            projectId={selectedProject.id}
            activePlaylist={selectedPlaylist}
            onPlaylistChange={handlePlaylistChange}
          />
        ) : null
      }
      contextName={contextName}
      contextMode={contextMode}
      currentContextId={currentContextId}
      changeContextLabel={changeContextLabel}
      onChangeContext={
        sessionMode || playlistMode ? handleChangeContext : undefined
      }
      onSelectRecentContext={
        sessionMode
          ? handleSelectRecentSession
          : playlistMode
            ? handleSelectRecentPlaylist
            : undefined
      }
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
