import { useState, useEffect } from "react";

// Backend URL from environment or default
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

interface ShotGridProject {
  id: number;
  code: string;
  name?: string;
}

interface ShotGridPlaylist {
  id: number;
  code: string;
  created_at?: string;
  name?: string;
}

interface ValidationResponse {
  status: "success" | "error";
  message?: string;
  shot_name?: string;
  version_name?: string;
}

export const useShotGrid = () => {
  const [shotgridEnabled, setShotgridEnabled] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [projects, setProjects] = useState<ShotGridProject[]>([]);
  const [playlists, setPlaylists] = useState<ShotGridPlaylist[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch configuration on mount
  useEffect(() => {
    fetch(`${BACKEND_URL}/config`)
      .then((res) => res.json())
      .then((data) => {
        setShotgridEnabled(data.shotgrid_enabled || false);
        setConfigLoaded(true);
      })
      .catch(() => {
        console.error("Failed to fetch app config, assuming ShotGrid disabled");
        setShotgridEnabled(false);
        setConfigLoaded(true);
      });
  }, []);

  // Fetch projects when config is loaded and ShotGrid is enabled
  useEffect(() => {
    if (!configLoaded || !shotgridEnabled) return;

    setLoading(true);
    fetch(`${BACKEND_URL}/shotgrid/active-projects`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setProjects(data.projects || []);
        } else {
          setError(data.message || "Failed to fetch projects");
        }
      })
      .catch(() => setError("Network error fetching projects"))
      .finally(() => setLoading(false));
  }, [configLoaded, shotgridEnabled]);

  // Fetch playlists when a project is selected
  useEffect(() => {
    if (!shotgridEnabled || !selectedProjectId) {
      setPlaylists([]);
      setSelectedPlaylistId(null);
      return;
    }

    setLoading(true);
    fetch(`${BACKEND_URL}/shotgrid/latest-playlists/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setPlaylists(data.playlists || []);
        } else {
          setError(data.message || "Failed to fetch playlists");
        }
      })
      .catch(() => setError("Network error fetching playlists"))
      .finally(() => setLoading(false));
  }, [shotgridEnabled, selectedProjectId]);

  // Fetch playlist items (shots/versions)
  const fetchPlaylistItems = async (playlistId: string): Promise<string[]> => {
    if (!shotgridEnabled || !playlistId) return [];

    setLoading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/shotgrid/playlist-items/${playlistId}`,
      );
      const data = await response.json();

      if (data.status === "success" && Array.isArray(data.items)) {
        return data.items;
      }
      return [];
    } catch (error) {
      console.error("Error fetching playlist items:", error);
      setError("Failed to fetch playlist items");
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Validate shot/version against ShotGrid
  const validateShotVersion = async (
    inputValue: string,
    projectId?: string,
  ): Promise<ValidationResponse> => {
    if (!shotgridEnabled) {
      return {
        status: "success",
        shot_name: inputValue,
      };
    }

    try {
      const response = await fetch(
        `${BACKEND_URL}/shotgrid/validate-shot-version`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input_value: inputValue.trim(),
            project_id: projectId ? parseInt(projectId) : null,
          }),
        },
      );

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error validating shot/version:", error);
      return {
        status: "error",
        message: "Network error during validation",
      };
    }
  };

  return {
    configLoaded,
    projects,
    playlists,
    selectedProjectId,
    setSelectedProjectId,
    selectedPlaylistId,
    setSelectedPlaylistId,
    loading,
    error,
    fetchPlaylistItems,
    validateShotVersion,
    isEnabled: shotgridEnabled,
  };
};
