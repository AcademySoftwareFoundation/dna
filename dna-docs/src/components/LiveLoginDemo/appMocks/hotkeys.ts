// Stands in for frontend/packages/app/src/hotkeys when AssistantNote
// imports it in docs demos (see plugins/dna-app-embed.ts): just the labels
// for its tooltips, from the app's default key bindings (hotkeysConfig).

const DEFAULT_KEYS: Record<string, string> = {
  aiInsert: 'meta+shift+i',
  aiRegenerate: 'meta+shift+r',
};

/** The app's formatKeysForDisplay (HotkeysProvider), for the keys used here. */
function formatKeys(keys: string): string {
  const mac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
  return keys
    .split('+')
    .map((part) => {
      if (part === 'meta') return mac ? '⌘' : 'Ctrl';
      if (part === 'shift') return '⇧';
      return part.toUpperCase();
    })
    .join(' + ');
}

export function useHotkeyConfig() {
  return {
    getLabel: (actionId: string) => formatKeys(DEFAULT_KEYS[actionId] ?? ''),
  };
}
