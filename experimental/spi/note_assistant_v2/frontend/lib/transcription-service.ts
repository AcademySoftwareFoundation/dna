import { MOCK_MODE } from "./config"
import { 
  getWebSocketService, 
  convertWebSocketSegment,
  type TranscriptMutableEvent,
  type TranscriptFinalizedEvent,
  type MeetingStatusEvent 
} from "./websocket-service"

// Types for our transcription service
export interface TranscriptionSegment {
  id: string
  text: string
  timestamp: string
  speaker?: string
  language?: string
}

export interface TranscriptionData {
  meetingId: string
  language: string
  segments: TranscriptionSegment[]
  status: "active" | "completed" | "stopped" | "error"
  lastUpdated: string
}

export interface Meeting {
  id: string
  platformId: string
  nativeMeetingId: string
  platform: string
  status: "active" | "completed" | "stopped" | "error"
  startTime: string
  endTime?: string
  title?: string
  name?: string
  participants?: string[]
  languages?: string[]
  data?: {
    name?: string
    participants?: string[]
    languages?: string[]
    notes?: string
  }
}

// Mock data for meeting history
const mockMeetings: Meeting[] = [
  {
    id: "mock-meeting-1",
    platformId: "google_meet",
    nativeMeetingId: "abc-defg-hij",
    platform: "google_meet",
    status: "completed",
    startTime: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    endTime: new Date(Date.now() - 83000000).toISOString(),
    title: "Product Team Standup",
    name: "Product Team Standup",
    participants: ["Alice", "Bob"],
    data: {
      name: "Product Team Standup",
      participants: ["Alice", "Bob"],
      languages: ["en"]
    }
  },
  {
    id: "mock-meeting-2",
    platformId: "google_meet",
    nativeMeetingId: "xyz-uvwt-rst",
    platform: "google_meet",
    status: "completed",
    startTime: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    endTime: new Date(Date.now() - 169200000).toISOString(),
    title: "Design Review",
    name: "Design Review",
    participants: ["Charlie", "Diana"],
    data: {
      name: "Design Review", 
      participants: ["Charlie", "Diana"],
      languages: ["en"]
    }
  },
  {
    id: "mock-meeting-3",
    platformId: "google_meet",
    nativeMeetingId: "123-456-789",
    platform: "google_meet",
    status: "active",
    startTime: new Date().toISOString(),
    title: "Client Presentation",
    name: "Client Presentation",
    participants: ["Eve", "Frank"]
  }
];

// Mock data for demonstration
const mockSegments: TranscriptionSegment[] = [
  {
    id: "segment-1",
    text: "Hello everyone, thanks for joining today's meeting.",
    timestamp: new Date(Date.now() - 60000).toISOString(),
    speaker: "John",
  },
  {
    id: "segment-2",
    text: "I wanted to discuss our progress on the new feature.",
    timestamp: new Date(Date.now() - 50000).toISOString(),
    speaker: "John",
  },
  {
    id: "segment-3",
    text: "The development team has completed the backend work.",
    timestamp: new Date(Date.now() - 40000).toISOString(),
    speaker: "Sarah",
  },
  {
    id: "segment-4",
    text: "We're still working on the frontend components.",
    timestamp: new Date(Date.now() - 30000).toISOString(),
    speaker: "Sarah",
  },
  {
    id: "segment-5",
    text: "When do you think we'll be ready for testing?",
    timestamp: new Date(Date.now() - 20000).toISOString(),
    speaker: "Michael",
  },
]

// Mock data storage
const mockTranscriptionData: Record<string, TranscriptionData> = {}

// Vexa API configuration - get URL dynamically from cookies, env, or default
function getApiBaseUrl(): string {
  return getApiUrl();
}

// Function to get the WebSocket URL from the API base URL
export function getWebSocketUrl(): string {
  const apiUrl = getApiUrl();
  if (apiUrl.startsWith('https://')) {
    return apiUrl.replace('https://', 'wss://') + '/ws';
  } else if (apiUrl.startsWith('http://')) {
    return apiUrl.replace('http://', 'ws://') + '/ws';
  } else {
    // Default to secure WebSocket
    return 'wss://devapi.dev.vexa.ai/ws';
  }
}

// Function to set the WebSocket URL (derived from API URL)
export function setWebSocketUrl(url: string): void {
  // WebSocket URL is derived from API URL, so we don't store it separately
  //console.log("WebSocket URL is derived from API URL:", url);
}

// Helper function to handle API responses
async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    
    // Specific handling for 409 conflict (existing bot)
    if (response.status === 409) {
      const error = new Error(`ExistingBotError: ${errorData.detail || "A bot is already running for this meeting"}`)
      error.name = "ExistingBotError"
      throw error
    }
    
    throw new Error(`API error: ${response.status} ${response.statusText} - ${errorData.detail || errorData.message || "Unknown error"}`)
  }
  return response.json()
}

// Function to get the API key - Vite style
export function getApiKey(): string {
  try {
    // Only attempt to get from cookies on client side
    if (typeof window !== 'undefined') {
      // Direct approach to get a specific cookie
      const match = document.cookie.match(/(^|;)\s*vexa_api_key\s*=\s*([^;]+)/);
      const cookieValue = match ? decodeURIComponent(match[2]) : '';
      if (cookieValue) {
        //console.log("Found API key in cookies");
        return cookieValue;
      }
    }
    // Use Vite environment variable
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VEXA_API_KEY) {
      const envKey = import.meta.env.VITE_VEXA_API_KEY;
      return envKey;
    }
    return '';
  } catch (error) {
    console.error("Error getting API key:", error);
    return '';
  }
}

