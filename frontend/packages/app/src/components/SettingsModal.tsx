import { useState, useEffect, useCallback, type ReactNode } from 'react';
import styled from 'styled-components';
import {
  Dialog,
  AlertDialog,
  Button,
  Checkbox,
  TextArea,
  Flex,
  Switch,
  Tooltip,
} from '@radix-ui/themes';
import * as Tabs from '@radix-ui/react-tabs';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { Loader2, Info } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRecordHotkeys } from 'react-hotkeys-hook';
import type { UserSettings, UserSettingsUpdate } from '@dna/core';
import type { HotkeyAction } from '../hotkeys/hotkeysConfig';
import { apiHandler } from '../api';
import { NoteQCTab } from './NoteQCTab';
import { useHotkeyConfig } from '../hotkeys';
import { useThemeMode, useFeatureFlags } from '../contexts';

interface SettingsModalProps {
  userEmail: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0;
`;

const SectionDescription = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin: 0 0 8px 0;
`;

const TextAreaWrapper = styled.div`
  position: relative;
`;

const StyledTextArea = styled(TextArea)`
  min-height: 120px;
  resize: vertical;
  font-family: ${({ theme }) => theme.fonts.sans};
`;

const CheckboxRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  cursor: pointer;
`;

const CheckboxContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CheckboxLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CheckboxDescription = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const TooltipIcon = styled.span`
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: help;
  margin-left: 4px;
`;

const SpinnerIcon = styled(Loader2)`
  animation: spin 1s linear infinite;
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  margin-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border.subtle};
  flex-shrink: 0;
`;

const TabsContentWrapper = styled.div`
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  flex: 1;
  padding-right: 4px;
`;

const StyledTabsList = styled(Tabs.List)`
  display: flex;
  align-items: center;
  gap: 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  margin-bottom: 16px;
`;

const StyledTabsTrigger = styled(Tabs.Trigger)`
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.secondary};
  }

  &[data-state='active'] {
    color: ${({ theme }) => theme.colors.text.primary};
    border-bottom-color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const RadioGroupRoot = styled(RadioGroup.Root)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const RadioItem = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
`;

const RadioIndicator = styled(RadioGroup.Item)`
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.colors.border.default};
  background: transparent;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &[data-state='checked'] {
    border-color: ${({ theme }) => theme.colors.accent.main};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.accent.main};
    outline-offset: 2px;
  }
`;

const RadioDot = styled(RadioGroup.Indicator)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;

  &::after {
    content: '';
    display: block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.accent.main};
  }
`;

const AppearanceRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
  }
`;

const KeybindingRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};

  &:last-child {
    border-bottom: none;
  }
`;

const KeybindingLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const KeybindingName = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: 500;
`;

const KeybindingDesc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const KeybindingInput = styled.button<{ $recording: boolean }>`
  min-width: 140px;
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

const FeatureEnableRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0 16px;
  margin-bottom: 4px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const FeatureEnableLabel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const FeatureEnableName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const FeatureEnableDesc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

// --- General Tab ---

interface GeneralTabProps {
  isLoading: boolean;
  syncProdtrackTabOnVersionChange: boolean;
  prodtrackPageType: 'version' | 'entity';
  isPending: boolean;
  onSyncProdtrackTabOnVersionChange: (checked: boolean) => void;
  onProdtrackPageTypeChange: (value: 'version' | 'entity') => void;
}

