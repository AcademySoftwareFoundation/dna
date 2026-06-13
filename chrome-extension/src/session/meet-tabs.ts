import { parseMeetUrl } from '../meet/parse-meet-url';

export interface MeetTabInfo {
  tabId: number;
  title: string;
  meetingId: string;
  platform: 'google_meet';
}

export async function listMeetTabsInWindow(
  windowId: number | undefined,
): Promise<MeetTabInfo[]> {
  const query: chrome.tabs.QueryInfo =
    typeof windowId === 'number' ? { windowId, url: 'https://meet.google.com/*' } : { url: 'https://meet.google.com/*' };

  const tabs = await chrome.tabs.query(query);
  const result: MeetTabInfo[] = [];

  for (const tab of tabs) {
    if (tab.id === undefined) {
      continue;
    }
    const parsed = parseMeetUrl(tab.url ?? '');
    if (!parsed) {
      continue;
    }
    result.push({
      tabId: tab.id,
      title: tab.title || tab.url || `Meet ${parsed.meetingId}`,
      meetingId: parsed.meetingId,
      platform: parsed.platform,
    });
  }

  return result;
}
