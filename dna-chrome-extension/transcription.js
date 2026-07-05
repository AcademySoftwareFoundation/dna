/**
 * DNA transcription capability for the extension service worker.
 *
 * Responsibilities (Phase 3):
 *  - Hold transcription state (connection, server info, selected Meet tab).
 *  - Handle the external handshake from the DNA web app
 *    (PING_TRANSCRIPTION / ACTIVATE_TRANSCRIPTION / GET_STATUS).
 *  - Handle internal messages from the popup and stream logs over a port.
 *  - Drive the toolbar status dot (red / orange-blinking / green).
 *
 * The audio capture pipeline (tabCapture -> WhisperLive -> DNA ingest) is added
 * in Phase 4; requestMeetPermission is the seam where that begins.
 */
(function () {
  'use strict';

  const MAX_LOGS = 300;

  const state = {
    // disconnected | connecting | needs_permission | connected
    connection: 'disconnected',
    serverInfo: null,
    meetTabId: null,
    currentSpeaker: null,
    detail: '',
    logs: [],
  };

  const logPorts = new Set();

  function nowIso() {
    return new Date().toISOString();
  }

  function log(level, message, data) {
    const entry = { t: nowIso(), level, message, data: data ?? null };
    state.logs.push(entry);
    if (state.logs.length > MAX_LOGS) state.logs.shift();
    for (const port of logPorts) {
      try {
        port.postMessage({ type: 'log', entry });
      } catch {
        /* port closed */
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[dna-transcription] ${level}: ${message}`, data ?? '');
  }

  function redactServerInfo() {
    if (!state.serverInfo) return null;
    return {
      ...state.serverInfo,
      token: state.serverInfo.token ? '***redacted***' : null,
    };
  }

  function statusPayload() {
    return {
      ok: true,
      connection: state.connection,
      meetTabId: typeof state.meetTabId === 'number' ? state.meetTabId : undefined,
      detail: state.detail || undefined,
    };
  }

  function broadcastStatus() {
    for (const port of logPorts) {
      try {
        port.postMessage({ type: 'status', status: statusPayload() });
      } catch {
        /* port closed */
      }
    }
  }

  function setConnection(connection, detail) {
    state.connection = connection;
    if (detail !== undefined) state.detail = detail;
    updateBadge();
    broadcastStatus();
    log('info', `connection -> ${connection}${detail ? ' (' + detail + ')' : ''}`);
  }

  // --- Toolbar status dot -----------------------------------------------------

  let blinkTimer = null;

  function stopBlink() {
    if (blinkTimer) {
      clearInterval(blinkTimer);
      blinkTimer = null;
    }
  }

  function updateBadge() {
    const action = chrome.action;
    if (!action) return;
    stopBlink();
    const colors = {
      connected: '#22c55e',
      connecting: '#f59e0b',
      needs_permission: '#f59e0b',
      disconnected: '#ef4444',
    };
    const color = colors[state.connection] || '#ef4444';
    try {
      action.setBadgeBackgroundColor({ color });
    } catch {
      /* action may be unavailable */
    }

    const shouldBlink =
      state.connection === 'connecting' || state.connection === 'needs_permission';
    if (shouldBlink) {
      let on = true;
      action.setBadgeText({ text: '\u25CF' });
      blinkTimer = setInterval(() => {
        on = !on;
        try {
          action.setBadgeText({ text: on ? '\u25CF' : ' ' });
        } catch {
          stopBlink();
        }
      }, 600);
    } else {
      try {
        action.setBadgeText({ text: '\u25CF' });
      } catch {
        /* ignore */
      }
    }
  }

  // --- Meet tab helpers -------------------------------------------------------

  function isMeetUrl(url) {
    return typeof url === 'string' && url.startsWith('https://meet.google.com/');
  }

  async function listMeetTabs() {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
      return tabs.map((t) => ({ id: t.id, title: t.title, url: t.url }));
    } catch {
      return [];
    }
  }

  async function getActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      return tab || null;
    } catch {
      return null;
    }
  }

  let captureInFlight = false;

  async function releaseCapturePipeline() {
    if (typeof self.DNACapture?.stop !== 'function') return;
    try {
      await self.DNACapture.stop();
    } catch {
      /* best effort */
    }
  }

  /**
   * Phase 3 seam. Phase 4 replaces the body with the real capture pipeline
   * (tabCapture via an offscreen document -> WhisperLive -> DNA ingest WS).
   */
  async function requestMeetPermission() {
    if (!state.serverInfo) {
      setConnection('disconnected', 'No server info yet — activate from DNA first');
      return { ok: false, error: 'not_activated' };
    }
    if (captureInFlight) {
      return { ok: false, error: 'capture_in_progress' };
    }
    // Chrome's tabCapture only grants access to the tab the extension was
    // invoked on (activeTab), which is whichever tab was active when this
    // popup was opened. Capturing a background Meet tab picked from a list is
    // therefore impossible — it fails with the opaque "Extension has not been
    // invoked for the current page" error. So the capture target must be the
    // active tab, and it must be the Meet call itself.
    const activeTab = await getActiveTab();
    if (!activeTab || !isMeetUrl(activeTab.url)) {
      setConnection(
        'needs_permission',
        'Open this extension while your Google Meet tab is active, then click ' +
          'Grant — Chrome only lets it capture the tab it was opened on.'
      );
      return { ok: false, error: 'meet_tab_not_active' };
    }
    const chosen = activeTab.id;
    state.meetTabId = chosen;
    captureInFlight = true;
    setConnection('connecting', 'Starting capture');
    if (typeof self.DNACapture?.start !== 'function') {
      captureInFlight = false;
      setConnection('needs_permission', 'Capture module unavailable');
      return { ok: false, error: 'capture_unavailable' };
    }
    try {
      await self.DNACapture.start({
        meetTabId: chosen,
        serverInfo: state.serverInfo,
        log,
      });
    } catch (e) {
      await releaseCapturePipeline();
      setConnection('needs_permission', `Capture failed: ${e?.message || e}`);
      log('error', `Capture start failed: ${e?.message || e}`);
      return { ok: false, error: String(e) };
    } finally {
      captureInFlight = false;
    }
    return { ok: true, tabId: chosen };
  }

  async function stopCapture() {
    await releaseCapturePipeline();
    setConnection('disconnected', 'Stopped');
  }

  // --- External handshake (from the DNA web app) ------------------------------

  const EXTERNAL_TYPES = new Set([
    'PING_TRANSCRIPTION',
    'ACTIVATE_TRANSCRIPTION',
    'GET_STATUS',
  ]);

  function handleExternalMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'PING_TRANSCRIPTION':
        sendResponse({ ok: true, pong: true, capability: 'transcription' });
        return true;
      case 'ACTIVATE_TRANSCRIPTION': {
        releaseCapturePipeline()
          .then(() => {
            state.serverInfo = {
              dnaApiUrl: message.dnaApiUrl,
              dnaIngestWsUrl: message.dnaIngestWsUrl,
              whisperLiveUrl: message.whisperLiveUrl,
              playlistId: message.playlistId,
              token: message.token ?? null,
            };
            log('info', 'Activated by DNA', {
              ...state.serverInfo,
              token: state.serverInfo.token ? '***' : null,
            });
            setConnection('needs_permission', 'Switch to your Google Meet tab, open this extension there, and click Grant');
            sendResponse({ ok: true });
          })
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      }
      case 'GET_STATUS':
        sendResponse(statusPayload());
        return true;
      default:
        return false;
    }
  }

  // --- Internal messages (from the popup) -------------------------------------

  function handleRuntimeMessage(message, sender, sendResponse) {
    if (!message || typeof message !== 'object') return false;
    switch (message.type) {
      case 'MEET_CONTENT_READY':
        log('info', `Meet content script ready: ${message.url || ''}`);
        return false;
      case 'MEET_SPEAKER':
        state.currentSpeaker = message.speaker || null;
        try {
          chrome.runtime.sendMessage({
            type: 'OFFSCREEN_SPEAKER',
            speaker: state.currentSpeaker,
          });
        } catch {
          /* offscreen not up yet */
        }
        return false;
      case 'CAPTURE_STATUS':
        setConnection(message.connection, message.detail);
        return false;
      case 'CAPTURE_LOG':
        log(message.level || 'info', message.message || '', message.data);
        return false;
      case 'POPUP_GET_STATE':
        sendResponse({
          ok: true,
          status: statusPayload(),
          serverInfo: redactServerInfo(),
          logs: state.logs,
        });
        return true;
      case 'POPUP_LIST_MEET_TABS':
        listMeetTabs()
          .then((tabs) => sendResponse({ ok: true, tabs }))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      case 'POPUP_SELECT_MEET_TAB':
        state.meetTabId = typeof message.tabId === 'number' ? message.tabId : null;
        broadcastStatus();
        sendResponse({ ok: true });
        return true;
      case 'POPUP_REQUEST_PERMISSION':
        requestMeetPermission()
          .then((r) => sendResponse(r))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      case 'POPUP_STOP':
        stopCapture()
          .then(() => sendResponse({ ok: true }))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      default:
        return false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) =>
    handleRuntimeMessage(message, sender, sendResponse)
  );

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'dna-logs') return;
    logPorts.add(port);
    try {
      port.postMessage({
        type: 'init',
        status: statusPayload(),
        logs: state.logs,
        serverInfo: redactServerInfo(),
      });
    } catch {
      /* ignore */
    }
    port.onDisconnect.addListener(() => logPorts.delete(port));
  });

  updateBadge();

  self.DNATranscription = {
    handleExternalMessage,
    EXTERNAL_TYPES,
    // exposed for the capture layer (Phase 4)
    _setConnection: setConnection,
    _log: log,
  };
})();
