import React, { useState } from 'react';

function SettingsPanel({ 
  includeSpeakerLabels, 
  setIncludeSpeakerLabels,
  autoGenerateSummary,
  setAutoGenerateSummary,
  autoSummaryLLM,
  setAutoSummaryLLM,
  enabledLLMs,
  onRefreshAllSummaries
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshCancelled, setRefreshCancelled] = useState(false);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setRefreshProgress(0);
    setRefreshCancelled(false);
    
    if (onRefreshAllSummaries) {
      await onRefreshAllSummaries(
        (progress) => setRefreshProgress(progress),
        () => refreshCancelled
      );
    }
    
    setIsRefreshing(false);
    setRefreshProgress(0);
  };

  const handleCancel = () => {
    setRefreshCancelled(true);
  };
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="auto-summary-toggle"
              type="checkbox"
              checked={autoGenerateSummary}
              onChange={(e) => setAutoGenerateSummary(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label
              htmlFor="auto-summary-toggle"
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              Auto generate summary on context switch
            </label>
          </div>
          
          {autoGenerateSummary && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '24px' }}>
              <select
                value={autoSummaryLLM}
                onChange={(e) => setAutoSummaryLLM(e.target.value)}
                style={{
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
              
              {autoSummaryLLM && autoSummaryLLM !== 'none' && !isRefreshing && (
                <button
                  onClick={handleRefreshAll}
                  className="btn"
                  style={{
                    padding: '4px 8px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10px',
                    background: '#3d82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Refresh All
                </button>
              )}
              
              {isRefreshing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '100px', 
                    height: '6px', 
                    background: '#444', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div 
                      style={{ 
                        width: `${refreshProgress}%`, 
                        height: '100%', 
                        background: '#3d82f6',
                        transition: refreshProgress === 0 ? 'none' : 'width 0.2s ease'
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {Math.round(refreshProgress)}%
                  </span>
                  <button
                    onClick={handleCancel}
                    style={{
                      padding: '4px 8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
