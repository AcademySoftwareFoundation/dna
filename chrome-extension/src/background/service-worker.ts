import {
  appendLog,
  getRecentLogs,
  clearLogs,
  logFromForward,
  chunkFromOffscreenMessage,
  type LogScope,
} from '../debug/logger';
import {
  startOffscreenCapture,
  stopOffscreenCapture,
} from '../audio/offscreen-document';
import {
  applyTranscriptionFromMessage,
  resetTranscriptionConfig,
} from '../config/session-config';
import {
  getRuntimeConfig,
  parseTranscriptionPayload,
  setRuntimeConfig,
} from '../config/runtime-config';
import { DnaWsClient } from '../dna/ws-client';
import { parseMeetUrl } from '../meet/parse-meet-url';
import { listMeetTabsInWindow } from '../session/meet-tabs';
import type { PendingConnect, ResolvedMeetTab, SessionState } from '../session/types';
import { SegmentBuilder } from '../transcription/segment-builder';
import { transcribeAudio } from '../transcription/transcriber';

const log = (message: string, detail?: unknown) =>
  appendLog('sw', message, detail);

let activeSession: SessionState | null = null;
let pendingConnect: PendingConnect | null = null;
let resolvedTab: ResolvedMeetTab | null = null;
let chunkCount = 0;

function reply(sendResponse: (payload: unknown) => void, payload: unknown): void {
  try {
    sendResponse(payload);
  } catch {
    /* channel closed */
  }
}

function getPhase():
  | 'idle'
  | 'awaiting_tab'
  | 'ready'
  | 'awaiting_capture'
  | 'capturing' {
  if (activeSession?.captureStarted) {
    return 'capturing';
  }
  if (activeSession) {
    return 'awaiting_capture';
  }
  if (pendingConnect && resolvedTab) {
    return 'ready';
  }
  if (pendingConnect) {
    return 'awaiting_tab';
  }
  return 'idle';
}

function buildStatusPayload(playlistId?: number) {
  const phase = getPhase();
  const matchesPlaylist =
    playlistId === undefined ||
    activeSession?.playlistId === playlistId ||
    pendingConnect?.playlistId === playlistId;

  return {
    ok: true,
    phase: matchesPlaylist ? phase : 'idle',
    playlistId: activeSession?.playlistId ?? pendingConnect?.playlistId,
    meetingId: activeSession?.meetingId ?? resolvedTab?.meetingId ?? null,
    platform: activeSession?.platform ?? resolvedTab?.platform ?? null,
    tabId: activeSession?.tabId ?? resolvedTab?.tabId ?? null,
    pendingPlaylistId: pendingConnect?.playlistId ?? null,
    chunkCount,
  };
}

async function handleConnect(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<Record<string, unknown>> {
  log('CONNECT received', {
    playlistId: message.playlistId,
    windowId: sender.tab?.windowId,
  });

  if (activeSession) {
    return { ok: false, reason: 'already_active' };
  }

  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    log('CONNECT failed: no_window');
    return { ok: false, reason: 'no_window' };
  }

  const transcription = applyTranscriptionFromMessage(message);
  if (!transcription?.sttApiKey) {
    log('CONNECT failed: stt_not_configured');
    return { ok: false, reason: 'stt_not_configured' };
  }

  const playlistId = message.playlistId as number;
  const backendUrl = message.backendUrl as string;
  const authToken = message.authToken as string;

  pendingConnect = {
    playlistId,
    backendUrl,
    authToken,
    windowId,
    transcription,
  };
  resolvedTab = null;

  const meetTabs = await listMeetTabsInWindow(windowId);
  log('Meet tabs in window', { count: meetTabs.length, tabIds: meetTabs.map((t) => t.tabId) });

  if (meetTabs.length === 0) {
    pendingConnect = null;
    resetTranscriptionConfig();
    return { ok: false, reason: 'no_meet_tab' };
  }

  if (meetTabs.length === 1) {
    resolvedTab = {
      tabId: meetTabs[0].tabId,
      meetingId: meetTabs[0].meetingId,
      platform: meetTabs[0].platform,
    };
    log('CONNECT ready (single Meet tab)', resolvedTab);
    return {
      ok: true,
      status: 'ready',
      ...buildStatusPayload(playlistId),
    };
  }

  log('CONNECT awaiting tab selection', { tabCount: meetTabs.length });
  return {
    ok: true,
    status: 'select_tab',
    tabs: meetTabs.map((t) => ({
      tabId: t.tabId,
      title: t.title,
      meetingId: t.meetingId,
    })),
    ...buildStatusPayload(playlistId),
  };
}

async function selectMeetTab(tabId: number): Promise<Record<string, unknown>> {
  log('selectMeetTab', { tabId });
  if (!pendingConnect) {
    return { ok: false, reason: 'no_pending_connect' };
  }

  const tab = await chrome.tabs.get(tabId);
  const parsed = parseMeetUrl(tab.url ?? '');
  if (!parsed) {
    log('selectMeetTab failed: invalid_meet_tab', { url: tab.url });
    return { ok: false, reason: 'invalid_meet_tab' };
  }

  resolvedTab = {
    tabId,
    meetingId: parsed.meetingId,
    platform: parsed.platform,
  };

  return {
    ok: true,
    status: 'ready',
    ...buildStatusPayload(pendingConnect.playlistId),
  };
}

