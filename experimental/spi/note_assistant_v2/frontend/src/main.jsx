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
  const [pinnedIndex, setPinnedIndex] = useState(null);
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
      const currentLastSegmentIndex = lastSegmentIndexRef.current;
      const url = currentLastSegmentIndex >= 0 
        ? `http://localhost:8000/transcripts/google_meet/${meetingId}?last_segment_index=${currentLastSegmentIndex}`
        : `http://localhost:8000/transcripts/google_meet/${meetingId}`;
      console.log(`Calling URL: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const transcriptArray = await res.json(); // Now an array of strings
        console.log(`Response data:`, transcriptArray);
        if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
          console.log('No new segments received');
          return;
        }
        // Update last segment index
        setLastSegmentIndex(currentLastSegmentIndex + transcriptArray.length);
        // Concatenate all transcript strings
        const newTranscriptText = transcriptArray.join('\n');
        if (rows.length > 0 && newTranscriptText.trim()) {
          setRows(prevRows => {
            const activeIndex = currentIndexRef.current;
            return prevRows.map((row, index) => {
              if (index === activeIndex) {
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
      }
    } catch (err) {
      console.error('Error fetching transcripts:', err);
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
            // Stop bot status polling
            if (botStatusIntervalRef.current) {
              clearInterval(botStatusIntervalRef.current);
              botStatusIntervalRef.current = null;
            }
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
    // Stop bot status polling when transcript polling starts
    if (botStatusIntervalRef.current) {
      clearInterval(botStatusIntervalRef.current);
      botStatusIntervalRef.current = null;
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
        setStatus({ msg: `Requested to join meeting: ${data.meet_id}`, type: "info" });
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
                            onFocus={() => { if (!isPinned) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'notes', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter notes..."
                            rows={3}
                          />
                        </td>
                        <td style={{ width: '28%' }}>
                          <textarea
                            value={row.transcription}
                            onFocus={() => { if (!isPinned) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'transcription', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter transcription..."
                            rows={3}
                          />
                        </td>
                        <td style={{ width: '28%', position: 'relative' }}>
                          <textarea
                            value={row.summary}
                            onFocus={() => { if (!isPinned) setCurrentIndex(idx); }}
                            onChange={(e) => updateCell(idx, 'summary', e.target.value)}
                            className="table-textarea"
                            placeholder="Enter summary..."
                            rows={3}
                            style={{ paddingRight: '36px' }}
                          />
                          <button type="button" className="btn" style={{ position: 'absolute', top: '12px', right: '12px', padding: '4px', minWidth: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Refresh">
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

      <footer className="app-footer">© {new Date().getFullYear()} Dailies Note Assistant</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
