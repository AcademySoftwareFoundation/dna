import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NomenclatureProvider, useNomenclature } from './NomenclatureContext';

function Probe() {
  const t = useNomenclature();
  return (
    <div>
      <span data-testid="version">{t.version.singular}</span>
      <span data-testid="playlist">{t.playlist.plural}</span>
    </div>
  );
}

describe('useNomenclature', () => {
  it('throws outside the provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      'useNomenclature must be used within NomenclatureProvider'
    );
    error.mockRestore();
  });

  it('provides DNA defaults', () => {
    render(
      <NomenclatureProvider>
        <Probe />
      </NomenclatureProvider>
    );
    expect(screen.getByTestId('version')).toHaveTextContent('Version');
    expect(screen.getByTestId('playlist')).toHaveTextContent('Playlists');
  });

  it('passes overrides to consumers', () => {
    render(
      <NomenclatureProvider
        overrides={{
          version: { singular: 'Take' },
          playlist: { singular: 'Review Session' },
        }}
      >
        <Probe />
      </NomenclatureProvider>
    );
    expect(screen.getByTestId('version')).toHaveTextContent('Take');
    expect(screen.getByTestId('playlist')).toHaveTextContent('Review Sessions');
  });
});