async function startSession(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  log('START received', {
    playlistId: message.playlistId,
    meetingId: message.meetingId,
    tabId: message.tabId,
  });

  if (activeSession) {
    log('START skipped: session already active', { phase: getPhase() });
    return { ok: true, ...buildStatusPayload(message.playlistId as number) };
  }

  applyTranscriptionFromMessage(message);
  const transcription =
    pendingConnect?.transcription ??
    parseTranscriptionPayload(
      (message.transcription as Record<string, unknown> | undefined) ?? {},
    ) ??
    getRuntimeConfig();

  if (!transcription?.sttApiKey) {
    log('START failed: stt_not_configured');
    return { ok: false, reason: 'stt_not_configured' };
  }

  setRuntimeConfig(transcription);

  const playlistId = message.playlistId as number;
  const platform = message.platform as string;
  const meetingId = message.meetingId as string;
  const backendUrl = message.backendUrl as string;
  const authToken = message.authToken as string;
  const tabId = (message.tabId as number | undefined) ?? resolvedTab?.tabId;

  if (tabId === undefined) {
    log('START failed: no_tab');
    return { ok: false, reason: 'no_tab' };
  }

  if (
    resolvedTab &&
    (resolvedTab.meetingId !== meetingId || resolvedTab.platform !== platform)
  ) {
    log('START failed: meeting_mismatch', { resolvedTab, meetingId, platform });
    return { ok: false, reason: 'meeting_mismatch' };
  }

  const sessionUid = crypto.randomUUID();
  const segmentBuilder = new SegmentBuilder({
    sessionUid,
    sessionStart: new Date(),
  });

  const wsClient = new DnaWsClient({
    backendUrl,
    authToken,
    onStop: () => {
      log('DNA backend sent stop');
      void stopSession();
    },
    onError: (errorMessage) => {
      appendLog('ws', 'Backend error', errorMessage);
    },
    onLog: (msg, detail) => appendLog('ws', msg, detail),
  });

  try {
    log('Connecting DNA WebSocket', { backendUrl, platform, meetingId });
    await wsClient.connect();
    const registered = await wsClient.register(platform, meetingId);
    log('DNA WebSocket registered', registered);
    wsClient.sendStatus('transcribing');
  } catch (error) {
    log('START failed during WebSocket setup', error);
    throw error;
  }

  chunkCount = 0;
  activeSession = {
    playlistId,
    tabId,
    meetingId,
    platform,
    backendUrl,
    authToken,
    transcription,
    captureStarted: false,
    wsClient,
    segmentBuilder,
    speaker: 'Unknown',
  };

  pendingConnect = null;
  resolvedTab = null;

  log('Session started; awaiting capture authorization on Meet tab', {
    tabId,
    chunkDurationMs: transcription.chunkDurationMs,
  });

  return { ok: true, ...buildStatusPayload(playlistId) };
}

async function beginTabCapture(
  streamId: string,
  tabId: number,
): Promise<Record<string, unknown>> {
  log('beginTabCapture', { tabId, streamIdPrefix: streamId.slice(0, 12) });

  if (!activeSession) {
    log('beginTabCapture failed: no_session');
    return { ok: false, reason: 'no_session' };
  }

  if (activeSession.tabId !== tabId) {
    log('beginTabCapture failed: tab_mismatch', {
      expected: activeSession.tabId,
      got: tabId,
    });
    return { ok: false, reason: 'tab_mismatch' };
  }

  if (activeSession.captureStarted) {
    log('beginTabCapture skipped: already capturing');
    return { ok: true, ...buildStatusPayload(activeSession.playlistId) };
  }

  try {
    await startOffscreenCapture(streamId, activeSession.transcription.chunkDurationMs);
    activeSession.captureStarted = true;
    activeSession.capture = {
      stop: () => {
        void stopOffscreenCapture();
      },
    };
    log('Offscreen capture started');
    return { ok: true, ...buildStatusPayload(activeSession.playlistId) };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : 'Failed to start tab capture';
    log('beginTabCapture failed', error);
    return { ok: false, reason: 'capture_failed', detail };
  }
}

