import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Playlist, Project, Version } from '@dna/core';
import {
  Layout,
  ContentArea,
  ProjectSelector,
  clearUserSession,
} from './components';
import { useGetVersionsForPlaylist } from './api';
import { usePlaylistMetadata } from './hooks/usePlaylistMetadata';

function App() {
  const queryClient = useQueryClient();
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
    if (versions.length > 0 && !selectedVersion) {
      const inReviewVersionId = playlistMetadata?.in_review;
      const inReviewVersion = inReviewVersionId
        ? versions.find((v) => v.id === inReviewVersionId)
        : null;

      if (inReviewVersion) {
        setSelectedVersion(inReviewVersion);
      } else {
        setSelectedVersion(versions[0]);
      }
    }
  }, [versions, selectedVersion, playlistMetadata]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['allDraftNotes'] });
    await queryClient.invalidateQueries({ queryKey: ['draftNote'] });

    const result = await refetch();
    if (result.data && selectedVersion) {
      const updatedVersion = result.data.find(
        (v) => v.id === selectedVersion.id
      );
      if (updatedVersion) {
        setSelectedVersion(updatedVersion);
      }
    }
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

  const handleReplacePlaylist = () => {
    setSelectedPlaylist(null);
    setSelectedVersion(null);
  };

  const handleLogout = () => {
    clearUserSession();
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
      onReplacePlaylist={handleReplacePlaylist}
      playlistId={selectedPlaylist.id}
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
