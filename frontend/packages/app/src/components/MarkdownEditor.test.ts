import { describe, expect, it } from 'vitest';
import { markdownToHtml, MENTION_REGEX } from './MarkdownEditor';

describe('mention markdown', () => {
  it('round-trips a non-numeric entity id', () => {
    const markdown = '@[Hero Shot](shot:abc-123)';
    expect(markdown.match(MENTION_REGEX)?.[0]).toBe(markdown);
    expect(markdownToHtml(markdown)).toContain('data-id="shot:abc-123"');
  });
});
