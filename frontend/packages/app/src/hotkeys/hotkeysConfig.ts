export interface HotkeyAction {
  id: string;
  label: string;
  description: string;
  defaultKeys: string;
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  {
    id: 'nextVersion',
    label: 'Next Version',
    description: 'Navigate to the next version',
    defaultKeys: 'meta+shift+down',
  },
  {
    id: 'previousVersion',
    label: 'Previous Version',
    description: 'Navigate to the previous version',
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
    label: 'AI Insert Note',
    description: 'Insert the AI-generated note',
    defaultKeys: 'meta+shift+i',
  },
  {
    id: 'aiRegenerate',
    label: 'AI Regenerate',
    description: 'Regenerate the AI note',
    defaultKeys: 'meta+shift+r',
  },
  {
    id: 'setInReview',
    label: 'Set In Review',
    description: 'Mark the current version as in review',
    defaultKeys: 'meta+shift+v',
  },
  {
    id: 'toggleSidebar',
    label: 'Toggle Sidebar',
    description: 'Expand or collapse the side panel',
    defaultKeys: 'meta+shift+b',
  },
];

export const HOTKEY_ACTIONS_MAP = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, a])
) as Record<string, HotkeyAction>;

export const STORAGE_KEY = 'dna-keybindings-v2';
