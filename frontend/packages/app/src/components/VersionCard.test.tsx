import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import type { Version } from '@dna/core';
import { darkTheme } from '../styles/theme';
import { VersionCard } from './VersionCard';

const version = { id: 7190, name: 'TST_010_0010_comp_v001' } as Version;

function renderCard(props: Partial<Parameters<typeof VersionCard>[0]> = {}) {
  return render(
    <ThemeProvider theme={darkTheme}>
      <Theme>
        <VersionCard version={version} {...props} />
      </Theme>
    </ThemeProvider>
  );
}

describe('VersionCard in-review pin', () => {
  it('renders no eye toggle when pinning is unavailable', () => {
    renderCard({ inReview: true });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers "Set in review" on a version that is not in review', () => {
    const onTogglePin = vi.fn();
    renderCard({ onTogglePin, canPin: true });

    fireEvent.click(screen.getByRole('button', { name: 'Set in review' }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
  });

  it('labels a pinned version and offers to resume RV sync', () => {
    const onTogglePin = vi.fn();
    renderCard({ inReview: true, pinned: true, canPin: true, onTogglePin });

    expect(screen.getByText('Pinned')).toBeInTheDocument();
    const toggle = screen.getByRole('button', {
      name: 'Unpin to resume sync with RV',
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });

  it('does not select the version when toggling the pin', () => {
    const onClick = vi.fn();
    renderCard({ onClick, onTogglePin: vi.fn(), canPin: true });

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  describe('without RV connected', () => {
    it('is a plain picker on versions that are not in review', () => {
      const onTogglePin = vi.fn();
      renderCard({ onTogglePin });

      fireEvent.click(screen.getByRole('button', { name: 'Set in review' }));
      expect(onTogglePin).toHaveBeenCalledTimes(1);
    });

    it('shows the version in review as an indicator only', () => {
      renderCard({ inReview: true, onTogglePin: vi.fn() });
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('ignores a stale pin: no label and no highlight', () => {
      renderCard({ inReview: true, pinned: true, onTogglePin: vi.fn() });
      expect(screen.queryByText('Pinned')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});

describe('VersionCard scratch removal', () => {
  it('renders the remove X in place of the in-review eye', () => {
    renderCard({ onRemove: vi.fn(), onTogglePin: vi.fn(), canPin: true });

    expect(
      screen.getByRole('button', { name: 'Remove scratch pad' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set in review' })
    ).not.toBeInTheDocument();
  });

  it('removes without selecting the tile', () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    renderCard({ onClick, onRemove });

    fireEvent.click(screen.getByRole('button', { name: 'Remove scratch pad' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
