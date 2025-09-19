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
  const [webhookEvents, setWebhookEvents] = useState([]); // Store webhook events
  const [botStatus, setBotStatus] = useState(""); // Current bot status
  const currentIndexRef = useRef(0); // Use ref to avoid closure issues
  const lastSegmentIndexRef = useRef(-1); // Use ref to avoid closure issues for segment tracking
  const pollingIntervalRef = useRef(null);
  const eventSourceRef = useRef(null); // SSE connection reference

  // Update the ref whenever currentIndex changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update the ref whenever lastSegmentIndex changes
  useEffect(() => {
    lastSegmentIndexRef.current = lastSegmentIndex;
  }, [lastSegmentIndex]);

  // SSE connection management
  const connectToWebhookEvents = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('🔗 Connecting to webhook events...');
    const eventSource = new EventSource('http://localhost:8000/webhook-events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('✅ Connected to webhook stream');
    };

    eventSource.onmessage = (event) => {
      try {
        const webhookData = JSON.parse(event.data);
        console.log('📡 Webhook event received:', webhookData);
        
        // Update webhook events list
        setWebhookEvents(prev => [...prev.slice(-9), webhookData]); // Keep last 10 events
        
        // Update bot status based on event type
        if (webhookData.event_type === 'bot_status' || webhookData.event_type === 'bot_joined' || webhookData.event_type === 'bot_ready') {
          setBotStatus(webhookData.status || webhookData.event_type);
        }
        
        // Handle specific event types
        switch (webhookData.event_type) {
          case 'bot_joined':
            setBotStatus('🤖 Bot joined the meeting');
            break;
          case 'bot_ready':
            setBotStatus('✅ Bot ready - transcription starting');
            break;
          case 'bot_disconnected':
            setBotStatus('❌ Bot disconnected');
            break;
          case 'error':
            setBotStatus(`❌ Error: ${webhookData.message || 'Unknown error'}`);
            break;
          case 'connection':
            setBotStatus('🔗 Webhook connection established');
            break;
          case 'keepalive':
            // Ignore keepalive messages
            break;
          default:
            setBotStatus(`📡 ${webhookData.event_type}: ${webhookData.status || 'Processing'}`);
        }
      } catch (error) {
        console.error('Error parsing webhook event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('❌ Webhook connection error:', error);
      setBotStatus('❌ Webhook connection lost');
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (isPollingTranscripts) {
          console.log('🔄 Attempting to reconnect to webhook stream...');
          connectToWebhookEvents();
        }
      }, 5000);
    };
  };

  const disconnectFromWebhookEvents = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setBotStatus('');
    setWebhookEvents([]);
  };

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

  // Start transcript polling
  const startTranscriptPolling = (meetingId) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    setIsPollingTranscripts(true);
    setJoinedMeetId(meetingId);
    setLastSegmentIndex(-1); // Reset segment index for new meeting
    lastSegmentIndexRef.current = -1; // Reset ref as well
    
    // Connect to webhook events
    connectToWebhookEvents();
    
    // Poll every second
    pollingIntervalRef.current = setInterval(() => {
      fetchTranscripts(meetingId);
    }, 2000);
  };

  // Stop transcript polling
  const stopTranscriptPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingTranscripts(false);
    setJoinedMeetId("");
    setLastSegmentIndex(-1); // Reset segment index
    lastSegmentIndexRef.current = -1; // Reset ref as well
    
    // Disconnect from webhook events
    disconnectFromWebhookEvents();
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meetId.trim()) return;
    setSubmitting(true);
    setStatus({ msg: "Submitting meet id...", type: "info" });
    
    // Stop any existing polling
    stopTranscriptPolling();
    
    try {
      const res = await fetch("http://localhost:8000/submit-meet-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meet_id: meetId.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setStatus({ msg: `Successfully joined meeting: ${data.meet_id}`, type: "success" });
        // Start polling for transcripts after successful join
        startTranscriptPolling(meetId.trim());
      } else {
        setStatus({ msg: "Server returned an error", type: "error" });
      }
    } catch (err) {
      setStatus({ msg: "Network error while sending Meet ID", type: "error" });
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Dailies Note Assistant (v2)</h1>
        <p className="app-subtitle">AI Assistant to join a Google meet based review session to capture the audio transcription and generate summaries for specific shots as guided by the user</p>
        {botStatus && (
          <div className={`bot-status status-${botStatus.toLowerCase().replace(/\s+/g, '-')}`}>
            Bot Status: {botStatus}
          </div>
        )}
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
              />
              <button type="submit" className="btn primary" disabled={!meetId.trim() || submitting}>
                {submitting ? "Joining..." : "Join"}
              </button>
              {isPollingTranscripts && (
                <button 
                  type="button" 
                  className="btn secondary" 
                  onClick={stopTranscriptPolling}
                  style={{ marginLeft: '8px' }}
                >
                  Stop Polling
                </button>
              )}
            </div>
            <div className="status-row">
              <StatusBadge type={status.type}>{status.msg}</StatusBadge>
              {isPollingTranscripts && (
                <StatusBadge type="info">
                  🎙️ Polling transcripts for: {joinedMeetId} (incremental updates)
                </StatusBadge>
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
