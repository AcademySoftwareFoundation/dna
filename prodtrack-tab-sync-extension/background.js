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

async function getDnaAnchorTab() {
  const win = await chrome.windows.getLastFocused({ populate: true });
  if (!win?.tabs?.length) return null;
  const active = win.tabs.find((t) => t.active);
  return active ?? null;
}

async function openOrUpdateControlledTab(url) {
  const tryTab = async (id) => {
    if (id == null) return false;
    try {
      const tab = await chrome.tabs.get(id);
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { url, active: false });
        return true;
      }
    } catch {
      /* tab closed */
    }
    return false;
  };

  if (await tryTab(controlledTabId)) {
    const anchor = await getDnaAnchorTab();
    if (anchor?.id != null && controlledTabId != null) {
      await tryAttachControlledToAnchorSplit(anchor.id, controlledTabId);
    }
    return;
  }

  const dnaTab = await getDnaAnchorTab();
  const createProps = { url, active: false };

  if (dnaTab?.windowId != null) {
    createProps.windowId = dnaTab.windowId;
    if (typeof dnaTab.index === 'number') {
      createProps.index = dnaTab.index + 1;
    }
    if (typeof dnaTab.id === 'number') {
      createProps.openerTabId = dnaTab.id;
    }
  }

  const created = await chrome.tabs.create(createProps);
  if (created?.id != null) {
    controlledTabId = created.id;
    if (dnaTab?.id != null) {
      await tryAttachControlledToAnchorSplit(dnaTab.id, created.id);
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === controlledTabId) controlledTabId = null;
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    reply(sendResponse, { ok: false, error: 'invalid_message' });
    return;
  }

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
    openOrUpdateControlledTab(url)
      .then(() => reply(sendResponse, { ok: true }))
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
});