// Function to set the API key in cookies - simplified
export function setApiKey(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      // Set a cookie that expires in 30 days
      const days = 30;
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      
      // Simplified cookie setting with no spaces
      document.cookie = `vexa_api_key=${encodeURIComponent(key)};expires=${date.toUTCString()};path=/`;
      
      // Immediately verify the cookie was set
      setTimeout(() => {
        const isSet = document.cookie.includes('vexa_api_key=');
        console.log(`API key cookie set: ${isSet}`);
      }, 10);
    }
  } catch (error) {
    console.error("Error setting API key:", error);
  }
}

// Function to clear the API key from cookies
export function clearApiKey(): void {
  try {
    if (typeof window !== 'undefined') {
      document.cookie = 'vexa_api_key=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      //console.log("API key cookie cleared");
    }
  } catch (error) {
    console.error("Error clearing API key:", error);
  }
}

// Function to get the API URL from cookies or Vite env
export function getApiUrl(): string {
  try {
    // Only attempt to get from cookies on client side
    if (typeof window !== 'undefined') {
      // Direct approach to get a specific cookie
      const match = document.cookie.match(/(^|;)\s*vexa_api_url\s*=\s*([^;]+)/);
      const cookieValue = match ? decodeURIComponent(match[2]) : '';
      if (cookieValue) {
        console.log("Found API URL in cookies:", cookieValue);
        return cookieValue;
      }
    }
    // Use Vite environment variable
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_VEXA_API_URL) {
      const envUrl = import.meta.env.VITE_VEXA_API_URL;
      if (envUrl) {
        //console.log("Using API URL from Vite env:", envUrl);
        return envUrl;
      }
    }
    // Final fallback to default URL
    const defaultUrl = "https://devapi.dev.vexa.ai";
    //console.log("Using default API URL:", defaultUrl);
    return defaultUrl;
  } catch (error) {
    console.error("Error getting API URL:", error);
    return "https://devapi.dev.vexa.ai";
  }
}

// Function to set the API URL in cookies
export function setApiUrl(url: string): void {
  try {
    if (typeof window !== 'undefined') {
      // Set a cookie that expires in 30 days
      const days = 30;
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

      // Simplified cookie setting with no spaces
      document.cookie = `vexa_api_url=${encodeURIComponent(url)};expires=${date.toUTCString()};path=/`;

      // Immediately verify the cookie was set
      setTimeout(() => {
        const isSet = document.cookie.includes('vexa_api_url=');
        //console.log(`API URL cookie set: ${isSet}`);
      }, 10);
    }
  } catch (error) {
    console.error("Error setting API URL:", error);
  }
}

// Function to clear the API URL from cookies
export function clearApiUrl(): void {
  try {
    if (typeof window !== 'undefined') {
      document.cookie = 'vexa_api_url=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      //console.log("API URL cookie cleared");
    }
  } catch (error) {
    console.error("Error clearing API URL:", error);
  }
}

// Function to get headers with Vexa API key - with extra logging
export function getHeaders() {
  // Get the API key
  const apiKey = getApiKey();
  
  // Add extensive logging
  //console.log("Building API headers");
  //console.log("Has API key:", !!apiKey);
  // if (apiKey) {
  //   // Only log part of the key for security
  //   //console.log("API key starts with:", apiKey.substring(0, 4));
  // }
  
  // Create headers with mandatory fields
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey
  };
  
  // Log what's being sent
  //console.log("Headers being sent:", JSON.stringify(headers));
  
  return headers;
}

/**
 * Start a new transcription session by adding a bot to a meeting
 * @param meetingUrl The URL of the meeting to transcribe
 * @param language The language code (e.g., 'en', 'es'), or 'auto' for auto-detection
 * @param botName Optional name for the bot that will appear in the meeting
 */
export async function startTranscription(
  meetingUrl: string,
  language = "auto",
  botName = "Vexa",
): Promise<{ success: boolean; meetingId: string }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API delay

    const meetingId = `mock-meeting-${Date.now()}`

    // Initialize mock transcription data
    mockTranscriptionData[meetingId] = {
      meetingId,
      language: language === "auto" ? "auto-detected" : language,
      segments: [...mockSegments], // Copy initial mock segments
      status: "active",
      lastUpdated: new Date().toISOString(),
    }

    return {
      success: true,
      meetingId,
    }
  }

  // Real API implementation using Vexa API
  try {
    // Parse the meeting URL to get platform and native meeting ID
    const { platform, nativeMeetingId, passcode } = parseMeetingUrl(meetingUrl)
    
    // Build request payload for /bots endpoint
    const requestPayload: any = {
      platform,
      native_meeting_id: nativeMeetingId,
      bot_name: botName,
      language: language === "auto" ? null : language,
    }

    // Add passcode for Teams meetings if present
    if (platform === "teams" && passcode) {
      requestPayload.passcode = passcode
    }

     const response = await fetch(`${getApiBaseUrl()}/bots`, {
       method: "POST",
       headers: getHeaders(),
       body: JSON.stringify(requestPayload),
     })
     
     // Some gateways return 202 with no body; attempt to read but tolerate failures
     let postData: any = null
     try {
       postData = await handleApiResponse<any>(response)
     } catch (e) {
       // ignore; we'll discover the meeting via /meetings shortly
     }

     // After starting the bot, discover the internal meeting id so we can subscribe via WebSocket
     // We look it up by platform + native_meeting_id
     try {
       const meetingsRes = await fetch(`${getApiBaseUrl()}/meetings`, {
         method: "GET",
         headers: getHeaders(),
       })
       const meetingsData = await handleApiResponse<any>(meetingsRes)
       const matched = (meetingsData?.meetings || []).find((m: any) =>
         m?.platform === platform && m?.native_meeting_id === nativeMeetingId
       )

       if (matched?.id != null) {
         //console.log(`Found internal meeting ID: ${matched.id} for ${platform}/${nativeMeetingId}`)
         return {
           success: true,
           meetingId: `${platform}/${nativeMeetingId}/${matched.id}`,
         }
       }
     } catch (e) {
       // If lookup fails, fall back to two-part id
       console.warn("Failed to look up internal meeting id after starting bot; falling back", e)
     }

     // Fallback: return two-part id so polling still works (WS will be skipped)
     console.log(`Using fallback meeting ID format: ${platform}/${nativeMeetingId}`)
     return {
       success: true,
       meetingId: `${platform}/${nativeMeetingId}`,
     }
  } catch (error) {
    console.error("Error starting transcription:", error)
    throw error
  }
}

