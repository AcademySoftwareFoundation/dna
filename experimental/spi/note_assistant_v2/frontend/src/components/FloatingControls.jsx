import React, { useState } from 'react';
import StatusBadge from './StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function FloatingControls({ 
  botIsActive, 
  status, 
  isReceivingTranscripts, 
  joinedMeetId, 
  onTranscriptToggle,
  // Add shot controls props
  config,
  rows,
  setRows,
  setCurrentIndex,
  selectedProjectId
}) {
  // Add shot controls state
  const [newShotValue, setNewShotValue] = useState("");
  const [addingShotLoading, setAddingShotLoading] = useState(false);
  const [addShotStatus, setAddShotStatus] = useState({ msg: "", type: "info" });
  const [isExpanded, setIsExpanded] = useState(true);

  // Function to add a new shot/version
  const addNewShot = async () => {
    if (!newShotValue.trim() || addingShotLoading) return;
    
    let finalShotValue = newShotValue.trim();
    let shouldAddShot = true; // Flag to determine if shot should be added
    
    // If ShotGrid is enabled, validate the input first
    if (config.shotgrid_enabled) {
      setAddingShotLoading(true);
      setAddShotStatus({ msg: "Validating with ShotGrid...", type: "info" });
      
      try {
        const requestBody = { 
          input_value: newShotValue.trim(),
          project_id: selectedProjectId ? parseInt(selectedProjectId) : null
        };
        
        const response = await fetch(`${BACKEND_URL}/shotgrid/validate-shot-version`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
          if (data.success) {
            finalShotValue = data.shot_version;
            // Show a brief success message
            setAddShotStatus({ msg: data.message, type: "success" });
            setTimeout(() => setAddShotStatus({ msg: "", type: "info" }), 2000);
            shouldAddShot = true;
          } else {
            // Show validation error and don't add the shot
            setAddShotStatus({ msg: data.message || "Shot validation failed", type: "error" });
            setTimeout(() => setAddShotStatus({ msg: "", type: "info" }), 2000);
            shouldAddShot = false; // Don't add invalid shots
          }
        } else {
          // Network or server error - show error and don't add
          const errorMsg = data.message || `Server error (${response.status})`;
          setAddShotStatus({ msg: `Validation failed: ${errorMsg}`, type: "error" });
          setTimeout(() => setAddShotStatus({ msg: "", type: "info" }), 2000);
          shouldAddShot = false;
        }
      } catch (error) {
        console.error('Validation error:', error);
        // Network error - show error and don't add
        setAddShotStatus({ msg: `Validation failed: ${error.message}`, type: "error" });
        setTimeout(() => setAddShotStatus({ msg: "", type: "info" }), 2000);
        shouldAddShot = false;
      } finally {
        setAddingShotLoading(false);
      }
    }
    
    // Only add the shot if validation passed or ShotGrid is disabled
    if (shouldAddShot) {
      const newRow = {
        shot: finalShotValue,
        transcription: "",
        summary: "",
        notes: ""
      };
      
      setRows(prevRows => [...prevRows, newRow]);
      setNewShotValue("");
      
      // Set focus to the new row
      setTimeout(() => {
        setCurrentIndex(rows.length);
      }, 0);
    }
  };

  // Handle Enter key press in add shot input
  const handleAddShotKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewShot();
    }
  };
  return (
    <div style={{ 
      position: 'fixed', 
      top: '20px', 
      right: '20px', 
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '12px'
    }}>
      {/* Expand/Collapse button - always visible on the left */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '8px',
          background: 'none',
          border: '1px solid #444',
          borderRadius: '4px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '36px',
          width: '36px',
          flexShrink: 0
        }}
        title={isExpanded ? 'Collapse controls' : 'Expand controls'}
      >
        {/* Expand/Collapse icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          {isExpanded ? (
            // Collapse icon (chevron up)
            <path d="M6 15L12 9L18 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          ) : (
            // Expand icon (chevron down)
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          )}
        </svg>
      </button>

      {/* Floating controls container */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {/* Add Shot Controls - only show when expanded */}
        {isExpanded && (
          <div className="add-shot-controls">
            <input
              type="text"
              className="text-input"
              placeholder={config.shotgrid_enabled ? "Add shot/version or ID..." : "Add shot/version..."}
              value={newShotValue}
              onChange={(e) => setNewShotValue(e.target.value)}
              onKeyDown={handleAddShotKeyPress}
              style={{ flex: 1, height: '36px', fontSize: '13px' }}
              disabled={addingShotLoading}
            />
            <button
              type="button"
              className="btn primary"
              onClick={addNewShot}
              disabled={!newShotValue.trim() || addingShotLoading}
              title={config.shotgrid_enabled ? 
                "Add Shot/Version (validates against ShotGrid when enabled)" : 
                "Add Shot/Version"
              }
              style={{
                backgroundColor: addShotStatus.type === 'error' ? 'var(--danger)' : undefined
              }}
            >
              {addingShotLoading ? '...' : '+'}
            </button>
          </div>
        )}

        {/* Add Shot Status - only show when expanded and there's a message */}
        {isExpanded && (
          <div className="add-shot-status" style={{ 
            display: addShotStatus.msg ? 'flex' : 'none'
          }}>
            <StatusBadge type={addShotStatus.type}>{addShotStatus.msg}</StatusBadge>
          </div>
        )}

        {/* Bot Status - only show when expanded and there's a message */}
        {isExpanded && status.msg && (
          <div className="bot-status-display">
            <StatusBadge 
              type={status.type} 
              detailedMessage={status.detailedMsg}
              maxLength={25}
            >
              {status.msg}
            </StatusBadge>
          </div>
        )}

        {/* Transcript Controls - always visible when bot is active */}
        {botIsActive && (
          <div className="transcript-controls">
            <button 
              type="button" 
              className={`btn ${isReceivingTranscripts ? (botIsActive ? 'danger' : 'primary') : 'primary'}`}
              onClick={onTranscriptToggle}
              disabled={!joinedMeetId}
            >
              {isReceivingTranscripts ? 'Pause Transcripts' : 'Get Transcripts'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FloatingControls;