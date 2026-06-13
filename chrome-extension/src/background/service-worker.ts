import { startTabCapture } from '../audio/capture';
import { loadConfig, saveConfig } from '../config/storage';
import { DnaWsClient } from '../dna/ws-client';
import { parseMeetUrl } from '../meet/parse-meet-url';
import { listMeetTabsInWindow } from '../session/meet-tabs';
import type { PendingConnect, ResolvedMeetTab, SessionState } from '../session/types';
import { SegmentBuilder } from '../transcription/segment-builder';
import { transcribeAudio } from '../transcription/transcriber';

let activeSession: SessionState | null = null;
let pendingConnect: PendingConnect | null = null;
let resolvedTab: ResolvedMeetTab | null = null;

function reply(sendResponse: (payload: unknown) => void, payload: unknown): void {
  try {
    sendResponse(payload);
  } catch {
    /* channel closed */
  }
}

function getPhase(): 'idle' | 'awaiting_tab' | 'ready' | 'capturing' {
  if (activeSession) {
    return 'capturing';
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
  };
}

async function handleConnect(
  message: {
    playlistId: number;
    backendUrl: string;
    authToken: string;
  },
  sender: chrome.runtime.MessageSender,
): Promise<Record<string, unknown>> {
  if (activeSession) {
    return { ok: false, reason: 'already_active' };
  }

  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    return { ok: false, reason: 'no_window' };
  }

  await saveConfig({
    ...(await loadConfig()),
    dnaBackendUrl: message.backendUrl,
    dnaAuthToken: message.authToken,
  });

  pendingConnect = {
    playlistId: message.playlistId,
    backendUrl: message.backendUrl,
    authToken: message.authToken,
    windowId,
  };
  resolvedTab = null;

  const meetTabs = await listMeetTabsInWindow(windowId);
  if (meetTabs.length === 0) {
    pendingConnect = null;
    return { ok: false, reason: 'no_meet_tab' };
  }

  if (meetTabs.length === 1) {
    resolvedTab = {
      tabId: meetTabs[0].tabId,
      meetingId: meetTabs[0].meetingId,
      platform: meetTabs[0].platform,
    };
    return {
      ok: true,
      status: 'ready',
      ...buildStatusPayload(message.playlistId),
    };
  }

  return {
    ok: true,
    status: 'select_tab',
    tabs: meetTabs.map((t) => ({
      tabId: t.tabId,
      title: t.title,
      meetingId: t.meetingId,
    })),
    ...buildStatusPayload(message.playlistId),
  };
}

async function selectMeetTab(tabId: number): Promise<Record<string, unknown>> {
  if (!pendingConnect) {
    return { ok: false, reason: 'no_pending_connect' };
  }

  const tab = await chrome.tabs.get(tabId);
  const parsed = parseMeetUrl(tab.url ?? '');
  if (!parsed) {
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

async function startCapture(message: {
  playlistId: number;
  platform: string;
  meetingId: string;
  backendUrl: string;
  authToken: string;
  tabId?: number;
}): Promise<Record<string, unknown>> {
  if (activeSession) {
    return { ok: false, reason: 'already_active' };
  }

  const tabId = message.tabId ?? resolvedTab?.tabId;
  if (tabId === undefined) {
    return { ok: false, reason: 'no_tab' };
  }

  if (
    resolvedTab &&
    (resolvedTab.meetingId !== message.meetingId ||
      resolvedTab.platform !== message.platform)
  ) {
    return { ok: false, reason: 'meeting_mismatch' };
  }

  const config = await loadConfig();
  if (!config.sttApiKey) {
    return { ok: false, reason: 'stt_not_configured' };
  }

  const sessionUid = crypto.randomUUID();
  const segmentBuilder = new SegmentBuilder({
    sessionUid,
    sessionStart: new Date(),
  });

  const wsClient = new DnaWsClient({
    backendUrl: message.backendUrl,
    authToken: message.authToken,
    onStop: () => {
      void stopSession();
    },
  });

  await wsClient.connect();
  await wsClient.register(message.platform, message.meetingId);
  wsClient.sendStatus('transcribing');

  activeSession = {
    playlistId: message.playlistId,
    tabId,
    meetingId: message.meetingId,
    platform: message.platform,
    backendUrl: message.backendUrl,
    authToken: message.authToken,
    wsClient,
    segmentBuilder,
    speaker: 'Unknown',
  };

  pendingConnect = null;
  resolvedTab = null;

  activeSession.capture = await startTabCapture(
    tabId,
    (blob) => {
      void processChunk(blob);
    },
    config.chunkDurationMs,
  );

  return { ok: true, ...buildStatusPayload(message.playlistId) };
}

async function processChunk(blob: Blob): Promise<void> {
  if (!activeSession?.wsClient || !activeSession.segmentBuilder) {
    return;
  }

  const config = await loadConfig();
  const segmentBuilder = activeSession.segmentBuilder as SegmentBuilder;
  const wsClient = activeSession.wsClient as DnaWsClient;

  try {
    const result = await transcribeAudio(blob, {
      sttUrl: config.sttUrl,
      sttApiKey: config.sttApiKey,
      sttModel: config.sttModel,
      language: config.language,
    });

    const speaker = activeSession.speaker || 'Unknown';
    if (result.segments.length === 0 && result.text) {
      wsClient.sendTranscript(
        segmentBuilder.buildConfirmed(
          { text: result.text, start: 0, end: 0, language: result.language },
          speaker,
        ),
      );
      return;
    }

    for (const segment of result.segments) {
      if (!segment.text.trim()) {
        continue;
      }
      wsClient.sendTranscript(
        segmentBuilder.buildConfirmed(
          {
            text: segment.text,
            start: segment.start,
            end: segment.end,
            language: result.language,
          },
          speaker,
        ),
      );
    }
  } catch (error) {
    console.error('Transcription chunk failed', error);
  }
}

async function stopSession(): Promise<void> {
  pendingConnect = null;
  resolvedTab = null;

  if (!activeSession) {
    return;
  }

  activeSession.capture?.stop();
  activeSession.wsClient?.sendStatus('completed');
  activeSession.wsClient?.disconnect();
  activeSession = null;
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
    void handleConnect(
      message as {
        playlistId: number;
        backendUrl: string;
        authToken: string;
      },
      sender,
    ).then((result) => reply(sendResponse, result));
    return true;
  }

  if (type === 'START') {
    void startCapture(
      message as {
        playlistId: number;
        platform: string;
        meetingId: string;
        backendUrl: string;
        authToken: string;
        tabId?: number;
      },
    ).then((result) => reply(sendResponse, result));
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
  if (message.type === 'speaker.changed') {
    if (activeSession) {
      activeSession.speaker = message.speaker ?? 'Unknown';
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

  if (message.type === 'session.stop') {
    void stopSession().then(() => reply(sendResponse, { ok: true }));
    return true;
  }

  return undefined;
});
