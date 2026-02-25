import { useHotkeys, type Options } from 'react-hotkeys-hook';
import { useHotkeyConfig } from './HotkeysProvider';

interface UseHotkeyActionOptions {
  enabled?: boolean;
  enableOnFormTags?: boolean;
  enableOnContentEditable?: boolean;
}

export function useHotkeyAction(
  actionId: string,
  callback: (e: KeyboardEvent) => void,
  options?: UseHotkeyActionOptions
) {
  const { getKeysForAction } = useHotkeyConfig();
  const keys = getKeysForAction(actionId);

  const hotkeyOptions: Options = {
    preventDefault: true,
    enabled: options?.enabled ?? true,
    enableOnFormTags: options?.enableOnFormTags ?? true,
    enableOnContentEditable: options?.enableOnContentEditable ?? true,
  };

  useHotkeys(keys, callback, hotkeyOptions, [keys, callback]);
}
