import { requestTabCaptureStreamId } from '../audio/request-stream-id';
import { logRemote, type DebugLogEntry } from '../debug/logger';

const log = (message: string, detail?: unknown) => logRemote('popup', message, detail);

const statusEl = document.getElementById('status') as HTMLParagraphElement;
const tabSection = document.getElementById('tabSection') as HTMLDivElement;
const captureSection = document.getElementById('captureSection') as HTMLDivElement;
const logSection = document.getElementById('logSection') as HTMLDivElement;
const logOutput = document.getElementById('logOutput') as HTMLPreElement;
const tabSelect = document.getElementById('tabSelect') as HTMLSelectElement;
const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;
const captureBtn = document.getElementById('captureBtn') as HTMLButtonElement;
const clearLogsBtn = document.getElementById('clearLogsBtn') as HTMLButtonElement;

let captureTabId: number | null = null;
let logPollTimer: number | null = null;

interface StatusPayload {
  phase?: string;
  meetingId?: string | null;
  playlistId?: number | null;
  tabId?: number | null;
  chunkCount?: number;
}

function hideSections(): void {
  tabSection.style.display = 'none';
  captureSection.style.display = 'none';
}

function formatLogEntry(entry: DebugLogEntry): string {
  const detail = entry.detail ? ` — ${entry.detail}` : '';
  return `${entry.ts.slice(11, 23)} [${entry.scope}] ${entry.message}${detail}`;
}

async function refreshLogs(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: 'debug.getLogs',
  })) as { logs?: DebugLogEntry[] };

  const logs = response?.logs ?? [];
  logOutput.textContent =
    logs.length > 0
      ? logs.map(formatLogEntry).join('\n')
      : 'No logs yet. Connect from DNA, then enable capture on Meet.';
  logOutput.scrollTop = logOutput.scrollHeight;
}

function startLogPolling(): void {
  if (logPollTimer !== null) {
    return;
  }
  logPollTimer = window.setInterval(() => {
    void refreshLogs();
  }, 1500);
}

async function isMeetTabActive(tabId: number | null | undefined): Promise<boolean> {
  if (tabId == null) {
    return false;
  }
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id === tabId;
}

async function refresh(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: 'session.getStatus',
  })) as StatusPayload;

  log('Popup status refresh', status);
  hideSections();
  logSection.style.display = 'block';
  void refreshLogs();
  startLogPolling();

  if (status.phase === 'capturing') {
    statusEl.textContent = `Transcribing · ${status.meetingId ?? 'meeting'} (${status.chunkCount ?? 0} chunks)`;
    return;
  }

  if (status.phase === 'awaiting_capture') {
    captureTabId = status.tabId ?? null;
    const onMeetTab = await isMeetTabActive(captureTabId);
    if (onMeetTab) {
      statusEl.textContent = 'DNA is connected. Enable audio capture to start transcribing.';
      captureSection.style.display = 'block';
      captureBtn.disabled = false;
      captureBtn.textContent = 'Enable tab + mic capture';
    } else {
      statusEl.textContent =
        'Open this popup from your Google Meet tab (click the extension icon on Meet), then enable audio capture.';
      captureSection.style.display = 'block';
      captureBtn.disabled = true;
    }
    return;
  }

  if (status.phase === 'awaiting_tab') {
    statusEl.textContent = 'Select a Meet tab for DNA transcription';
    tabSection.style.display = 'block';
    await loadTabs();
    return;
  }

  if (status.phase === 'ready') {
    statusEl.textContent = `Ready · ${status.meetingId ?? 'meeting'}. Connect from DNA.`;
    return;
  }

  statusEl.textContent = 'Waiting for DNA to connect';
}

async function loadTabs(): Promise<void> {
  tabSelect.innerHTML = '';
  const { tabs } = (await chrome.runtime.sendMessage({
    type: 'session.listMeetTabs',
  })) as { tabs: Array<{ tabId: number; title: string; meetingId: string }> };

  for (const tab of tabs) {
    const option = document.createElement('option');
    option.value = String(tab.tabId);
    option.textContent = tab.title || tab.meetingId;
    tabSelect.appendChild(option);
  }
  selectBtn.disabled = tabs.length === 0;
}

selectBtn.addEventListener('click', async () => {
  const tabId = Number(tabSelect.value);
  if (!tabId) {
    return;
  }
  log('Selecting Meet tab', { tabId });
  const result = await chrome.runtime.sendMessage({
    type: 'session.selectTab',
    tabId,
  });
  if (!result.ok) {
    statusEl.textContent = result.reason ?? 'Failed to select tab';
    return;
  }
  await refresh();
});

captureBtn.addEventListener('click', () => {
  const tabId = captureTabId;
  if (tabId == null) {
    statusEl.textContent = 'No Meet tab is ready for capture.';
    return;
  }

  captureBtn.disabled = true;
  statusEl.textContent = 'Requesting audio capture…';
  log('Requesting tab capture stream id', { tabId });

  requestTabCaptureStreamId(tabId)
    .then((streamId) => {
      log('Got stream id', { tabId, streamIdPrefix: streamId.slice(0, 12) });
      return chrome.runtime.sendMessage({
        type: 'capture.startWithStreamId',
        streamId,
        tabId,
      });
    })
    .then(async (result) => {
      log('capture.startWithStreamId result', result);
      if (!result?.ok) {
        statusEl.textContent = result?.detail ?? result?.reason ?? 'Capture failed';
        captureBtn.disabled = false;
        return;
      }
      await refresh();
    })
    .catch((error) => {
      log('Capture authorization failed', error);
      statusEl.textContent =
        error instanceof Error ? error.message : 'Capture authorization failed';
      captureBtn.disabled = false;
    });
});

clearLogsBtn.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'debug.clearLogs' }).then(() => refreshLogs());
});

log('Popup opened');
void refresh();
