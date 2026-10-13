// Load the transcription capability (registers its own popup/log listeners and
// exposes self.DNATranscription for the external-message delegation below).
// Firefox runs this as a background page (manifest `background.scripts`), which
// loads those files itself and has no importScripts.
if (typeof importScripts === 'function') {
  try {
    importScripts('transcription.js', 'capture.js');
  } catch (e) {
    console.error('Failed to load transcription/capture scripts', e);
  }
}

let controlledTabId = null;

function reply(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch {
    /* channel may be closed */
  }
}

function splitViewNoneConstant() {
  if (typeof chrome.tabs?.SPLIT_VIEW_ID_NONE === 'number') {
    return chrome.tabs.SPLIT_VIEW_ID_NONE;
  }
  return -1;
}

function tabSplitViewId(tab) {
  const v = tab?.splitViewId;
  if (typeof v !== 'number') return splitViewNoneConstant();
  return v;
}

function tabOrigin(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function sameOrigin(a, b) {
  if (!a || !b) return false;
  return a === b;
}

/**
 * If the anchor tab is already in a Chrome split view, try to attach the
 * controlled tab to the same split. Chrome 140+ exposes splitViewId on Tab;
 * tabs.update(splitViewId) is not in the public schema yet — this is a
 * forward-compatible best-effort (see README). Always wrapped in try/catch.
 */
async function tryAttachControlledToAnchorSplit(anchorTabId, controlledTabId) {
  if (anchorTabId == null || controlledTabId == null) return false;
  const none = splitViewNoneConstant();
  try {
    const anchor = await chrome.tabs.get(anchorTabId);
    const sid = tabSplitViewId(anchor);
    if (sid === none) return false;
    await chrome.tabs.update(controlledTabId, { splitViewId: sid });
    return true;
  } catch {
    return false;
  }
}

async function getTabsInWindow(windowId) {
  if (typeof windowId !== 'number') return [];
  try {
    return await chrome.tabs.query({ windowId });
  } catch {
    return [];
  }
}

/**
 * Prefer the tab that sent the external message (always DNA). When the user
 * focuses the other split pane, getLastFocused's active tab is not DNA;
 * sender.tab and split-group origin matching fix that.
 */
async function resolveDnaAnchorTab(sender) {
  const senderTabId = sender?.tab?.id;
  if (typeof senderTabId === 'number') {
    try {
      const t = await chrome.tabs.get(senderTabId);
      if (t?.id != null) return t;
    } catch {
      /* tab gone */
    }
  }

  const senderOrigin = tabOrigin(sender?.url);
  const win = await chrome.windows.getLastFocused({ populate: true });
  if (!win?.tabs?.length) return null;
  const active = win.tabs.find((t) => t.active) ?? null;
  if (!active) return null;

  const none = splitViewNoneConstant();
  const sid = tabSplitViewId(active);
  const candidates =
    sid !== none
      ? win.tabs.filter((t) => tabSplitViewId(t) === sid)
      : [active];

  if (senderOrigin) {
    const dnaInGroup = candidates.find((t) => sameOrigin(tabOrigin(t?.url), senderOrigin));
    if (dnaInGroup) return dnaInGroup;
  }

  return active;
}

/**
 * Any other tab sharing DNA's splitViewId (the other pane). Prefer one that
 * already matches the prodtrack URL hostname when several share the split.
 */
function findSplitViewPartnerTab(dnaAnchor, tabs, prodtrackUrl) {
  const none = splitViewNoneConstant();
  const sid = tabSplitViewId(dnaAnchor);
  if (sid === none) return null;

  const others = tabs.filter(
    (t) => typeof t.id === 'number' && t.id !== dnaAnchor.id && tabSplitViewId(t) === sid
  );
  if (!others.length) return null;

  let targetHost = null;
  try {
    targetHost = new URL(prodtrackUrl).hostname;
  } catch {
    /* ignore */
  }
  if (targetHost) {
    const sameHost = others.find((t) => {
      try {
        return new URL(t.url).hostname === targetHost;
      } catch {
        return false;
      }
    });
    if (sameHost) return sameHost;
  }

  return [...others].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
}

/**
 * @param {string} url
 * @param {chrome.runtime.MessageSender} sender
 * @param {unknown} [clientTabId] — last known tab id from the page; used first if still valid
 * @returns {Promise<number|null>} Chrome tab id that was navigated, or null on total failure
 */
async function openOrUpdateControlledTab(url, sender, clientTabId) {
  const updateTabById = async (id) => {
    if (id == null) return null;
    try {
      const tab = await chrome.tabs.get(id);
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { url, active: false });
        return tab.id;
      }
    } catch {
      /* tab closed */
    }
    return null;
  };

  if (typeof clientTabId === 'number' && clientTabId > 0) {
    const fromClient = await updateTabById(clientTabId);
    if (fromClient != null) {
      controlledTabId = fromClient;
      const dnaTab = await resolveDnaAnchorTab(sender);
      let dnaAnchorForSplit = dnaTab;
      if (dnaTab?.id != null) {
        try {
          dnaAnchorForSplit = await chrome.tabs.get(dnaTab.id);
        } catch {
          /* use resolved */
        }
      }
      if (dnaAnchorForSplit?.id != null) {
        await tryAttachControlledToAnchorSplit(dnaAnchorForSplit.id, fromClient);
      }
      return fromClient;
    }
  }

  const dnaTab = await resolveDnaAnchorTab(sender);
  let dnaAnchorForSplit = dnaTab;
  if (dnaTab?.id != null) {
    try {
      dnaAnchorForSplit = await chrome.tabs.get(dnaTab.id);
    } catch {
      /* use resolved tab */
    }
  }
  const windowTabs =
    dnaAnchorForSplit?.windowId != null
      ? await getTabsInWindow(dnaAnchorForSplit.windowId)
      : [];
  const splitPartner =
    dnaAnchorForSplit != null
      ? findSplitViewPartnerTab(dnaAnchorForSplit, windowTabs, url)
      : null;

  if (splitPartner?.id != null) {
    try {
      await chrome.tabs.update(splitPartner.id, { url, active: false });
      controlledTabId = splitPartner.id;
      if (dnaAnchorForSplit?.id != null) {
        await tryAttachControlledToAnchorSplit(dnaAnchorForSplit.id, splitPartner.id);
      }
      return splitPartner.id;
    } catch {
      /* fall through: try tracked tab or create */
    }
  }

  const fromTracked = await updateTabById(controlledTabId);
  if (fromTracked != null) {
    if (dnaAnchorForSplit?.id != null) {
      await tryAttachControlledToAnchorSplit(dnaAnchorForSplit.id, fromTracked);
    }
    return fromTracked;
  }

  controlledTabId = null;

  const createProps = { url, active: false };

  if (dnaAnchorForSplit?.windowId != null) {
    createProps.windowId = dnaAnchorForSplit.windowId;
    if (typeof dnaAnchorForSplit.index === 'number') {
      createProps.index = dnaAnchorForSplit.index + 1;
    }
    if (typeof dnaAnchorForSplit.id === 'number') {
      createProps.openerTabId = dnaAnchorForSplit.id;
    }
  }

  const created = await chrome.tabs.create(createProps);
  if (created?.id != null) {
    controlledTabId = created.id;
    if (dnaAnchorForSplit?.id != null) {
      await tryAttachControlledToAnchorSplit(dnaAnchorForSplit.id, created.id);
    }
    return created.id;
  }
  return null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === controlledTabId) controlledTabId = null;
});

