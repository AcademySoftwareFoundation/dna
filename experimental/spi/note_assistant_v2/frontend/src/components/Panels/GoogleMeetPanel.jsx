import { useState } from 'react';
import StatusBadge from '../StatusBadge';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

function GoogleMeetPanel({
  meetId,
  setMeetId,
  onSubmit,
  onExitBot,
  botIsActive,
  submitting,
  waitingForActive,
  rows,
  selectedProjectId,
  sgProjects,
  originalFilename
}) {
  const [meetTab, setMeetTab] = useState('live');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [pastSubmitting, setPastSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ msg: "", type: "info" });

  const handlePastRecordingSubmit = async (e) => {
    e.preventDefault();

    // Validate that ShotGrid data has been uploaded
    if (!rows || rows.length === 0) {
      setSubmitStatus({
        msg: "Please upload a ShotGrid playlist first (Import > Upload Playlist)",
        type: "error"
      });
      return;
    }

    // Extract selected project name from sgProjects
    let selectedProjectName = '';
    if (selectedProjectId && sgProjects && sgProjects.length > 0) {
      const project = sgProjects.find(p => String(p.id) === String(selectedProjectId));
      if (project) {
        selectedProjectName = project.code;
      }
    }

    setPastSubmitting(true);
    setSubmitStatus({ msg: "Submitting...", type: "info" });

    try {
      const res = await fetch(`${BACKEND_URL}/process-past-recording`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recording_url: recordingUrl,
          recipient_email: recipientEmail,
          shotgrid_data: rows,
          selected_project_name: selectedProjectName,
          playlist_name: originalFilename || ''
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitStatus({
          msg: "Processing started! Check your email for results (may take 10-30 minutes).",
          type: "success"
        });
        setRecordingUrl('');
        setRecipientEmail('');
      } else {
        setSubmitStatus({
          msg: data.detail || "Failed to start processing",
          type: "error"
        });
      }
    } catch (err) {
      setSubmitStatus({ msg: "Network error during submission", type: "error" });
    } finally {
      setPastSubmitting(false);
    }
  };

  return (
    <div>
      {/* Tab buttons */}
      <div style={{ display: 'flex', marginBottom: '12px' }}>
        <button
          type="button"
          className={`tab-button ${meetTab === 'live' ? 'active' : ''}`}
          onClick={() => setMeetTab('live')}
          style={{ fontSize: '14px', padding: '6px 12px' }}
        >
          Live
        </button>
        <button
          type="button"
          className={`tab-button ${meetTab === 'past' ? 'active' : ''}`}
          onClick={() => setMeetTab('past')}
          style={{ fontSize: '14px', padding: '6px 12px' }}
        >
          Past
        </button>
      </div>

      {/* Live tab content */}
      {meetTab === 'live' && (
        <div>
          <p className="help-text">Enter Google Meet URL or ID (e.g abc-defg-hij)</p>
          <form onSubmit={onSubmit} className="form-grid" aria-label="Enter Google Meet URL or ID">
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
                <button type="button" className="btn danger" onClick={onExitBot} disabled={submitting}>
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

      {/* Past tab content */}
      {meetTab === 'past' && (
        <div>
          <p className="help-text">
            Enter Google Meet recording link and email address. Results will be sent asynchronously.
          </p>
          <form className="form-grid" aria-label="Process past Google Meet recording" onSubmit={handlePastRecordingSubmit}>
            {/* Recording URL field - full width */}
            <div className="field-row" style={{ marginBottom: '8px' }}>
              <input
                id="recording-url"
                type="text"
                className="text-input"
                placeholder="Google Drive recording URL (e.g. https://drive.google.com/file/d/...)"
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                autoComplete="off"
                required
                disabled={pastSubmitting}
              />
            </div>

            {/* Email field + Process button - side by side */}
            <div className="field-row">
              <input
                id="recipient-email"
                type="email"
                className="text-input"
                placeholder="Email address for results"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                autoComplete="off"
                required
                disabled={pastSubmitting}
              />
              <button
                type="submit"
                className="btn primary"
                disabled={!recordingUrl.trim() || !recipientEmail.trim() || pastSubmitting}
              >
                {pastSubmitting ? "Submitting..." : "Process Recording"}
              </button>
            </div>
          </form>
          {submitStatus.msg && (
            <div style={{ marginTop: '12px' }}>
              <StatusBadge type={submitStatus.type}>{submitStatus.msg}</StatusBadge>
            </div>
          )}
          <p className="help-text" style={{ marginTop: '12px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
            Processing typically takes 10-30 minutes depending on video length.
          </p>
        </div>
      )}
    </div>
  );
}

export default GoogleMeetPanel;