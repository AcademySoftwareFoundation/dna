import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./ui.css";

function StatusBadge({ type = "info", children }) {
  if (!children) return null;
  return <span className={`badge badge-${type}`}>{children}</span>;
}

function App() {
  const [meetId, setMeetId] = useState("");
  const [status, setStatus] = useState({ msg: "", type: "info" });
  const [uploadStatus, setUploadStatus] = useState({ msg: "", type: "info" });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [rows, setRows] = useState([]); // [{shot, transcription, summary}]
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPollingTranscripts, setIsPollingTranscripts] = useState(false);
  const [joinedMeetId, setJoinedMeetId] = useState("");
  const [lastSegmentIndex, setLastSegmentIndex] = useState(-1); // Track last received segment
  const [botIsActive, setBotIsActive] = useState(false);
  const [waitingForActive, setWaitingForActive] = useState(false);
  const currentIndexRef = useRef(0); // Use ref to avoid closure issues
  const lastSegmentIndexRef = useRef(-1); // Use ref to avoid closure issues for segment tracking
  const pollingIntervalRef = useRef(null);
  const botStatusIntervalRef = useRef(null);

  // Update the ref whenever currentIndex changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update the ref whenever lastSegmentIndex changes
  useEffect(() => {
    lastSegmentIndexRef.current = lastSegmentIndex;
  }, [lastSegmentIndex]);

  // Function to fetch and update transcripts
  const fetchTranscripts = async (meetingId) => {
    try {
      // Use ref to get current lastSegmentIndex value
      const currentLastSegmentIndex = lastSegmentIndexRef.current;
      
      // Add last_segment_index parameter for incremental updates
      const url = currentLastSegmentIndex >= 0 
        ? `http://localhost:8000/transcripts/google_meet/${meetingId}?last_segment_index=${currentLastSegmentIndex}`
        : `http://localhost:8000/transcripts/google_meet/${meetingId}`;
      
      console.log(`Calling URL: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const segments = data.segments || [];
        
        console.log(`Response data:`, data);
        
        // If no new segments, return early
        if (segments.length === 0) {
          console.log('No new segments received');
          return;
        }
        
        // Update last segment index from response
        if (data.last_segment_index !== undefined) {
          console.log(`Updating lastSegmentIndex from ${currentLastSegmentIndex} to ${data.last_segment_index}`);
          setLastSegmentIndex(data.last_segment_index);
        }
        
        // Concatenate speaker + text for new segments
        const newTranscriptText = segments
          .map(segment => `${segment.speaker}: ${segment.text}`)
          .join('\n');
        
        // Update the transcription field of the current row if rows exist
        if (rows.length > 0 && newTranscriptText.trim()) {
          setRows(prevRows => {
            const activeIndex = currentIndexRef.current;
            return prevRows.map((row, index) => {
              if (index === activeIndex) {
                // Always append new content to existing transcription
                const existingTranscription = row.transcription || '';
                const updatedTranscription = existingTranscription
                  ? `${existingTranscription}\n${newTranscriptText}`
                  : newTranscriptText;
                
                return { ...row, transcription: updatedTranscription };
              }
              return row;
            });
          });
        }
        
        // Log incremental update info
        if (data.new_segments_count !== undefined) {
          console.log(`Received ${data.new_segments_count} new segments -> Row ${currentIndexRef.current}`);
        }
      }
    } catch (err) {
      console.error('Error fetching transcripts:', err);
      // Don't show error to user for polling failures, just log them
    }
  };

  // Poll bot status from backend
  const pollBotStatus = (meetingId) => {
    fetch(`http://localhost:8000/bot-status/google_meet/${meetingId}`)
      .then(res => res.json())
      .then(data => {
        if (data.status) {
          setStatus({ msg: `Bot Status: ${data.status}`, type: 'info' });
          setBotIsActive(data.status === 'active');
          if (waitingForActive && data.status === 'active') {
            setWaitingForActive(false);
          }
          // Start transcript polling only when status is 'active'
          if (data.status === 'active' && !isPollingTranscripts) {
            startTranscriptPolling(meetingId);
          }
          // Stop transcript polling when status is 'completed'
          if (data.status === 'completed' && isPollingTranscripts) {
            stopTranscriptPolling();
            setBotIsActive(false);
          }
        } else {
          setStatus({ msg: 'Bot Status: unknown', type: 'info' });
          setBotIsActive(false);
        }
      })
      .catch(() => {
        setStatus({ msg: 'Bot Status: error', type: 'error' });
        setBotIsActive(false);
      });
  };

  // Start transcript polling (only called internally)
  const startTranscriptPolling = (meetingId) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    setIsPollingTranscripts(true);
    setJoinedMeetId(meetingId);
    setLastSegmentIndex(-1); // Reset segment index for new meeting
    lastSegmentIndexRef.current = -1; // Reset ref as well
    pollingIntervalRef.current = setInterval(() => {
      fetchTranscripts(meetingId);
    }, 2000);
  };

  // Stop transcript polling (only called internally)
  const stopTranscriptPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingTranscripts(false);
    setJoinedMeetId("");
    setLastSegmentIndex(-1); // Reset segment index
    lastSegmentIndexRef.current = -1; // Reset ref as well
    setStatus({ msg: '', type: 'info' });
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (botStatusIntervalRef.current) {
        clearInterval(botStatusIntervalRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meetId.trim()) return;
    setSubmitting(true);
    setWaitingForActive(true);
    setStatus({ msg: "Submitting meet id...", type: "info" });
    stopTranscriptPolling();
    try {
      const res = await fetch("http://localhost:8000/submit-meet-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meet_id: meetId.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setStatus({ msg: `Requested to join meeting: ${data.meet_id}`, type: "success" });
        // Start polling bot status after successful join
        if (botStatusIntervalRef.current) {
          clearInterval(botStatusIntervalRef.current);
        }
        botStatusIntervalRef.current = setInterval(() => {
          pollBotStatus(meetId.trim());
        }, 2000);
        // Initial bot status fetch
        pollBotStatus(meetId.trim());
      } else {
        setStatus({ msg: "Server returned an error", type: "error" });
        setWaitingForActive(false);
      }
    } catch (err) {
      setStatus({ msg: "Network error while sending Meet ID", type: "error" });
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

  // Exit bot handler
  const handleExitBot = async () => {
    setSubmitting(true);
    setStatus({ msg: "Exiting bot...", type: "info" });
    try {
      const res = await fetch(`http://localhost:8000/stop-bot/google_meet/${joinedMeetId}`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setStatus({ msg: "Bot exited successfully.", type: "success" });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
      } else {
        setStatus({ msg: "Failed to exit bot.", type: "error" });
      }
    } catch (err) {
      setStatus({ msg: "Network error while exiting bot", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Dailies Note Assistant (v2)</h1>
        <p className="app-subtitle">AI Assistant to join a Google meet based review session to capture the audio transcription and generate summaries for specific shots as guided by the user</p>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2 className="panel-title">Enter Google Meet ID</h2>
          <form onSubmit={handleSubmit} className="form-grid" aria-label="Submit Google Meet ID">
            <label htmlFor="meet-id" className="field-label">Meet ID</label>
            <div className="field-row">
              <input
                id="meet-id"
                type="text"
                className="text-input"
                value={meetId}
                onChange={(e) => setMeetId(e.target.value)}
                placeholder="e.g. abc-defg-hij"
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
            <div className="status-row">
              <StatusBadge type={status.type}>{status.msg}</StatusBadge>
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
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-current">Current</th>
                    <th className="col-shot">Shot/Version</th>
                    <th className="col-transcription">Transcription</th>
                    <th className="col-summary">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className={idx === currentIndex ? 'current-row' : ''}>
                      <td className="current-cell" style={{ textAlign: 'center' }}>
                        <input
                          type="radio"
                          name="current-shot"
                          checked={idx === currentIndex}
                          onChange={() => setCurrentIndex(idx)}
                          aria-label={`Set current row to ${row.shot}`}
                        />
                      </td>
                      <td className="readonly-cell" style={{ width: '18%' }}>{row.shot}</td>
                      <td style={{ width: '41%' }}>
                        <textarea
                          value={row.transcription}
                          onChange={(e) => updateCell(idx, 'transcription', e.target.value)}
                          className="table-textarea"
                          placeholder="Enter transcription..."
                          rows={3}
                        />
                      </td>
                      <td style={{ width: '41%' }}>
                        <textarea
                          value={row.summary}
                          onChange={(e) => updateCell(idx, 'summary', e.target.value)}
                          className="table-textarea"
                          placeholder="Enter summary..."
                          rows={3}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <footer className="app-footer">© {new Date().getFullYear()} Dailies Note Assistant</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
