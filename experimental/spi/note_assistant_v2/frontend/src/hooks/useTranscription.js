import { useState, useRef, useEffect, useCallback } from 'react';
import { startWebSocketTranscription, stopWebSocketTranscription, processSegments } from '../../lib/transcription-service';
import { parseMeetingUrl } from '../../lib/bot-service';

// Global dictionaries - these need to persist across hook instances
const allSegments = {}; // { [timestamp]: combinedText }
const shotSegments = {}; // { [shotKey]: { [timestamp]: { speaker, combinedText } } }

export function useTranscription(rows, setRows, currentIndex, pinnedIndex, includeSpeakerLabels) {
  const [isReceivingTranscripts, setIsReceivingTranscripts] = useState(false);
  const [joinedMeetId, setJoinedMeetId] = useState("");
  const isReceivingTranscriptsRef = useRef(isReceivingTranscripts);
  const currentIndexRef = useRef(0);
  const pinnedIndexRef = useRef(null);
  const hasActiveWebSocketRef = useRef(false);

  // Update refs when values change
  useEffect(() => {
    isReceivingTranscriptsRef.current = isReceivingTranscripts;
  }, [isReceivingTranscripts]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    pinnedIndexRef.current = pinnedIndex;
  }, [pinnedIndex]);

  // Helper to process segments and update the UI transcription field
  const updateTranscriptionFromSegments = useCallback((segments) => {
    // Track all segments globally as a dictionary
    segments.forEach(seg => {
      let start_time = seg.absolute_start_time || seg.timestamp;
      if (start_time) {
        if (!(start_time in allSegments)) {
          seg.new_segment = true; // first time we are seeing this segment
        }
        allSegments[start_time] = seg.combinedText || seg.text || '';
      }
    });
    
    // Only update UI transcription if actively receiving transcripts
    if (!isReceivingTranscriptsRef.current) return;

    // Track segments for this shot BEFORE processSegments
    let activeIndex = pinnedIndexRef.current !== null ? pinnedIndexRef.current : currentIndexRef.current;
    if (activeIndex == null || activeIndex < 0 || activeIndex >= rows.length) activeIndex = 0;
    const shotKey = rows[activeIndex]?.shot;

    if (shotKey) {
      if (!shotSegments[shotKey]) shotSegments[shotKey] = {};
      // Only add new segments for this shot
      segments.forEach(seg => {
        let start_time = seg.absolute_start_time || seg.timestamp;
        if (!seg.new_segment) {
          // if this segment does not belong to the current shot, ignore it
          if (!(start_time in shotSegments[shotKey])) {
            return;
          }
        }
        if (seg) {
          // New or updated segment received
          shotSegments[shotKey][start_time] = seg;
        }
      });
    }

    const speakerGroups = processSegments(Object.values(shotSegments[shotKey] || {}));
    const combinedSpeakerTexts = speakerGroups.map(g => {
      const ts = g.timestamp ? `[${g.timestamp}]` : '';
      if (includeSpeakerLabels) {
        return `${g.speaker}${ts ? ' ' + ts : ''}:\n${g.combinedText}`;
      } else {
        return `${ts ? ts + ':\n' : ''}${g.combinedText}`;
      }
    });

    setRows(prevRows => {
      let activeIndex = pinnedIndexRef.current !== null ? pinnedIndexRef.current : currentIndexRef.current;
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
  }, [rows, setRows, includeSpeakerLabels]);

  // Start transcript stream
  const startTranscriptStream = useCallback(async (meetingId, setBotIsActive, setStatus, botIsActive) => {
    setJoinedMeetId(meetingId);
    hasActiveWebSocketRef.current = true;
    // Don't automatically start receiving transcripts - wait for manual toggle
    
    try {
      // Parse meeting ID to get the format needed for WebSocket
      const { platform, nativeMeetingId } = parseMeetingUrl(meetingId);
      const meetingIdForWS = `${platform}/${nativeMeetingId}`;
      
      // Start WebSocket transcription for real-time updates and status
      await startWebSocketTranscription(
        meetingIdForWS,
        (segments) => {
          // --- WORKAROUND: Some platforms (e.g. vexa) never send 'active' status, but do send transcript segments ---
          // If we receive transcript segments and bot is not marked active, flip bot status to 'active'
          if (segments && segments.length > 0 && !botIsActive) {
            setBotIsActive(true);
            setStatus({ msg: 'Bot Status: active', type: 'success', detailedMsg: null });
          }
          updateTranscriptionFromSegments(segments);
        },
        // onTranscriptFinalized (optional, not used here)
        () => {},
        // onMeetingStatus
        (statusValue) => {
          // Only update status if bot is not already active, or if status is 'completed' or 'error'
          if (!botIsActive || statusValue === 'completed' || statusValue === 'error') {
            const isActiveStatus = statusValue === 'active' || statusValue === 'test-mode-running';
            setStatus({ msg: `Bot Status: ${statusValue}`, type: isActiveStatus ? 'success' : 'info', detailedMsg: null });
            setBotIsActive(isActiveStatus);
            
            // Stop stream when status is 'completed' or 'error'
            if (statusValue === 'completed' || statusValue === 'error') {
              setBotIsActive(false);
              setStatus({ msg: `Bot Status: ${statusValue}`, type: 'info', detailedMsg: null });
              stopTranscriptStream();
            }
          }
        },
        // onError
        (error) => {
          setStatus({ msg: `WebSocket error: ${error}`, type: 'error', detailedMsg: null });
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
  }, [updateTranscriptionFromSegments]);

  // Stop transcript stream
  const stopTranscriptStream = useCallback(async () => {
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
  }, [joinedMeetId]);

  // Manual transcript stream control
  const pauseTranscriptStream = useCallback(() => {
    setIsReceivingTranscripts(false);
  }, []);

  const resumeTranscriptStream = useCallback(() => {
    setIsReceivingTranscripts(true);
  }, []);

  const handleTranscriptStreamToggle = useCallback(() => {
    if (!isReceivingTranscripts) {
      // Only resume stream if already started, otherwise start
      if (joinedMeetId && hasActiveWebSocketRef.current) {
        resumeTranscriptStream();
      } else if (joinedMeetId && !hasActiveWebSocketRef.current) {
        // This needs to be called from the parent with the required params
        return 'start';
      }
    } else {
      pauseTranscriptStream();
    }
    return null;
  }, [isReceivingTranscripts, joinedMeetId, resumeTranscriptStream, pauseTranscriptStream]);

  return {
    isReceivingTranscripts,
    joinedMeetId,
    setJoinedMeetId,
    startTranscriptStream,
    stopTranscriptStream,
    handleTranscriptStreamToggle,
    shotSegments
  };
}