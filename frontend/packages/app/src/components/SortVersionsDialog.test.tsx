import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { ThemeProvider } from 'styled-components';
import { SortVersionsDialog } from './SortVersionsDialog';
import { VersionSortProvider } from '../contexts';
import { darkTheme } from '../styles';

function renderDialog() {
  return render(
    <ThemeProvider theme={darkTheme}>
      <Theme>
        <VersionSortProvider>
          <SortVersionsDialog open onOpenChange={() => {}} />
        </VersionSortProvider>
      </Theme>
    </ThemeProvider>
  );
}

function storedSort() {
  return JSON.parse(localStorage.getItem('dna-version-sort') ?? 'null');
}

describe('SortVersionsDialog', () => {
  beforeEach(() => localStorage.clear());

  it('offers each sort field with playlist order selected by default', () => {
    renderDialog();
    for (const label of [
      'Playlist Order',
      'Version Name',
      'Pipeline Step',
      'Created Date',
      'Updated Date',
    ]) {
      expect(screen.getByRole('radio', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(
      screen
        .getByRole('radio', { name: /Playlist Order/ })
        .getAttribute('data-state')
    ).toBe('checked');
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('selects and persists a field', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: /Created Date/ }));
    expect(storedSort().field).toBe('created_at');
    expect(
      screen
        .getByRole('radio', { name: /Created Date/ })
        .getAttribute('data-state')
    ).toBe('checked');
  });

  it('reverses the selected field and updates the descriptions', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: /Version Name/ }));
    expect(screen.queryByText('Z to A')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: /Reverse Order/ }));
    expect(storedSort()).toEqual({ field: 'name', reversed: true });
    expect(screen.getAllByText('Z to A')).toHaveLength(2);
  });

  it('keeps the reverse setting when changing field', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('switch', { name: /Reverse Order/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Created Date/ }));
    expect(storedSort()).toEqual({ field: 'created_at', reversed: true });
  });

  it('restores a stored sort', () => {
    localStorage.setItem(
      'dna-version-sort',
      JSON.stringify({ field: 'updated_at', reversed: true })
    );
    renderDialog();
    expect(
      screen
        .getByRole('radio', { name: /Updated Date/ })
        .getAttribute('data-state')
    ).toBe('checked');
    expect(screen.getAllByText('Newest first')).toHaveLength(2);
  });
});
