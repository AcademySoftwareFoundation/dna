import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./ui.css";
import { startWebSocketTranscription, stopWebSocketTranscription, parseMeetingUrl, getApiUrl, getHeaders, processSegments } from '../lib/transcription-service'
import { MOCK_MODE } from '../lib/config';

// Global dictionary to track all segments by timestamp
const allSegments = {}; // { [timestamp]: combinedText }
// Global dictionary to track segments per shot, with speaker and combinedText
const shotSegments = {}; // { [shotKey]: { [timestamp]: { speaker, combinedText } } }

function StatusBadge({ type = "info", children }) {
  if (!children) return null;
  return <span className={`badge badge-${type}`}>{children}</span>;
}

function App() {
  const [meetId, setMeetId] = useState(() => {
    if (MOCK_MODE) {
      return 'https://meet.google.com/mock-meet-123';
    }
    return '';
  });
  const [status, setStatus] = useState({ msg: "", type: "info" });
  const [uploadStatus, setUploadStatus] = useState({ msg: "", type: "info" });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState([]); // [{shot, transcription, summary}]
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPollingTranscripts, setIsPollingTranscripts] = useState(false);
  const isPollingTranscriptsRef = useRef(isPollingTranscripts);
  const [joinedMeetId, setJoinedMeetId] = useState("");
  const [botIsActive, setBotIsActive] = useState(false);
  const [waitingForActive, setWaitingForActive] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState({ msg: "", type: "info" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const currentIndexRef = useRef(0); // Use ref to avoid closure issues
  const pollingIntervalRef = useRef(null);
  const prevIndexRef = useRef(currentIndex);

  // Add a ref to track if websocket polling has started
  const hasStartedWebSocketPollingRef = useRef(false);

  // Update the ref whenever currentIndex changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update the ref whenever isPollingTranscripts changes
  useEffect(() => {
    isPollingTranscriptsRef.current = isPollingTranscripts;
  }, [isPollingTranscripts]);

  // Start transcript polling (only called internally)
  const startTranscriptPolling = async (meetingId) => {
    console.log('startTranscriptPolling called, isPollingTranscripts:', isPollingTranscripts);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    setJoinedMeetId(meetingId);
    hasStartedWebSocketPollingRef.current = true;
    try {
      // Parse meeting ID to get the format needed for WebSocket
      const { platform, nativeMeetingId } = parseMeetingUrl(meetingId);
      const meetingIdForWS = `${platform}/${nativeMeetingId}`;
      // Start WebSocket transcription for real-time updates and status
      await startWebSocketTranscription(
        meetingIdForWS,
        (segments) => {
          console.log('🟢 WebSocket Segments:', segments);
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
          // Stop polling when status is 'completed' or 'error'
          if (statusValue === 'completed' || statusValue === 'error') {
            setBotIsActive(false);
            setStatus({ msg: `Bot Status: ${statusValue}`, type: 'info' });
            stopTranscriptPolling();
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

  // Stop transcript polling (only called internally)
  const stopTranscriptPolling = async () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingTranscripts(false);
    hasStartedWebSocketPollingRef.current = false;
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

  // Update the ref whenever isPollingTranscripts changes
  useEffect(() => {
    isPollingTranscriptsRef.current = isPollingTranscripts;
  }, [isPollingTranscripts]);

  // Manual transcript polling control
  const pauseTranscriptPolling = () => {
    console.log('pauseTranscriptPolling called');
    setIsPollingTranscripts(false);
  };

  const resumeTranscriptPolling = () => {
    console.log('resumeTranscriptPolling called');
    setIsPollingTranscripts(true);
  };

  const handleTranscriptPollingToggle = () => {
    console.log('handleTranscriptPollingToggle called, isPollingTranscripts:', isPollingTranscriptsRef.current, ' hasStartedWebSocketPollingRef:', hasStartedWebSocketPollingRef.current);
    if (!isPollingTranscripts) {
      // Only resume polling if already started, otherwise start
      if (joinedMeetId && hasStartedWebSocketPollingRef.current) {
        resumeTranscriptPolling();
      } else if (joinedMeetId && !hasStartedWebSocketPollingRef.current) {
        startTranscriptPolling(joinedMeetId);
      }
    } else {
      pauseTranscriptPolling();
    }
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (statusPollingIntervalRef.current) {
        clearInterval(statusPollingIntervalRef.current);
      }
    };
  }, []);

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
    stopTranscriptPolling();
    
    try {
      const { platform, nativeMeetingId } = parseMeetingUrl(fullUrl);
      if (MOCK_MODE) {
        // Simulate mock response (like DISABLE_VEXA in backend)
        await new Promise((resolve) => setTimeout(resolve, 800));
        setStatus({ msg: "(TEST MODE) Bot has been requested to join the meeting", type: "success" });
        setJoinedMeetId(fullUrl);
        startTranscriptPolling(fullUrl);
        return;
      }
      // Call Vexa backend REST API directly
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/bots`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          platform,
          native_meeting_id: nativeMeetingId,
          bot_name: 'Vexa',
        }),
      });
      const data = await res.json();
      // Accept any 2xx status as success if data.status is always numerical
      if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300))) {
        console.log('[DEBUG] Bot add response:', res, data); // debug log
        setStatus({ msg: "Failed to add bot to meeting.", type: "error" });
        setSubmitting(false);
        setWaitingForActive(false);
        return;
      }
      console.log('[DEBUG] Bot request successful:', data);
      setJoinedMeetId(fullUrl);
      startTranscriptPolling(fullUrl);
    } catch (err) {
      setStatus({ msg: "Error starting transcription", type: "error" });
      console.error('Error submitting meet ID:', err);
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
      // Parse joinedMeetId to get platform/nativeMeetingId
      const { platform, nativeMeetingId } = parseMeetingUrl(joinedMeetId);
      // MOCK_MODE: Simulate bot exit without API call
      if (MOCK_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        setStatus({ msg: "(TEST MODE) Bot exited successfully.", type: "success" });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
        stopTranscriptPolling();
        return;
      }
      // Use Vexa API directly (like handleSubmit)
      const apiUrl = getApiUrl();
      // Use correct Vexa API endpoint for stopping bot (DELETE /bots/{platform}/{nativeMeetingId})
      const res = await fetch(`${apiUrl}/bots/${platform}/${nativeMeetingId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      // Accept any 2xx status as success if data.status is always numerical
      if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300)) || data.status === 'error') {
        console.log('[DEBUG] Bot exit response:', res, data); // debug log
        setStatus({ msg: "Failed to exit bot.", type: "error" });
      } else {
        setStatus({ msg: "Bot exited successfully.", type: "success" });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
        stopTranscriptPolling();
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

  // Helper to process segments and update the UI transcription field
  function updateTranscriptionFromSegments(segments) {
    // Track all segments globally as a dictionary
    const newSegments = {}; // { [timestamp]: combinedText }
    segments.forEach(seg => {
      if (seg.timestamp && !(seg.timestamp in allSegments)) {
        allSegments[seg.timestamp] = seg.combinedText || seg.text || '';
        newSegments[seg.timestamp] = seg.combinedText || seg.text || '';
      }
    });
    console.log('allSegments:', allSegments);
    console.log('newSegments:', newSegments);

    if (!isPollingTranscriptsRef.current) return;
    // Track segments for this shot BEFORE processSegments
    let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
    if (activeIndex == null || activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;
    const shotKey = rows[activeIndex]?.shot;
    if (shotKey) {
      if (!shotSegments[shotKey]) shotSegments[shotKey] = {};
      // Only add new segments for this shot
      Object.keys(newSegments).forEach(ts => {
        // Find the segment in the original segments array to get speaker info
        const seg = segments.find(s => s.timestamp === ts);
        if (seg && !(ts in shotSegments[shotKey])) {
          shotSegments[shotKey][ts] = {
            speaker: seg.speaker || '',
            combinedText: seg.combinedText || seg.text || ''
          };
        }
      });
      console.log('shotSegments:', shotSegments);
    }
    // Only include segments whose timestamps are present in shotSegments[shotKey]
    let filteredSegments = segments;
    if (shotKey && shotSegments[shotKey]) {
      filteredSegments = segments.filter(seg =>
        seg.timestamp && shotSegments[shotKey][seg.timestamp]
      );
    }
    const speakerGroups = processSegments(filteredSegments);
    const combinedSpeakerTexts = speakerGroups.map(g => {
      const ts = g.timestamp ? `[${g.timestamp}]` : '';
      return `${g.speaker}${ts ? ' ' + ts : ''}:\n${g.combinedText}`;
    });
    setRows(prevRows => {
      let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
      if (activeIndex == null || activeIndex < 0 || activeIndex >= prevRows.length) activeIndex = 0;
      const newTranscript = combinedSpeakerTexts.join('\n\n');
      if (prevRows[activeIndex]?.transcription === newTranscript) return prevRows;
      // After updating, scroll the textarea to the bottom
      setTimeout(() => {
        const textarea = document.querySelector(
          `.data-table tbody tr${pinnedIndex !== null ? `.current-row` : ''} textarea.table-textarea[name='transcription']`
        );
        if (textarea) {
          textarea.scrollTop = textarea.scrollHeight;
        }
      }, 0);
      return prevRows.map((r, idx) => idx === activeIndex ? { ...r, transcription: newTranscript } : r);
    });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Dailies Note Assistant (v2)</h1>
        <p className="app-subtitle">AI Assistant to join a Google meet based review session to capture the audio transcription and generate summaries for specific shots as guided by the user</p>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2 className="panel-title">Google Meet</h2>
          <form onSubmit={handleSubmit} className="form-grid" aria-label="Enter Google Meet URL or ID">
            {/* <label htmlFor="meet-id" className="field-label">Enter Google Meet URL or ID</label> */}
            <p className="help-text">Enter Google Meet URL or ID (e.g abc-defg-hij)</p>
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
        </section>

        <section className="panel">
          <h2 className="panel-title">Shotgrid Playlist</h2>
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
        </section>

        <section className="panel full-span">
          <h2 className="panel-title">Shot Notes</h2>
          {rows.length === 0 && <p className="help-text">Upload a playlist CSV to populate shot notes.</p>}
          {rows.length > 0 && (
            <div className="table-wrapper" style={{ width: '100%' }}>
              <table className="data-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    {/* Remove Current column header */}
                    <th className="col-shot" style={{ width: '10%' }}>Shot/Version</th>
                    <th className="col-notes" style={{ width: '28%' }}>Notes</th>
                    <th className="col-transcription" style={{ width: '28%' }}>Transcription</th>
                    <th className="col-summary" style={{ width: '28%' }}>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isPinned = pinnedIndex === idx;
                    const isCurrent = pinnedIndex !== null ? isPinned : idx === currentIndex;
                    return (
                      <tr key={idx} className={isCurrent ? 'current-row' : ''}>
                        {/* Remove Current radio button cell */}
                        <td className="readonly-cell" style={{ width: '10%', position: 'relative' }}>
                          {row.shot}
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
                        <td style={{ width: '28%' }}>
                          <textarea
                            value={row.notes || ''}
                            onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'notes', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter notes..."
                            rows={3}
                          />
                        </td>
                        <td style={{ width: '28%' }}>
                          <textarea
                            name="transcription"
                            value={row.transcription}
                            onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'transcription', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter transcription..."
                            rows={3}
                          />
                        </td>
                        <td style={{ width: '28%', position: 'relative' }}>
                          <textarea
                            value={row.summary}
                            onFocus={() => { if (pinnedIndex === null) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'summary', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter summary..."
                            rows={3}
                            style={{ paddingRight: '36px' }}
                          />
                          <button
                            type="button"
                            className="btn"
                            style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            aria-label="Refresh"
                            onClick={async () => {
                              // Use transcription as input for summary
                              const inputText = row.transcription || row.notes || '';
                              if (!inputText.trim()) return;
                              updateCell(idx, 'summary', '...'); // Show loading
                              const summary = await getLLMSummary(inputText);
                              updateCell(idx, 'summary', summary || '[No summary returned]');
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M9 3a6 6 0 1 1-6 6" stroke="#3d82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 3v6h6" stroke="#3d82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
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
                className={`btn ${isPollingTranscripts ? (botIsActive ? 'danger' : 'primary') : 'primary'}`}
                onClick={handleTranscriptPollingToggle}
                disabled={!joinedMeetId}
              >
                {isPollingTranscripts ? 'Pause Transcripts' : 'Get Transcripts'}
              </button>
            </div>
          )}
        </div>
      )}

      <footer className="app-footer">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <button
              className="btn primary"
              style={{ minWidth: 180, height: 36, padding: '0 16px' }}
              onClick={downloadCSV}
              disabled={rows.length === 0}
            >
              Download Notes
            </button>
            <input
              type="email"
              className="text-input"
              style={{ minWidth: 220, height: 36, padding: '0 12px', boxSizing: 'border-box' }}
              placeholder="Enter email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={sendingEmail}
              aria-label="Recipient email address"
              required
            />
            <button
              className="btn primary"
              style={{ minWidth: 120, height: 36, padding: '0 16px' }}
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
              {sendingEmail ? "Sending..." : "Email Notes"}
            </button>
          </div>
          <StatusBadge type={emailStatus.type}>{emailStatus.msg}</StatusBadge>
          <span>© {new Date().getFullYear()} Dailies Note Assistant</span>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