function GeneralTab({
  isLoading,
  syncProdtrackTabOnVersionChange,
  prodtrackPageType,
  isPending,
  onSyncProdtrackTabOnVersionChange,
  onProdtrackPageTypeChange,
}: GeneralTabProps) {
  const { mode, setMode } = useThemeMode();

  if (isLoading) {
    return (
      <Flex align="center" justify="center" py="6">
        <SpinnerIcon size={24} />
      </Flex>
    );
  }

  return (
    <ModalContent>
      <Section>
        <SectionTitle>Appearance</SectionTitle>
        <AppearanceRow>
          <KeybindingLabel>
            <KeybindingName>Light Mode</KeybindingName>
            <KeybindingDesc>Switch between dark and light theme</KeybindingDesc>
          </KeybindingLabel>
          <Switch
            checked={mode === 'light'}
            onCheckedChange={(checked) => setMode(checked ? 'light' : 'dark')}
          />
        </AppearanceRow>
      </Section>

      <Section>
        <SectionTitle>Production tracking (browser)</SectionTitle>
        <SectionDescription>
          Requires the DNA tab sync Chrome extension.
        </SectionDescription>
        <CheckboxRow>
          <Checkbox
            checked={syncProdtrackTabOnVersionChange}
            onCheckedChange={onSyncProdtrackTabOnVersionChange}
            disabled={isPending}
          />
          <CheckboxContent>
            <CheckboxLabel>
              Sync PT tab when version changes
            </CheckboxLabel>
            <CheckboxDescription>
              When enabled (default), the extension updates your
              production-tracking tab whenever you select a different version.
              Turn off to update the PT tab only with the &quot;PT tab&quot;
              button in the version header.
            </CheckboxDescription>
          </CheckboxContent>
        </CheckboxRow>

        <CheckboxContent style={{ paddingTop: '8px' }}>
          <CheckboxLabel>Page to sync</CheckboxLabel>
          <CheckboxDescription>
            Which production-tracking page opens when a version is selected.
          </CheckboxDescription>
        </CheckboxContent>
        <RadioGroupRoot
          value={prodtrackPageType}
          onValueChange={(v) => onProdtrackPageTypeChange(v as 'version' | 'entity')}
        >
          <RadioItem>
            <RadioIndicator value="version" id="pt-version">
              <RadioDot />
            </RadioIndicator>
            <CheckboxContent>
              <CheckboxLabel>Version Detail</CheckboxLabel>
              <CheckboxDescription>Open the version&apos;s detail page</CheckboxDescription>
            </CheckboxContent>
          </RadioItem>
          <RadioItem>
            <RadioIndicator value="entity" id="pt-entity">
              <RadioDot />
            </RadioIndicator>
            <CheckboxContent>
              <CheckboxLabel>Shot / Asset Detail</CheckboxLabel>
              <CheckboxDescription>Open the linked shot or asset detail page</CheckboxDescription>
            </CheckboxContent>
          </RadioItem>
        </RadioGroupRoot>
      </Section>
    </ModalContent>
  );
}

// --- Keybindings Tab ---

interface KeybindingsTabProps {
  actions: HotkeyAction[];
  getKeysForAction: (actionId: string) => string;
  onRecord: (actionId: string, keys: string) => void;
  onResetToDefaults: () => void;
}

function KeybindingsTab({
  actions,
  getKeysForAction,
  onRecord,
  onResetToDefaults,
}: KeybindingsTabProps) {
  return (
    <ModalContent>
      <Section>
        <SectionDescription>
          Click a shortcut to record a new key combination. Press Escape
          to cancel.
        </SectionDescription>
        {actions.map((action) => (
          <KeybindingRow key={action.id}>
            <KeybindingLabel>
              <KeybindingName>{action.label}</KeybindingName>
              <KeybindingDesc>{action.description}</KeybindingDesc>
            </KeybindingLabel>
            <KeybindingRecorder
              actionId={action.id}
              currentKeys={getKeysForAction(action.id)}
              onRecord={onRecord}
            />
          </KeybindingRow>
        ))}
        <Flex mt="2" justify="end">
          <AlertDialog.Root>
            <AlertDialog.Trigger>
              <Button variant="soft" color="gray">
                Reset to Defaults
              </Button>
            </AlertDialog.Trigger>
            <AlertDialog.Content maxWidth="400px">
              <AlertDialog.Title>Reset keybindings?</AlertDialog.Title>
              <AlertDialog.Description size="2">
                This will reset all keyboard shortcuts to their default values.
                Any custom bindings you've set will be lost.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action onClick={onResetToDefaults}>
                  <Button variant="solid" color="red">
                    Reset
                  </Button>
                </AlertDialog.Action>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Flex>
      </Section>
    </ModalContent>
  );
}

// --- Transcription Tab ---

