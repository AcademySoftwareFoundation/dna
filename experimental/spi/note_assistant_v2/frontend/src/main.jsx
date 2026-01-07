import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./ui.css";

// Components
import AppLayout from './components/AppLayout';

// Hooks
import { useAppConfig } from './hooks/useAppConfig';
import { useShotGrid } from './hooks/useShotGrid';
import { useTranscription } from './hooks/useTranscription';
import { useGoogleMeet } from './hooks/useGoogleMeet';

// Services
import { getLLMSummary } from './services/llmService';

function App() {
  // --- Configuration State ---
  const { config, configLoaded, enabledLLMs, availablePromptTypes } = useAppConfig();
  const [promptTypeSelection, setPromptTypeSelection] = useState({}); // Track prompt type per row per LLM

  // Google Meet functionality
  const {
    meetId,
    setMeetId,
    status,
    setStatus,
    submitting,
    botIsActive,
    setBotIsActive,
    waitingForActive,
    setWaitingForActive,
    handleSubmit: handleMeetSubmit,
    handleExitBot: handleMeetExit
  } = useGoogleMeet();

  const [rows, setRows] = useState([]); // [{shot, transcription, summary}]
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [activeTab, setActiveTab] = useState({}); // Track active tab per row
  const prevIndexRef = useRef(currentIndex);

  // Add state for top-level tab management
  const [activeTopTab, setActiveTopTab] = useState('panel');

  // Add state for settings
  const [includeSpeakerLabels, setIncludeSpeakerLabels] = useState(true);
  const [autoGenerateSummary, setAutoGenerateSummary] = useState(false);
  const [autoSummaryLLM, setAutoSummaryLLM] = useState('none');

  // Use transcription hook
  const {
    isReceivingTranscripts,
    joinedMeetId,
    setJoinedMeetId,
    startTranscriptStream,
    stopTranscriptStream,
    handleTranscriptStreamToggle,
    shotSegments
  } = useTranscription(rows, setRows, currentIndex, pinnedIndex, includeSpeakerLabels);

  // Enhanced transcript stream toggle
  const handleTranscriptToggle = () => {
    const action = handleTranscriptStreamToggle();
    if (action === 'start') {
      startTranscriptStream(joinedMeetId, setBotIsActive, setStatus, botIsActive, setWaitingForActive);
    }
  };

  // Wrapper functions that integrate with transcription hook
  const handleSubmit = (e) => {
    handleMeetSubmit(e, stopTranscriptStream, setJoinedMeetId, startTranscriptStream);
  };

  const handleExitBot = () => {
    handleMeetExit(joinedMeetId, stopTranscriptStream, setJoinedMeetId);
  };

  // Helper functions for prompt type selection
  const setPromptTypeForRowAndLLM = (rowIndex, llmKey, promptType) => {
    setPromptTypeSelection(prev => ({
      ...prev,
      [`${rowIndex}_${llmKey}`]: promptType
    }));
  };

  const getPromptTypeForRowAndLLM = (rowIndex, llmKey) => {
    return promptTypeSelection[`${rowIndex}_${llmKey}`] || (availablePromptTypes[0] || '');
  };

  // ShotGrid integration
  const {
    selectedProjectId,
    setSelectedProjectId,
    sgProjects,
    sgPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    sgLoading,
    sgError
  } = useShotGrid(config, configLoaded);

  const updateCell = (index, key, value) => {
    setRows(r => r.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };

  // Auto-refresh summary if empty when switching rows
  useEffect(() => {
    if (pinnedIndex === null && prevIndexRef.current !== currentIndex) {
      const prevIdx = prevIndexRef.current;
      if (
        prevIdx != null &&
        prevIdx >= 0 &&
        prevIdx < rows.length &&
        autoGenerateSummary &&
        autoSummaryLLM !== 'none'
      ) {
        const inputText = rows[prevIdx].transcription || rows[prevIdx].notes || '';
        if (inputText.trim()) {
          const summaryField = `${autoSummaryLLM}_summary`;
          
          // Only generate if the selected LLM summary is empty
          if (!rows[prevIdx][summaryField] || !rows[prevIdx][summaryField].trim()) {
            const promptType = getPromptTypeForRowAndLLM(prevIdx, autoSummaryLLM);
            const selectedLLM = enabledLLMs.find(llm => llm.key === autoSummaryLLM);
            
            if (selectedLLM) {
              updateCell(prevIdx, summaryField, '...'); // Show loading
              getLLMSummary(inputText, selectedLLM.provider, promptType).then(summary => {
                updateCell(prevIdx, summaryField, summary || '[No summary returned]');
              });
            }
          }
        }
      }
    }
    prevIndexRef.current = currentIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  return (
    <AppLayout
      // Configuration
      config={config}
      configLoaded={configLoaded}
      enabledLLMs={enabledLLMs}
      availablePromptTypes={availablePromptTypes}
      
      // State
      rows={rows}
      currentIndex={currentIndex}
      setCurrentIndex={setCurrentIndex}
      pinnedIndex={pinnedIndex}
      setPinnedIndex={setPinnedIndex}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      activeTopTab={activeTopTab}
      setActiveTopTab={setActiveTopTab}
      promptTypeSelection={promptTypeSelection}
      setPromptTypeSelection={setPromptTypeSelection}
      
      // Google Meet
      meetId={meetId}
      setMeetId={setMeetId}
      onSubmit={handleSubmit}
      onExitBot={handleExitBot}
      botIsActive={botIsActive}
      submitting={submitting}
      waitingForActive={waitingForActive}
      
      // Transcription
      isReceivingTranscripts={isReceivingTranscripts}
      joinedMeetId={joinedMeetId}
      onTranscriptToggle={handleTranscriptToggle}
      shotSegments={shotSegments}
      status={status}
      
      // Settings
      includeSpeakerLabels={includeSpeakerLabels}
      setIncludeSpeakerLabels={setIncludeSpeakerLabels}
      autoGenerateSummary={autoGenerateSummary}
      setAutoGenerateSummary={setAutoGenerateSummary}
      autoSummaryLLM={autoSummaryLLM}
      setAutoSummaryLLM={setAutoSummaryLLM}
      
      // Utility functions
      updateCell={updateCell}
      setRows={setRows}

      // ShotGrid state
      selectedProjectId={selectedProjectId}
      setSelectedProjectId={setSelectedProjectId}
      sgProjects={sgProjects}
      sgPlaylists={sgPlaylists}
      selectedPlaylistId={selectedPlaylistId}
      setSelectedPlaylistId={setSelectedPlaylistId}
      sgLoading={sgLoading}
      sgError={sgError}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
