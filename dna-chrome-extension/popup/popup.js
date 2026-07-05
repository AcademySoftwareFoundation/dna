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
  meetTab: document.getElementById('meetTab'),
  refreshTabs: document.getElementById('refreshTabs'),
  grantBtn: document.getElementById('grantBtn'),
  hint: document.getElementById('hint'),
  serverInfo: document.getElementById('serverInfo'),
  logs: document.getElementById('logs'),
  clearLogs: document.getElementById('clearLogs'),
};

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

els.grantBtn.addEventListener('click', () => {
  if (els.grantBtn.dataset.mode === 'stop') {
    els.grantBtn.disabled = true;
    chrome.runtime.sendMessage({ type: 'POPUP_STOP' }, () => {
      els.grantBtn.disabled = false;
    });
    return;
  }
  const id = Number(els.meetTab.value);
  const tabId = Number.isFinite(id) && id > 0 ? id : undefined;
  els.grantBtn.disabled = true;
  chrome.runtime.sendMessage(
    { type: 'POPUP_REQUEST_PERMISSION', tabId },
    (resp) => {
      if (!resp?.ok) {
        els.hint.textContent = `Could not start: ${resp?.error || 'unknown'}`;
        els.grantBtn.disabled = false;
      }
    }
  );
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
    renderServerInfo(resp.serverInfo);
    renderStatus(resp.status);
  }
});

loadMeetTabs();