function TranscriptionTab() {
  const { transcriptionEnabled, setTranscriptionEnabled } = useFeatureFlags();

  return (
    <ModalContent>
      <FeatureEnableRow>
        <FeatureEnableLabel>
          <FeatureEnableName>Enable Feature</FeatureEnableName>
          <FeatureEnableDesc>
            Show transcription controls and the Transcript tab
          </FeatureEnableDesc>
        </FeatureEnableLabel>
        <Switch
          checked={transcriptionEnabled}
          onCheckedChange={setTranscriptionEnabled}
        />
      </FeatureEnableRow>
    </ModalContent>
  );
}

// --- AI Tab ---

interface AITabProps {
  isLoading: boolean;
  notePrompt: string;
  regenerateOnVersionChange: boolean;
  regenerateOnTranscriptUpdate: boolean;
  isPending: boolean;
  userEmail: string;
  onNotePromptChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onRegenerateOnVersionChange: (checked: boolean) => void;
  onRegenerateOnTranscriptUpdate: (checked: boolean) => void;
}

function AITab({
  isLoading,
  notePrompt,
  regenerateOnVersionChange,
  regenerateOnTranscriptUpdate,
  isPending,
  userEmail,
  onNotePromptChange,
  onRegenerateOnVersionChange,
  onRegenerateOnTranscriptUpdate,
}: AITabProps) {
  const { aiEnabled, setAiEnabled } = useFeatureFlags();

  if (isLoading) {
    return (
      <Flex align="center" justify="center" py="6">
        <SpinnerIcon size={24} />
      </Flex>
    );
  }

  return (
    <ModalContent>
      <FeatureEnableRow>
        <FeatureEnableLabel>
          <FeatureEnableName>Enable Feature</FeatureEnableName>
          <FeatureEnableDesc>
            Show AI note suggestions and Note QC checks
          </FeatureEnableDesc>
        </FeatureEnableLabel>
        <Switch
          checked={aiEnabled}
          onCheckedChange={setAiEnabled}
        />
      </FeatureEnableRow>

      <Section>
        <SectionTitle>
          Note Generation
          <Tooltip
            content={
              <>
                Customize the prompt used when generating notes from
                transcript and version information. You can include
                the following tags in the prompt:
                <br />
                <br />
                {'{{ transcript }}'} - What was said on this version
                <br />
                {'{{ context }}'} - Includes context for the version
                <br />
                {'{{ notes }}'} - Any notes you took on this version
                already
              </>
            }
          >
            <TooltipIcon>
              <Info size={14} />
            </TooltipIcon>
          </Tooltip>
        </SectionTitle>
        <SectionDescription>
          This prompt is used when generating notes via the transcript
          and version information.
        </SectionDescription>
        <TextAreaWrapper>
          <StyledTextArea
            placeholder="Enter your custom prompt for generating notes..."
            value={notePrompt}
            onChange={onNotePromptChange}
            disabled={isPending}
          />
        </TextAreaWrapper>

        <CheckboxRow>
          <Checkbox
            checked={regenerateOnVersionChange}
            onCheckedChange={onRegenerateOnVersionChange}
            disabled={isPending}
          />
          <CheckboxContent>
            <CheckboxLabel>
              Regenerate notes on version change
            </CheckboxLabel>
            <CheckboxDescription>
              Automatically regenerate the AI note when switching to a
              different version in review.
            </CheckboxDescription>
          </CheckboxContent>
        </CheckboxRow>

        <CheckboxRow>
          <Checkbox
            checked={regenerateOnTranscriptUpdate}
            onCheckedChange={onRegenerateOnTranscriptUpdate}
            disabled={isPending}
          />
          <CheckboxContent>
            <CheckboxLabel>
              Regenerate on transcript update
            </CheckboxLabel>
            <CheckboxDescription>
              Automatically regenerate the AI note when a new
              transcript segment comes in or an existing segment is
              updated.
            </CheckboxDescription>
          </CheckboxContent>
        </CheckboxRow>
      </Section>

      <Section>
        <SectionTitle>Note QC</SectionTitle>
        <NoteQCTab userEmail={userEmail} />
      </Section>
    </ModalContent>
  );
}

// --- Keybinding Recorder ---

