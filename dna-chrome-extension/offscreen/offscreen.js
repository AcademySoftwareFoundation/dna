/**
 * DNA capture offscreen document.
 *
 * Pipeline (Phase 4):
 *   tabCapture stream -> AudioContext(16kHz) -> Float32 PCM
 *     -> WhisperLive WebSocket (audio in, segments out)
 *     -> DNA ingest WebSocket ({type:"transcript", confirmed, pending, ...})
 *
 * The tab audio is also routed to the speakers so the operator keeps hearing
 * the call. All lifecycle events are reported to the service worker so the four
 * handshakes are observable in the popup Debug log:
 *   2) capture permission granted
 *   3) WhisperLive open + SERVER_READY
 *   4) DNA ingest open + connected ack (+ per-frame acks)
 */
(function () {
  'use strict';

  const TARGET_SAMPLE_RATE = 16000;

  let audioContext = null;
  let mediaStream = null;
  let micStream = null;
  let sourceNode = null;
  let micSourceNode = null;
  let mergerNode = null;
  let processorNode = null;
  let whisperWs = null;
  let dnaWs = null;
  let serverInfo = null;
  let uid = null;
  let captureStartMs = 0;
  let currentSpeaker = null;
  let whisperReady = false;
  let dnaReady = false;
  // Latency instrumentation so the debug log makes the gap between "pipeline
  // connected" and the first transcript visible, and attributes it to the
  // right hop (audio out -> WhisperLive result -> DNA frame).
  let whisperReadyAtMs = 0;
  let audioStreamingLogged = false;
  let firstWhisperResultLogged = false;
  let firstFrameSentLogged = false;

  function log(level, message, data) {
    chrome.runtime.sendMessage({
      type: 'CAPTURE_LOG',
      level,
      message,
      data: data ?? null,
    });
  }

  function setConnection(connection, detail) {
    chrome.runtime.sendMessage({ type: 'CAPTURE_STATUS', connection, detail });
  }

  function isoFromOffset(startSec) {
    return new Date(captureStartMs + startSec * 1000).toISOString();
  }

  // Key a segment by its stream start time only (not its position in the
  // WhisperLive array). WhisperLive resends a rolling window whose indices
  // shift as older segments drop off, so an index-based id would churn and
  // create duplicates. A time-based id lets the backend upsert refinements of
  // the same utterance in place.
  function segmentId(startSec) {
    return `${uid}:${Math.round(startSec * 1000)}`;
  }

  // The renderer keys live (pending) text by speaker and discards it when the
  // speaker is null, so fall back to a stable label when Meet hasn't reported
  // an active speaker. This keeps in-progress transcription visible.
  function speakerLabel() {
    return currentSpeaker || 'Speaker';
  }

  // --- WhisperLive ------------------------------------------------------------

  function openWhisper() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(serverInfo.whisperLiveUrl);
      } catch (e) {
        reject(e);
        return;
      }
      ws.binaryType = 'arraybuffer';
      whisperWs = ws;

      ws.onopen = () => {
        log('info', 'Handshake 3a: WhisperLive socket open');
        ws.send(
          JSON.stringify({
            uid,
            language: null,
            task: 'transcribe',
            model: 'small',
            use_vad: true,
          })
        );
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.uid && uid && msg.uid !== uid) return;

        if (msg.message === 'SERVER_READY') {
          whisperReady = true;
          whisperReadyAtMs = Date.now();
          log('info', 'Handshake 3b: WhisperLive SERVER_READY', {
            backend: msg.backend,
          });
          resolve();
          return;
        }
        if (msg.status === 'WAIT') {
          log('warn', 'WhisperLive busy (WAIT)', msg);
          return;
        }
        if (msg.message === 'DISCONNECT') {
          log('warn', 'WhisperLive requested disconnect');
          return;
        }
        if (Array.isArray(msg.segments)) {
          if (!firstWhisperResultLogged) {
            firstWhisperResultLogged = true;
            const waited = whisperReadyAtMs ? Date.now() - whisperReadyAtMs : 0;
            log(
              'info',
              `First WhisperLive result ${waited}ms after SERVER_READY ` +
                `(${msg.segments.length} segment(s)) — earlier delay is ` +
                `WhisperLive transcription latency, not DNA`
            );
          }
          handleWhisperSegments(msg.segments);
        }
      };

      ws.onerror = () => {
        log('error', 'WhisperLive socket error');
        reject(new Error('whisperlive_error'));
      };

      ws.onclose = () => {
        whisperReady = false;
        log('warn', 'WhisperLive socket closed');
      };
    });
  }

  function handleWhisperSegments(segments) {
    const confirmed = [];
    const pending = [];
    // A non-last WhisperLive segment is still mutable, so treating it as
    // confirmed used to freeze a partial phrase ("Hello") in the renderer's
    // confirmed set; the growing pending text ("Hello world ...") then got
    // dropped as a stale prefix, leaving only the first word. Trust only
    // WhisperLive's explicit `completed` flag; everything else stays pending.
    segments.forEach((seg) => {
      const start = typeof seg.start === 'number' ? seg.start : Number(seg.start) || 0;
      const end = typeof seg.end === 'number' ? seg.end : Number(seg.end) || start;
      const text = (seg.text || '').trim();
      if (!text) return;
      const isCompleted = seg.completed === true;
      const base = {
        segment_id: segmentId(start),
        text,
        speaker: speakerLabel(),
        language: seg.language || null,
        start_time: start,
        end_time: end,
        absolute_start_time: isoFromOffset(start),
        absolute_end_time: isoFromOffset(end),
        updated_at: new Date().toISOString(),
      };
      if (isCompleted) {
        confirmed.push({ ...base, completed: true });
      } else {
        pending.push(base);
      }
    });

    if (confirmed.length === 0 && pending.length === 0) return;
    sendToDna(confirmed, pending);
  }

  // --- DNA ingest -------------------------------------------------------------

  function openDna() {
    return new Promise((resolve, reject) => {
      let url = serverInfo.dnaIngestWsUrl;
      if (serverInfo.token) {
        url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(serverInfo.token);
      }
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      dnaWs = ws;

      ws.onopen = () => log('info', 'Handshake 4a: DNA ingest socket open');

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'connected') {
          dnaReady = true;
          log('info', 'Handshake 4b: DNA ingest connected', { user: msg.user });
          resolve();
        } else if (msg.type === 'ack') {
          if (msg.stored > 0) log('info', `DNA stored ${msg.stored} segment(s)`);
        } else if (msg.type === 'error') {
          log('error', `DNA ingest error: ${msg.error}`);
        }
      };

      ws.onerror = () => {
        log('error', 'DNA ingest socket error');
        reject(new Error('dna_ingest_error'));
      };

      ws.onclose = () => {
        dnaReady = false;
        log('warn', 'DNA ingest socket closed');
      };
    });
  }

  function sendToDna(confirmed, pending) {
    if (!dnaWs || dnaWs.readyState !== WebSocket.OPEN) return;
    // The target version is resolved server-side (the playlist's in-review
    // version); the extension intentionally does not send a version_id.
    const frame = {
      type: 'transcript',
      playlist_id: serverInfo.playlistId,
      speaker: speakerLabel(),
      confirmed,
      pending,
      ts: new Date().toISOString(),
    };
    try {
      dnaWs.send(JSON.stringify(frame));
      if (!firstFrameSentLogged) {
        firstFrameSentLogged = true;
        log(
          'info',
          `First transcript frame sent to DNA ` +
            `(confirmed=${confirmed.length}, pending=${pending.length})`
        );
      }
    } catch (e) {
      log('error', `Failed to send frame to DNA: ${e?.message || e}`);
    }
  }

  // --- Audio capture ----------------------------------------------------------

  async function startCapture(streamId, captureMic) {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
    log('info', 'Handshake 2: tab capture permission granted');

    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    // An offscreen document has no user gesture, so Chrome starts the
    // AudioContext suspended. A suspended context never fires
    // `onaudioprocess`, so no audio would ever reach WhisperLive. Resume it
    // explicitly (the live tab-capture stream keeps it running afterwards).
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (e) {
        log('warn', `AudioContext resume failed: ${e?.message || e}`);
      }
    }
    log('info', `AudioContext ${audioContext.state} @ ${audioContext.sampleRate}Hz`);
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Keep the call audible to the operator.
    sourceNode.connect(audioContext.destination);

    // Mix tab audio (and optionally the operator's mic) into one signal that we
    // feed to WhisperLive. The mic is NOT routed to the speakers to avoid echo.
    mergerNode = audioContext.createGain();
    sourceNode.connect(mergerNode);

    if (captureMic) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        micSourceNode = audioContext.createMediaStreamSource(micStream);
        micSourceNode.connect(mergerNode);
        log('info', 'Microphone capture enabled (mixed with tab audio)');
      } catch (e) {
        log('warn', `Microphone capture unavailable: ${e?.message || e}`);
      }
    }

    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    processorNode.onaudioprocess = (e) => {
      if (!whisperWs || whisperWs.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      // Copy so the underlying buffer isn't reused before send.
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      try {
        whisperWs.send(chunk.buffer);
        if (!audioStreamingLogged) {
          audioStreamingLogged = true;
          log('info', 'Streaming audio to WhisperLive; awaiting transcription');
        }
      } catch {
        /* socket closing */
      }
    };
    mergerNode.connect(processorNode);
    // ScriptProcessor must be connected to the graph to fire; it writes no
    // output, so this contributes silence (no echo of the mixed signal).
    processorNode.connect(audioContext.destination);
  }

  // --- Lifecycle --------------------------------------------------------------

  function releaseCaptureResources() {
    try {
      processorNode && processorNode.disconnect();
      mergerNode && mergerNode.disconnect();
      sourceNode && sourceNode.disconnect();
      micSourceNode && micSourceNode.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close();
      mediaStream && mediaStream.getTracks().forEach((t) => t.stop());
      micStream && micStream.getTracks().forEach((t) => t.stop());
      whisperWs && whisperWs.close();
      dnaWs && dnaWs.close();
    } catch {
      /* best effort */
    }
    processorNode = mergerNode = sourceNode = micSourceNode = null;
    audioContext = mediaStream = micStream = null;
    whisperWs = dnaWs = null;
    whisperReady = false;
    dnaReady = false;
  }

  async function start(streamId, info) {
    serverInfo = info;
    uid = `dna-${info.playlistId}-${Date.now()}`;
    captureStartMs = Date.now();
    whisperReady = false;
    dnaReady = false;
    whisperReadyAtMs = 0;
    audioStreamingLogged = false;
    firstWhisperResultLogged = false;
    firstFrameSentLogged = false;

    try {
      await startCapture(streamId, info.captureMic === true);
    } catch (e) {
      releaseCaptureResources();
      setConnection('needs_permission', `Capture failed: ${e?.message || e}`);
      log('error', `getUserMedia failed: ${e?.message || e}`);
      return { ok: false, error: String(e) };
    }

    setConnection('connecting', 'Connecting to WhisperLive and DNA');
    try {
      await Promise.all([openWhisper(), openDna()]);
    } catch (e) {
      releaseCaptureResources();
      setConnection('needs_permission', `Upstream connect failed: ${e?.message || e}`);
      log('error', `Upstream connect failed: ${e?.message || e}`);
      return { ok: false, error: String(e) };
    }

    setConnection('connected', 'Streaming transcripts');
    log('info', 'Capture pipeline fully connected');
    return { ok: true };
  }

  function stop() {
    releaseCaptureResources();
    setConnection('disconnected', 'Capture stopped');
    log('info', 'Capture stopped');
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;
    switch (message.type) {
      case 'OFFSCREEN_START':
        start(message.streamId, message.serverInfo)
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      case 'OFFSCREEN_STOP':
        stop();
        sendResponse({ ok: true });
        return true;
      case 'OFFSCREEN_SPEAKER':
        currentSpeaker = message.speaker || null;
        return false;
      default:
        return false;
    }
  });
})();
