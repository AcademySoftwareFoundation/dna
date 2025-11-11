import React from 'react';

function SettingsPanel({ includeSpeakerLabels, setIncludeSpeakerLabels }) {
  return (
    <div>
      <p className="help-text">Configure application settings for transcription and AI summaries.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={includeSpeakerLabels}
            onChange={(e) => setIncludeSpeakerLabels(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Include speaker labels in the transcript</span>
        </label>
      </div>
    </div>
  );
}

export default SettingsPanel;