/** PING / OPEN_VERSION from DNA, via externally_connectable or the page bridge. */
function handleTabSyncMessage(message, sender, sendResponse) {
  if (message.type === 'PING') {
    reply(sendResponse, { ok: true, pong: true });
    return true;
  }

  if (message.type === 'OPEN_VERSION') {
    const url = message.url;
    if (typeof url !== 'string' || !url.startsWith('http')) {
      reply(sendResponse, { ok: false, error: 'invalid_url' });
      return true;
    }
    openOrUpdateControlledTab(url, sender, message.tabId)
      .then((tabId) => {
        if (typeof tabId === 'number') {
          reply(sendResponse, { ok: true, tabId });
        } else {
          reply(sendResponse, { ok: false, error: 'no_tab' });
        }
      })
      .catch((err) =>
        reply(sendResponse, {
          ok: false,
          error: err?.message || String(err),
        })
      );
    return true;
  }

  reply(sendResponse, { ok: false, error: 'unknown_type' });
  return true;
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    reply(sendResponse, { ok: false, error: 'invalid_message' });
    return;
  }

  // Delegate transcription handshake messages to the transcription module.
  if (
    self.DNATranscription &&
    self.DNATranscription.EXTERNAL_TYPES.has(message.type)
  ) {
    return self.DNATranscription.handleExternalMessage(
      message,
      sender,
      sendResponse
    );
  }

  return handleTabSyncMessage(message, sender, sendResponse);
});

// --- Page bridge (browsers without externally_connectable, e.g. Firefox) ----
//
// The user saves their DNA app URL in the popup and grants host access to it;
// content/dnaBridge.js is then registered on that origin and relays the same
// PING / OPEN_VERSION protocol over window.postMessage. Transcription stays on
// externally_connectable only (it needs Chrome's tabCapture/offscreen APIs).

