import type { ResolvedNomenclature } from '../nomenclature';

export interface HotkeyAction {
  id: string;
  label: string;
  description: string;
  defaultKeys: string;
}

export function buildHotkeyActions(
  terms: ResolvedNomenclature
): HotkeyAction[] {
  const { version, note } = terms;
  return [
    {
      id: 'nextVersion',
      label: `Next ${version.singular}`,
      description: `Navigate to the next ${version.lower}`,
      defaultKeys: 'meta+shift+down',
    },
    {
      id: 'previousVersion',
      label: `Previous ${version.singular}`,
      description: `Navigate to the previous ${version.lower}`,
      defaultKeys: 'meta+shift+up',
    },
    {
      id: 'openSettings',
      label: 'Toggle Settings',
      description: 'Open or close the settings dialog',
      defaultKeys: 'meta+shift+s',
    },
    {
      id: 'aiInsert',
      label: `AI Insert ${note.singular}`,
      description: `Insert the AI-generated ${note.lower}`,
      defaultKeys: 'meta+shift+i',
    },
    {
      id: 'aiRegenerate',
      label: 'AI Regenerate',
      description: `Regenerate the AI ${note.lower}`,
      defaultKeys: 'meta+shift+r',
    },
    {
      id: 'setInReview',
      label: 'Set In Review',
      description: `Mark the current ${version.lower} as in review`,
      defaultKeys: 'meta+shift+v',
    },
    {
      id: 'toggleSidebar',
      label: 'Toggle Sidebar',
      description: 'Expand or collapse the side panel',
      defaultKeys: 'meta+shift+b',
    },
    {
      id: 'focusSearch',
      label: 'Focus Search',
      description: `Open and focus the ${version.lower} search`,
      defaultKeys: 'meta+shift+f',
    },
  ];
}

export const STORAGE_KEY = 'dna-keybindings-v2';
