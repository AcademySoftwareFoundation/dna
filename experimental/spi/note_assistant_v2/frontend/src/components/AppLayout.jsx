import React, { useEffect } from 'react';
import GoogleMeetPanel from './Panels/GoogleMeetPanel';
import ShotGridPanel from './Panels/ShotGridPanel';
import UploadPanel from './Panels/UploadPanel';
import ExportPanel from './Panels/ExportPanel';
import SettingsPanel from './Panels/SettingsPanel';
import ShotTable from './ShotTable';
import FloatingControls from './FloatingControls';
import { getLLMSummary } from '../services/llmService';

function AppLayout({
  // Configuration
  config,
  configLoaded,
  enabledLLMs,
  availablePromptTypes,
  
  // State
  rows,
  currentIndex,
  setCurrentIndex,
  pinnedIndex,
  setPinnedIndex,
  activeTab,
  setActiveTab,
  activeTopTab,
  setActiveTopTab,
  promptTypeSelection,
  setPromptTypeSelection,
  
  // Google Meet
  meetId,
  setMeetId,
  onSubmit,
  onExitBot,
  botIsActive,
  submitting,
  waitingForActive,
  
  // Transcription
  isReceivingTranscripts,
  joinedMeetId,
  onTranscriptToggle,
  shotSegments,
  status,
  
  // Settings
  includeSpeakerLabels,
  setIncludeSpeakerLabels,
  autoGenerateSummary,
  setAutoGenerateSummary,
  autoSummaryLLM,
  setAutoSummaryLLM,
  
  // Utility functions
  updateCell,
  setRows,

  // ShotGrid state
  selectedProjectId,
  setSelectedProjectId,
  sgProjects,
  sgPlaylists,
  selectedPlaylistId,
  setSelectedPlaylistId,
  sgLoading,
  sgError
}) {
  // Separate state for import sub-tabs vs shot table row tabs
  const [importSubTab, setImportSubTab] = React.useState(config.shotgrid_enabled ? 'shotgrid' : 'upload');
  const [shotTableRowTabs, setShotTableRowTabs] = React.useState({});
  const [isPanelExpanded, setIsPanelExpanded] = React.useState(true);
  const [originalFilename, setOriginalFilename] = React.useState(null);
  // Initialize tabs on component mount
  useEffect(() => {
    // Always set default top tab to import on mount
    setActiveTopTab('import');
    
    // Set default import sub-tab based on config
    if (config.shotgrid_enabled) {
      setImportSubTab('shotgrid');
    } else {
      setImportSubTab('upload');
    }
  }, [config.shotgrid_enabled, setActiveTopTab]);

  // Handle refresh all summaries functionality
  const handleRefreshAllSummaries = async (progressCallback, isCancelledCallback) => {
    const selectedLLM = enabledLLMs.find(llm => llm.key === autoSummaryLLM);
    if (!selectedLLM) return;

    const rowsWithTranscription = rows.filter(row => row.transcription && row.transcription.trim());
    const totalRows = rowsWithTranscription.length;
    
    if (totalRows === 0) return;

    for (let i = 0; i < rowsWithTranscription.length; i++) {
      // Check if cancelled
      if (isCancelledCallback()) {
        break;
      }

      // Update progress before processing
      const progress = (i / totalRows) * 100;
      progressCallback(progress);

      const row = rowsWithTranscription[i];
      const rowIndex = rows.indexOf(row);
      
      try {
        // Get the prompt type for this row and LLM (use default if not set)
        const promptType = promptTypeSelection[`${rowIndex}_${selectedLLM.key}`] || (availablePromptTypes[0] || '');
        
        // Show loading state
        updateCell(rowIndex, `${selectedLLM.key}_summary`, '...');
        
        // Generate summary
        const summary = await getLLMSummary(row.transcription, selectedLLM.provider, promptType, selectedLLM.model_name);
        updateCell(rowIndex, `${selectedLLM.key}_summary`, summary || '[No summary returned]');
      } catch (error) {
        console.error('Error generating summary for row', rowIndex, error);
        updateCell(rowIndex, `${selectedLLM.key}_summary`, '[Error generating summary]');
      }

      // Update progress after completion
      const completedProgress = ((i + 1) / totalRows) * 100;
      progressCallback(completedProgress);

      // Small delay to prevent overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Dailies Note Assistant (v2)</h1>
        <p className="app-subtitle">AI Assistant to join a Google meet based review session to capture the audio transcription and generate summaries for specific shots as guided by the user</p>
      </header>

      <main className="app-main">
        <section className="panel" style={{ height: isPanelExpanded ? '295px' : '60px', minWidth: '600px', transition: 'height 0.3s ease', padding: '8px' }}>
          {/* Header with expand/collapse button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isPanelExpanded ? '8px' : '0px' }}>
            {/* Tab Navigation - only show when expanded */}
            {isPanelExpanded && (
              <div style={{ display: 'flex', borderBottom: '1px solid #2c323c', flex: 1 }}>
                <button
                  type="button"
                  className={`tab-button ${activeTopTab === 'import' ? 'active' : ''}`}
                  onClick={() => setActiveTopTab('import')}
                >
                  Import
                </button>
                <button
                  type="button"
                  className={`tab-button ${activeTopTab === 'panel' ? 'active' : ''}`}
                  onClick={() => setActiveTopTab('panel')}
                >
                  Google Meet
                </button>
                <button
                  type="button"
                  className={`tab-button ${activeTopTab === 'export' ? 'active' : ''}`}
                  onClick={() => setActiveTopTab('export')}
                >
                  Export
                </button>
                <button
                  type="button"
                  className={`tab-button ${activeTopTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveTopTab('settings')}
                >
                  Settings
                </button>
              </div>
            )}
            
            {/* Collapsed state title and expand/collapse button */}
            {!isPanelExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>
                  {activeTopTab === 'import' ? 'Import' : 
                   activeTopTab === 'panel' ? 'Google Meet' : 
                   activeTopTab === 'export' ? 'Export' : 'Settings'}
                </h3>
              </div>
            )}
            
            <button
              type="button"
              onClick={() => setIsPanelExpanded(!isPanelExpanded)}
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
                marginLeft: isPanelExpanded ? '12px' : '0px'
              }}
              title={isPanelExpanded ? 'Collapse panel' : 'Expand panel'}
            >
              {/* Expand/Collapse icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {isPanelExpanded ? (
                  // Collapse icon (chevron up)
                  <path d="M6 15L12 9L18 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                ) : (
                  // Expand icon (chevron down)
                  <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
            </button>
          </div>

          {/* Tab Content - only show when expanded */}
          {isPanelExpanded && (
            <div style={{ height: '255px' }}>
            {activeTopTab === 'import' && (
              <div style={{ height: '100%' }}>
                {/* Import Sub-tabs */}
                <div style={{ display: 'flex', marginBottom: '12px' }}>
                  {config.shotgrid_enabled && (
                    <button
                      type="button"
                      className={`tab-button ${importSubTab === 'shotgrid' ? 'active' : ''}`}
                      onClick={() => setImportSubTab('shotgrid')}
                      style={{ fontSize: '14px', padding: '6px 12px' }}
                    >
                      ShotGrid
                    </button>
                  )}
                  <button
                    type="button"
                    className={`tab-button ${importSubTab === 'upload' ? 'active' : ''}`}
                    onClick={() => setImportSubTab('upload')}
                    style={{ fontSize: '14px', padding: '6px 12px' }}
                  >
                    Upload Playlist
                  </button>
                </div>
                
                {/* Import Content */}
                <div style={{ height: 'calc(100% - 40px)' }}>
                  {importSubTab === 'shotgrid' && config.shotgrid_enabled && (
                    <ShotGridPanel
                      config={config}
                      configLoaded={configLoaded}
                      setRows={setRows}
                      setCurrentIndex={setCurrentIndex}
                      setOriginalFilename={setOriginalFilename}
                      sgProjects={sgProjects}
                      selectedProjectId={selectedProjectId}
                      setSelectedProjectId={setSelectedProjectId}
                      sgPlaylists={sgPlaylists}
                      selectedPlaylistId={selectedPlaylistId}
                      setSelectedPlaylistId={setSelectedPlaylistId}
                      sgLoading={sgLoading}
                      sgError={sgError}
                    />
                  )}
                  
                  {importSubTab === 'upload' && (
                    <UploadPanel 
                      setRows={setRows} 
                      setCurrentIndex={setCurrentIndex} 
                      setOriginalFilename={setOriginalFilename}
                    />
                  )}
                </div>
              </div>
            )}

            {activeTopTab === 'panel' && (
              <GoogleMeetPanel
                meetId={meetId}
                setMeetId={setMeetId}
                onSubmit={onSubmit}
                onExitBot={onExitBot}
                botIsActive={botIsActive}
                submitting={submitting}
                waitingForActive={waitingForActive}
                rows={rows}
                selectedProjectId={selectedProjectId}
                sgProjects={sgProjects}
                originalFilename={originalFilename}
              />
            )}

            {activeTopTab === 'export' && (
              <ExportPanel 
                rows={rows} 
                shotSegments={shotSegments}
                originalFilename={originalFilename}
              />
            )}

            {activeTopTab === 'settings' && (
              <SettingsPanel
                includeSpeakerLabels={includeSpeakerLabels}
                setIncludeSpeakerLabels={setIncludeSpeakerLabels}
                autoGenerateSummary={autoGenerateSummary}
                setAutoGenerateSummary={setAutoGenerateSummary}
                autoSummaryLLM={autoSummaryLLM}
                setAutoSummaryLLM={setAutoSummaryLLM}
                enabledLLMs={enabledLLMs}
                onRefreshAllSummaries={handleRefreshAllSummaries}
              />
            )}
          </div>
          )}
        </section>

        <section className="panel full-span">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 className="panel-title" style={{ margin: 0 }}>Shot Notes</h2>
          </div>
          
          <ShotTable
            rows={rows}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex}
            pinnedIndex={pinnedIndex}
            setPinnedIndex={setPinnedIndex}
            activeTab={shotTableRowTabs}
            setActiveTab={setShotTableRowTabs}
            enabledLLMs={enabledLLMs}
            availablePromptTypes={availablePromptTypes}
            promptTypeSelection={promptTypeSelection}
            setPromptTypeSelection={setPromptTypeSelection}
            updateCell={updateCell}
            isReceivingTranscripts={isReceivingTranscripts}
            setIsReceivingTranscripts={onTranscriptToggle}
            onTranscriptToggle={onTranscriptToggle}
          />
        </section>
      </main>

      {/* Floating Controls (includes Add Shot and Bot Status) */}
      <FloatingControls
        botIsActive={botIsActive}
        status={status}
        isReceivingTranscripts={isReceivingTranscripts}
        joinedMeetId={joinedMeetId}
        onTranscriptToggle={onTranscriptToggle}
        config={config}
        rows={rows}
        setRows={setRows}
        setCurrentIndex={setCurrentIndex}
        selectedProjectId={selectedProjectId}
      />

      <footer className="app-footer">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span>© {new Date().getFullYear()} Dailies Note Assistant</span>
        </div>
      </footer>
    </div>
  );
}

export default AppLayout;