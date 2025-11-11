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
    
    let data;
    try {
      data = await res.json();
    } catch (jsonError) {
      const shortMessage = "Server response error";
      const detailedMessage = `Failed to add bot to meeting. Server returned invalid response (HTTP ${res.status}: ${res.statusText})`;
      return {
        success: false,
        joinedMeetId: null,
        statusMsg: shortMessage,
        detailedMsg: detailedMessage,
        error: { jsonError, status: res.status, statusText: res.statusText },
      };
    }
    
    if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300))) {
      let shortMessage = "Failed to add bot to meeting";
      let detailedMessage = "Failed to add bot to meeting.";
      
      // Add specific error details if available
      if (data.message) {
        detailedMessage += ` ${data.message}`;
        // For short message, try to extract key information
        if (data.message.toLowerCase().includes('already exists')) {
          shortMessage = "Bot already in meeting";
        } else if (data.message.toLowerCase().includes('invalid') || data.message.toLowerCase().includes('expired')) {
          shortMessage = "Invalid meeting URL";
        } else if (data.message.toLowerCase().includes('permission') || data.message.toLowerCase().includes('denied')) {
          shortMessage = "Permission denied";
        } else if (data.message.toLowerCase().includes('not found')) {
          shortMessage = "Meeting not found";
        }
      } else if (data.error) {
        detailedMessage += ` Error: ${data.error}`;
      } else if (data.detail) {
        detailedMessage += ` ${data.detail}`;
      }
      
      // Add HTTP status information to detailed message
      if (!res.ok) {
        detailedMessage += ` (HTTP ${res.status}: ${res.statusText})`;
        // Update short message for common HTTP errors
        if (res.status === 409) {
          shortMessage = "Bot already in meeting";
        } else if (res.status === 404) {
          shortMessage = "Meeting not found";
        } else if (res.status === 403) {
          shortMessage = "Permission denied";
        } else if (res.status >= 500) {
          shortMessage = "Server error";
        }
      }
      
      return {
        success: false,
        joinedMeetId: null,
        statusMsg: shortMessage,
        detailedMsg: detailedMessage,
        error: data,
      };
    }
    return {
      success: true,
      joinedMeetId: fullUrl,
      statusMsg: "Bot request successful.",
    };
  } catch (err) {
    let shortMessage = "Connection error";
    let detailedMessage = "Error starting transcription";
    
    // Provide more specific error details
    if (err instanceof Error) {
      detailedMessage += `: ${err.message}`;
      // Extract key info for short message
      if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
        shortMessage = "Network error";
      } else if (err.message.toLowerCase().includes('timeout')) {
        shortMessage = "Request timeout";
      }
    } else if (typeof err === 'string') {
      detailedMessage += `: ${err}`;
    } else {
      detailedMessage += ": Unknown error occurred";
    }
    
    return {
      success: false,
      joinedMeetId: null,
      statusMsg: shortMessage,
      detailedMsg: detailedMessage,
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
    
    let data;
    try {
      data = await res.json();
    } catch (jsonError) {
      const shortMessage = "Server response error";
      const detailedMessage = `Failed to exit bot. Server returned invalid response (HTTP ${res.status}: ${res.statusText})`;
      return {
        success: false,
        statusMsg: shortMessage,
        detailedMsg: detailedMessage,
        error: { jsonError, status: res.status, statusText: res.statusText },
      };
    }
    
    if (!res.ok || (typeof data.status === 'number' && (data.status < 200 || data.status >= 300)) || data.status === 'error') {
      let shortMessage = "Failed to exit bot";
      let detailedMessage = "Failed to exit bot.";
      
      // Add specific error details if available
      if (data.message) {
        detailedMessage += ` ${data.message}`;
        // For short message, try to extract key information
        if (data.message.toLowerCase().includes('not found')) {
          shortMessage = "Bot not found";
        } else if (data.message.toLowerCase().includes('already')) {
          shortMessage = "Bot already stopped";
        }
      } else if (data.error) {
        detailedMessage += ` Error: ${data.error}`;
      } else if (data.detail) {
        detailedMessage += ` ${data.detail}`;
      }
      
      // Add HTTP status information to detailed message
      if (!res.ok) {
        detailedMessage += ` (HTTP ${res.status}: ${res.statusText})`;
        // Update short message for common HTTP errors
        if (res.status === 404) {
          shortMessage = "Bot not found";
        } else if (res.status === 403) {
          shortMessage = "Permission denied";
        } else if (res.status >= 500) {
          shortMessage = "Server error";
        }
      }
      
      return {
        success: false,
        statusMsg: shortMessage,
        detailedMsg: detailedMessage,
        error: data,
      };
    }
    return {
      success: true,
      statusMsg: "Bot exited successfully.",
    };
  } catch (err) {
    let shortMessage = "Connection error";
    let detailedMessage = "Network error while exiting bot";
    
    // Provide more specific error details
    if (err instanceof Error) {
      detailedMessage += `: ${err.message}`;
      // Extract key info for short message
      if (err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
        shortMessage = "Network error";
      } else if (err.message.toLowerCase().includes('timeout')) {
        shortMessage = "Request timeout";
      }
    } else if (typeof err === 'string') {
      detailedMessage += `: ${err}`;
    } else {
      detailedMessage += ": Unknown error occurred";
    }
    
    return {
      success: false,
      statusMsg: shortMessage,
      detailedMsg: detailedMessage,
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
