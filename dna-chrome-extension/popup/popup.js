'use strict';

const CONNECTION_LABELS = {
  connected: 'Connected — sending transcripts',
  connecting: 'Connecting…',
  needs_permission: 'Needs Google Meet permission',
  disconnected: 'Disconnected',
};

const els = {
  statusDot: document.getElementById('statusDot'),
  statusLabel: document.getElementById('statusLabel'),
  dnaKey: document.getElementById('dnaKey'),
  saveKey: document.getElementById('saveKey'),
  keyHint: document.getElementById('keyHint'),
  meetTab: document.getElementById('meetTab'),
  refreshTabs: document.getElementById('refreshTabs'),
  grantBtn: document.getElementById('grantBtn'),
  hint: document.getElementById('hint'),
  serverInfo: document.getElementById('serverInfo'),
  logs: document.getElementById('logs'),
  clearLogs: document.getElementById('clearLogs'),
};

// Whether a DNA key has been saved in the extension. Until it is, the
// extension can't be activated by any DNA app, so the grant button is gated.
let hasKey = false;

function applyKeyGate() {
  if (els.grantBtn.dataset.mode === 'stop') return;
  if (hasKey) {
    els.keyHint.textContent = 'DNA key saved.';
    els.grantBtn.disabled = false;
  } else {
    els.keyHint.textContent =
      'Enter the DNA key from your DNA app to connect this extension to it.';
    els.grantBtn.disabled = true;
  }
}