/**
 * Stop an active transcription session
 * @param meetingId The ID of the meeting to stop transcribing
 */
export async function stopTranscription(meetingId: string): Promise<{ success: boolean }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API delay

    // Update mock data status
    if (mockTranscriptionData[meetingId]) {
      mockTranscriptionData[meetingId].status = "stopped"
    }

    return {
      success: true,
    }
  }

  // Real API implementation using Vexa API
  try {
    // The meetingId should be in the format "platform/nativeMeetingId"
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];
    const internalIdForCurrent = parts.length >= 3 ? parts[2] : null
    // internal meeting id not required for stop endpoint; ignore third part here

    const response = await fetch(`${getApiBaseUrl()}/bots/${platform}/${nativeMeetingId}`, {
      method: "DELETE",
      headers: getHeaders(),
    })

    await handleApiResponse<any>(response)

    return {
      success: true,
    }
  } catch (error) {
    console.error("Error stopping transcription:", error)
    throw error
  }
}

/**
 * Update the language configuration for an ongoing transcription session
 * @param meetingId The ID of the meeting to update
 * @param language The new language code (e.g., 'en', 'es', 'fr', 'de', etc.)
 */
export async function updateTranscriptionLanguage(meetingId: string, language: string): Promise<{ success: boolean }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 1000)) // Simulate API delay

    // Update mock data language
    if (mockTranscriptionData[meetingId]) {
      mockTranscriptionData[meetingId].language = language;
    }

    return {
      success: true,
    }
  }

  // Real API implementation using Vexa API
  try {
    // The meetingId should be in the format "platform/nativeMeetingId"
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];

    const updateConfigUrl = `${getApiBaseUrl()}/bots/${platform}/${nativeMeetingId}/config`;
    const updatePayload = {
      language: language === "auto" ? null : language
    };

    const response = await fetch(updateConfigUrl, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(updatePayload),
    });

    await handleApiResponse<any>(response);

    return {
      success: true,
    }
  } catch (error) {
    console.error("Error updating transcription language:", error)
    throw error
  }
}

/**
 * Get the current transcription data for a meeting
 * @param meetingId The ID of the meeting
 */
export async function getTranscription(meetingId: string): Promise<TranscriptionData> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate API delay

    // If this meeting doesn't exist in our mock data, create it
    if (!mockTranscriptionData[meetingId]) {
      mockTranscriptionData[meetingId] = {
        meetingId,
        language: "en",
        segments: [...mockSegments], // Copy initial mock segments
        status: "active",
        lastUpdated: new Date().toISOString(),
      }
    }

    // Add a new segment occasionally to simulate real-time updates
    if (Math.random() > 0.5 && mockTranscriptionData[meetingId].status === "active") {
      const newSegment = {
        id: `segment-${Date.now()}`,
        text: `This is a new transcription segment generated at ${new Date().toLocaleTimeString()}.`,
        timestamp: new Date().toISOString(),
        speaker: Math.random() > 0.5 ? "John" : Math.random() > 0.5 ? "Sarah" : "Michael",
      }

      mockTranscriptionData[meetingId].segments.push(newSegment)
      mockTranscriptionData[meetingId].lastUpdated = new Date().toISOString()
    }

    return { ...mockTranscriptionData[meetingId] }
  }

  // Real API implementation using Vexa API
  try {
    //console.log("getTranscription called with meetingId:", meetingId);
    
    // The meetingId can be in format "platform/nativeMeetingId" or "platform/nativeMeetingId/id"
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];
    const internalIdForCurrent = parts.length >= 3 ? parts[2] : null
    
    console.log(`Fetching transcript for platform=${platform}, nativeMeetingId=${nativeMeetingId}${internalIdForCurrent ? `, meeting_id=${internalIdForCurrent}` : ''}`);

    const transcriptUrl = `${getApiBaseUrl()}/transcripts/${platform}/${nativeMeetingId}` + (internalIdForCurrent ? `?meeting_id=${encodeURIComponent(internalIdForCurrent)}` : '')
    const response = await fetch(transcriptUrl, {
      method: "GET",
      headers: getHeaders(),
    })

    console.log("Transcript API response status:", response.status);
    
    const data = await handleApiResponse<any>(response)
    console.log("Transcript API data received:", JSON.stringify(data).substring(0, 200) + "...");
    
    // Check if data contains segments directly
    if (!data.segments && !data.transcript) {
      console.error("API response missing segments data:", data);
      throw new Error("API response missing segments data");
    }

    // Get segments from the correct location in the response
    const segmentsFromApi = data.segments || (data.transcript ? data.transcript.segments : []) || [];
    console.log(`Found ${segmentsFromApi.length} segments in API response`);

    // Transform the Vexa API response into our TranscriptionData format
    const segments: TranscriptionSegment[] = segmentsFromApi.map((segment: any) => {
      const segmentText = segment.text || "";
      const timestamp = segment.absolute_start_time || segment.timestamp || new Date().toISOString();
      const stableId = `${timestamp}-${segmentText.slice(0, 20).replace(/\s+/g, '-')}`;
      
      return {
        id: stableId,
        text: segmentText,
        timestamp: timestamp,
        speaker: segment.speaker || "Unknown",
        language: segment.language,
      };
    });
    
    let overallLanguage = data.language || "auto";
    if (segments.length > 0) {
      const lastSegmentWithLanguage = [...segments].reverse().find(s => s.language);
      if (lastSegmentWithLanguage?.language) {
        overallLanguage = lastSegmentWithLanguage.language;
      }
    }

    return {
      meetingId,
      language: overallLanguage,
      segments,
      status: data.status || "active",
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Error getting transcription:", error)
    throw error
  }
}

