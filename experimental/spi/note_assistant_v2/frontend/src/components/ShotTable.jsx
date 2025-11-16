import React from 'react';
import { getLLMSummary } from '../services/llmService';

function ShotTable({ 
  rows, 
  currentIndex, 
  setCurrentIndex, 
  pinnedIndex, 
  setPinnedIndex, 
  activeTab, 
  setActiveTab,
  enabledLLMs,
  availablePromptTypes,
  promptTypeSelection,
  setPromptTypeSelection,
  updateCell
}) {
  // Helper function to set all rows to notes tab
  const switchAllRowsToNotes = () => {
    const newActiveTab = {};
    rows.forEach((_, idx) => {
      newActiveTab[idx] = 'notes';
    });
    setActiveTab(newActiveTab);
  };

  const setTabForRow = (rowIndex, tabName) => {
    setActiveTab(prev => ({
      ...prev,
      [rowIndex]: tabName
    }));
  };

  const getActiveTabForRow = (rowIndex) => {
    return activeTab[rowIndex] || 'notes';
  };

  const setPromptTypeForRowAndLLM = (rowIndex, llmKey, promptType) => {
    setPromptTypeSelection(prev => ({
      ...prev,
      [`${rowIndex}_${llmKey}`]: promptType
    }));
  };

  const getPromptTypeForRowAndLLM = (rowIndex, llmKey) => {
    return promptTypeSelection[`${rowIndex}_${llmKey}`] || (availablePromptTypes[0] || '');
  };

  if (rows.length === 0) {
    return <p className="help-text">Upload a playlist CSV to populate shot notes, or add shots manually using the button above.</p>;
  }

  return (
    <div className="table-wrapper" style={{ width: '100%' }}>
      <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th className="col-shot" style={{ width: '10%' }}>Shot/Version</th>
                                <th className="col-notes" style={{ width: '45%' }}>
                      <span 
                        onClick={() => {
                          const newActiveTab = {};
                          rows.forEach((_, idx) => {
                            newActiveTab[idx] = 'notes';
                          });
                          setActiveTab(newActiveTab);
                        }}
                        style={{ 
                          cursor: 'pointer', 
                          textDecoration: 'underline',
                          color: '#3d82f6'
                        }}
                        title="Click to switch all rows to Notes tab"
                      >
                        Notes
                      </span> & Summary
                      {enabledLLMs.length > 0 && (
                        <span style={{ marginLeft: '8px' }}>
                          (
                          {enabledLLMs.map((llm, index) => (
                            <span key={llm.key}>
                              <span
                                onClick={() => {
                                  const newActiveTab = {};
                                  rows.forEach((_, idx) => {
                                    newActiveTab[idx] = llm.key;
                                  });
                                  setActiveTab(newActiveTab);
                                }}
                                style={{ 
                                  cursor: 'pointer', 
                                  textDecoration: 'underline',
                                  color: '#3d82f6'
                                }}
                                title={`Click to switch all rows to ${llm.name} tab`}
                              >
                                {llm.name}
                              </span>
                              {index < enabledLLMs.length - 1 && ', '}
                            </span>
                          ))}
                          )
                        </span>
                      )}
                    </th>
            <th className="col-transcription" style={{ width: '45%' }}>Transcription</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isPinned = pinnedIndex === idx;
            const isCurrent = pinnedIndex !== null ? isPinned : idx === currentIndex;
            return (
              <tr key={idx} className={isCurrent ? 'current-row' : ''}>
                {/* Shot/Version Cell */}
                <td className="readonly-cell" style={{ width: '10%', position: 'relative', paddingRight: '40px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2', wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-all', maxWidth: '100%' }}>
                    {(() => {
                      // Parse shot/version - try common delimiters
                      const shotText = row.shot || '';
                      const delimiters = ['/', '-', '_', '.'];
                      let shot = shotText;
                      let version = '';
                      
                      for (const delimiter of delimiters) {
                        const parts = shotText.split(delimiter);
                        if (parts.length >= 2) {
                          shot = parts[0];
                          version = parts.slice(1).join(delimiter);
                          break;
                        }
                      }
                      
                      return (
                        <>
                          <span style={{ color: 'var(--text-muted)', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{shot}</span>
                          <span style={{ fontSize: '1.5em', fontWeight: 'bold', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{version || shot}</span>
                        </>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className={`btn${isPinned ? ' pinned' : ''}`}
                    style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPinned ? 'rgba(59, 130, 246, 0.1)' : undefined, borderColor: isPinned ? '#3d82f6' : undefined, color: isPinned ? '#3d82f6' : undefined }}
                    aria-label="Pin"
                    onClick={() => setPinnedIndex(isPinned ? null : idx)}
                  >
                    {/* Pin icon from Iconoir (https://iconoir.com/) */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9.5 14.5L3 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </td>

                {/* Notes & Summary Cell */}
                <td style={{ width: '45%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Tab Navigation */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #2c323c', marginBottom: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`tab-button ${getActiveTabForRow(idx) === 'notes' ? 'active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setTabForRow(idx, 'notes');
                        }}
                      >
                        Notes
                      </button>
                      {enabledLLMs.map(llm => (
                        <button
                          key={llm.key}
                          type="button"
                          className={`tab-button ${getActiveTabForRow(idx) === llm.key ? 'active' : ''}`}
                          style={{ position: 'relative' }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setTabForRow(idx, llm.key);
                          }}
                        >
                          {llm.name}
                        </button>
                      ))}
                      <div style={{ flex: 1 }}></div>
                      <button
                        type="button"
                        className="btn"
                        style={{ 
                          padding: '2px', 
                          minWidth: '20px', 
                          height: '20px', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          fontSize: '10px',
                          background: '#3d82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          marginLeft: '8px'
                        }}
                        aria-label="Refresh All Summaries"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const inputText = row.transcription || row.notes || '';
                          if (!inputText.trim()) return;
                          
                          // Generate summaries for all enabled LLMs
                          enabledLLMs.forEach(async (llm) => {
                            const promptType = getPromptTypeForRowAndLLM(idx, llm.key);
                            updateCell(idx, `${llm.key}_summary`, '...'); // Show loading
                            const summary = await getLLMSummary(inputText, llm.provider, promptType);
                            updateCell(idx, `${llm.key}_summary`, summary || '[No summary returned]');
                          });
                        }}
                      >
                        {/* Refresh icon from Iconoir (https://iconoir.com/) */}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>

                    {/* Tab Content */}
                    <div style={{ flex: 1 }}>
                      {(() => {
                        const activeTabName = getActiveTabForRow(idx);
                        if (activeTabName === 'notes') {
                          return (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                              {/* Invisible prompt selector to match height of LLM tabs */}
                              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', visibility: 'hidden' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '60px' }}>
                                  Prompt:
                                </label>
                                <select
                                  style={{
                                    fontSize: '12px',
                                    padding: '2px 4px',
                                    border: '1px solid #444',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    borderRadius: '3px',
                                    minWidth: '70px'
                                  }}
                                >
                                  <option>short</option>
                                </select>
                                <button
                                  type="button"
                                  style={{ 
                                    padding: '2px', 
                                    minWidth: '20px', 
                                    height: '20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    background: '#3d82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px'
                                  }}
                                >
                                  ↻
                                </button>
                              </div>
                              <textarea
                                value={row.notes || ''}
                                onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                                onChange={(e) => updateCell(idx, 'notes', e.target.value)}
                                className="table-textarea"
                                placeholder="Enter notes..."
                                rows={3}
                                style={{ flex: 1, minHeight: '50px' }}
                              />
                            </div>
                          );
                        }
                        
                        const activeLLM = enabledLLMs.find(llm => llm.key === activeTabName);
                        if (activeLLM) {
                          return (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                              {/* Prompt Type Selector */}
                              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '60px' }}>
                                  Prompt:
                                </label>
                                <select
                                  value={getPromptTypeForRowAndLLM(idx, activeLLM.key)}
                                  onChange={(e) => setPromptTypeForRowAndLLM(idx, activeLLM.key, e.target.value)}
                                  style={{
                                    fontSize: '12px',
                                    padding: '2px 4px',
                                    border: '1px solid #444',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    borderRadius: '3px',
                                    minWidth: '70px'
                                  }}
                                >
                                  {availablePromptTypes.map(promptType => (
                                    <option key={promptType} value={promptType}>
                                      {promptType}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ 
                                    padding: '2px', 
                                    minWidth: '20px', 
                                    height: '20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    background: '#3d82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px'
                                  }}
                                  aria-label="Refresh Summary"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const inputText = row.transcription || row.notes || '';
                                    if (!inputText.trim()) return;
                                    const promptType = getPromptTypeForRowAndLLM(idx, activeLLM.key);
                                    updateCell(idx, `${activeLLM.key}_summary`, '...'); // Show loading
                                    const summary = await getLLMSummary(inputText, activeLLM.provider, promptType);
                                    updateCell(idx, `${activeLLM.key}_summary`, summary || '[No summary returned]');
                                  }}
                                >
                                  {/* Refresh icon from Iconoir (https://iconoir.com/) */}
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                                <div style={{ flex: 1 }}></div>
                                <button
                                  type="button"
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Find the active summary textarea using data attributes
                                    const summaryTextarea = document.querySelector(
                                      `textarea[data-row-index="${idx}"][data-llm-key="${activeLLM.key}"]`
                                    );
                                    
                                    let contentToCopy = '';
                                    if (summaryTextarea && summaryTextarea.selectionStart !== summaryTextarea.selectionEnd) {
                                      // Use selected text if there's a selection
                                      contentToCopy = summaryTextarea.value.substring(
                                        summaryTextarea.selectionStart, 
                                        summaryTextarea.selectionEnd
                                      );
                                    } else {
                                      // Use entire summary if no selection
                                      contentToCopy = row[`${activeLLM.key}_summary`] || '';
                                    }
                                    
                                    if (contentToCopy.trim()) {
                                      const currentNotes = row.notes || '';
                                      const separator = currentNotes.trim() ? '\n\n' : '';
                                      updateCell(idx, 'notes', currentNotes + separator + contentToCopy);
                                    }
                                  }}
                                >
                                  Add to Notes
                                </button>
                              </div>
                              <textarea
                                key={activeLLM.key}
                                ref={(el) => {
                                  if (el) {
                                    el.dataset.rowIndex = idx;
                                    el.dataset.llmKey = activeLLM.key;
                                  }
                                }}
                                value={row[`${activeLLM.key}_summary`] || ''}
                                onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                                onChange={(e) => updateCell(idx, `${activeLLM.key}_summary`, e.target.value)}
                                className="table-textarea"
                                placeholder={`${activeLLM.name} summary goes here...`}
                                rows={3}
                                style={{ flex: 1, minHeight: '50px' }}
                              />
                            </div>
                          );
                        }
                        
                        return null;
                      })()}
                    </div>
                  </div>
                </td>

                {/* Transcription Cell */}
                <td style={{ width: '45%' }}>
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <textarea
                      name="transcription"
                      value={row.transcription}
                      onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                      onChange={(e) => updateCell(idx, 'transcription', e.target.value)}
                      className="table-textarea"
                      placeholder="Transcription goes here..."
                      rows={3}
                      style={{ flex: 1, height: '100%', minHeight: '110px' }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ShotTable;