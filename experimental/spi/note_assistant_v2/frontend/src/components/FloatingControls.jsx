import React from 'react';
import StatusBadge from './StatusBadge';

function FloatingControls({ 
  botIsActive, 
  status, 
  isReceivingTranscripts, 
  joinedMeetId, 
  onTranscriptToggle 
}) {
  if (!botIsActive && !status.msg) {
    return null;
  }

  return (
    <div className="floating-controls">
      <div className="bot-status-display">
        <StatusBadge 
          type={status.type} 
          detailedMessage={status.detailedMsg}
          maxLength={25}
        >
          {status.msg}
        </StatusBadge>
      </div>
      {botIsActive && (
        <div className="transcript-controls">
          <button 
            type="button" 
            className={`btn ${isReceivingTranscripts ? (botIsActive ? 'danger' : 'primary') : 'primary'}`}
            onClick={onTranscriptToggle}
            disabled={!joinedMeetId}
          >
            {isReceivingTranscripts ? 'Pause Transcripts' : 'Get Transcripts'}
          </button>
        </div>
      )}
    </div>
  );
}

export default FloatingControls;