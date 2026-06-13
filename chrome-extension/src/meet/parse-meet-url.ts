export interface ParsedMeetUrl {
  platform: 'google_meet';
  meetingId: string;
}

export function parseMeetUrl(url: string): ParsedMeetUrl | null {
  const trimmed = url.trim();

  const fullMatch = trimmed.match(
    /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i,
  );
  if (fullMatch) {
    return {
      platform: 'google_meet',
      meetingId: fullMatch[1].toLowerCase(),
    };
  }

  if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(trimmed)) {
    return {
      platform: 'google_meet',
      meetingId: trimmed.toLowerCase(),
    };
  }

  return null;
}