async function processChunk(blob: Blob): Promise<void> {
  chunkCount += 1;
  log('Processing audio chunk', { chunkCount, bytes: blob.size });

  if (!activeSession?.wsClient || !activeSession.segmentBuilder) {
    log('processChunk skipped: no active session');
    return;
  }

  const config = activeSession.transcription;
  const segmentBuilder = activeSession.segmentBuilder as SegmentBuilder;
  const wsClient = activeSession.wsClient as DnaWsClient;

  try {
    appendLog('stt', 'Sending chunk to STT', {
      url: config.sttUrl,
      bytes: blob.size,
      model: config.sttModel,
    });
    const result = await transcribeAudio(blob, {
      sttUrl: config.sttUrl,
      sttApiKey: config.sttApiKey,
      sttModel: config.sttModel,
      language: config.language,
      onLog: (msg, detail) => appendLog('stt', msg, detail),
    });

    appendLog('stt', 'STT response', {
      textLength: result.text.length,
      segmentCount: result.segments.length,
      preview: result.text.slice(0, 80),
    });

    const speaker = activeSession.speaker || 'Unknown';
    if (result.segments.length === 0 && result.text) {
      const frame = segmentBuilder.buildConfirmed(
        { text: result.text, start: 0, end: 0, language: result.language },
        speaker,
      );
      wsClient.sendTranscript(frame);
      appendLog('ws', 'Sent transcript frame', {
        speaker,
        text: result.text.slice(0, 80),
      });
      return;
    }

    for (const segment of result.segments) {
      if (!segment.text.trim()) {
        continue;
      }
      const frame = segmentBuilder.buildConfirmed(
        {
          text: segment.text,
          start: segment.start,
          end: segment.end,
          language: result.language,
        },
        speaker,
      );
      wsClient.sendTranscript(frame);
      appendLog('ws', 'Sent transcript segment', {
        speaker,
        text: segment.text.slice(0, 80),
      });
    }

    if (result.segments.every((s) => !s.text.trim()) && !result.text.trim()) {
      appendLog('stt', 'STT returned empty text for chunk', { chunkCount });
    }
  } catch (error) {
    appendLog('stt', 'Transcription chunk failed', error);
  }
}

async function stopSession(): Promise<void> {
  log('Stopping session', { chunkCount });
  pendingConnect = null;
  resolvedTab = null;
  resetTranscriptionConfig();

  if (!activeSession) {
    return;
  }

  activeSession.capture?.stop();
  await stopOffscreenCapture();
  activeSession.wsClient?.sendStatus('completed');
  activeSession.wsClient?.disconnect();
  activeSession = null;
  chunkCount = 0;
}

function handleExternalMessage(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  const type = message.type;

  if (type === 'PING') {
    reply(sendResponse, { ok: true });
    return true;
  }

  if (type === 'GET_STATUS') {
    const playlistId =
      typeof message.playlistId === 'number' ? message.playlistId : undefined;
    reply(sendResponse, buildStatusPayload(playlistId));
    return true;
  }

  if (type === 'CONNECT') {
    void handleConnect(message, sender).then((result) => reply(sendResponse, result));
    return true;
  }

  if (type === 'START') {
    void startSession(message)
      .then((result) => reply(sendResponse, result))
      .catch((error) =>
        reply(sendResponse, {
          ok: false,
          reason: 'start_failed',
          detail: error instanceof Error ? error.message : 'Failed to start session',
        }),
      );
    return true;
  }

  if (type === 'DISCONNECT') {
    void stopSession().then(() => reply(sendResponse, { ok: true }));
    return true;
  }

  return false;
}

chrome.runtime.onMessageExternal.addListener(handleExternalMessage);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'debug.log') {
    logFromForward({
      scope: message.scope as LogScope,
      message: String(message.message),
      detail: message.detail ? String(message.detail) : undefined,
    });
    return;
  }

  if (message.type === 'debug.getLogs') {
    reply(sendResponse, { ok: true, logs: getRecentLogs() });
    return true;
  }

  if (message.type === 'debug.clearLogs') {
    clearLogs();
    reply(sendResponse, { ok: true });
    return true;
  }

  if (message.type === 'speaker.changed') {
    if (activeSession) {
      activeSession.speaker = message.speaker ?? 'Unknown';
      log('Speaker changed', { speaker: activeSession.speaker });
    }
    return;
  }

  if (message.type === 'offscreen.chunk') {
    const blob = chunkFromOffscreenMessage(message as Record<string, unknown>);
    if (blob) {
      void processChunk(blob);
    } else {
      log('offscreen.chunk ignored: invalid payload', {
        byteLength: (message as { byteLength?: number }).byteLength,
        hasBuffer: (message as { chunkBuffer?: unknown }).chunkBuffer instanceof ArrayBuffer,
      });
    }
    return;
  }

  if (message.type === 'session.getStatus') {
    reply(sendResponse, buildStatusPayload(message.playlistId));
    return true;
  }

  if (message.type === 'session.listMeetTabs') {
    void listMeetTabsInWindow(pendingConnect?.windowId).then((tabs) =>
      reply(sendResponse, { tabs }),
    );
    return true;
  }

  if (message.type === 'session.selectTab') {
    void selectMeetTab(message.tabId as number).then((result) =>
      reply(sendResponse, result),
    );
    return true;
  }

  if (message.type === 'capture.startWithStreamId') {
    void beginTabCapture(
      String(message.streamId),
      Number(message.tabId),
    ).then((result) => reply(sendResponse, result));
    return true;
  }

  if (message.type === 'session.stop') {
    void stopSession().then(() => reply(sendResponse, { ok: true }));
    return true;
  }

  return undefined;
});

log('Service worker started');
