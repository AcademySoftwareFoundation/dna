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
