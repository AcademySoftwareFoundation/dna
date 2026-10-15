import type { Platform } from '@dna/core';

export interface ParsedMeetingUrl {
  platform: Platform;
  meetingId: string;
  /** Passcode embedded in the link itself (Zoom's `?pwd=`), if any. */
  passcode?: string;
  /** Join link to hand to the bot as-is (Zoom only; absent for bare IDs). */
  meetingUrl?: string;
}

type ParsedMeeting = Omit<ParsedMeetingUrl, 'platform'>;

export interface MeetingPlatform {
  /** Whether the transcription menu offers a passcode field. */
  acceptsPasscode: boolean;
  parse: (input: string) => ParsedMeeting | null;
  /** Explains why a link that looks like this platform can't be joined. */
  unsupportedReason?: (input: string) => string | null;
}

const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;

const ZOOM_DOMAINS = ['zoom.us', 'zoomgov.com'];
// /j/<id>, /wc/join/<id> and /wc/<id>/join
const ZOOM_JOIN_PATH = /^\/(?:j|wc\/join|wc)\/(\d{9,11})(?:\/|$)/;

function toUrl(input: string): URL | null {
  try {
    return new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    return null;
  }
}

function zoomUrl(input: string): URL | null {
  const url = toUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const isZoom = ZOOM_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
  return isZoom ? url : null;
}

/**
 * Every platform DNA can send a Vexa bot to. Keyed by `Platform` so adding a
 * platform to the core type fails to compile until it is described here.
 * Insertion order is parse order.
 */
export const MEETING_PLATFORMS: Record<Platform, MeetingPlatform> = {
  google_meet: {
    acceptsPasscode: false,
    parse: (input) => {
      const urlMatch = input.match(
        /meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i
      );
      if (urlMatch) return { meetingId: urlMatch[1].toLowerCase() };
      if (MEET_CODE.test(input)) return { meetingId: input.toLowerCase() };
      return null;
    },
  },

  teams: {
    acceptsPasscode: true,
    parse: (input) =>
      /teams\.microsoft\.com.*meetup-join/i.test(input)
        ? { meetingId: input }
        : null,
  },

  zoom: {
    acceptsPasscode: true,
    parse: (input) => {
      // Bare meeting ID as Zoom displays it, e.g. "812 3456 7890".
      if (/^[\d\s-]+$/.test(input)) {
        const digits = input.replace(/[\s-]/g, '');
        return /^\d{9,11}$/.test(digits) ? { meetingId: digits } : null;
      }

      const url = zoomUrl(input);
      if (!url || url.hostname.toLowerCase().startsWith('events.')) {
        return null;
      }
      const match = url.pathname.match(ZOOM_JOIN_PATH);
      if (!match) return null;
      const passcode = url.searchParams.get('pwd') || undefined;
      // Vexa's Zoom bot needs the real link: the encoded pwd and regional
      // host don't survive being rebuilt from the ID.
      return { meetingId: match[1], passcode, meetingUrl: url.toString() };
    },
    unsupportedReason: (input) => {
      const url = zoomUrl(input);
      if (!url) return null;
      if (url.hostname.toLowerCase().startsWith('events.')) {
        return "Zoom Events links aren't supported. Use the meeting's zoom.us/j/… link instead.";
      }
      if (url.pathname.startsWith('/my/')) {
        return "Zoom personal links (/my/…) can't be joined. Use the numeric meeting ID or the zoom.us/j/… link instead.";
      }
      if (url.pathname.startsWith('/s/')) {
        return "That's a Zoom host start link. Use the join link (zoom.us/j/…) instead.";
      }
      return "Couldn't find a meeting ID in that Zoom link.";
    },
  },
};

export function parseMeetingUrl(url: string): ParsedMeetingUrl | null {
  const input = url.trim();
  for (const [platform, descriptor] of Object.entries(MEETING_PLATFORMS)) {
    const parsed = descriptor.parse(input);
    if (parsed) return { platform: platform as Platform, ...parsed };
  }
  return null;
}

/** User-facing reason a meeting link was rejected by `parseMeetingUrl`. */
export function describeInvalidMeetingUrl(url: string): string {
  const input = url.trim();
  for (const descriptor of Object.values(MEETING_PLATFORMS)) {
    const reason = descriptor.unsupportedReason?.(input);
    if (reason) return reason;
  }
  return 'Invalid meeting URL format';
}
