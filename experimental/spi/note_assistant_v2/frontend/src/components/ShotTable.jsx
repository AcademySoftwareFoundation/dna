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
  updateCell,
  isReceivingTranscripts,
  setIsReceivingTranscripts,
  onTranscriptToggle
}) {
  const [hasActiveFocus, setHasActiveFocus] = React.useState(true);

  // Add a ref to track if we recently toggled to prevent rapid toggling
  const recentlyToggled = React.useRef(false);
  const prevRowsRef = React.useRef(rows);

  // Helper function to set all rows to notes tab
  const switchAllRowsToNotes = () => {
    const newActiveTab = {};
    rows.forEach((_, idx) => {
      newActiveTab[idx] = 'notes';
    });
    setActiveTab(newActiveTab);
  };

  // Handle clicking outside to deactivate focus
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is on a text input or within a text input
      const isTextInput = event.target.tagName === 'TEXTAREA' || 
                         (event.target.tagName === 'INPUT' && event.target.type === 'text') ||
                         event.target.closest('textarea') ||
                         event.target.closest('input[type="text"]');
      
      // If clicking on a text input, don't deactivate focus
      if (isTextInput) {
        return;
      }
      
      // Check if click is within the table
      const isWithinTable = event.target.closest('.data-table');
      
      // Check if click is within floating controls (don't interfere with those)
      const isWithinFloatingControls = event.target.closest('.floating-controls');
      
      // Check if click is on interactive elements we want to ignore
      const isButton = event.target.tagName === 'BUTTON' || event.target.closest('button');
      const isSelect = event.target.tagName === 'SELECT' || event.target.closest('select');
      const isSVG = event.target.tagName === 'SVG' || event.target.closest('svg');
      
      // Only deactivate if we're clicking in non-interactive areas, but NOT in floating controls
      if (isWithinTable && !isButton && !isSelect && !isSVG) {
        setHasActiveFocus(false);
        // Only pause transcript collection if no shot is pinned (pinned shots should continue receiving transcripts)
        if (isReceivingTranscripts && !recentlyToggled.current && pinnedIndex === null) {
          recentlyToggled.current = true;
          setIsReceivingTranscripts(); // This toggles from true to false
          setTimeout(() => { recentlyToggled.current = false; }, 1000); // Prevent rapid toggling
        }
      } else if (!isWithinTable && !isWithinFloatingControls) {
        setHasActiveFocus(false);
        // Only pause transcript collection if no shot is pinned (pinned shots should continue receiving transcripts)
        if (isReceivingTranscripts && !recentlyToggled.current && pinnedIndex === null) {
          recentlyToggled.current = true;
          setIsReceivingTranscripts(); // This toggles from true to false
          setTimeout(() => { recentlyToggled.current = false; }, 1000); // Prevent rapid toggling
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isReceivingTranscripts, pinnedIndex]);

  // Handle Escape key to toggle transcript streaming
  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setHasActiveFocus(false);
        // Use the same toggle logic as the floating control button
        if (!recentlyToggled.current) {
          recentlyToggled.current = true;
          onTranscriptToggle(); // Use the same function as the floating control button
          setTimeout(() => { recentlyToggled.current = false; }, 1000); // Prevent rapid toggling
        }
      }
      
      // Handle Ctrl+P to toggle pin/unpin
      if (event.ctrlKey && event.key === 'p') {
        event.preventDefault(); // Prevent browser print dialog
        
        // Determine which row to pin/unpin based on current focus
        const focusedElement = document.activeElement;
        let targetRowIndex = currentIndex; // Default to current index
        
        // Try to get row index from focused element
        if (focusedElement && focusedElement.tagName === 'TEXTAREA') {
          const rowElement = focusedElement.closest('tr');
          if (rowElement) {
            const allRows = Array.from(rowElement.parentElement.children);
            const rowIndex = allRows.indexOf(rowElement);
            if (rowIndex >= 0) {
              targetRowIndex = rowIndex;
            }
          }
        }
        
        // Handle pin/unpin logic
        if (pinnedIndex === targetRowIndex) {
          // If the target row is currently pinned, unpin it
          setPinnedIndex(null);
        } else if (pinnedIndex !== null) {
          // If another row is pinned and we're pressing Ctrl+P on a different row,
          // unpin the current pinned row and switch context to the target row (but don't pin it)
          setPinnedIndex(null);
          setCurrentIndex(targetRowIndex);
          setHasActiveFocus(true);
        } else {
          // If no row is pinned, pin the target row and make it active for transcription
          setPinnedIndex(targetRowIndex);
          setCurrentIndex(targetRowIndex);
          setHasActiveFocus(true);
        }
      }
      
      // Handle Alt+Arrow keys for navigation (changed from Ctrl to avoid macOS conflicts)
      if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault(); // Prevent default scroll behavior
        
        let newIndex;
        if (event.key === 'ArrowUp') {
          newIndex = Math.max(0, currentIndex - 1);
        } else {
          newIndex = Math.min(rows.length - 1, currentIndex + 1);
        }
        
        // Only change if we can actually move
        if (newIndex !== currentIndex) {
          // Always move the current index for navigation
          setCurrentIndex(newIndex);
          
          // Only set focus if no shot is pinned (pinned shots should continue receiving transcripts)
          if (pinnedIndex === null) {
            setHasActiveFocus(true);
          }
          
          // Focus the active tab textarea of the new row (Notes or LLM summary)
          // But don't trigger handleTextFieldFocus when a shot is pinned
          setTimeout(() => {
            const tableRows = document.querySelectorAll('.data-table tbody tr');
            if (tableRows[newIndex]) {
              const activeTabName = getActiveTabForRow(newIndex);
              let targetTextarea;
              
              if (activeTabName === 'notes') {
                // Focus the notes textarea
                targetTextarea = tableRows[newIndex].querySelector('textarea.table-textarea:not([name="transcription"])');
              } else {
                // Focus the active LLM summary textarea
                targetTextarea = tableRows[newIndex].querySelector(`textarea[data-llm-key="${activeTabName}"]`);
              }
              
              // Fallback to transcription if we can't find the target
              if (!targetTextarea) {
                targetTextarea = tableRows[newIndex].querySelector('textarea[name="transcription"]');
              }
              
              if (targetTextarea) {
                // Add a flag to prevent handleTextFieldFocus from changing currentIndex when shot is pinned
                targetTextarea.dataset.keyboardNavigation = 'true';
                targetTextarea.focus();
                // Remove the flag after a short delay
                setTimeout(() => {
                  delete targetTextarea.dataset.keyboardNavigation;
                }, 100);
              }
            }
          }, 50);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isReceivingTranscripts, onTranscriptToggle, pinnedIndex, currentIndex, setPinnedIndex, setCurrentIndex, rows, activeTab]);

  // Handle text field focus to restore active focus
  const handleTextFieldFocus = (rowIndex, event) => {
    // Prevent the event from bubbling up
    if (event) {
      event.stopPropagation();
    }
    
    // Check if this focus event is from keyboard navigation
    const isKeyboardNavigation = event && event.target && event.target.dataset.keyboardNavigation;
    
    // Only set the current index when focusing on a text field if no shot is pinned
    // When a shot is pinned, transcription should continue to the pinned shot regardless of focus
    if (pinnedIndex === null) {
      setCurrentIndex(rowIndex);
    }
    // If a shot is pinned, DO NOT change currentIndex regardless of how focus happened
    // The pinned shot should always remain the target for transcription
    
    // Use a small delay to ensure this runs after any click handlers
    setTimeout(() => {
      setHasActiveFocus(true);
    }, 10);
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

  // Initialize tabs for new rows while preserving existing selections
  React.useEffect(() => {
    const prevRows = prevRowsRef.current;
    
    // Detect when a completely new dataset replaces the current rows (e.g., new playlist import)
    const isDatasetReplacement = (
      prevRows.length === rows.length &&
      rows.length > 0 &&
      prevRows.some((prevRow, idx) => {
        const currentRow = rows[idx];
        if (!currentRow || !prevRow) return true;
        const prevIdentifier = `${prevRow.shot || ''}__${prevRow.version || ''}`;
        const currentIdentifier = `${currentRow.shot || ''}__${currentRow.version || ''}`;
        return prevIdentifier !== currentIdentifier;
      })
    );

    if (isDatasetReplacement) {
      const newActiveTab = {};
      rows.forEach((_, idx) => {
        newActiveTab[idx] = 'notes';
      });
      setActiveTab(newActiveTab);
    } else if (rows.length > 0) {
      setActiveTab(prev => {
        const nextTabs = { ...prev };
        let changed = false;
        
        // Ensure every row has an assigned tab (default to notes)
        rows.forEach((_, idx) => {
          if (!nextTabs[idx]) {
            nextTabs[idx] = 'notes';
            changed = true;
          }
        });

        // Remove any stale tab entries for rows that no longer exist
        Object.keys(nextTabs).forEach(key => {
          const idx = Number(key);
          if (Number.isInteger(idx) && idx >= rows.length) {
            delete nextTabs[idx];
            changed = true;
          }
        });

        return changed ? nextTabs : prev;
      });
    }

    prevRowsRef.current = rows;
  }, [rows, setActiveTab]);

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
      <style dangerouslySetInnerHTML={{
        __html: `
          .current-row-focused {
            border: 2px solid #3d82f6 !important;
            background-color: rgba(59, 130, 246, 0.1) !important;
          }
          .current-row-unfocused {
            border: 2px dotted rgba(59, 130, 246, 0.7) !important;
            background-color: rgba(59, 130, 246, 0.04) !important;
          }
        `
      }} />
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
            // When determining which row is "current" for transcription purposes:
            // - If a shot is pinned, only the pinned shot is "current" 
            // - If no shot is pinned, the currentIndex determines which shot is "current"
            const isCurrent = pinnedIndex !== null ? isPinned : idx === currentIndex;
            // Show dotted border when transcripts are NOT being received, regardless of focus
            // Show solid border when transcripts ARE being received
            const shouldShowDottedBorder = isCurrent && !isReceivingTranscripts;
            const rowClass = isCurrent 
              ? (shouldShowDottedBorder ? 'current-row current-row-unfocused' : 'current-row current-row-focused')
              : '';
            
            return (
              <tr key={idx} className={rowClass}>
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
                      <path d="M5.00007 9.48528L14.1925 18.6777L15.8895 16.9806L15.4974 13.1944L21.0065 8.5211L15.1568 2.67141L10.4834 8.18034L6.69713 7.78823L5.00007 9.48528Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
                        title="Generate summaries for all enabled LLMs for this shot using current transcription"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const inputText = row.transcription || '';
                          if (!inputText.trim()) return;
                          
                          // Generate summaries for all enabled LLMs
                          enabledLLMs.forEach(async (llm) => {
                            const promptType = getPromptTypeForRowAndLLM(idx, llm.key);
                            updateCell(idx, `${llm.key}_summary`, '...'); // Show loading
                            const summary = await getLLMSummary(inputText, llm.provider, promptType, llm.model_name);
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
                                onFocus={(e) => handleTextFieldFocus(idx, e)}
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
                                  title={`Generate ${activeLLM.name} summary for this shot using current transcription`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const inputText = row.transcription || '';
                                    if (!inputText.trim()) return;
                                    const promptType = getPromptTypeForRowAndLLM(idx, activeLLM.key);
                                    updateCell(idx, `${activeLLM.key}_summary`, '...'); // Show loading
                                    const summary = await getLLMSummary(inputText, activeLLM.provider, promptType, activeLLM.model_name);
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
                                  title="Copy summary content to Notes tab (copies selected text or entire summary if none selected)"
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
                                onFocus={(e) => handleTextFieldFocus(idx, e)}
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
                      onFocus={(e) => handleTextFieldFocus(idx, e)}
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