// Turn a ws(s):// URL into a host-permission match pattern. Match patterns
// can't carry a port, so the hostname (which matches any port) is used.
function originForWsUrl(u) {
  try {
    const url = new URL(u);
    const scheme =
      url.protocol === 'wss:'
        ? 'https:'
        : url.protocol === 'ws:'
          ? 'http:'
          : url.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return null;
    return `${scheme}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

function originsForServerInfo(info) {
  if (!info) return [];
  const out = new Set();
  for (const u of [info.dnaIngestWsUrl, info.whisperLiveUrl]) {
    const origin = originForWsUrl(u);
    if (origin) out.add(origin);
  }
  return [...out];
}

// --- Tabs -------------------------------------------------------------------

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document
      .querySelectorAll('.tab')
      .forEach((t) => t.classList.remove('tab-active'));
    document
      .querySelectorAll('.panel')
      .forEach((p) => p.classList.remove('panel-active'));
    tab.classList.add('tab-active');
    const name = tab.getAttribute('data-tab');
    document.getElementById(`tab-${name}`).classList.add('panel-active');
  });
});

// --- Rendering --------------------------------------------------------------

let currentServerInfo = null;

function renderStatus(status) {
  const connection = status?.connection || 'disconnected';
  els.statusDot.className = `dot dot-${connection}`;
  els.statusLabel.textContent = CONNECTION_LABELS[connection] || connection;

  if (connection === 'disconnected') {
    if (!currentServerInfo) {
      els.hint.textContent =
        'To start, open the DNA app and click "Transcribe via Extension".';
    } else {
      els.hint.textContent = status?.detail || 'Stopped — activate again from DNA.';
    }
  } else if (connection === 'needs_permission') {
    els.hint.textContent =
      status?.detail ||
      'Open this extension on your Google Meet tab, then click "Grant permission & start".';
  } else if (connection === 'connecting') {
    els.hint.textContent = status?.detail || 'Connecting…';
  } else {
    els.hint.textContent = '';
  }

  if (connection === 'connected') {
    els.grantBtn.textContent = 'Stop transcription';
    els.grantBtn.dataset.mode = 'stop';
    els.grantBtn.disabled = false;
  } else {
    els.grantBtn.textContent = 'Grant permission & start';
    els.grantBtn.dataset.mode = 'start';
    els.grantBtn.disabled = false;
  }
  applyKeyGate();
}

function renderServerInfo(serverInfo) {
  currentServerInfo = serverInfo ?? null;
  if (!serverInfo) {
    els.serverInfo.textContent =
      'Waiting for DNA — click "Transcribe via Extension" in the app first.';
    return;
  }
  els.serverInfo.textContent = JSON.stringify(serverInfo, null, 2);
}

function appendLog(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  const time = (entry.t || '').replace('T', ' ').replace('Z', '');
  const level = entry.level || 'info';
  div.innerHTML =
    `<span class="log-time">${time.slice(11)}</span> ` +
    `<span class="log-${level}">${escapeHtml(entry.message)}</span>`;
  els.logs.appendChild(div);
  els.logs.scrollTop = els.logs.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]
  );
}

// --- Meet tab selector ------------------------------------------------------

function renderMeetTabs(tabs, selectedId) {
  els.meetTab.innerHTML = '';
  if (!tabs || !tabs.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No Meet tabs found';
    els.meetTab.appendChild(opt);
    return;
  }
  for (const t of tabs) {
    const opt = document.createElement('option');
    opt.value = String(t.id);
    opt.textContent = t.title ? t.title.slice(0, 40) : t.url;
    if (selectedId != null && t.id === selectedId) opt.selected = true;
    els.meetTab.appendChild(opt);
  }
}

function loadMeetTabs() {
  chrome.runtime.sendMessage({ type: 'POPUP_LIST_MEET_TABS' }, (resp) => {
    if (resp?.ok) renderMeetTabs(resp.tabs);
  });
}

// --- Wire actions -----------------------------------------------------------

els.refreshTabs.addEventListener('click', loadMeetTabs);

els.meetTab.addEventListener('change', () => {
  const id = Number(els.meetTab.value);
  if (Number.isFinite(id) && id > 0) {
    chrome.runtime.sendMessage({ type: 'POPUP_SELECT_MEET_TAB', tabId: id });
  }
});

els.saveKey.addEventListener('click', () => {
  const key = els.dnaKey.value;
  els.saveKey.disabled = true;
  chrome.runtime.sendMessage({ type: 'POPUP_SET_KEY', key }, (resp) => {
    els.saveKey.disabled = false;
    if (resp?.ok) {
      hasKey = !!resp.hasKey;
      els.dnaKey.value = '';
      applyKeyGate();
    } else {
      els.keyHint.textContent = `Could not save key: ${resp?.error || 'unknown'}`;
    }
  });
});

els.grantBtn.addEventListener('click', () => {
  if (els.grantBtn.dataset.mode === 'stop') {
    els.grantBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'POPUP_STOP' }, () => {
      els.grantBtn.disabled = false;
    });
    return;
  }
  if (!hasKey) {
    els.keyHint.textContent = 'Enter and save your DNA key first.';
    return;
  }
  els.grantBtn.disabled = true;
  const start = () => {
    chrome.runtime.sendMessage({ type: 'POPUP_REQUEST_PERMISSION' }, (resp) => {
      if (!resp?.ok) {
        els.hint.textContent = `Could not start: ${resp?.error || 'unknown'}`;
        els.grantBtn.disabled = false;
      }
    });
  };
  // Host access to the DNA backend + WhisperLive is requested on demand (it is
  // an optional permission) so a fixed deployment URL never has to be baked in.
  const origins = originsForServerInfo(currentServerInfo);
  if (origins.length && chrome.permissions?.request) {
    chrome.permissions.request({ origins }, (granted) => {
      if (chrome.runtime.lastError || !granted) {
        els.hint.textContent =
          'Host access to WhisperLive and DNA is required to start.';
        els.grantBtn.disabled = false;
        return;
      }
      start();
    });
  } else {
    start();
  }
});

els.clearLogs.addEventListener('click', () => {
  els.logs.innerHTML = '';
});

// --- Live connection to the service worker ----------------------------------

const port = chrome.runtime.connect({ name: 'dna-logs' });
port.onMessage.addListener((msg) => {
  if (msg.type === 'init') {
    renderServerInfo(msg.serverInfo);
    renderStatus(msg.status);
    (msg.logs || []).forEach(appendLog);
  } else if (msg.type === 'status') {
    renderStatus(msg.status);
  } else if (msg.type === 'log') {
    appendLog(msg.entry);
  }
});

chrome.runtime.sendMessage({ type: 'POPUP_GET_STATE' }, (resp) => {
  if (resp?.ok) {
    hasKey = !!resp.hasKey;
    renderServerInfo(resp.serverInfo);
    renderStatus(resp.status);
  }
});

loadMeetTabs();
