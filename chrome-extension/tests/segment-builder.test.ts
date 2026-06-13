import { describe, expect, it } from 'vitest';
import { parseMeetUrl } from '../src/meet/parse-meet-url';
import { SegmentBuilder } from '../src/transcription/segment-builder';

describe('parseMeetUrl', () => {
  it('extracts meeting code from full Meet URL', () => {
    expect(parseMeetUrl('https://meet.google.com/abc-defg-hij')).toEqual({
      platform: 'google_meet',
      meetingId: 'abc-defg-hij',
    });
  });

  it('extracts meeting code from bare code', () => {
    expect(parseMeetUrl('abc-defg-hij')).toEqual({
      platform: 'google_meet',
      meetingId: 'abc-defg-hij',
    });
  });

  it('returns null for non-Meet URLs', () => {
    expect(parseMeetUrl('https://example.com')).toBeNull();
  });
});

describe('SegmentBuilder', () => {
  it('builds confirmed segments with stable segment_id and ISO timestamps', () => {
    const builder = new SegmentBuilder({
      sessionUid: 'sess-123',
      sessionStart: new Date('2026-04-20T19:00:00.000Z'),
    });

    const frame = builder.buildConfirmed(
      {
        text: 'hello world',
        start: 0,
        end: 1.5,
        language: 'en',
      },
      'Alice',
    );

    expect(frame.confirmed).toHaveLength(1);
    expect(frame.confirmed[0].segment_id).toBe('sess-123:Alice:1');
    expect(frame.confirmed[0].text).toBe('hello world');
    expect(frame.confirmed[0].speaker).toBe('Alice');
    expect(frame.confirmed[0].absolute_start_time).toBe(
      '2026-04-20T19:00:00.000Z',
    );
    expect(frame.confirmed[0].absolute_end_time).toBe(
      '2026-04-20T19:00:01.500Z',
    );
    expect(frame.pending).toEqual([]);
    expect(frame.speaker).toBe('Alice');
    expect(frame.ts).toBeTruthy();
  });

  it('puts in-flight text in pending until confirmed', () => {
    const builder = new SegmentBuilder({
      sessionUid: 'sess-123',
      sessionStart: new Date('2026-04-20T19:00:00.000Z'),
    });

    const pending = builder.buildPending('partial text', 'Bob');
    expect(pending.pending).toHaveLength(1);
    expect(pending.confirmed).toEqual([]);
    expect(pending.pending[0].text).toBe('partial text');
    expect(pending.pending[0].speaker).toBe('Bob');
  });

  it('increments segment sequence for each confirmed segment', () => {
    const builder = new SegmentBuilder({
      sessionUid: 'sess-123',
      sessionStart: new Date('2026-04-20T19:00:00.000Z'),
    });

    const first = builder.buildConfirmed(
      { text: 'one', start: 0, end: 1 },
      'Alice',
    );
    const second = builder.buildConfirmed(
      { text: 'two', start: 1, end: 2 },
      'Alice',
    );

    expect(first.confirmed[0].segment_id).toBe('sess-123:Alice:1');
    expect(second.confirmed[0].segment_id).toBe('sess-123:Alice:2');
  });
});
