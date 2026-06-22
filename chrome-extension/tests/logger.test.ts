import { describe, expect, it } from 'vitest';
import {
  appendLog,
  clearLogs,
  getRecentLogs,
  chunkFromMessagePayload,
  chunkFromOffscreenMessage,
} from '../src/debug/logger';

describe('debug logger', () => {
  it('stores and returns recent log entries', () => {
    clearLogs();
    appendLog('sw', 'hello', { foo: 'bar' });
    const logs = getRecentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].scope).toBe('sw');
    expect(logs[0].message).toBe('hello');
    expect(logs[0].detail).toContain('foo');
  });

  it('converts ArrayBuffer chunks to Blob', () => {
    const blob = chunkFromMessagePayload(new ArrayBuffer(8));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe('audio/webm');
  });

  it('parses offscreen chunk messages with ArrayBuffer payload', () => {
    const buffer = new ArrayBuffer(16);
    const blob = chunkFromOffscreenMessage({
      chunkBuffer: buffer,
      mimeType: 'audio/webm',
      byteLength: 16,
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.size).toBe(16);
  });
});