/**
 * Get the full transcript for a meeting (all segments combined)
 * @param meetingId The ID of the meeting
 */
export async function getFullTranscript(
  meetingId: string,
): Promise<{ text: string; segments: TranscriptionSegment[] }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API delay

    // If this meeting doesn't exist in our mock data, return empty
    if (!mockTranscriptionData[meetingId]) {
      return {
        text: "",
        segments: [],
      }
    }

    // Combine all segment texts
    const text = mockTranscriptionData[meetingId].segments.map((segment) => segment.text).join(" ")

    return {
      text,
      segments: [...mockTranscriptionData[meetingId].segments],
    }
  }

  // Real API implementation using Vexa API
  try {
    // The meetingId should be in the format "platform/nativeMeetingId/id"
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];

    // Get the latest transcript data
    const transcriptionData = await getTranscription(meetingId)
    
    // Combine all segment texts
    const text = transcriptionData.segments.map(segment => segment.text).join(" ")

    return {
      text,
      segments: transcriptionData.segments,
    }
  } catch (error) {
    console.error("Error getting full transcript:", error)
    throw error
  }
}

/**
 * Get a list of all meetings
 */
export async function getMeetingHistory(): Promise<Meeting[]> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API delay
    return [...mockMeetings]
  }

  // Real API implementation using Vexa API
  try {
    const response = await fetch(`${getApiBaseUrl()}/meetings`, {
      method: "GET",
      headers: getHeaders(),
    })

    const data = await handleApiResponse<any>(response)

    // Transform the API response to our Meeting interface
    return data.meetings.map((meeting: any) => ({
      id: `${meeting.platform}/${meeting.native_meeting_id}/${meeting.id}`,
      platformId: meeting.platform,
      nativeMeetingId: meeting.native_meeting_id,
      platform: meeting.platform,
      status: meeting.status || "completed",
      startTime: meeting.start_time || new Date().toISOString(),
      endTime: meeting.end_time,
      title: meeting.data?.name || `Meeting ${meeting.native_meeting_id}`,
      name: meeting.data?.name,
      participants: meeting.data?.participants,
      languages: meeting.data?.languages,
      data: meeting.data
    }));
  } catch (error) {
    console.error("Error getting meeting history:", error)
    throw error
  }
}

/**
 * Get a specific meeting's transcript without polling (for history view)
 * @param meetingId The ID of the meeting to get the transcript for
 */
