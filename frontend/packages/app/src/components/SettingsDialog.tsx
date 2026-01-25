import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Dialog, Flex, Button } from '@radix-ui/themes';
import { Settings } from 'lucide-react';

interface KeyCombo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean; // Command on Mac, Windows key on Windows
}

interface Keybindings {
  nextVersion: KeyCombo;
  previousVersion: KeyCombo;
  openSettings: KeyCombo;
  aiInsert: KeyCombo;
  aiRegenerate: KeyCombo;
}

const DEFAULT_KEYBINDINGS: Keybindings = {
  nextVersion: { key: 'ArrowDown', meta: true, shift: true },
  previousVersion: { key: 'ArrowUp', meta: true, shift: true },
  openSettings: { key: 's', meta: true, shift: true },
  aiInsert: { key: 'i', meta: true, shift: true },
  aiRegenerate: { key: 'r', meta: true, shift: true },
};

const KEYBINDINGS_STORAGE_KEY = 'dna-keybindings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TabsRoot = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const TabsList = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.default};
`;

const TabsTrigger = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.text.primary : theme.colors.text.secondary};
  background: transparent;
  border: none;
  border-bottom: 2px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.accent.main : 'transparent'};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const TabsContent = styled.div`
  padding: 16px 0;
`;

const KeybindingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
  }
`;

const KeybindingLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: 500;
`;

const KeybindingInput = styled.button<{ $recording: boolean }>`
  min-width: 160px;
  padding: 6px 12px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ theme, $recording }) =>
    $recording ? theme.colors.accent.main : theme.colors.text.primary};
  background: ${({ theme, $recording }) =>
    $recording ? theme.colors.accent.main + '15' : theme.colors.bg.surface};
  border: 1px solid
    ${({ theme, $recording }) =>
      $recording ? theme.colors.accent.main : theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  text-align: center;

  &:hover {
    background: ${({ theme, $recording }) =>
      $recording
        ? theme.colors.accent.main + '25'
        : theme.colors.bg.surfaceHover};
    border-color: ${({ theme, $recording }) =>
      $recording ? theme.colors.accent.main : theme.colors.border.strong};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.accent.main};
  }
