import React from 'react';

function SettingsPanel({ 
  includeSpeakerLabels, 
  setIncludeSpeakerLabels,
  autoGenerateSummary,
  setAutoGenerateSummary,
  autoSummaryLLM,
  setAutoSummaryLLM,
  enabledLLMs
}) {
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

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoGenerateSummary}
            onChange={(e) => setAutoGenerateSummary(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span>Auto generate summary on context switch</span>
          {autoGenerateSummary && (
            <select
              value={autoSummaryLLM}
              onChange={(e) => setAutoSummaryLLM(e.target.value)}
              style={{
                marginLeft: '8px',
                padding: '4px 8px',
                border: '1px solid #444',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="none">None</option>
              {enabledLLMs.map(llm => (
                <option key={llm.key} value={llm.key}>
                  {llm.name}
                </option>
              ))}
            </select>
          )}
        </label>
      </div>
    </div>
  );
}

export default SettingsPanel;