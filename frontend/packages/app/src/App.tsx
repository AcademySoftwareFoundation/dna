import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Playlist, Project, Version } from '@dna/core';
import {
  Layout,
  ContentArea,
  ProjectSelector,
} from './components';
import { useAuth } from './contexts';
import { useGetVersionsForPlaylist } from './api';
import { usePlaylistMetadata } from './hooks/usePlaylistMetadata';

function App() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  const { data: versions = [], refetch } = useGetVersionsForPlaylist(
    selectedPlaylist?.id ?? null
  );

  const { data: playlistMetadata } = usePlaylistMetadata(
    selectedPlaylist?.id ?? null
  );

  useEffect(() => {
    if (versions.length === 0) return;

    if (!selectedVersion) {
      const inReviewVersionId = playlistMetadata?.in_review;
      const inReviewVersion = inReviewVersionId
        ? versions.find((v) => v.id === inReviewVersionId)
        : null;

      setSelectedVersion(inReviewVersion ?? versions[0]);
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
    email: string
  ) => {
    setSelectedProject(project);
    setSelectedPlaylist(playlist);
    setUserEmail(email);
  };

  const handlePlaylistChange = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setSelectedVersion(null);
  };

  const handleLogout = () => {
    signOut();
    setSelectedProject(null);
    setSelectedPlaylist(null);
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
