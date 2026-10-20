import { describe, it, expect } from 'vitest';
import {
  MEETING_PLATFORMS,
  describeInvalidMeetingUrl,
  parseMeetingUrl,
} from './meetingPlatforms';

describe('parseMeetingUrl', () => {
  describe('google_meet', () => {
    it('parses a Meet URL and lowercases the code', () => {
      expect(parseMeetingUrl('https://meet.google.com/ABC-defg-HIJ')).toEqual({
        platform: 'google_meet',
        meetingId: 'abc-defg-hij',
      });
    });

    it('parses a bare Meet code', () => {
      expect(parseMeetingUrl('  abc-defg-hij ')).toEqual({
        platform: 'google_meet',
        meetingId: 'abc-defg-hij',
      });
    });
  });

  describe('teams', () => {
    it('keeps the full meetup-join URL as the meeting ID', () => {
      const url =
        'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0';
      expect(parseMeetingUrl(url)).toEqual({
        platform: 'teams',
        meetingId: url,
      });
    });
  });

  describe('zoom', () => {
    it.each([
      ['https://zoom.us/j/81234567890', 'https://zoom.us/j/81234567890'],
      [
        'https://us02web.zoom.us/j/81234567890',
        'https://us02web.zoom.us/j/81234567890',
      ],
      ['zoom.us/j/81234567890', 'https://zoom.us/j/81234567890'],
      [
        'https://zoom.us/wc/join/81234567890',
        'https://zoom.us/wc/join/81234567890',
      ],
      [
        'https://zoom.us/wc/81234567890/join',
        'https://zoom.us/wc/81234567890/join',
      ],
      [
        'https://agency.zoomgov.com/j/81234567890',
        'https://agency.zoomgov.com/j/81234567890',
      ],
    ])('parses %s', (url, meetingUrl) => {
      expect(parseMeetingUrl(url)).toEqual({
        platform: 'zoom',
        meetingId: '81234567890',
        passcode: undefined,
        meetingUrl,
      });
    });

    it('pulls the passcode out of ?pwd= and keeps the full link', () => {
      const link = 'https://us05web.zoom.us/j/81234567890?pwd=aBcD1234.1';
      expect(parseMeetingUrl(link)).toEqual({
        platform: 'zoom',
        meetingId: '81234567890',
        passcode: 'aBcD1234.1',
        meetingUrl: link,
      });
    });

    it.each([
      ['81234567890'],
      ['812 3456 7890'],
      ['812-3456-7890'],
      ['123456789'],
    ])('parses the bare meeting ID %s', (input) => {
      expect(parseMeetingUrl(input)).toEqual({
        platform: 'zoom',
        meetingId: input.replace(/[\s-]/g, ''),
      });
    });

    it.each([
      ['12345678'],
      ['123456789012'],
      ['https://zoom.us/my/someone'],
      ['https://zoom.us/s/81234567890'],
      ['https://events.zoom.us/ev/abc'],
      ['https://notzoom.us/j/81234567890'],
    ])('rejects %s', (input) => {
      expect(parseMeetingUrl(input)).toBeNull();
    });
  });

  it('returns null for unrecognised input', () => {
    expect(parseMeetingUrl('https://example.com/meeting')).toBeNull();
    expect(parseMeetingUrl('')).toBeNull();
  });
});

describe('describeInvalidMeetingUrl', () => {
  it('explains Zoom personal links', () => {
    expect(describeInvalidMeetingUrl('https://zoom.us/my/someone')).toMatch(
      /personal links/
    );
  });

  it('explains Zoom start links', () => {
    expect(describeInvalidMeetingUrl('https://zoom.us/s/81234567890')).toMatch(
      /start link/
    );
  });

  it('explains Zoom Events links', () => {
    expect(describeInvalidMeetingUrl('https://events.zoom.us/ev/abc')).toMatch(
      /Zoom Events/
    );
  });

  it('falls back to a generic message', () => {
    expect(describeInvalidMeetingUrl('https://example.com/meeting')).toBe(
      'Invalid meeting URL format'
    );
  });
});

describe('MEETING_PLATFORMS', () => {
  it('only offers a passcode for Teams and Zoom', () => {
    expect(MEETING_PLATFORMS.google_meet.acceptsPasscode).toBe(false);
    expect(MEETING_PLATFORMS.teams.acceptsPasscode).toBe(true);
    expect(MEETING_PLATFORMS.zoom.acceptsPasscode).toBe(true);
  });
});
