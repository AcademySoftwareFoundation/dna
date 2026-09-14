import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Flex, Spinner } from '@radix-ui/themes';
import { Playlist, Project, Version } from '@dna/core';
import {
  Layout,
  ContentArea,
  ProjectSelector,
  ShotGridLoginPage,
} from './components';
import { useAuth } from './contexts';
import {
  useGetPlaylistsForProject,
  useGetProjectsForUser,
  useGetVersionsForPlaylist,
} from './api';
import { usePlaylistMetadata } from './hooks/usePlaylistMetadata';

// The selected project, playlist and version are kept in the query string,
// so a reload returns to the same playlist page.
interface UrlSelection {
  projectId: number | null;
  playlistId: number | null;
  versionId: number | null;
}

const EMPTY_URL_SELECTION: UrlSelection = {
  projectId: null,
  playlistId: null,
  versionId: null,
};

function parseId(value: string | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function readSelectionFromUrl(): UrlSelection {
  const params = new URLSearchParams(window.location.search);
  return {
    projectId: parseId(params.get('project')),
    playlistId: parseId(params.get('playlist')),
    versionId: parseId(params.get('version')),
  };
}

function writeSelectionToUrl(selection: UrlSelection): void {
  const params = new URLSearchParams(window.location.search);
  const entries: [string, number | null][] = [
    ['project', selection.projectId],
    ['playlist', selection.playlistId],
    ['version', selection.versionId],
  ];
  for (const [key, id] of entries) {
    if (id) {
      params.set(key, String(id));
    } else {
      params.delete(key);
    }
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', url);
}

function App() {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, authProvider, signOut, user } = useAuth();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  const [urlSelection, setUrlSelection] =
    useState<UrlSelection>(readSelectionFromUrl);

  // When the session ends or a different user signs in, nothing loaded for the
  // previous user may remain on screen or in the query cache. The URL is kept:
  // after signing in again the selection is re-fetched with the new user's
  // permissions.
  const signedInEmail = isAuthenticated ? (user?.email ?? null) : null;
  const previousEmailRef = useRef<string | null>(signedInEmail);
  useEffect(() => {
    const previousEmail = previousEmailRef.current;
    previousEmailRef.current = signedInEmail;
    if (!previousEmail || previousEmail === signedInEmail) return;

    queryClient.clear();
    setSelectedProject(null);
    setSelectedPlaylist(null);
    setUserEmail(null);
    setSelectedVersion(null);
    setUrlSelection(readSelectionFromUrl());
  }, [signedInEmail, queryClient]);

  const isRestoring =
    !!urlSelection.projectId && !!urlSelection.playlistId && !selectedPlaylist;
  const restoreEmail =
    isRestoring && isAuthenticated ? (user?.email ?? null) : null;
  const { data: restoreProjects, isError: isRestoreProjectsError } =
    useGetProjectsForUser(restoreEmail);
  const { data: restorePlaylists, isError: isRestorePlaylistsError } =
    useGetPlaylistsForProject(restoreEmail ? urlSelection.projectId : null);

  useEffect(() => {
    if (!isRestoring || !restoreEmail) return;

    const abandonRestore = () => {
      writeSelectionToUrl(EMPTY_URL_SELECTION);
      setUrlSelection(EMPTY_URL_SELECTION);
    };

    if (isRestoreProjectsError || isRestorePlaylistsError) {
      abandonRestore();
      return;
    }
    if (!restoreProjects || !restorePlaylists) return;

    const project = restoreProjects.find(
      (p) => p.id === urlSelection.projectId
    );
    const playlist = restorePlaylists.find(
      (p) => p.id === urlSelection.playlistId
    );
    if (!project || !playlist) {
      // No longer exists, or this user cannot see it.
      abandonRestore();
      return;
    }
    setSelectedProject(project);
    setSelectedPlaylist(playlist);
    setUserEmail(restoreEmail);
  }, [
    isRestoring,
    restoreEmail,
    restoreProjects,
    restorePlaylists,
    isRestoreProjectsError,
    isRestorePlaylistsError,
    urlSelection,
  ]);

  useEffect(() => {
    if (!selectedPlaylist) return;
    writeSelectionToUrl({
      projectId: selectedProject?.id ?? null,
      playlistId: selectedPlaylist.id,
      versionId: selectedVersion?.id ?? null,
    });
  }, [selectedProject, selectedPlaylist, selectedVersion]);

  const { data: versions = [], refetch } = useGetVersionsForPlaylist(
    selectedPlaylist?.id ?? null
  );

  const { data: playlistMetadata } = usePlaylistMetadata(
    selectedPlaylist?.id ?? null
  );

  useEffect(() => {
    if (versions.length === 0) return;

    if (!selectedVersion) {
      const urlVersion = urlSelection.versionId
        ? versions.find((v) => v.id === urlSelection.versionId)
        : null;
      const inReviewVersionId = playlistMetadata?.in_review;
      const inReviewVersion = inReviewVersionId
        ? versions.find((v) => v.id === inReviewVersionId)
        : null;

      setSelectedVersion(urlVersion ?? inReviewVersion ?? versions[0]);
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
  }, [versions, selectedVersion, playlistMetadata, urlSelection.versionId]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allDraftNotes'] });
    await queryClient.invalidateQueries({ queryKey: ['draftNote'] });
    await refetch();
  };

  const handleSelectionComplete = (
    project: Project,
    playlist: Playlist,
    email: string
  ) => {
    setSelectedProject(project);
    setSelectedPlaylist(playlist);
    setUserEmail(email);
  };

  const handlePlaylistChange = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setSelectedVersion(null);
    setUrlSelection((current) => ({ ...current, versionId: null }));
  };

  const handleLogout = () => {
    signOut();
    setSelectedProject(null);
    setSelectedPlaylist(null);
    setUserEmail(null);
    setSelectedVersion(null);
    writeSelectionToUrl(EMPTY_URL_SELECTION);
    setUrlSelection(EMPTY_URL_SELECTION);
  };

  const handleVersionSelect = (version: Version) => {
    setSelectedVersion(version);
  };

  // ShotGrid auth: show login page until authenticated
  if (authProvider === 'shotgrid' && (isLoading || !isAuthenticated)) {
    return <ShotGridLoginPage />;
  }

  if (isRestoring && restoreEmail) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spinner size="3" />
      </Flex>
    );
  }

  if (!selectedProject || !selectedPlaylist || !userEmail) {
    return <ProjectSelector onSelectionComplete={handleSelectionComplete} />;
  }

  return (
    <Layout
      onPlaylistChange={handlePlaylistChange}
      playlistId={selectedPlaylist.id}
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
        userEmail={userEmail}
        onVersionSelect={handleVersionSelect}
        onRefresh={handleRefresh}
      />
    </Layout>
  );
}

export default App;
