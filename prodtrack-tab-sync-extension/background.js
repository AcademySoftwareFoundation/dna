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

async function openOrUpdateControlledTab(url, sender) {
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
      return;
    } catch {
      /* fall through: try tracked tab or create */
    }
  }

  if (await tryTab(controlledTabId)) {
    if (dnaAnchorForSplit?.id != null && controlledTabId != null) {
      await tryAttachControlledToAnchorSplit(dnaAnchorForSplit.id, controlledTabId);
    }
    return;
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
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === controlledTabId) controlledTabId = null;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
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
    openOrUpdateControlledTab(url, sender)
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
