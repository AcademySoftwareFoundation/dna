import React, { useEffect, useState } from 'react';
import { useShotGrid } from '../../hooks/useShotGrid';
import StatusBadge from '../StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function ShotGridPanel({ config, configLoaded, setRows, setCurrentIndex, setOriginalFilename }) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistStatus, setPlaylistStatus] = useState({ msg: "", type: "info" });
  const [playlistItemsLoading, setPlaylistItemsLoading] = useState(false);
  const {
    sgProjects,
    selectedProjectId,
    setSelectedProjectId,
    sgPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    sgLoading,
    sgError
  } = useShotGrid(config, configLoaded);

  const extractPlaylistIdFromUrl = (value) => {
    if (!value) return "";
    const match =
      value.match(/Playlist[_/](\d+)/i) ||      // e.g. #Playlist_406605 or /Playlist/406605
      value.match(/playlist_id=(\d+)/i) ||      // query param
      value.match(/playlists?\/(\d+)/i) ||      // path segment
      value.match(/(\d+)(?!.*\d)/);             // last number in the string as fallback
    return match ? match[1] : "";
  };
  const parsedPlaylistId = extractPlaylistIdFromUrl(playlistUrl);
  const handleLoadPlaylist = () => {
    if (!parsedPlaylistId) {
      setPlaylistStatus({ msg: "Invalid ShotGrid playlist URL", type: "error" });
      return;
    }
    setPlaylistStatus({ msg: "", type: "info" });
    setSelectedPlaylistId(parsedPlaylistId);
  };

  // --- Populate shot list when a playlist is selected ---
  useEffect(() => {
    if (!config.shotgrid_enabled || !selectedPlaylistId) {
      setPlaylistItemsLoading(false);
      return;
    }
    setPlaylistItemsLoading(true);
    // Fetch playlist shots from backend as soon as a playlist is selected
    fetch(`${BACKEND_URL}/shotgrid/playlist-items/${selectedPlaylistId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.items)) {
          //console.log('Fetched playlist items:', data.items);
          setRows(data.items.map(v => ({ shot: v, transcription: "", summary: "", notes: "" })));
          setCurrentIndex(0);
          // Set original filename for ShotGrid playlists with project name
          if (setOriginalFilename) {
            const project = sgProjects.find(p => String(p.id) === String(selectedProjectId));
            const projectName = project?.code || 'unknown_project';
            // Clean up the project name for filename
            const cleanProjectName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
            setOriginalFilename(`${cleanProjectName}_playlist_${selectedPlaylistId}`);
          }
        }
      })
      .catch((error) => {
        console.error('Error fetching playlist items:', error);
      })
      .finally(() => setPlaylistItemsLoading(false));
  }, [config.shotgrid_enabled, selectedPlaylistId, selectedProjectId, sgProjects, setRows, setCurrentIndex, setOriginalFilename]);

  if (!config.shotgrid_enabled) {
    return null;
  }

  return (
    <div>
      <p className="help-text">Select an active ShotGrid project and a recent playlist, or paste a playlist URL, to add shots to the shot list.</p>
      <div className="field-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ minWidth: 160, maxWidth: 200, flex: '0 1 200px' }}>
          <label htmlFor="sg-project-select" className="field-label" style={{ marginBottom: 4, display: 'block' }}>Project</label>
          <select
            id="sg-project-select"
            value={selectedProjectId}
            onChange={e => {
              setSelectedProjectId(e.target.value);
              setSelectedPlaylistId("");
              setPlaylistUrl("");
              setPlaylistStatus({ msg: "", type: "info" });
            }}
            className="text-input"
            style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            disabled={!!playlistUrl || sgLoading || sgProjects.length === 0}
          >
            <option value="">...</option>
            {sgProjects.map(pr => (
              <option key={pr.id} value={pr.id}>{pr.code}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 200, maxWidth: 260, flex: '1 1 260px' }}>
          <label htmlFor="sg-playlist-select" className="field-label" style={{ marginBottom: 4, display: 'block' }}>Playlist</label>
          <select
            id="sg-playlist-select"
            value={selectedPlaylistId}
            onChange={e => {
              setSelectedPlaylistId(e.target.value);
              setPlaylistUrl("");
              setPlaylistStatus({ msg: "", type: "info" });
            }}
            className="text-input"
            style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            disabled={!!playlistUrl || !selectedProjectId || sgLoading || sgPlaylists.length === 0}
          >
            <option value="">...</option>
            {sgPlaylists.map(pl => (
              <option key={pl.id} value={pl.id}>{pl.code} ({pl.created_at?.slice(0,10)})</option>
            ))}
          </select>
        </div>
        {sgLoading && <span className="spinner" aria-hidden="true" style={{ marginLeft: 12, marginTop: 32 }} />}
        {sgError && <span style={{ color: 'red', marginLeft: 12, marginTop: 32 }}>{sgError}</span>}
      </div>
      <div style={{ width: '100%', textAlign: 'left', margin: '8px 0 4px 0', fontWeight: 700, color: 'var(--accent)' }}>
        <span>------ OR ------</span>
      </div>
      <div className="field-row" style={{ marginTop: 8 }}>
        <div style={{ flex: '1 1 100%', maxWidth: 520 }}>
          <div className="field-row" style={{ gap: 8, alignItems: 'stretch', padding: 0 }}>
            <input
              id="sg-playlist-url"
              type="text"
              className="text-input"
              placeholder="Paste a ShotGrid playlist link"
              aria-label="ShotGrid playlist URL"
              value={playlistUrl}
              onChange={e => {
                const value = e.target.value;
                setPlaylistUrl(value);
                if (!value.trim()) {
                  setPlaylistStatus({ msg: "", type: "info" });
                } else if (extractPlaylistIdFromUrl(value)) {
                  setPlaylistStatus({ msg: "", type: "info" });
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLoadPlaylist();
                }
              }}
              style={{
                flex: '1 1 auto',
                borderColor: playlistStatus.type === 'error' && playlistStatus.msg ? 'var(--danger)' : undefined
              }}
            />
            <button
              type="button"
              className="btn primary"
              style={{ alignSelf: 'stretch', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}
              onClick={handleLoadPlaylist}
              disabled={sgLoading || playlistItemsLoading}
            >
              Load
            </button>
            {playlistItemsLoading && <span className="spinner" aria-hidden="true" style={{ marginLeft: 4 }} />}
          </div>
          {playlistStatus.msg && (
            <div style={{ marginTop: 6 }}>
              <StatusBadge type={playlistStatus.type}>{playlistStatus.msg}</StatusBadge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShotGridPanel;
