import React, { useEffect } from 'react';
import { useShotGrid } from '../../hooks/useShotGrid';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function ShotGridPanel({ config, configLoaded, setRows, setCurrentIndex }) {
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

  // --- Populate shot list when a playlist is selected ---
  useEffect(() => {
    if (!config.shotgrid_enabled || !selectedPlaylistId) return;
    // Fetch playlist shots from backend as soon as a playlist is selected
    fetch(`${BACKEND_URL}/shotgrid/playlist-items/${selectedPlaylistId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.items)) {
          //console.log('Fetched playlist items:', data.items);
          setRows(data.items.map(v => ({ shot: v, transcription: "", summary: "", notes: "" })));
          setCurrentIndex(0);
        }
      })
      .catch((error) => {
        console.error('Error fetching playlist items:', error);
      });
  }, [config.shotgrid_enabled, selectedPlaylistId, setRows, setCurrentIndex]);

  if (!config.shotgrid_enabled) {
    return null;
  }

  return (
    <div>
      <p className="help-text">Select an active ShotGrid project and a recent playlist to add shots to the shot list.</p>
      <div className="field-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 220, marginRight: 16 }}>
          <label htmlFor="sg-project-select" className="field-label" style={{ marginBottom: 4, display: 'block' }}>Project</label>
          <select
            id="sg-project-select"
            value={selectedProjectId}
            onChange={e => setSelectedProjectId(e.target.value)}
            className="text-input"
            style={{ width: '100%' }}
            disabled={sgLoading || sgProjects.length === 0}
          >
            <option value="">-- Select Project --</option>
            {sgProjects.map(pr => (
              <option key={pr.id} value={pr.id}>{pr.code}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row" style={{ marginTop: 8 }}>
        <div style={{ minWidth: 240 }}>
          <label htmlFor="sg-playlist-select" className="field-label" style={{ marginBottom: 4, display: 'block' }}>Playlist</label>
          <select
            id="sg-playlist-select"
            value={selectedPlaylistId}
            onChange={e => setSelectedPlaylistId(e.target.value)}
            className="text-input"
            style={{ width: '100%' }}
            disabled={!selectedProjectId || sgLoading || sgPlaylists.length === 0}
          >
            <option value="">-- Select Playlist --</option>
            {sgPlaylists.map(pl => (
              <option key={pl.id} value={pl.id}>{pl.code} ({pl.created_at?.slice(0,10)})</option>
            ))}
          </select>
        </div>
        {sgLoading && <span className="spinner" aria-hidden="true" style={{ marginLeft: 12, marginTop: 32 }} />}
        {sgError && <span style={{ color: 'red', marginLeft: 12, marginTop: 32 }}>{sgError}</span>}
      </div>
    </div>
  );
}

export default ShotGridPanel;