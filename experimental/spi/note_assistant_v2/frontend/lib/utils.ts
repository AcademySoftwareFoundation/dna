import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract meeting ID and platform from URL
 * @param url The meeting URL (e.g., https://meet.google.com/xxx-xxxx-xxx or https://teams.live.com/meet/9327884808517?p=zCmPHnrCLiXtY5atOp)
 * @returns Object containing platform, nativeMeetingId, and passcode (for Teams)
 */
export function parseMeetingUrl(url: string): { platform: string; nativeMeetingId: string; passcode?: string } {
  try {
    const urlObj = new URL(url)
    
    // Handle Google Meet URLs
    if (urlObj.hostname === "meet.google.com") {
      // Extract meeting ID from URL path
      const meetingId = urlObj.pathname.substring(1) // Remove leading slash
      return { platform: "google_meet", nativeMeetingId: meetingId }
    }
    
    // Handle Microsoft Teams URLs
    if (urlObj.hostname === "teams.live.com" || urlObj.hostname === "teams.microsoft.com") {
      // Extract meeting ID from URL path using regex
      const meetIdMatch = url.match(/\/meet\/(\d+)/)
      if (!meetIdMatch) {
        throw new Error("Invalid Teams URL format. Could not extract meeting ID.")
      }
      
      const nativeMeetingId = meetIdMatch[1]
      
      // Extract passcode from query parameter if present
      const passcodeMatch = url.match(/\?p=([^&]+)/)
      const passcode = passcodeMatch ? passcodeMatch[1] : undefined
      
      return { 
        platform: "teams", 
        nativeMeetingId,
        passcode
      }
    }
    
    throw new Error("Unsupported meeting platform. Currently only Google Meet and Microsoft Teams are supported.")
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error("Invalid meeting URL. Please provide a valid Google Meet or Teams URL.")
  }
}