function formatKeysForDisplay(keys: string): string {
  return keys
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase();
      if (p === 'meta')
        return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
      if (p === 'shift') return '⇧';
      if (p === 'alt')
        return navigator.platform.includes('Mac') ? '⌥' : 'Alt';
      if (p === 'ctrl') return 'Ctrl';
      if (p === 'down' || p === 'arrowdown') return '↓';
      if (p === 'up' || p === 'arrowup') return '↑';
      if (p === 'left' || p === 'arrowleft') return '←';
      if (p === 'right' || p === 'arrowright') return '→';
      if (p === 'space') return 'Space';
      if (p === 'escape') return 'Esc';
      return p.toUpperCase();
    })
    .join(' + ');
}

function KeybindingRecorder({
  actionId,
  currentKeys,
  onRecord,
}: {
  actionId: string;
  currentKeys: string;
  onRecord: (actionId: string, keys: string) => void;
}) {
  const [keys, { start, stop, isRecording, resetKeys }] = useRecordHotkeys();

  const handleClick = () => {
    if (isRecording) {
      if (keys.size > 0) {
        const keysString = Array.from(keys).join('+');
        onRecord(actionId, keysString);
      }
      stop();
      resetKeys();
    } else {
      resetKeys();
      start();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isRecording && e.key === 'Escape') {
      e.stopPropagation();
      stop();
      resetKeys();
    }
  };

  const handleBlur = () => {
    if (isRecording) {
      if (keys.size > 0) {
        const keysString = Array.from(keys).join('+');
        onRecord(actionId, keysString);
      }
      stop();
      resetKeys();
    }
  };

  const displayText = isRecording
    ? keys.size > 0
      ? formatKeysForDisplay(Array.from(keys).join('+'))
      : 'Press keys...'
    : formatKeysForDisplay(currentKeys);

  return (
    <KeybindingInput
      $recording={isRecording}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {displayText}
    </KeybindingInput>
  );
}

// --- Settings Modal ---

