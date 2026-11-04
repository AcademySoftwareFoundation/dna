import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import type { Version } from '@dna/core';
import { darkTheme } from '../styles/theme';
import { VersionCard } from './VersionCard';

const version = { id: '7190', name: 'TST_010_0010_comp_v001' } as Version;

function renderCard(props: Partial<Parameters<typeof VersionCard>[0]> = {}) {
  return render(
    <ThemeProvider theme={darkTheme}>
      <Theme>
        <VersionCard version={version} {...props} />
      </Theme>
    </ThemeProvider>
  );
}

describe('VersionCard scratch removal', () => {
  it('renders the remove X in place of the in-review eye', () => {
    renderCard({ onRemove: vi.fn(), inReview: true });

    expect(
      screen.getByRole('button', { name: 'Remove scratch pad' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
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

describe('VersionCard in-review eye', () => {
  it('renders no toggle when setting in review is unavailable', () => {
    renderCard();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers "Set in review" on a version that is not in review', () => {
    const onSetInReview = vi.fn();
    renderCard({ onSetInReview });

    fireEvent.click(screen.getByRole('button', { name: 'Set in review' }));
    expect(onSetInReview).toHaveBeenCalledTimes(1);
  });

  it('pins the version in review from its pin button', () => {
    const onClick = vi.fn();
    const onTogglePin = vi.fn();
    renderCard({ inReview: true, onClick, onTogglePin });

    expect(
      screen.queryByRole('button', { name: 'Pinned, click to unpin' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Pin in review' }));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('unpins from the pin icon, leaving the eye as an indicator', () => {
    const onClick = vi.fn();
    const onTogglePin = vi.fn();
    renderCard({ inReview: true, inReviewPinned: true, onClick, onTogglePin });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Pinned, click to unpin' })
    );
    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its look after a click until the pin state actually changes', () => {
    const card = (inReviewPinned: boolean) => (
      <ThemeProvider theme={darkTheme}>
        <Theme>
          <VersionCard
            version={version}
            inReview
            inReviewPinned={inReviewPinned}
            onTogglePin={vi.fn()}
          />
        </Theme>
      </ThemeProvider>
    );
    const pinButton = () => screen.getAllByRole('button')[0];

    const unsettledGray = render(card(false));
    const unsettledGrayClass = pinButton().className;
    unsettledGray.unmount();

    const { rerender } = render(card(true));
    const pinnedClass = pinButton().className;
    fireEvent.click(pinButton());
    expect(pinButton().className).toBe(pinnedClass);

    rerender(card(false));
    expect(pinButton().className).not.toBe(unsettledGrayClass);

    fireEvent.mouseLeave(pinButton());
    expect(pinButton().className).toBe(unsettledGrayClass);
  });

  it('shows the version in review as an indicator only', () => {
    renderCard({ inReview: true, onSetInReview: vi.fn() });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not select the version when setting it in review', () => {
    const onClick = vi.fn();
    renderCard({ onClick, onSetInReview: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: 'Set in review' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
