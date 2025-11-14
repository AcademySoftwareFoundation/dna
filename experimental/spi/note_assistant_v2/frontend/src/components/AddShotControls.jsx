import React, { useState } from 'react';
import StatusBadge from './StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function AddShotControls({ config, rows, setRows, setCurrentIndex, selectedProjectId }) {
  const [newShotValue, setNewShotValue] = useState("");
  const [addingShotLoading, setAddingShotLoading] = useState(false);
  const [addShotStatus, setAddShotStatus] = useState({ msg: "", type: "info" });

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
    <div className="floating-add-shot-controls">
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
      {/* Always render status container, but only show badge when there's a message */}
      <div className="add-shot-status" style={{ 
        display: addShotStatus.msg ? 'flex' : 'none'
      }}>
        <StatusBadge type={addShotStatus.type}>{addShotStatus.msg}</StatusBadge>
      </div>
    </div>
  );
}

export default AddShotControls;