let controlledTabId = null;

function reply(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch {
    /* channel may be closed */
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

  if (await tryTab(controlledTabId)) return;

  const dnaTab = await getDnaAnchorTab();
  const createProps = { url, active: false };

  if (dnaTab?.windowId != null) {
    createProps.windowId = dnaTab.windowId;
    if (typeof dnaTab.index === 'number') {
      createProps.index = dnaTab.index + 1;
    }
  }

  const created = await chrome.tabs.create(createProps);
  if (created?.id != null) {
    controlledTabId = created.id;
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