`;

const formatKeyCombo = (combo: KeyCombo): string => {
  const parts: string[] = [];

  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push('Cmd');

  const keyMap: Record<string, string> = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ' ': 'Space',
  };

  parts.push(keyMap[combo.key] || combo.key.toUpperCase());

  return parts.join(' + ');
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState('keybindings');
  const [keybindings, setKeybindings] = useState<Keybindings>(() => {
    try {
      const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (!stored) return DEFAULT_KEYBINDINGS;

      const parsed = JSON.parse(stored);

      // Check if it's the old string format or missing new fields
      if (
        typeof parsed.nextVersion === 'string' ||
        !parsed.openSettings ||
        !parsed.aiInsert ||
        !parsed.aiRegenerate
      ) {
        return DEFAULT_KEYBINDINGS;
      }

      return parsed;
    } catch {
      return DEFAULT_KEYBINDINGS;
    }
  });
  const [recordingKey, setRecordingKey] = useState<keyof Keybindings | null>(
    null
  );

  useEffect(() => {
    localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(keybindings));
    // Dispatch storage event for same-window updates
    window.dispatchEvent(new Event('keybindings-changed'));
  }, [keybindings]);

  useEffect(() => {
    if (!recordingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingKey(null);
        return;
      }

      // Ignore if only modifier keys are pressed
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const newCombo: KeyCombo = {
        key: e.key,
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      };

      setKeybindings((prev) => ({
        ...prev,
        [recordingKey]: newCombo,
      }));
      setRecordingKey(null);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [recordingKey]);

  const handleStartRecording = (key: keyof Keybindings) => {
    setRecordingKey(key);
  };

  const handleResetDefaults = () => {
    setKeybindings(DEFAULT_KEYBINDINGS);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="600px">
        <Dialog.Title>
          <Flex align="center" gap="2">
            <Settings size={20} />
            Settings
          </Flex>
        </Dialog.Title>

        <TabsRoot>
          <TabsList>
            <TabsTrigger
              $active={activeTab === 'keybindings'}
              onClick={() => setActiveTab('keybindings')}
            >
              Keybindings
            </TabsTrigger>
          </TabsList>

          {activeTab === 'keybindings' && (
            <TabsContent>
              <Flex direction="column" gap="2">
                <KeybindingRow>
                  <KeybindingLabel>Next Version</KeybindingLabel>
                  <KeybindingInput
                    $recording={recordingKey === 'nextVersion'}
                    onClick={() => handleStartRecording('nextVersion')}
                  >
                    {recordingKey === 'nextVersion'
                      ? 'Press any key...'
                      : formatKeyCombo(keybindings.nextVersion)}
                  </KeybindingInput>
                </KeybindingRow>

                <KeybindingRow>
                  <KeybindingLabel>Previous Version</KeybindingLabel>
                  <KeybindingInput
                    $recording={recordingKey === 'previousVersion'}
                    onClick={() => handleStartRecording('previousVersion')}
                  >
                    {recordingKey === 'previousVersion'
                      ? 'Press any key...'
                      : formatKeyCombo(keybindings.previousVersion)}
                  </KeybindingInput>
                </KeybindingRow>

                <KeybindingRow>
                  <KeybindingLabel>Toggle Settings</KeybindingLabel>
                  <KeybindingInput
                    $recording={recordingKey === 'openSettings'}
                    onClick={() => handleStartRecording('openSettings')}
                  >
                    {recordingKey === 'openSettings'
                      ? 'Press any key...'
                      : formatKeyCombo(keybindings.openSettings)}
                  </KeybindingInput>
                </KeybindingRow>

                <KeybindingRow>
                  <KeybindingLabel>AI Insert Note</KeybindingLabel>
                  <KeybindingInput
                    $recording={recordingKey === 'aiInsert'}
                    onClick={() => handleStartRecording('aiInsert')}
                  >
                    {recordingKey === 'aiInsert'
                      ? 'Press any key...'
                      : formatKeyCombo(keybindings.aiInsert)}
                  </KeybindingInput>
                </KeybindingRow>

                <KeybindingRow>
                  <KeybindingLabel>AI Regenerate Note</KeybindingLabel>
                  <KeybindingInput
                    $recording={recordingKey === 'aiRegenerate'}
                    onClick={() => handleStartRecording('aiRegenerate')}
                  >
                    {recordingKey === 'aiRegenerate'
                      ? 'Press any key...'
                      : formatKeyCombo(keybindings.aiRegenerate)}
                  </KeybindingInput>
                </KeybindingRow>

                <Flex mt="4" justify="end">
                  <Button
                    variant="soft"
                    color="gray"
                    onClick={handleResetDefaults}
                  >
                    Reset to Defaults
                  </Button>
                </Flex>
              </Flex>
            </TabsContent>
          )}
        </TabsRoot>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="solid">Done</Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function useKeybindings(): Keybindings {
  const [keybindings, setKeybindings] = useState<Keybindings>(() => {
    try {
      const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (!stored) return DEFAULT_KEYBINDINGS;

      const parsed = JSON.parse(stored);

      // Check if it's the old string format or missing new fields
      if (
        typeof parsed.nextVersion === 'string' ||
        !parsed.openSettings ||
        !parsed.aiInsert ||
        !parsed.aiRegenerate
      ) {
        return DEFAULT_KEYBINDINGS;
      }

      return parsed;
    } catch {
      return DEFAULT_KEYBINDINGS;
    }
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (stored) {
        setKeybindings(JSON.parse(stored));
      }
    };

    const handleKeybindingsChanged = () => {
      const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
      if (stored) {
        setKeybindings(JSON.parse(stored));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('keybindings-changed', handleKeybindingsChanged);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(
        'keybindings-changed',
        handleKeybindingsChanged
      );
    };
  }, []);

  return keybindings;
}

export type { KeyCombo, Keybindings };
