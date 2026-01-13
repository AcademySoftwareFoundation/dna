import { useState } from 'react';
import { Playlist, Project, Version } from '@dna/core';
import { Layout, ContentArea, ProjectSelector, clearUserSession } from './components';
import { useGetVersionsForPlaylist } from './api';

function App() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null
  );
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);

  const { data: versions = [], refetch } = useGetVersionsForPlaylist(
    selectedPlaylist?.id ?? null
  );

  const handleRefresh = async () => {
    const result = await refetch();
    if (result.data && selectedVersion) {
      const updatedVersion = result.data.find(v => v.id === selectedVersion.id);
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
        onVersionSelect={handleVersionSelect}
        onRefresh={handleRefresh}
      />
    </Layout>
  );
}

export default App;
