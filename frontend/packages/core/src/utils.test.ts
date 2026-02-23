import { describe, it, expect } from 'vitest';
import { formatDate, isValidUrl } from './utils';

describe('utils', () => {
  describe('formatDate', () => {
    it('should format a date string correctly', () => {
      const dateString = '2024-01-15T10:30:00Z';
      const formatted = formatDate(dateString);
      expect(formatted).toContain('January');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('15');
    });

    it('should handle different date formats', () => {
      const dateString = '2024-12-25T00:00:00Z';
      const formatted = formatDate(dateString);
      expect(formatted).toContain('December');
      expect(formatted).toContain('25');
    });
  });

  describe('isValidUrl', () => {
    it('should return true for valid URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl('just text')).toBe(false);
    });
  });
});