const DNA_URL_STORAGE = 'dnaAppUrl';
const BRIDGE_SCRIPT_ID = 'dna-page-bridge';
const BRIDGE_SCRIPT_FILE = 'content/dnaBridge.js';

// Host-permission / content-script match pattern for a DNA URL. Match patterns
// can't carry a port, so the hostname (which matches any port) is used.
function originPatternForUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function getStoredDnaUrl() {
  try {
    const out = await chrome.storage.local.get(DNA_URL_STORAGE);
    const u = out?.[DNA_URL_STORAGE];
    return typeof u === 'string' && u.length > 0 ? u : null;
  } catch {
    return null;
  }
}

async function getRegisteredBridge() {
  try {
    const [script] = await chrome.scripting.getRegisteredContentScripts({
      ids: [BRIDGE_SCRIPT_ID],
    });
    return script ?? null;
  } catch {
    return null;
  }
}

async function injectBridgeIntoOpenTabs(pattern) {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: pattern });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [BRIDGE_SCRIPT_FILE],
      });
    } catch {
      /* tab not scriptable (discarded, error page, …) */
    }
  }
}

/**
 * Make the registered bridge match the stored DNA URL and granted permission:
 * (re)register it when both are present, unregister it otherwise. Newly
 * registered bridges are also injected into DNA tabs that are already open.
 */
async function syncPageBridgeNow() {
  if (!chrome.scripting?.registerContentScripts) return;
  const url = await getStoredDnaUrl();
  const pattern = url ? originPatternForUrl(url) : null;
  let granted = false;
  if (pattern) {
    try {
      granted = await chrome.permissions.contains({ origins: [pattern] });
    } catch {
      granted = false;
    }
  }
  const wanted = granted ? pattern : null;

  const existing = await getRegisteredBridge();
  const existingPattern = existing?.matches?.[0] ?? null;
  if (existingPattern === wanted) return;

  if (existing) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_SCRIPT_ID] });
    } catch {
      /* already gone */
    }
  }
  if (!wanted) return;

  await chrome.scripting.registerContentScripts([
    {
      id: BRIDGE_SCRIPT_ID,
      matches: [wanted],
      js: [BRIDGE_SCRIPT_FILE],
      runAt: 'document_start',
    },
  ]);
  await injectBridgeIntoOpenTabs(wanted);
}

// Serialised so startup, popup saves and permission events can't race on the
// same content-script id.
let bridgeSync = Promise.resolve();
function syncPageBridge() {
  bridgeSync = bridgeSync
    .then(syncPageBridgeNow)
    .catch((e) => console.error('Failed to sync DNA page bridge', e));
  return bridgeSync;
}

async function bridgeState() {
  const url = await getStoredDnaUrl();
  const registered = await getRegisteredBridge();
  return { ok: true, url, active: !!registered };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  switch (message.type) {
    case 'DNA_PAGE_MESSAGE': {
      // Only accept relays from our own content script running in a tab.
      if (sender?.id !== chrome.runtime.id || !sender?.tab) return false;
      const inner = message.message;
      if (!inner || typeof inner !== 'object') {
        reply(sendResponse, { ok: false, error: 'invalid_message' });
        return false;
      }
      return handleTabSyncMessage(inner, sender, sendResponse);
    }
    case 'POPUP_GET_DNA_URL':
      bridgeState().then((s) => reply(sendResponse, s));
      return true;
    case 'POPUP_SET_DNA_URL': {
      const raw = typeof message.url === 'string' ? message.url.trim() : '';
      if (raw && !originPatternForUrl(raw)) {
        reply(sendResponse, { ok: false, error: 'invalid_url' });
        return false;
      }
      const write = raw
        ? chrome.storage.local.set({ [DNA_URL_STORAGE]: raw })
        : chrome.storage.local.remove(DNA_URL_STORAGE);
      write
        .then(syncPageBridge)
        .then(bridgeState)
        .then((s) => reply(sendResponse, s))
        .catch((e) => reply(sendResponse, { ok: false, error: String(e) }));
      return true;
    }
    default:
      return false;
  }
});

// The popup requests host access after saving the URL; Firefox closes the
// popup when its permission prompt opens, so registration is driven from here.
chrome.permissions.onAdded.addListener(() => syncPageBridge());
chrome.permissions.onRemoved.addListener(() => syncPageBridge());
chrome.runtime.onInstalled.addListener(() => syncPageBridge());
chrome.runtime.onStartup.addListener(() => syncPageBridge());
syncPageBridge();