export function SettingsModal({
  userEmail,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SettingsModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [notePrompt, setNotePrompt] = useState('');
  const [regenerateOnVersionChange, setRegenerateOnVersionChange] =
    useState(false);
  const [regenerateOnTranscriptUpdate, setRegenerateOnTranscriptUpdate] =
    useState(false);
  const [syncProdtrackTabOnVersionChange, setSyncProdtrackTabOnVersionChange] =
    useState(true);
  const [prodtrackPageType, setProdtrackPageType] = useState<'version' | 'entity'>('version');
  const [isDirty, setIsDirty] = useState(false);

  const { getAllActions, getKeysForAction, setKeysForAction, resetToDefaults } =
    useHotkeyConfig();

  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<UserSettings>({
    queryKey: ['userSettings', userEmail],
    queryFn: () => apiHandler.getUserSettings({ userEmail }),
    enabled: !!userEmail,
  });

  const mutation = useMutation({
    mutationKey: ['upsertUserSettings', userEmail],
    mutationFn: (data: UserSettingsUpdate) =>
      apiHandler.upsertUserSettings({ userEmail, data }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['userSettings', userEmail], saved);
      queryClient.invalidateQueries({ queryKey: ['userSettings', userEmail] });
      setIsDirty(false);
    },
  });

  useEffect(() => {
    if (settings) {
      const displayPrompt =
        settings.note_prompt.trim() !== ''
          ? settings.note_prompt
          : settings.default_note_prompt;
      setNotePrompt(displayPrompt);
      setRegenerateOnVersionChange(settings.regenerate_on_version_change);
      setRegenerateOnTranscriptUpdate(settings.regenerate_on_transcript_update);
      setSyncProdtrackTabOnVersionChange(
        settings.sync_prodtrack_tab_on_version_change ?? true
      );
      setProdtrackPageType(settings.prodtrack_page_type ?? 'version');
      setIsDirty(false);
    } else if (settings === null) {
      setNotePrompt('');
      setRegenerateOnVersionChange(false);
      setRegenerateOnTranscriptUpdate(false);
      setSyncProdtrackTabOnVersionChange(true);
      setProdtrackPageType('version');
      setIsDirty(false);
    }
  }, [settings]);

  const handleNotePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setNotePrompt(e.target.value);
      setIsDirty(true);
    },
    []
  );

  const handleRegenerateOnVersionChange = useCallback((checked: boolean) => {
    setRegenerateOnVersionChange(checked);
    setIsDirty(true);
  }, []);

  const handleRegenerateOnTranscriptUpdate = useCallback((checked: boolean) => {
    setRegenerateOnTranscriptUpdate(checked);
    setIsDirty(true);
  }, []);

  const handleSyncProdtrackTabOnVersionChange = useCallback(
    (checked: boolean) => {
      setSyncProdtrackTabOnVersionChange(checked);
      setIsDirty(true);
    },
    []
  );

  const handleProdtrackPageTypeChange = useCallback(
    (value: 'version' | 'entity') => {
      setProdtrackPageType(value);
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(() => {
    const defaultTrimmed = (settings?.default_note_prompt ?? '').trim();
    const currentTrimmed = notePrompt.trim();
    const persistAsDefault =
      currentTrimmed === '' || currentTrimmed === defaultTrimmed;
    mutation.mutate({
      note_prompt: persistAsDefault ? '' : notePrompt,
      regenerate_on_version_change: regenerateOnVersionChange,
      regenerate_on_transcript_update: regenerateOnTranscriptUpdate,
      sync_prodtrack_tab_on_version_change: syncProdtrackTabOnVersionChange,
      prodtrack_page_type: prodtrackPageType,
    });
  }, [
    mutation,
    notePrompt,
    settings?.default_note_prompt,
    regenerateOnVersionChange,
    regenerateOnTranscriptUpdate,
    syncProdtrackTabOnVersionChange,
    prodtrackPageType,
  ]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen && isDirty) {
        handleSave();
      }
      setOpen(isOpen);
    },
    [isDirty, handleSave, setOpen]
  );

  const handleRecordKeybinding = useCallback(
    (actionId: string, keys: string) => {
      setKeysForAction(actionId, keys);
    },
    [setKeysForAction]
  );

  const actions = getAllActions();

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {trigger && <Dialog.Trigger>{trigger}</Dialog.Trigger>}
      <Dialog.Content maxWidth="600px" style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        <Dialog.Title>Settings</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Configure your preferences for note generation, AI assistance, and
          keyboard shortcuts.
        </Dialog.Description>

        <Tabs.Root defaultValue="general" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <StyledTabsList>
            <StyledTabsTrigger value="general">General</StyledTabsTrigger>
            <StyledTabsTrigger value="keybindings">
              Keybindings
            </StyledTabsTrigger>
            <StyledTabsTrigger value="transcription">
              Transcription
            </StyledTabsTrigger>
            <StyledTabsTrigger value="ai">AI</StyledTabsTrigger>
          </StyledTabsList>

          <Tabs.Content value="general" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <TabsContentWrapper>
              <GeneralTab
                isLoading={isLoading}
                syncProdtrackTabOnVersionChange={syncProdtrackTabOnVersionChange}
                prodtrackPageType={prodtrackPageType}
                isPending={mutation.isPending}
                onSyncProdtrackTabOnVersionChange={
                  handleSyncProdtrackTabOnVersionChange
                }
                onProdtrackPageTypeChange={handleProdtrackPageTypeChange}
              />
            </TabsContentWrapper>
          </Tabs.Content>

          <Tabs.Content value="keybindings" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <TabsContentWrapper>
              <KeybindingsTab
                actions={actions}
                getKeysForAction={getKeysForAction}
                onRecord={handleRecordKeybinding}
                onResetToDefaults={resetToDefaults}
              />
            </TabsContentWrapper>
          </Tabs.Content>

          <Tabs.Content value="transcription" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <TabsContentWrapper>
              <TranscriptionTab />
            </TabsContentWrapper>
          </Tabs.Content>

          <Tabs.Content value="ai" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <TabsContentWrapper>
              <AITab
                isLoading={isLoading}
                notePrompt={notePrompt}
                regenerateOnVersionChange={regenerateOnVersionChange}
                regenerateOnTranscriptUpdate={regenerateOnTranscriptUpdate}
                isPending={mutation.isPending}
                userEmail={userEmail}
                onNotePromptChange={handleNotePromptChange}
                onRegenerateOnVersionChange={handleRegenerateOnVersionChange}
                onRegenerateOnTranscriptUpdate={handleRegenerateOnTranscriptUpdate}
              />
            </TabsContentWrapper>
          </Tabs.Content>
        </Tabs.Root>

        <Footer>
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
