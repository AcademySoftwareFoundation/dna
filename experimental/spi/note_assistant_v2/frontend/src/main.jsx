import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import "./ui.css";
import { startTranscription, startWebSocketTranscription, stopTranscription, parseMeetingUrl } from '../lib/transcription-service'
import { getWebSocketService } from '../lib/websocket-service';
import { groupSegmentsBySpeaker, mergeByAbsoluteUtc } from '../lib/transcription-display';

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
  const isPollingTranscriptsRef = useRef(isPollingTranscripts);
  const [joinedMeetId, setJoinedMeetId] = useState("");
  const [lastSegmentIndex, setLastSegmentIndex] = useState(-1); // Track last received segment
  const [botIsActive, setBotIsActive] = useState(false);
  const [waitingForActive, setWaitingForActive] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState({ msg: "", type: "info" });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [mutableSegments, setMutableSegments] = useState([]);
  const currentIndexRef = useRef(0); // Use ref to avoid closure issues
  const lastSegmentIndexRef = useRef(-1); // Use ref to avoid closure issues for segment tracking
  const pollingIntervalRef = useRef(null);
  const prevIndexRef = useRef(currentIndex);

  // Update the ref whenever currentIndex changes
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Update the ref whenever lastSegmentIndex changes
  useEffect(() => {
    lastSegmentIndexRef.current = lastSegmentIndex;
  }, [lastSegmentIndex]);

  // Update the ref whenever isPollingTranscripts changes
  useEffect(() => {
    isPollingTranscriptsRef.current = isPollingTranscripts;
  }, [isPollingTranscripts]);

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
        const transcriptArray = await res.json(); // Now an array of objects {speaker, start, text}
        console.log(`Response data:`, transcriptArray);
        if (!Array.isArray(transcriptArray) || transcriptArray.length === 0) {
          console.log('No new segments received');
          return;
        }
        // Update last segment index
        setLastSegmentIndex(currentLastSegmentIndex + transcriptArray.length);
        // Concatenate all transcript strings (group by speaker, merge with existing transcription)
        let newTranscriptText = '';
        let lastSpeaker = null;
        // Find the last speaker in the existing transcription (if any)
        let existingTranscription = '';
        if (rows.length > 0) {
          let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
          if (activeIndex == null || activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;
          existingTranscription = rows[activeIndex]?.transcription || '';
          const match = existingTranscription.match(/^(?:.|\n)*?([A-Za-z0-9_\-]+):[^\n]*$/m);
          if (match) {
            // Try to get the last speaker from the last non-empty line
            const lines = existingTranscription.trim().split(/\n/).filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
              const m = lines[i].match(/^([A-Za-z0-9_\-]+):/);
              if (m) { lastSpeaker = m[1]; break; }
            }
          }
        }
        transcriptArray.forEach((seg, idx) => {
          if (!seg.text) return;
          if (seg.speaker && seg.speaker === lastSpeaker && (newTranscriptText || existingTranscription)) {
            // Same speaker as previous, append to last line
            if (newTranscriptText) {
              // If already building newTranscriptText, append to last line
              const lastNewline = newTranscriptText.lastIndexOf('\n');
              if (lastNewline === -1) {
                newTranscriptText += ` ${seg.text}`;
              } else {
                newTranscriptText = newTranscriptText.slice(0, lastNewline) + newTranscriptText.slice(lastNewline) + ` ${seg.text}`;
              }
            } else if (existingTranscription) {
              // If appending to existing transcription, just add to last line
              newTranscriptText = ` ${seg.text}`;
            } else {
              newTranscriptText = `${seg.speaker}: ${seg.text}`;
            }
          } else if (seg.speaker) {
            // New speaker, start new line
            if (newTranscriptText) newTranscriptText += '\n';
            newTranscriptText += `${seg.speaker}: ${seg.text}`;
            lastSpeaker = seg.speaker;
          } else {
            // No speaker info, just append
            if (newTranscriptText) newTranscriptText += '\n';
            newTranscriptText += seg.text;
            lastSpeaker = null;
          }
        });
        // Merge with existing transcription, handling speaker grouping
        let updatedTranscription = '';
        if (rows.length > 0) {
          let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
          if (activeIndex == null || activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;
          const existingTranscription = rows[activeIndex]?.transcription || '';
          let lines = existingTranscription.split(/\n/).filter(Boolean);
          // Find last speaker from last non-empty line
          let lastSpeaker = null;
          if (lines.length > 0) {
            for (let i = lines.length - 1; i >= 0; i--) {
              const m = lines[i].match(/^([A-Za-z0-9_\-]+):/);
              if (m) { lastSpeaker = m[1]; break; }
            }
          }
          // Merge new segments
          transcriptArray.forEach(seg => {
            if (!seg.text) return;
            if (seg.speaker) {
              if (seg.speaker === lastSpeaker && lines.length > 0) {
                // Append to last line
                lines[lines.length - 1] += ` ${seg.text}`;
              } else {
                // New speaker
                lines.push(`${seg.speaker}: ${seg.text}`);
                lastSpeaker = seg.speaker;
              }
            } else {
              // No speaker info
              lines.push(seg.text);
              lastSpeaker = null;
            }
          });
          updatedTranscription = lines.join('\n');
        }
        console.log('Current rows:', rows);
        if (rows.length > 0 && transcriptArray.length > 0) {
          setRows(prevRows => {
            let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
            if (activeIndex == null || activeIndex < 0 || activeIndex >= prevRows.length) activeIndex = 0;
            const row = prevRows[activeIndex];
            let lines = (row.transcription || '').split(/\n/).filter(Boolean);
            // Find last speaker from last non-empty line
            let lastSpeaker = null;
            if (lines.length > 0) {
              for (let i = lines.length - 1; i >= 0; i--) {
                const m = lines[i].match(/^([A-Za-z0-9_\-]+):/);
                if (m) { lastSpeaker = m[1]; break; }
              }
            }
            // Merge new segments
            transcriptArray.forEach(seg => {
              if (!seg.text) return;
              if (seg.speaker) {
                if (seg.speaker === lastSpeaker && lines.length > 0) {
                  lines[lines.length - 1] += ` ${seg.text}`;
                } else {
                  lines.push(`${seg.speaker}: ${seg.text}`);
                  lastSpeaker = seg.speaker;
                }
              } else {
                lines.push(seg.text);
                lastSpeaker = null;
              }
            });
            const updatedTranscription = lines.join('\n');
            return prevRows.map((r, idx) => idx === activeIndex ? { ...r, transcription: updatedTranscription } : r);
          });
        } else {
          console.log('No rows to update or transcript is empty');
        }
      }
    } catch (err) {
      console.error('Error fetching transcripts:', err);
    }
  };

  // Start transcript polling (only called internally)
  const startTranscriptPolling = (meetingId) => {
    console.log('startTranscriptPolling called, isPollingTranscripts:', isPollingTranscripts);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    setIsPollingTranscripts(true);
    setJoinedMeetId(meetingId);
    setLastSegmentIndex(-1); // Reset segment index for new meeting
    lastSegmentIndexRef.current = -1; // Reset ref as well
/*     pollingIntervalRef.current = setInterval(() => {
      fetchTranscripts(meetingId);
    }, 2000); */
  };

  // Stop transcript polling (only called internally)
  const stopTranscriptPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPollingTranscripts(false);
    setLastSegmentIndex(-1); // Reset segment index
    lastSegmentIndexRef.current = -1; // Reset ref as well
  };

  // Manual transcript polling control
  const handleTranscriptPollingToggle = () => {
    console.log('handleTranscriptPollingToggle called, isPollingTranscripts:', isPollingTranscripts);
    if (isPollingTranscripts) {
      // Stop polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setIsPollingTranscripts(false);
    } else {
      // Start polling
      if (joinedMeetId) {
        startTranscriptPolling(joinedMeetId);
      }
    }
  };

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
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

  // Replace the handleSubmit function to call startWebSocketTranscription for testing
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
      // Add bot to meeting first
      const startResult = await startTranscription(fullUrl);
      if (!startResult.success) {
        setStatus({ msg: "Failed to add bot to meeting.", type: "error" });
        setSubmitting(false);
        return;
      }
      const meetingIdForWS = startResult.meetingId;
      console.log('[DEBUG] Meeting ID from startTranscription:', meetingIdForWS);
      setJoinedMeetId(fullUrl);
      // Subscribe to WebSocket events for this meeting
      await startWebSocketTranscription(
        meetingIdForWS,
        (segments) => {
          console.log('Transcript Mutable Event:', segments, isPollingTranscriptsRef.current);
          if(!isPollingTranscriptsRef.current) return;
          setRows(prevRows => appendSegmentsToTranscription(prevRows, segments, pinnedIndex, currentIndexRef));
        },
        (segments) => {
          // Transcript Finalized Event: update UI transcription
          if(!isPollingTranscriptsRef.current) return;
          if (segments && segments.length > 0) {
            setRows(prevRows => appendSegmentsToTranscription(prevRows, segments, pinnedIndex, currentIndexRef));
          }
        },
        (statusValue) => {
          // Update bot status in UI using setStatus
          const isActiveStatus = statusValue === 'active' || statusValue === 'test-mode-running';
          setStatus({ msg: `Bot Status: ${statusValue}`, type: isActiveStatus ? 'success' : 'info' });
          setBotIsActive(isActiveStatus);
          if (waitingForActive && isActiveStatus) {
            setWaitingForActive(false);
          }
          // Stop transcript polling when status is 'completed'
          if (statusValue === 'completed' && isPollingTranscriptsRef.current) {
            stopTranscriptPolling();
            setBotIsActive(false);
          }
        },
        (error) => {
          console.error('WebSocket Error Event:', error);
        },
        () => {
          console.log('WebSocket Connected');
        },
        () => {
          console.log('WebSocket Disconnected');
        }
      );
    } catch (err) {
      setStatus({ msg: "Error connecting to WebSocket for transcript updates", type: "error" });
      console.error('startWebSocketTranscription error:', err);
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
      const meetingIdForStop = `${platform}/${nativeMeetingId}`;
      const res = await stopTranscription(meetingIdForStop);
      if (res.success) {
        setStatus({ msg: "Bot exited successfully.", type: "success" });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
        stopTranscriptPolling();
      } else {
        setStatus({ msg: "Failed to exit bot.", type: "error" });
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

  // --- Algorithmic transcript upsert and grouping (from ws_realtime_transcription.py, append-only mode) ---
  function appendSegmentsToTranscription(prevRows, segments, pinnedIndex, currentIndexRef) {
    let activeIndex = pinnedIndex !== null ? pinnedIndex : currentIndexRef.current;
    if (activeIndex == null || activeIndex < 0 || activeIndex >= prevRows.length) activeIndex = 0;
    const row = prevRows[activeIndex];
    // Use a persistent map to store segments by absolute_start_time
    if (!row._transcriptByAbsStart) row._transcriptByAbsStart = {};
    // Upsert new segments (deduplicate by absolute_start_time, keep latest by updated_at)
    segments.forEach(seg => {
      const absStart = seg.absolute_start_time;
      if (!absStart || !seg.text || !seg.text.trim()) return;
      const existing = row._transcriptByAbsStart[absStart];
      if (existing && existing.updated_at && seg.updated_at) {
        if (seg.updated_at < existing.updated_at) return; // keep newer
      }
      row._transcriptByAbsStart[absStart] = seg;
    });
    // Sort segments by absolute_start_time
    const sortedSegments = Object.values(row._transcriptByAbsStart)
      .filter(s => s.absolute_start_time)
      .sort((a, b) => (a.absolute_start_time < b.absolute_start_time ? -1 : 1));
    // Group consecutive segments by speaker
    const groups = [];
    let currentGroup = null;
    const cleanText = t => (t || '').replace(/\s+/g, ' ').trim();
    sortedSegments.forEach(seg => {
      const speaker = seg.speaker || 'Unknown';
      const text = cleanText(seg.text);
      if (!text) return;
      if (currentGroup && currentGroup.speaker === speaker) {
        currentGroup.text += ' ' + text;
        currentGroup.end_time = seg.absolute_end_time || seg.absolute_start_time;
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = {
          speaker,
          text,
          start_time: seg.absolute_start_time,
          end_time: seg.absolute_end_time || seg.absolute_start_time
        };
      }
    });
    if (currentGroup) groups.push(currentGroup);
    // Render grouped transcript as lines
    const lines = groups.map(g => `${g.speaker}: ${g.text}`);
    // Only append new lines to the current transcription
    const currentLines = (row.transcription || '').split(/\n/).filter(Boolean);
    let firstDiffIdx = 0;
    while (firstDiffIdx < currentLines.length && firstDiffIdx < lines.length && currentLines[firstDiffIdx] === lines[firstDiffIdx]) {
      firstDiffIdx++;
    }
    // If user has edited, preserve their edits and only append new lines
    const updatedTranscription = [
      ...currentLines,
      ...lines.slice(currentLines.length)
    ].join('\n');
    // Store the updated map for future calls
    const updatedRows = prevRows.map((r, idx) => {
      if (idx === activeIndex) {
        return { ...r, transcription: updatedTranscription, _transcriptByAbsStart: row._transcriptByAbsStart };
      }
      return r;
    });
    return updatedRows;
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
                className={`btn ${isPollingTranscripts ? 'danger' : 'primary'}`}
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