export async function getMeetingTranscript(meetingId: string): Promise<TranscriptionData> {
  // This is similar to getTranscription but without adding new simulated segments in mock mode
  
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API delay

    // If this meeting doesn't exist in our mock data, create it with mock segments
    if (!mockTranscriptionData[meetingId]) {
      // Find the mock meeting by ID
      const mockMeeting = mockMeetings.find(m => m.id === meetingId);
      
      if (mockMeeting) {
        // Create mock transcript for this meeting
        mockTranscriptionData[meetingId] = {
          meetingId,
          language: "en",
          segments: [...mockSegments], // Use the mock segments
          status: mockMeeting.status,
          lastUpdated: mockMeeting.endTime || new Date().toISOString(),
        }
      } else {
        // Create a generic mock transcript if meeting not found
        mockTranscriptionData[meetingId] = {
          meetingId,
          language: "en",
          segments: [...mockSegments],
          status: "stopped",
          lastUpdated: new Date().toISOString(),
        }
      }
    }

    return { ...mockTranscriptionData[meetingId] }
  }

  // Real API implementation using Vexa API
  try {
    console.log("getMeetingTranscript called with meetingId:", meetingId);
    
    // Check if the meetingId is already in the format "platform/nativeMeetingId" or "platform/nativeMeetingId/id"
    let platform, nativeMeetingId;
    
    const parts = meetingId.split('/');
    if (parts.length >= 2) {
      platform = parts[0];
      nativeMeetingId = parts[1];
      console.log(`Using platform=${platform}, nativeMeetingId=${nativeMeetingId} from meetingId`);
    } else {
      // Try to fetch meeting details to get platform and nativeMeetingId
      console.log("Invalid meeting ID format, trying to fetch meeting details");
      const meetings = await getMeetingHistory();
      const meeting = meetings.find(m => m.id === meetingId);
      
      if (meeting) {
        platform = meeting.platform;
        nativeMeetingId = meeting.nativeMeetingId;
        console.log(`Found meeting in history, using platform=${platform}, nativeMeetingId=${nativeMeetingId}`);
      } else {
        throw new Error("Meeting not found")
      }
    }
    
    if (!platform || !nativeMeetingId) {
      throw new Error("Invalid meeting ID format")
    }

    const partsHist = meetingId.split('/')
    const internalIdForHistory = partsHist.length >= 3 ? partsHist[2] : null
    console.log(`Fetching transcript for platform=${platform}, nativeMeetingId=${nativeMeetingId}${internalIdForHistory ? `, meeting_id=${internalIdForHistory}` : ''}`);
    const transcriptUrlHistory = `${getApiBaseUrl()}/transcripts/${platform}/${nativeMeetingId}` + (internalIdForHistory ? `?meeting_id=${encodeURIComponent(internalIdForHistory)}` : '')
    const response = await fetch(transcriptUrlHistory, {
      method: "GET",
      headers: getHeaders(),
    })

    console.log("Transcript API response status:", response.status);
    const data = await handleApiResponse<any>(response)
    console.log("Transcript API data received:", JSON.stringify(data).substring(0, 200) + "...");

    // Check if data contains segments directly
    if (!data.segments && !data.transcript) {
      console.error("API response missing segments data:", data);
      throw new Error("API response missing segments data");
    }

    // Get segments from the correct location in the response
    const segmentsFromApi = data.segments || (data.transcript ? data.transcript.segments : []) || [];
    console.log(`Found ${segmentsFromApi.length} segments in API response`);

    // Transform the Vexa API response into our TranscriptionData format
    const segments: TranscriptionSegment[] = segmentsFromApi.map((segment: any) => {
        // Create a deterministic ID based on the text and timestamp
        // This ensures we can properly detect duplicates
        const segmentText = segment.text || "";
        const timestamp = segment.absolute_start_time || segment.timestamp || new Date().toISOString();
        const stableId = `${timestamp}-${segmentText.slice(0, 20).replace(/\s+/g, '-')}`;
        
        return {
          id: stableId,
          text: segmentText,
          timestamp: timestamp,
          speaker: segment.speaker || "Unknown",
          language: segment.language,
        };
      });
      
    let overallLanguage = data.language || "en";
    if (segments.length > 0) {
      const lastSegmentWithLanguage = [...segments].reverse().find(s => s.language);
      if (lastSegmentWithLanguage?.language) {
        overallLanguage = lastSegmentWithLanguage.language;
      }
    }

    // Transform the Vexa API response into our TranscriptionData format
    return {
      meetingId,
      language: overallLanguage,
      segments,
      status: "stopped", // Historical view always shows as stopped
      lastUpdated: new Date().toISOString(),
    }
  } catch (error) {
    console.error("Error getting meeting transcript:", error)
    throw error
  }
}

/**
 * Update meeting metadata (name, participants, languages, notes)
 * @param meetingId The ID of the meeting to update (platform/nativeMeetingId/id format)
 * @param data The data to update (name, participants, languages, notes)
 */
