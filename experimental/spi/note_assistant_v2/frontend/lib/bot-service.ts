// bot-service.ts
// Bot management utilities for starting and stopping the Vexa bot
import { getApiUrl, getHeaders } from "./transcription-service";
import { MOCK_MODE } from "./config";

/**
 * Start the Vexa bot for a meeting (Google Meet or Teams)
 * @param fullUrl Full Google Meet or Teams URL
 * @returns {Promise<{ success: boolean; joinedMeetId: string; statusMsg: string; error?: string }>} Result
 */
export async function startBot(fullUrl) {
  try {
    const { platform, nativeMeetingId } = parseMeetingUrl(fullUrl);
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        success: true,
        joinedMeetId: fullUrl,
        statusMsg: "(TEST MODE) Bot has been requested to join the meeting",
      };
    }
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/bots`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        platform,
        native_meeting_id: nativeMeetingId,
        bot_name: 'Vexa',
      }),
    });
    const data = await res.json();
    if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300))) {
      return {
        success: false,
        joinedMeetId: null,
        statusMsg: "Failed to add bot to meeting.",
        error: data,
      };
    }
    return {
      success: true,
      joinedMeetId: fullUrl,
      statusMsg: "Bot request successful.",
    };
  } catch (err) {
    return {
      success: false,
      joinedMeetId: null,
      statusMsg: "Error starting transcription",
      error: err,
    };
  }
}

/**
 * Stop the Vexa bot for a meeting
 * @param joinedMeetId Full Google Meet or Teams URL
 * @returns {Promise<{ success: boolean; statusMsg: string; error?: string }>} Result
 */
export async function stopBot(joinedMeetId) {
  try {
    const { platform, nativeMeetingId } = parseMeetingUrl(joinedMeetId);
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        success: true,
        statusMsg: "(TEST MODE) Bot exited successfully.",
      };
    }
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/bots/${platform}/${nativeMeetingId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300)) || data.status === 'error') {
      return {
        success: false,
        statusMsg: "Failed to exit bot.",
        error: data,
      };
    }
    return {
      success: true,
      statusMsg: "Bot exited successfully.",
    };
  } catch (err) {
    return {
      success: false,
      statusMsg: "Network error while exiting bot",
      error: err,
    };
  }
}

// parseMeetingUrl: Parse a Google Meet or Teams meeting URL and extract platform and native meeting ID
export function parseMeetingUrl(url: string): { platform: string; nativeMeetingId: string; passcode?: string } {
  // Google Meet: https://meet.google.com/abc-defg-hij
  const googleMeetRegex = /https?:\/\/(meet\.google\.com)\/([a-z0-9\-]+)/i;
  // Teams: https://teams.microsoft.com/l/meetup-join/19%3ameeting_NjY...%40thread.v2/0?context=...&passcode=123456
  const teamsRegex = /https?:\/\/(teams\.microsoft\.com)\/l\/meetup-join\/(\S+?)(?:\?|$)/i;
  // Zoom: https://us02web.zoom.us/j/1234567890?pwd=abcdef
  const zoomRegex = /https?:\/\/(\S*zoom\.us)\/j\/(\d+)(?:\?pwd=(\w+))?/i;

  if (googleMeetRegex.test(url)) {
    const match = url.match(googleMeetRegex);
    return { platform: "google_meet", nativeMeetingId: match[2] };
  } else if (teamsRegex.test(url)) {
    const match = url.match(teamsRegex);
    // Try to extract passcode if present
    const passcodeMatch = url.match(/[?&]passcode=([\w-]+)/i);
    return { platform: "teams", nativeMeetingId: match[2], passcode: passcodeMatch ? passcodeMatch[1] : undefined };
  } else if (zoomRegex.test(url)) {
    const match = url.match(zoomRegex);
    return { platform: "zoom", nativeMeetingId: match[2], passcode: match[3] };
  }
  throw new Error("Unsupported or invalid meeting URL");
}
