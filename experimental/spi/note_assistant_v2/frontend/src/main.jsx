import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./ui.css";
import { startWebSocketTranscription, stopWebSocketTranscription, getApiUrl, getHeaders, processSegments } from '../lib/transcription-service'
import { startBot, stopBot, parseMeetingUrl } from '../lib/bot-service';
import { MOCK_MODE } from '../lib/config';

// Global dictionary to track all segments by timestamp
const allSegments = {}; // { [timestamp]: combinedText }
// Global dictionary to track segments per shot, with speaker and combinedText
const shotSegments = {}; // { [shotKey]: { [timestamp]: { speaker, combinedText } } }

function StatusBadge({ type = "info", children }) {
  if (!children) return null;
  return <span className={`badge badge-${type}`}>{children}</span>;
}

function getDefaultMeetUrl() {
  return MOCK_MODE ? 'https://meet.google.com/mock-meet-123' : '';
}

function App() {
  // --- Configuration State ---
  const [config, setConfig] = useState({ shotgrid_enabled: false });
  const [configLoaded, setConfigLoaded] = useState(false);

  // --- ShotGrid Project/Playlist State ---
  const [sgProjects, setSgProjects] = useState([]); // List of active projects
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [sgPlaylists, setSgPlaylists] = useState([]); // Last 20 playlists for selected project
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [sgLoading, setSgLoading] = useState(false);
  const [sgError, setSgError] = useState("");

  const [meetId, setMeetId] = useState(getDefaultMeetUrl());
  const [status, setStatus] = useState({ msg: "", type: "info" });
  const [uploadStatus, setUploadStatus] = useState({ msg: "", type: "info" });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState([]); // [{shot, transcription, summary}]
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isReceivingTranscripts, setIsReceivingTranscripts] = useState(false);
  const isReceivingTranscriptsRef = useRef(isReceivingTranscripts);
  const [joinedMeetId, setJoinedMeetId] = useState("");
  const [botIsActive, setBotIsActive] = useState(false);
  const [waitingForActive, setWaitingForActive] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState({ msg: "", type: "info" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [activeTab, setActiveTab] = useState({}); // Track active tab per row
  const [newShotValue, setNewShotValue] = useState("");
  const [addingShotLoading, setAddingShotLoading] = useState(false);
  const [addShotStatus, setAddShotStatus] = useState({ msg: "", type: "info" });
  const currentIndexRef = useRef(0); // Use ref to avoid closure issues
  const prevIndexRef = useRef(currentIndex);

  // Add a ref to track if websocket is active
  const hasActiveWebSocketRef = useRef(false);

  // Add state for top-level tab management
  const [activeTopTab, setActiveTopTab] = useState('panel');

  // Update the ref whenever currentIndex changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update the ref whenever isReceivingTranscripts changes
  useEffect(() => {
    isReceivingTranscriptsRef.current = isReceivingTranscripts;
  }, [isReceivingTranscripts]);

  // Start transcript stream (only called internally)
  const startTranscriptStream = async (meetingId) => {
    //console.log('startTranscriptStream called, isReceivingTranscripts:', isReceivingTranscripts);
    setJoinedMeetId(meetingId);
    hasActiveWebSocketRef.current = true;
    try {
      // Parse meeting ID to get the format needed for WebSocket
      const { platform, nativeMeetingId } = parseMeetingUrl(meetingId);
      const meetingIdForWS = `${platform}/${nativeMeetingId}`;
      // Start WebSocket transcription for real-time updates and status
      await startWebSocketTranscription(
        meetingIdForWS,
        (segments) => {
          //console.log('🟢 WebSocket Segments:', segments);
          updateTranscriptionFromSegments(segments);
        },
        // onTranscriptFinalized (optional, not used here)
        () => {},
        // onMeetingStatus
        (statusValue) => {
          const isActiveStatus = statusValue === 'active' || statusValue === 'test-mode-running';
          setStatus({ msg: `Bot Status: ${statusValue}`, type: isActiveStatus ? 'success' : 'info' });
          setBotIsActive(isActiveStatus);
          if (waitingForActive && isActiveStatus) {
            setWaitingForActive(false);
          }
          // Stop stream when status is 'completed' or 'error'
          if (statusValue === 'completed' || statusValue === 'error') {
            setBotIsActive(false);
            setStatus({ msg: `Bot Status: ${statusValue}`, type: 'info' });
            stopTranscriptStream();
          }
        },
        // onError
        (error) => {
          setStatus({ msg: `WebSocket error: ${error}`, type: 'error' });
        },
        // onConnected
        () => {
          console.log('✅ WebSocket Connected');
        },
        // onDisconnected
        () => {
          console.log('❌ WebSocket Disconnected');
        }
      );
    } catch (err) {
      console.error('Error starting WebSocket transcription:', err);
    }
  };

  // Stop transcript stream (only called internally)
  const stopTranscriptStream = async () => {
    setIsReceivingTranscripts(false);
    hasActiveWebSocketRef.current = false;
    // Clear global segments dict when stopping WebSocket
    for (const key in allSegments) {
      delete allSegments[key];
    }
    // Stop WebSocket connection if active
    if (joinedMeetId) {
      try {
        const { platform, nativeMeetingId } = parseMeetingUrl(joinedMeetId);
        const meetingIdForWS = `${platform}/${nativeMeetingId}`;
        await stopWebSocketTranscription(meetingIdForWS);
        console.log('WebSocket transcription stopped');
      } catch (err) {
        console.error('Error stopping WebSocket transcription:', err);
      }
    }
  };

  // Update the ref whenever isReceivingTranscripts changes
  useEffect(() => {
    isReceivingTranscriptsRef.current = isReceivingTranscripts;
  }, [isReceivingTranscripts]);

  // Manual transcript stream control
  const pauseTranscriptStream = () => {
    //console.log('pauseTranscriptStream called');
    setIsReceivingTranscripts(false);
  };

  const resumeTranscriptStream = () => {
    //console.log('resumeTranscriptStream called');
    setIsReceivingTranscripts(true);
  };

  const handleTranscriptStreamToggle = () => {
    //console.log('handleTranscriptStreamToggle called, isReceivingTranscripts:', isReceivingTranscriptsRef.current, ' hasActiveWebSocketRef:', hasActiveWebSocketRef.current);
    if (!isReceivingTranscripts) {
      // Only resume stream if already started, otherwise start
      if (joinedMeetId && hasActiveWebSocketRef.current) {
        resumeTranscriptStream();
      } else if (joinedMeetId && !hasActiveWebSocketRef.current) {
        startTranscriptStream(joinedMeetId);
      }
    } else {
      pauseTranscriptStream();
    }
  };

  // Function to get full Google Meet URL from input (URL or Meet ID)
  const getFullMeetUrl = (input) => {
    const urlPattern = /^https?:\/\/meet\.google\.com\/([a-zA-Z0-9\-]+)$/;
    const idPattern = /^[a-zA-Z0-9\-]{10,}$/;
    if (!input) return '';
    const urlMatch = input.match(urlPattern);
    if (urlMatch) return input;
    if (idPattern.test(input.trim())) {
      // Convert meet ID to full URL
      return `https://meet.google.com/${input.trim()}`;
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rawInput = meetId.trim();
    const fullUrl = getFullMeetUrl(rawInput);
    if (!fullUrl) {
      setStatus({ msg: "Please enter a valid Google Meet URL or Meet ID (e.g. https://meet.google.com/abc-defg-hij or abc-defg-hij)", type: "error" });
      return;
    }
    setSubmitting(true);
    setWaitingForActive(true);
    setStatus({ msg: "Submitting Google Meet URL...", type: "info" });
    stopTranscriptStream();
    try {
      const result = await startBot(fullUrl);
      if (!result.success) {
        setStatus({ msg: result.statusMsg, type: "error" });
        setSubmitting(false);
        setWaitingForActive(false);
        return;
      }
      setStatus({ msg: result.statusMsg, type: "success" });
      setJoinedMeetId(fullUrl);
      startTranscriptStream(fullUrl);
    } catch (err) {
      setStatus({ msg: "Error starting transcription", type: "error" });
      setWaitingForActive(false);
    } finally {
      setSubmitting(false);
    }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setUploadStatus({ msg: `Uploading ${file.name}...`, type: "info" });
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("http://localhost:8000/upload-playlist", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === "success") {
        const mapped = (data.items || []).map(v => ({ shot: v, transcription: "", summary: "" }));
        setRows(mapped);
        setCurrentIndex(0);
        setUploadStatus({ msg: "Playlist CSV uploaded successfully", type: "success" });
      } else {
        setUploadStatus({ msg: "Upload failed", type: "error" });
      }
    } catch (err) {
      setUploadStatus({ msg: "Network error during upload", type: "error" });
    } finally {
      setUploading(false);
    }
  };

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".csv")) {
      uploadFile(file);
    } else if (file) {
      setUploadStatus({ msg: "Please drop a .csv file", type: "warning" });
    }
  };

  const openFileDialog = useCallback(() => {
    document.getElementById("playlist-file-input")?.click();
  }, []);

  const updateCell = (index, key, value) => {
    setRows(r => r.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };

  const setTabForRow = (rowIndex, tabName) => {
    setActiveTab(prev => ({ ...prev, [rowIndex]: tabName }));
  };

  const getActiveTabForRow = (rowIndex) => {
    return activeTab[rowIndex] || 'notes';
  };

  // Function to get LLM summary from backend
  const getLLMSummary = async (text) => {
    try {
      const res = await fetch('http://localhost:8000/llm-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        return data.summary;
      } else {
        return '';
      }
    } catch (err) {
      console.error('Error fetching LLM summary:', err);
      return '';
    }
  };

  // Exit bot handler
  const handleExitBot = async () => {
    setSubmitting(true);
    setStatus({ msg: "Exiting bot...", type: "info" });
    try {
      const result = await stopBot(joinedMeetId);
      if (!result.success) {
        setStatus({ msg: result.statusMsg, type: "error" });
      } else {
        setStatus({ msg: result.statusMsg, type: "success" });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
        stopTranscriptStream();
      }
    } catch (err) {
      setStatus({ msg: "Network error while exiting bot", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Auto-refresh summary if empty when switching rows
  useEffect(() => {
    if (pinnedIndex === null && prevIndexRef.current !== currentIndex) {
      const prevIdx = prevIndexRef.current;
      if (
        prevIdx != null &&
        prevIdx >= 0 &&
        prevIdx < rows.length &&
        (!rows[prevIdx].summary || !rows[prevIdx].summary.trim())
      ) {
        const inputText = rows[prevIdx].transcription || rows[prevIdx].notes || '';
        if (inputText.trim()) {
          // Show loading
          updateCell(prevIdx, 'summary', '...');
          getLLMSummary(inputText).then(summary => {
            updateCell(prevIdx, 'summary', summary || '[No summary returned]');
          });
        }
      }
    }
    prevIndexRef.current = currentIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // --- CSV Download Helper ---
  const downloadCSV = () => {
    if (!rows.length) return;
    // CSV header
    const header = ['shot/jts', 'notes', 'transcription', 'summary'];
    // Escape CSV values
    const escape = (val = '') => '"' + String(val).replace(/"/g, '""') + '"';
    // Build CSV rows
    const csvRows = [header.join(',')];
    rows.forEach(row => {
      csvRows.push([
        escape(row.shot),
        escape(row.notes),
        escape(row.transcription),
        escape(row.summary)
      ].join(','));
    });
    const csvContent = csvRows.join('\n');
    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shot_notes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Transcript Download Helper ---
  const downloadTranscript = () => {
    if (!Object.keys(shotSegments).length) return;
    
    let transcriptContent = 'Audio Transcript\n================\n\n';
    
    // Iterate through each shot in shotSegments
    Object.keys(shotSegments).forEach(shotKey => {
      transcriptContent += `${shotKey}\n`;
      transcriptContent += '-------------------\n';
      
      const segments = shotSegments[shotKey];
      // Sort segments by timestamp
      const sortedTimestamps = Object.keys(segments).sort();
      
      sortedTimestamps.forEach(timestamp => {
        const segment = segments[timestamp];
        const speaker = segment.speaker || 'Unknown';
        const text = segment.combinedText || '';
        transcriptContent += `[${timestamp}] ${speaker}:\n${text}\n\n`;
      });
      
      transcriptContent += '\n';
    });
    
    // Create blob and trigger download
    const blob = new Blob([transcriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audio_transcript.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Function to add a new shot/version
  const addNewShot = async () => {
    if (!newShotValue.trim() || addingShotLoading) return;
    
    let finalShotValue = newShotValue.trim();
    let shouldAddShot = true; // Flag to determine if shot should be added
    
    // console.log('🔍 addNewShot called with:', newShotValue.trim());
    // console.log('🔍 ShotGrid enabled:', config.shotgrid_enabled);
    // console.log('🔍 Selected project ID:', selectedProjectId);
    
    // If ShotGrid is enabled, validate the input first
    if (config.shotgrid_enabled) {
      setAddingShotLoading(true);
      setAddShotStatus({ msg: "Validating with ShotGrid...", type: "info" });
      
      try {
        const requestBody = { 
          input_value: newShotValue.trim(),
          project_id: selectedProjectId ? parseInt(selectedProjectId) : null
        };
        //console.log('🔍 Sending validation request:', requestBody);
        
        const response = await fetch("http://localhost:8000/shotgrid/validate-shot-version", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        
        //console.log('🔍 Response status:', response.status);
        const data = await response.json();
        //console.log('🔍 Response data:', data);
        
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
        console.error('🔍 Validation error:', error);
        // Network error - show error and don't add
        setAddShotStatus({ msg: `Validation failed: ${error.message}`, type: "error" });
        setTimeout(() => setAddShotStatus({ msg: "", type: "info" }), 2000);
        shouldAddShot = false;
      } finally {
        setAddingShotLoading(false);
      }
    }
    
    //console.log('🔍 Should add shot:', shouldAddShot);
    
    // Only add the shot if validation passed or ShotGrid is disabled
    if (shouldAddShot) {
      const newRow = {
        shot: finalShotValue,
        transcription: "",
        summary: "",
        notes: ""
      };
      
     // console.log('🔍 Adding new row:', newRow);
      setRows(prevRows => [...prevRows, newRow]);
      setNewShotValue("");
      
      // Set focus to the new row
      setTimeout(() => {
        setCurrentIndex(rows.length);
      }, 0);
    } else {
      console.log('🔍 Shot not added due to validation failure');
    }
  };

  // Handle Enter key press in add shot input
  const handleAddShotKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewShot();
    }
  };

  // Helper to process segments and update the UI transcription field
  function updateTranscriptionFromSegments(segments) {
    // Track all segments globally as a dictionary
    //console.log('segments:', segments);

     segments.forEach(seg => {
      let start_time = seg.absolute_start_time || seg.timestamp;
      if (start_time) {
        if (!(start_time in allSegments)) {
          seg.new_segment = true; // first time we are seeing this segment
        }
        allSegments[start_time] = seg.combinedText || seg.text || '';
      }
    });
    //console.log('allSegments:', allSegments);
    
    if (!isReceivingTranscriptsRef.current) return;

    // Track segments for this shot BEFORE processSegments
    let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
    if (activeIndex == null || activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;
    const shotKey = rows[activeIndex]?.shot;
    //console.log('shotKey:', shotKey);

    if (shotKey) {
      if (!shotSegments[shotKey]) shotSegments[shotKey] = {};
      // Only add new segments for this shot
      segments.forEach(seg => {
        // Find the segment in the original segments array to get speaker info
        let start_time = seg.absolute_start_time || seg.timestamp;
        if (!seg.new_segment) {
          //console.log('changed segment found: ', seg)
          // if this segment does not belong to the current shot, ignore it
          if (!(start_time in shotSegments[shotKey])) {
            //console.log("skipping segment, doesn't belong to this shot")
            return;
          }
        }
        if (seg) {
          // New or updated segment received
          shotSegments[shotKey][start_time] = seg;
        }
      });
      //console.log('segments for shot ', shotKey, ' is ', shotSegments[shotKey]);
    }

    const speakerGroups = processSegments(Object.values(shotSegments[shotKey]));
    //console.log('speakerGroups', speakerGroups)
    const combinedSpeakerTexts = speakerGroups.map(g => {
      const ts = g.timestamp ? `[${g.timestamp}]` : '';
      return `${g.speaker}${ts ? ' ' + ts : ''}:\n${g.combinedText}`;
    });
    //console.log('combinedSpeakerTexts', combinedSpeakerTexts)
    setRows(prevRows => {
      let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
      if (activeIndex == null || activeIndex < 0 || activeIndex >= prevRows.length) activeIndex = 0;
      const newTranscript = combinedSpeakerTexts.join('\n\n');
      if (prevRows[activeIndex]?.transcription === newTranscript) return prevRows;
      // After updating, scroll the textarea to the bottom
      setTimeout(() => {
        const textarea = document.querySelector(
          `.data-table tbody tr.current-row textarea.table-textarea[name='transcription']`
        );
        if (textarea) {
          textarea.scrollTop = textarea.scrollHeight;
        }
      }, 0);
      return prevRows.map((r, idx) => idx === activeIndex ? { ...r, transcription: newTranscript } : r);
    });
  }

  // --- ShotGrid Project/Playlist Fetch Logic ---
  // Fetch application configuration on mount
  useEffect(() => {
    fetch("http://localhost:8000/config")
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setConfigLoaded(true);
      })
      .catch(() => {
        console.error("Failed to fetch app config, assuming ShotGrid disabled");
        setConfig({ shotgrid_enabled: false });
        setConfigLoaded(true);
      });
  }, []);

  // Fetch active ShotGrid projects on mount (only if ShotGrid is enabled)
  useEffect(() => {
    if (!configLoaded || !config.shotgrid_enabled) return;
    
    setSgLoading(true);
    fetch("http://localhost:8000/shotgrid/active-projects")
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setSgProjects(data.projects || []);
        } else {
          setSgError(data.message || "Failed to fetch projects");
        }
      })
      .catch(() => setSgError("Network error fetching projects"))
      .finally(() => setSgLoading(false));
  }, [configLoaded, config.shotgrid_enabled]);

  // Fetch playlists when a project is selected
  useEffect(() => {
    if (!config.shotgrid_enabled || !selectedProjectId) {
      setSgPlaylists([]);
      setSelectedPlaylistId("");
      return;
    }
    setSgLoading(true);
    fetch(`http://localhost:8000/shotgrid/latest-playlists/${selectedProjectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setSgPlaylists(data.playlists || []);
        } else {
          setSgError(data.message || "Failed to fetch playlists");
        }
      })
      .catch(() => setSgError("Network error fetching playlists"))
      .finally(() => setSgLoading(false));
  }, [config.shotgrid_enabled, selectedProjectId]);

  // --- Populate shot list when a playlist is selected ---
  useEffect(() => {
    if (!config.shotgrid_enabled || !selectedPlaylistId) return;
    // Fetch playlist shots from backend as soon as a playlist is selected
    setSgLoading(true);
    fetch(`http://localhost:8000/shotgrid/playlist-items/${selectedPlaylistId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && Array.isArray(data.items)) {
          //console.log('Fetched playlist items:', data.items);
          setRows(data.items.map(v => ({ shot: v, transcription: "", summary: "" })));
          setCurrentIndex(0);
        }
      })
      .finally(() => setSgLoading(false));
  }, [config.shotgrid_enabled, selectedPlaylistId]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Dailies Note Assistant (v2)</h1>
        <p className="app-subtitle">AI Assistant to join a Google meet based review session to capture the audio transcription and generate summaries for specific shots as guided by the user</p>
      </header>

      <main className="app-main">
        <section className="panel" style={{ height: '280px', minWidth: '500px' }}>
          {/* Tab Navigation */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2c323c', marginBottom: '16px' }}>
            <button
              type="button"
              className={`tab-button ${activeTopTab === 'panel' ? 'active' : ''}`}
              onClick={() => setActiveTopTab('panel')}
            >
              Google Meet
            </button>
            {config.shotgrid_enabled && (
              <button
                type="button"
                className={`tab-button ${activeTopTab === 'shotgrid' ? 'active' : ''}`}
                onClick={() => setActiveTopTab('shotgrid')}
              >
                ShotGrid
              </button>
            )}
            <button
              type="button"
              className={`tab-button ${activeTopTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTopTab('upload')}
            >
              Upload Playlist
            </button>
            <button
              type="button"
              className={`tab-button ${activeTopTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTopTab('export')}
            >
              Export Notes
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ height: '240px' }}>
            {activeTopTab === 'panel' && (
              <div>
                <p className="help-text">Enter Google Meet URL or ID (e.g abc-defg-hij)</p>
                <form onSubmit={handleSubmit} className="form-grid" aria-label="Enter Google Meet URL or ID">
                  <div className="field-row">
                    <input
                      id="meet-id"
                      type="text"
                      className="text-input"
                      value={meetId}
                      onChange={(e) => setMeetId(e.target.value)}
                      placeholder="e.g. https://meet.google.com/abc-defg-hij or abc-defg-hij"
                      autoComplete="off"
                      required
                      aria-required="true"
                      disabled={botIsActive}
                    />
                    {botIsActive ? (
                      <button type="button" className="btn danger" onClick={handleExitBot} disabled={submitting}>
                        {submitting ? "Exiting..." : "Exit"}
                      </button>
                    ) : (
                      <button type="submit" className="btn primary" disabled={!meetId.trim() || submitting || waitingForActive}>
                        {submitting ? "Joining..." : "Join"}
                      </button>
                    )}
                  </div>
                </form>
              </div>
            )}

            {activeTopTab === 'shotgrid' && config.shotgrid_enabled && (
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
            )}

            {activeTopTab === 'upload' && (
              <div>
                <p className="help-text">Upload a playlist .csv file. First column should contain the shot/version info.</p>
                <div
                  className={`drop-zone ${dragActive ? "active" : ""}`}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  role="button"
                  tabIndex={0}
                  onClick={openFileDialog}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openFileDialog(); }}
                  aria-label="Upload playlist CSV via drag and drop or click"
                >
                  <div className="dz-inner">
                    <strong>Drag & Drop</strong> CSV here<br />
                    <span className="muted">or click to browse</span>
                  </div>
                  <input
                    id="playlist-file-input"
                    type="file"
                    accept=".csv"
                    onChange={onFileInputChange}
                    style={{ display: "none" }}
                  />
                </div>
                <div className="actions-row">
                  {uploading && <span className="spinner" aria-hidden="true" />}
                  <StatusBadge type={uploadStatus.type}>{uploadStatus.msg}</StatusBadge>
                </div>
              </div>
            )}

            {activeTopTab === 'export' && (
              <div>
                <p className="help-text">Download your notes and transcripts, or email them to a recipient.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <button
                    className="btn primary"
                    style={{ alignSelf: 'flex-start', minWidth: 160, height: 36, padding: '0 16px', fontSize: '14px' }}
                    onClick={downloadCSV}
                    disabled={rows.length === 0}
                  >
                    Download Notes
                  </button>
                  <button
                    className="btn primary"
                    style={{ alignSelf: 'flex-start', minWidth: 160, height: 36, padding: '0 16px', fontSize: '14px' }}
                    onClick={downloadTranscript}
                    disabled={Object.keys(shotSegments).length === 0}
                  >
                    Download Transcript
                  </button>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="email"
                      className="text-input"
                      style={{ flex: 1, height: 36, padding: '0 12px', boxSizing: 'border-box', fontSize: '14px' }}
                      placeholder="Enter email address"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={sendingEmail}
                      aria-label="Recipient email address"
                      required
                    />
                    <button
                      className="btn primary"
                      style={{ minWidth: 100, height: 36, padding: '0 16px', fontSize: '14px' }}
                      disabled={!email || sendingEmail || rows.length === 0}
                      onClick={async () => {
                        setSendingEmail(true);
                        setEmailStatus({ msg: "Sending notes...", type: "info" });
                        try {
                          const res = await fetch("http://localhost:8000/email-notes", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email, notes: rows }),
                          });
                          const data = await res.json();
                          if (res.ok && data.status === "success") {
                            setEmailStatus({ msg: data.message, type: "success" });
                          } else {
                            setEmailStatus({ msg: data.message || "Failed to send email", type: "error" });
                          }
                        } catch (err) {
                          setEmailStatus({ msg: "Network error while sending email", type: "error" });
                        } finally {
                          setSendingEmail(false);
                        }
                      }}
                    >
                      {sendingEmail ? "Sending..." : "Email"}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <StatusBadge type={emailStatus.type}>{emailStatus.msg}</StatusBadge>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="panel full-span">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 className="panel-title" style={{ margin: 0 }}>Shot Notes</h2>
          </div>
          {rows.length === 0 && <p className="help-text">Upload a playlist CSV to populate shot notes, or add shots manually using the button above.</p>}
          {rows.length > 0 && (
            <div className="table-wrapper" style={{ width: '100%' }}>
              <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {/* Remove Current column header */}
                    <th className="col-shot" style={{ width: '10%' }}>Shot/Version</th>
                    <th className="col-notes" style={{ width: '45%' }}>Notes & Summary</th>
                    <th className="col-transcription" style={{ width: '45%' }}>Transcription</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isPinned = pinnedIndex === idx;
                    const isCurrent = pinnedIndex !== null ? isPinned : idx === currentIndex;
                    return (
                      <tr key={idx} className={isCurrent ? 'current-row' : ''}>
                        {/* Remove Current radio button cell */}
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
                            style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isPinned ? '#e0f2fe' : undefined, borderColor: isPinned ? '#3d82f6' : undefined }}
                            aria-label="Pin"
                            onClick={() => setPinnedIndex(isPinned ? null : idx)}
                          >
                            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                              {/* Larger half-circle head */}
                              <path d="M3 8 A6 6 0 0 1 15 8 Z" fill="#3d82f6" stroke="#1e40af" strokeWidth="0.8"/>
                              {/* Wider tapered pin */}
                              <path d="M7 8 L11 8 L9 15 Z" fill="#3d82f6" stroke="#1e40af" strokeWidth="0.8"/>
                            </svg>
                          </button>
                        </td>
                        <td style={{ width: '45%' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                            {/* Tab Navigation */}
                            <div style={{ display: 'flex', borderBottom: '1px solid #2c323c', marginBottom: '8px' }}>
                              <button
                                type="button"
                                className={`tab-button ${getActiveTabForRow(idx) === 'notes' ? 'active' : ''}`}
                                onClick={() => setTabForRow(idx, 'notes')}
                              >
                                Notes
                              </button>
                              <button
                                type="button"
                                className={`tab-button ${getActiveTabForRow(idx) === 'summary' ? 'active' : ''}`}
                                style={{ position: 'relative' }}
                                onClick={() => setTabForRow(idx, 'summary')}
                              >
                                Gemini
                                {getActiveTabForRow(idx) === 'summary' && (
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ 
                                      position: 'absolute', 
                                      top: '-2px', 
                                      right: '-8px', 
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
                                      borderRadius: '50%'
                                    }}
                                    aria-label="Refresh Summary"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const inputText = row.transcription || row.notes || '';
                                      if (!inputText.trim()) return;
                                      updateCell(idx, 'summary', '...'); // Show loading
                                      const summary = await getLLMSummary(inputText);
                                      updateCell(idx, 'summary', summary || '[No summary returned]');
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                      <path d="M9 3a6 6 0 1 1-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      <path d="M3 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                )}
                              </button>
                            </div>
                            {/* Tab Content */}
                            <div style={{ flex: 1 }}>
                              {getActiveTabForRow(idx) === 'notes' && (
                                <textarea
                                  value={row.notes || ''}
                                  onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                                  onChange={(e) => updateCell(idx, 'notes', e.target.value)}
                                  className="table-textarea"
                                  placeholder="Enter notes..."
                                  rows={3}
                                  style={{ height: '100%', minHeight: '72px' }}
                                />
                              )}
                              {getActiveTabForRow(idx) === 'summary' && (
                                <textarea
                                  value={row.summary || ''}
                                  onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                                  onChange={(e) => updateCell(idx, 'summary', e.target.value)}
                                  className="table-textarea"
                                  placeholder="Summary goes here..."
                                  rows={3}
                                  style={{ height: '100%', minHeight: '72px' }}
                                />
                              )}
                            </div>
                          </div>
                        </td>
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
          )}
        </section>
      </main>

      {/* Floating Add Shot Controls */}
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

      {/* Floating Bot Status and Transcript Control */}
      {(botIsActive || status.msg) && (
        <div className="floating-controls">
          <div className="bot-status-display">
            <StatusBadge type={status.type}>{status.msg}</StatusBadge>
          </div>
          {botIsActive && (
            <div className="transcript-controls">
              <button 
                type="button" 
                className={`btn ${isReceivingTranscripts ? (botIsActive ? 'danger' : 'primary') : 'primary'}`}
                onClick={handleTranscriptStreamToggle}
                disabled={!joinedMeetId}
              >
                {isReceivingTranscripts ? 'Pause Transcripts' : 'Get Transcripts'}
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="app-footer">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <span>© {new Date().getFullYear()} Dailies Note Assistant</span>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