export async function updateMeetingData(
  meetingId: string, 
  data: {
    name?: string
    participants?: string[]
    languages?: string[]
    notes?: string
  }
): Promise<{ success: boolean }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate API delay
    
    // Find the mock meeting and update it
    const meetingIndex = mockMeetings.findIndex(m => m.id === meetingId);
    if (meetingIndex !== -1) {
      mockMeetings[meetingIndex] = {
        ...mockMeetings[meetingIndex],
        title: data.name || mockMeetings[meetingIndex].title,
        name: data.name,
        participants: data.participants,
        languages: data.languages,
        data: {
          ...mockMeetings[meetingIndex].data,
          ...data
        }
      };
    }
    
    return { success: true }
  }

  // Real API implementation using Vexa API
  try {
    // Parse meetingId to get platform and nativeMeetingId
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];

    const response = await fetch(`${getApiBaseUrl()}/meetings/${platform}/${nativeMeetingId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ data })
    })

    await handleApiResponse<any>(response)
    return { success: true }
  } catch (error) {
    console.error("Error updating meeting data:", error)
    throw error
  }
}

/**
 * Delete a meeting and all its associated transcripts
 * @param meetingId The ID of the meeting to delete (platform/nativeMeetingId/id format)
 */
export async function deleteMeeting(meetingId: string): Promise<{ success: boolean }> {
  // Use mock implementation if in mock mode
  if (MOCK_MODE) {
    await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate API delay
    
    // Remove the mock meeting
    const meetingIndex = mockMeetings.findIndex(m => m.id === meetingId);
    if (meetingIndex !== -1) {
      mockMeetings.splice(meetingIndex, 1);
    }
    
    // Remove associated transcript data
    delete mockTranscriptionData[meetingId];
    
    return { success: true }
  }

  // Real API implementation using Vexa API
  try {
    // Parse meetingId to get platform and nativeMeetingId
    const parts = meetingId.split('/');
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format")
    }
    
    const platform = parts[0];
    const nativeMeetingId = parts[1];

    const response = await fetch(`${getApiBaseUrl()}/meetings/${platform}/${nativeMeetingId}`, {
      method: "DELETE",
      headers: getHeaders()
    })

    await handleApiResponse<any>(response)
    return { success: true }
   } catch (error) {
     console.error("Error deleting meeting:", error)
     throw error
   }
 }

/**
 * Start WebSocket connection for real-time transcription updates
 * @param meetingId The internal meeting ID (number) to subscribe to
 * @param onTranscriptMutable Callback for mutable transcript updates
 * @param onTranscriptFinalized Callback for finalized transcript updates
 * @param onMeetingStatus Callback for meeting status changes
 * @param onError Callback for errors
 * @param onConnected Callback when WebSocket connects
 * @param onDisconnected Callback when WebSocket disconnects
 */
export async function startWebSocketTranscription(
  meetingId: string | { platform: string; native_id: string },
  onTranscriptMutable: (segments: TranscriptionSegment[]) => void,
  onTranscriptFinalized: (segments: TranscriptionSegment[]) => void,
  onMeetingStatus: (status: string) => void,
  onError: (error: string) => void,
  onConnected: () => void,
  onDisconnected: () => void
): Promise<void> {
  if (MOCK_MODE) {
    // Simulate connection
    setTimeout(() => {
      if (typeof onConnected === 'function') onConnected();
      if (typeof onMeetingStatus === 'function') onMeetingStatus('active');
    }, 1000);
    // Simulate transcript events every 2 seconds
    let count = 0;
    const creativeFeedbacks = [
      { speaker: "KJ", text: "The lighting on this shot looks great, but I think the shadows could be softer." },
      { speaker: "BH", text: "Agreed, maybe the artist can try a different falloff on the key light?" },
      { speaker: "CR", text: "I'll make a note to ask for a softer shadow pass." },
      { speaker: "KJ", text: "The character's expression is much improved from the last version." },
      { speaker: "BH", text: "Yes, but the hand movement still feels a bit stiff." },
      { speaker: "CR", text: "Should we suggest a reference for more natural hand motion?" },
      { speaker: "KJ", text: "Let's approve the background, but request tweaks on the character animation." },
      { speaker: "BH", text: "I'll mark the background as finalled in ShotGrid." },
      { speaker: "CR", text: "I'll send the artist a note about the animation feedback." },
      { speaker: "KJ", text: "The color grade is close, but the highlights are a bit too hot." },
      { speaker: "BH", text: "Maybe ask the artist to bring down the highlight gain by 10%." },
      { speaker: "CR", text: "Noted, I'll include that in the feedback summary." },
      { speaker: "KJ", text: "Great progress overall, just a few minor notes for the next version." },
      { speaker: "BH", text: "Let's target final for the next review if these are addressed." },
      { speaker: "CR", text: "I'll communicate the action items and next steps to the artist." }
    ];
    // Accumulate all segments as in real WebSocket
    const allSegments: any[] = [];
    const interval = setInterval(() => {
      const feedback = creativeFeedbacks[count % creativeFeedbacks.length];
      const now = new Date();
      const absStart = new Date(now.getTime() - 1000).toISOString();
      const absEnd = now.toISOString();
      const updatedAt = new Date(now.getTime() + 8000).toISOString();
      const segment = {
        id: `mock-${Date.now()}`,
        text: feedback.text,
        speaker: feedback.speaker,
        language: 'en',
        absolute_start_time: absStart,
        absolute_end_time: absEnd,
        timestamp: absStart,
        updated_at: updatedAt
      };
      allSegments.push(segment);
      // Simulate real WebSocket payload structure
      if (typeof onTranscriptMutable === 'function') onTranscriptMutable([...allSegments]);
      // Simulate finalized every 3 segments
      if ((count + 1) % 3 === 0) {
        if (typeof onTranscriptFinalized === 'function') onTranscriptFinalized([...allSegments]);
      }
      count++;
      // Simulate meeting completion after 100 segments
      if (count === 100) {
        if (typeof onMeetingStatus === 'function') onMeetingStatus('completed');
        clearInterval(interval);
        setTimeout(() => {
          if (typeof onDisconnected === 'function') onDisconnected();
        }, 500);
      }
    }, 2000);
    return;
  }

  const wsService = getWebSocketService()

  // Convert meetingId to the format needed for segment conversion
  const meetingIdString = typeof meetingId === 'string' ? meetingId : `${meetingId.platform}/${meetingId.native_id}`

  // Set up event handlers
  wsService.setOnTranscriptMutable((event: TranscriptMutableEvent) => {
    // console.log("🟢 [TRANSCRIPTION SERVICE] Received transcript.mutable:", event);
    // console.log("🟢 [TRANSCRIPTION SERVICE] Event payload:", event.payload);
    // console.log("🟢 [TRANSCRIPTION SERVICE] Event payload keys:", event.payload ? Object.keys(event.payload) : "null");
    try {
      // Check if payload contains segments array
      if (event.payload?.segments && Array.isArray(event.payload.segments)) {
        // console.log("🟢 [TRANSCRIPTION SERVICE] Found segments array with", event.payload.segments.length, "segments");
        // Convert each segment in the array
        const convertedSegments = event.payload.segments.map((segmentData: any) => {
          return convertWebSocketSegment(segmentData);
        });
        // console.log("🟢 [TRANSCRIPTION SERVICE] Converted", convertedSegments.length, "segments");
        onTranscriptMutable(convertedSegments);
        return;
      }
      // Try different possible locations for single segment data
      let segmentData: any = null;
      if (event.payload?.segment) {
        segmentData = event.payload.segment;
        // console.log("🟢 [TRANSCRIPTION SERVICE] Found single segment in payload.segment");
      } else if (event.payload) {
        segmentData = event.payload;
        // console.log("🟢 [TRANSCRIPTION SERVICE] Using payload as single segment data");
      } else if ((event as any).segment) {
        segmentData = (event as any).segment;
        // console.log("🟢 [TRANSCRIPTION SERVICE] Found single segment directly in event");
      } else {
        // console.error("🟢 [TRANSCRIPTION SERVICE] No segment data found in event");
        // console.log("🟢 [TRANSCRIPTION SERVICE] Full event structure:", JSON.stringify(event, null, 2));
        return;
      }
      const segment = convertWebSocketSegment(segmentData, meetingId.toString())
      onTranscriptMutable([segment])
    } catch (error) {
      // console.error("🟢 [TRANSCRIPTION SERVICE] Error processing transcript.mutable:", error);
      // console.error("🟢 [TRANSCRIPTION SERVICE] Event structure:", event);
    }
  })

  wsService.setOnTranscriptFinalized((event: TranscriptFinalizedEvent) => {
    // console.log("🔵 [TRANSCRIPTION SERVICE] Received transcript.finalized:", event);
    // console.log("🔵 [TRANSCRIPTION SERVICE] Event payload:", event.payload);
    // console.log("🔵 [TRANSCRIPTION SERVICE] Event payload keys:", event.payload ? Object.keys(event.payload) : "null");
    try {
      // Check if payload contains segments array
      if (event.payload?.segments && Array.isArray(event.payload.segments)) {
        // console.log("🔵 [TRANSCRIPTION SERVICE] Found segments array with", event.payload.segments.length, "segments");
        // Convert each segment in the array
        const convertedSegments = event.payload.segments.map((segmentData: any) => {
          return convertWebSocketSegment(segmentData);
        });
        // console.log("🔵 [TRANSCRIPTION SERVICE] Converted", convertedSegments.length, "segments");
        onTranscriptFinalized(convertedSegments);
        return;
      }
      // Try different possible locations for single segment data
      let segmentData: any = null;
      if (event.payload?.segment) {
        segmentData = event.payload.segment;
        // console.log("🔵 [TRANSCRIPTION SERVICE] Found single segment in payload.segment");
      } else if (event.payload) {
        segmentData = event.payload;
        // console.log("🔵 [TRANSCRIPTION SERVICE] Using payload as single segment data");
      } else if ((event as any).segment) {
        segmentData = (event as any).segment;
        // console.log("🔵 [TRANSCRIPTION SERVICE] Found single segment directly in event");
      } else {
        // console.error("🔵 [TRANSCRIPTION SERVICE] No segment data found in event");
        // console.log("🔵 [TRANSCRIPTION SERVICE] Full event structure:", JSON.stringify(event, null, 2));
        return;
      }
      const segment = convertWebSocketSegment(segmentData, meetingId.toString())
      onTranscriptFinalized([segment])
    } catch (error) {
      // console.error("🔵 [TRANSCRIPTION SERVICE] Error processing transcript.finalized:", error);
      // console.error("🔵 [TRANSCRIPTION SERVICE] Event structure:", event);
    }
  })

  wsService.setOnMeetingStatus((event: MeetingStatusEvent) => {
    // console.log("🟡 [TRANSCRIPTION SERVICE] Received meeting.status:", event);
    try {
      onMeetingStatus(event.payload?.status || "unknown")
    } catch (error) {
      // console.error("🟡 [TRANSCRIPTION SERVICE] Error processing meeting.status:", error);
      // console.error("🟡 [TRANSCRIPTION SERVICE] Event structure:", event);
    }
  })

  wsService.setOnError((event) => {
    onError(event.error)
  })

  wsService.setOnConnected(onConnected)
  wsService.setOnDisconnected(onDisconnected)

  // Connect and subscribe
  await wsService.connect()
  
  // Convert meetingId to platform/native_id format if it's a string
  let subscriptionMeeting: { platform: string; native_id: string }
  if (typeof meetingId === 'string') {
    // Parse string format "platform/native_id" or "platform/native_id/internal_id"
    const parts = meetingId.split('/')
    if (parts.length < 2) {
      throw new Error("Invalid meeting ID format for WebSocket subscription. Expected format: 'platform/native_id'")
    }
    subscriptionMeeting = { platform: parts[0], native_id: parts[1] }
  } else {
    // Already in correct format
    subscriptionMeeting = meetingId
  }
  
  await wsService.subscribeToMeeting(subscriptionMeeting)
}

/**
 * Stop WebSocket connection for a meeting
 * @param meetingId The meeting ID to unsubscribe from
 */
export async function stopWebSocketTranscription(meetingId: string | { platform: string; native_id: string }): Promise<void> {
  const wsService = getWebSocketService()
  
  if (wsService.isConnected()) {
    // Convert meetingId to platform/native_id format if it's a string
    let subscriptionMeeting: { platform: string; native_id: string }
    if (typeof meetingId === 'string') {
      // Parse string format "platform/native_id" or "platform/native_id/internal_id"
      const parts = meetingId.split('/')
      if (parts.length < 2) {
        throw new Error("Invalid meeting ID format for WebSocket unsubscription. Expected format: 'platform/native_id'")
      }
      subscriptionMeeting = { platform: parts[0], native_id: parts[1] }
    } else {
      // Already in correct format
      subscriptionMeeting = meetingId
    }
    
    await wsService.unsubscribeFromMeeting(subscriptionMeeting)
  }
  
  // If no more meetings are subscribed, disconnect
  const subscribedMeetings = wsService.getSubscribedMeetings()
  if (subscribedMeetings.length === 0) {
    wsService.disconnect()
  }
}

/**
 * Get WebSocket connection status
 */
export function getWebSocketStatus(): { connected: boolean; subscribedMeetings: string[] } {
  const wsService = getWebSocketService()
  return {
    connected: wsService.isConnected(),
    subscribedMeetings: wsService.getSubscribedMeetings()
  }
}

// Utility: Clean text
export const cleanText = (text: string) => {
  if (!text) return ""
  return text.trim().replace(/\s+/g, " ")
}

// Utility: Key by absolute_start_time
export const getAbsKey = (segment: any) => {
  return segment.absolute_start_time || segment.timestamp || segment.created_at || `no-utc-${segment.id || ''}`
}

// Utility: Merge segments by absolute UTC
export const mergeByAbsoluteUtc = (prev: any[], incoming: any[]) => {
  const map = new Map()
  for (const s of prev) {
    const key = getAbsKey(s)
    if (key.startsWith('no-utc-')) continue
    map.set(key, { ...s, text: cleanText(s.text) })
  }
  for (const s of incoming) {
    if (!s.absolute_start_time) continue
    const key = getAbsKey(s)
    if (key.startsWith('no-utc-')) continue
    const existing = map.get(key)
    const candidate = { ...s, text: cleanText(s.text) }
    if (existing && existing.updated_at && candidate.updated_at) {
      if (candidate.updated_at < existing.updated_at) continue
    }
    map.set(key, candidate)
  }
  return Array.from(map.values()).sort((a, b) => {
    const at = new Date(a.absolute_start_time || a.timestamp).getTime()
    const bt = new Date(b.absolute_start_time || b.timestamp).getTime()
    return at - bt
  })
}

// Split long text into chunks without breaking sentences
export function splitTextIntoSentenceChunks(text: string, maxLen: number): string[] {
  const normalized = (text || "").trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLen) return [normalized]
  // Split into sentences on punctuation boundaries. Keep punctuation.
  const sentences = normalized.split(/(?<=[.!?])\s+/)
  if (sentences.length === 1) {
    // Single long sentence: return as one chunk to avoid breaking the sentence
    return [normalized]
  }
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (current.length === 0) {
      if (sentence.length > maxLen) {
        chunks.push(sentence)
      } else {
        current = sentence
      }
    } else if (current.length + 1 + sentence.length <= maxLen) {
      current = current + ' ' + sentence
    } else {
      chunks.push(current)
      if (sentence.length > maxLen) {
        chunks.push(sentence)
        current = ''
      } else {
        current = sentence
      }
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export interface SpeakerGroup {
  speaker: string
  startTime: string
  endTime: string
  combinedText: string
  segments: any[]
  isMutable: boolean
  isHighlighted: boolean
  timestamp?: string // Added for HH:MM:SS formatted time
}

// Group consecutive segments by speaker and combine text
export function groupSegmentsBySpeaker(
  segments: any[],
  mutableSegmentIds: Set<string> = new Set(),
  newMutableSegmentIds: Set<string> = new Set()
): SpeakerGroup[] {
  if (!segments || segments.length === 0) return []
  // Sort segments by absolute UTC
  const sorted = [...segments].sort((a, b) => {
    const aUtc = a.absolute_start_time || a.timestamp
    const bUtc = b.absolute_start_time || b.timestamp
    const aHasUtc = !!a.absolute_start_time
    const bHasUtc = !!b.absolute_start_time
    if (aHasUtc && !bHasUtc) return -1
    if (!aHasUtc && bHasUtc) return 1
    const at = new Date(aUtc).getTime()
    const bt = new Date(bUtc).getTime()
    return at - bt
  })
  const groups: SpeakerGroup[] = []
  let current: SpeakerGroup | null = null
  for (const seg of sorted) {
    const speaker = seg.speaker || 'Unknown Speaker'
    const text = cleanText(seg.text)
    const startTime = seg.absolute_start_time || seg.timestamp
    const endTime = seg.absolute_end_time || seg.timestamp
    const segKey = getAbsKey(seg)
    const segIsMutable = mutableSegmentIds.has(segKey)
    const segIsHighlighted = newMutableSegmentIds.has(segKey)
    if (!text) continue
    if (current && current.speaker === speaker) {
      current.combinedText += ' ' + text
      current.endTime = endTime
      current.segments.push(seg)
      current.isMutable = current.isMutable || segIsMutable
      current.isHighlighted = current.isHighlighted || segIsHighlighted
    } else {
      if (current) groups.push(current)
      current = {
        speaker,
        startTime,
        endTime,
        combinedText: text,
        segments: [seg],
        isMutable: segIsMutable,
        isHighlighted: segIsHighlighted
      }
    }
  }
  if (current) groups.push(current)
  // Split long combinedText into chunks for readability (max 512 chars)
  const MAX_CHARS = 512
  const splitGroups: SpeakerGroup[] = []
  for (const g of groups) {
    const chunks = splitTextIntoSentenceChunks(g.combinedText, MAX_CHARS)
    // Format timestamp as HH:MM:SS in local timezone from absolute_start_time
    let timestamp = '';
    if (g.startTime) {
      try {
        const date = new Date(g.startTime);
        if (!isNaN(date.getTime())) {
          // Format as HH:MM:SS in local time
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          timestamp = `${hours}:${minutes}:${seconds}`;
        }
      } catch {}
    }
    if (chunks.length <= 1) {
      splitGroups.push({ ...g, timestamp });
    } else {
      for (const chunk of chunks) {
        splitGroups.push({
          speaker: g.speaker,
          startTime: g.startTime,
          endTime: g.endTime,
          combinedText: chunk,
          segments: g.segments,
          isMutable: g.isMutable,
          isHighlighted: g.isHighlighted,
          timestamp
        })
      }
    }
  }
  return splitGroups
}

// Process segments: convert, sort, and group by speaker
export function processSegments(segments: any[]): SpeakerGroup[] {
  // Sort segments by absolute_start_time (if it exists)
  //console.log('processSegments: receiving', segments)
  const sortedSegments = segments
    .filter(s => s.absolute_start_time)
    .sort((a, b) => {
      if (a.absolute_start_time < b.absolute_start_time) return -1;
      if (a.absolute_start_time > b.absolute_start_time) return 1;
      return 0;
    });
  //console.log('sortedSegments', sortedSegments)
  // Group by speaker using sortedSegments
  return groupSegmentsBySpeaker(sortedSegments);
}
