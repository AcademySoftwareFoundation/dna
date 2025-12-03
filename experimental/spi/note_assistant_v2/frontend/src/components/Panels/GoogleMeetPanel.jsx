import React from 'react';

function GoogleMeetPanel({ 
  meetId, 
  setMeetId, 
  onSubmit, 
  onExitBot, 
  botIsActive, 
  submitting, 
  waitingForActive 
}) {
  return (
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
  );
}

export default GoogleMeetPanel;