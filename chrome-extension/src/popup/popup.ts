const statusEl = document.getElementById('status') as HTMLParagraphElement;
const tabSection = document.getElementById('tabSection') as HTMLDivElement;
const tabSelect = document.getElementById('tabSelect') as HTMLSelectElement;
const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;

interface StatusPayload {
  phase?: string;
  meetingId?: string | null;
  playlistId?: number | null;
}

async function refresh(): Promise<void> {
  const status = (await chrome.runtime.sendMessage({
    type: 'session.getStatus',
  })) as StatusPayload;

  if (status.phase === 'capturing') {
    statusEl.textContent = `Connected · ${status.meetingId ?? 'meeting'}`;
    tabSection.style.display = 'none';
    return;
  }

  if (status.phase === 'awaiting_tab') {
    statusEl.textContent = 'Select a Meet tab for DNA transcription';
    tabSection.style.display = 'block';
    await loadTabs();
    return;
  }

  if (status.phase === 'ready') {
    statusEl.textContent = `Ready · ${status.meetingId ?? 'meeting'}`;
    tabSection.style.display = 'none';
    return;
  }

  statusEl.textContent = 'Waiting for DNA to connect';
  tabSection.style.display = 'none';
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

void refresh();
