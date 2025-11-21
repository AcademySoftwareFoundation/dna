import { useState, useEffect } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export function useShotGrid(config, configLoaded) {
  const [sgProjects, setSgProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [sgPlaylists, setSgPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [sgLoading, setSgLoading] = useState(false);
  const [sgError, setSgError] = useState("");

  // Fetch active ShotGrid projects on mount (only if ShotGrid is enabled)
  useEffect(() => {
    if (!configLoaded || !config.shotgrid_enabled) return;
    
    setSgLoading(true);
    fetch(`${BACKEND_URL}/shotgrid/active-projects`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setSgProjects(data.projects || []);
        } else {
          setSgError(data.message || "Failed to fetch projects");
        }
      })
      .catch(() => setSgError("Network error fetching projects"))
      .finally(() => setSgLoading(false));
  }, [configLoaded, config.shotgrid_enabled]);

  // Fetch playlists when a project is selected
  useEffect(() => {
    if (!config.shotgrid_enabled || !selectedProjectId) {
      setSgPlaylists([]);
      return;
    }
    setSgLoading(true);
    fetch(`${BACKEND_URL}/shotgrid/latest-playlists/${selectedProjectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setSgPlaylists(data.playlists || []);
        } else {
          setSgError(data.message || "Failed to fetch playlists");
        }
      })
      .catch(() => setSgError("Network error fetching playlists"))
      .finally(() => setSgLoading(false));
  }, [config.shotgrid_enabled, selectedProjectId]);

  return {
    sgProjects,
    selectedProjectId,
    setSelectedProjectId,
    sgPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    sgLoading,
    sgError
  };
}
