import { useState, useCallback } from 'react';
import { startBot, stopBot } from '../../lib/bot-service';
import { MOCK_MODE } from '../../lib/config';

function getDefaultMeetUrl() {
  return MOCK_MODE ? 'https://meet.google.com/mock-meet-123' : '';
}

export function useGoogleMeet() {
  const [meetId, setMeetId] = useState(getDefaultMeetUrl());
  const [status, setStatus] = useState({ msg: "", type: "info", detailedMsg: null });
  const [submitting, setSubmitting] = useState(false);
  const [botIsActive, setBotIsActive] = useState(false);
  const [waitingForActive, setWaitingForActive] = useState(false);

  // Function to get full Google Meet URL from input (URL or Meet ID)
  const getFullMeetUrl = useCallback((input) => {
    const urlPattern = /^https?:\/\/meet\.google\.com\/([a-zA-Z0-9\-]+)(?:\?.*)?$/;
    const idPattern = /^[a-zA-Z0-9\-]{10,}$/;
    if (!input) return '';
    const urlMatch = input.match(urlPattern);
    if (urlMatch) {
      // Extract just the meet ID and return clean URL
      const meetId = urlMatch[1];
      return `https://meet.google.com/${meetId}`;
    }
    if (idPattern.test(input.trim())) {
      // Convert meet ID to full URL
      return `https://meet.google.com/${input.trim()}`;
    }
    return '';
  }, []);

  const handleSubmit = useCallback(async (e, stopTranscriptStream, setJoinedMeetId, startTranscriptStream) => {
    e.preventDefault();
    const rawInput = meetId.trim();
    const fullUrl = getFullMeetUrl(rawInput);
    if (!fullUrl) {
      setStatus({ msg: "Please enter a valid Google Meet URL or Meet ID (e.g. https://meet.google.com/abc-defg-hij or abc-defg-hij)", type: "error", detailedMsg: null });
      return;
    }
    setSubmitting(true);
    setWaitingForActive(true);
    setStatus({ msg: "Submitting Google Meet URL...", type: "info", detailedMsg: null });
    stopTranscriptStream();
    try {
      const result = await startBot(fullUrl);
      if (!result.success) {
        // Log detailed error information for debugging
        console.error('Bot join failed:', result.error);
        setStatus({ 
          msg: result.statusMsg, 
          type: "error",
          detailedMsg: result.detailedMsg || result.statusMsg
        });
        setSubmitting(false);
        setWaitingForActive(false);
        return;
      }
      setStatus({ msg: result.statusMsg, type: "success", detailedMsg: null });
      setJoinedMeetId(fullUrl);
      startTranscriptStream(fullUrl, setBotIsActive, setStatus, botIsActive, setWaitingForActive);
    } catch (err) {
      console.error('Error starting transcription:', err);
      const errorMessage = `Error starting transcription: ${err.message || err}`;
      setStatus({ msg: "Connection error", type: "error", detailedMsg: errorMessage });
      setWaitingForActive(false);
    } finally {
      setSubmitting(false);
    }
  }, [meetId, getFullMeetUrl, botIsActive]);

  // Exit bot handler
  const handleExitBot = useCallback(async (joinedMeetId, stopTranscriptStream, setJoinedMeetId) => {
    setSubmitting(true);
    setStatus({ msg: "Exiting bot...", type: "info", detailedMsg: null });
    try {
      const result = await stopBot(joinedMeetId);
      if (!result.success) {
        // Log detailed error information for debugging
        console.error('Bot exit failed:', result.error);
        setStatus({ 
          msg: result.statusMsg, 
          type: "error", 
          detailedMsg: result.detailedMsg || result.statusMsg 
        });
      } else {
        setStatus({ msg: result.statusMsg, type: "success", detailedMsg: null });
        setBotIsActive(false);
        setJoinedMeetId("");
        setMeetId("");
        stopTranscriptStream();
      }
    } catch (err) {
      console.error('Network error while exiting bot:', err);
      const errorMessage = `Network error while exiting bot: ${err.message || err}`;
      setStatus({ msg: "Connection error", type: "error", detailedMsg: errorMessage });
    } finally {
      setSubmitting(false);
    }
  }, []);

  return {
    // State
    meetId,
    setMeetId,
    status,
    setStatus,
    submitting,
    botIsActive,
    setBotIsActive,
    waitingForActive,
    setWaitingForActive,
    
    // Functions
    handleSubmit,
    handleExitBot,
    getFullMeetUrl
  };
}