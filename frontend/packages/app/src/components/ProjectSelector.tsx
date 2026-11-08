import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { Button, Flex, Popover, Select, Spinner } from '@radix-ui/themes';
import * as Tabs from '@radix-ui/react-tabs';
import { Playlist, Project, Session } from '@dna/core';
import {
  apiHandler,
  useGetProjectsForUser,
  useGetPlaylistsForProject,
} from '../api';
import { Logo } from './Logo';
import {
  StyledSelectTrigger,
  StyledSelectContent,
} from './FormInputs';
import { useAuth, useFeatureFlags } from '../contexts';
import { useCreateSession, useGetSessionsForProject } from '../hooks/useSessions';
import { useNomenclature } from '../nomenclature';

export const STORAGE_KEYS = {
  USER_EMAIL: 'dna_user_email',
  PROJECT: 'dna_selected_project',
};

interface ProjectSelectorProps {
  onSelectionComplete: (
    project: Project,
    playlist: Playlist,
    userEmail: string,
    session?: Session
  ) => void;
}

const PageWrapper = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(
        ellipse 80% 50% at 50% -20%,
        ${({ theme }) => theme.colors.accent.subtle},
        transparent
      )
      fixed,
    ${({ theme }) => theme.colors.bg.base};
`;

const CardContainer = styled.div`
  width: 100%;
  max-width: 420px;
  padding: 40px;
  background: ${({ theme }) => theme.colors.bg.elevated};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.xl};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`;

const LogoWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 24px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  text-align: center;
  margin: 0 0 8px 0;
`;

const Subtitle = styled.p`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
  margin: 0 0 32px 0;
`;

const FormSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Label = styled.label`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const SelectionDisplay = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const SelectionText = styled.span`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ChangeButton = styled.button`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.accent.main};
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const LoadingWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
`;

const LoadingText = styled.span`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ErrorText = styled.p`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.status.error};
  text-align: center;
  margin: 0;
  padding: 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: ${({ theme }) => theme.radii.md};
`;

const EmptyText = styled.p`
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
  margin: 0;
  padding: 24px;
`;

type Step = 'loading' | 'signin' | 'project' | 'session' | 'playlist';

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SessionModeTabs = styled(Tabs.Root)`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const SessionTabsList = styled(Tabs.List)`
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
`;

const SessionSelectButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 44px;
  padding: 0 12px;
  box-sizing: border-box;
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: none;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  cursor: pointer;
  transition:
    border-color ${({ theme }) => theme.transitions.fast},
    box-shadow ${({ theme }) => theme.transitions.fast};

  &:focus,
  &[data-state='open'] {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.accent.main};
  }

  span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span[data-placeholder] {
    color: ${({ theme }) => theme.colors.text.muted};
  }

  svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const SessionSelectMenu = styled(Popover.Content)`
  &&.rt-PopoverContent {
    width: var(--radix-popover-trigger-width);
    padding: 0;
    overflow: hidden;
    background: ${({ theme }) => theme.colors.bg.elevated};
    border: 1px solid ${({ theme }) => theme.colors.border.subtle};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }
`;

const SessionSearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border.subtle};
  background: transparent;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.primary};
  outline: none;

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }
`;

const SessionOptionList = styled.div`
  max-height: 240px;
  overflow-y: auto;
`;

const SessionOption = styled.button<{ $highlighted: boolean }>`
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.accent.subtle : 'transparent'};
  color: ${({ theme, $highlighted }) =>
    $highlighted ? theme.colors.accent.main : theme.colors.text.primary};
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.accent.subtle};
    color: ${({ theme }) => theme.colors.accent.main};
  }
`;

const SessionSearchEmpty = styled.div`
  padding: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

interface SessionSelectProps {
  sessions: Session[];
  value: string;
  onValueChange: (sessionId: string) => void;
}

function SessionSelect({ sessions, value, onValueChange }: SessionSelectProps) {
  const t = useNomenclature();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = sessions.find((session) => session.id === value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSessions = sessions.filter((session) =>
    session.name.toLowerCase().includes(normalizedQuery)
  );

  const closeMenu = () => {
    setOpen(false);
    setQuery('');
    setHighlightedIndex(0);
  };

  const chooseSession = (sessionId: string) => {
    onValueChange(sessionId);
    closeMenu();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (visibleSessions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((index) =>
        index < visibleSessions.length - 1 ? index + 1 : 0
      );
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((index) =>
        index > 0 ? index - 1 : visibleSessions.length - 1
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const session = visibleSessions[highlightedIndex];
      if (session) chooseSession(session.id);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        closeMenu();
      }}
    >
      <Popover.Trigger>
        <SessionSelectButton
          type="button"
          role="combobox"
          aria-label={selected?.name ?? `Choose a ${t.session.lower}...`}
          aria-expanded={open}
          aria-haspopup="listbox"
          data-state={open ? 'open' : 'closed'}
        >
          <span data-placeholder={selected ? undefined : ''}>
            {selected?.name ?? `Choose a ${t.session.lower}...`}
          </span>
          <ChevronDown size={16} />
        </SessionSelectButton>
      </Popover.Trigger>
      <SessionSelectMenu
        side="bottom"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <SessionSearchInput
          ref={searchRef}
          aria-label={`Search ${t.session.lowerPlural}`}
          placeholder={`Search ${t.session.lowerPlural}...`}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleSearchKeyDown}
        />
        <SessionOptionList role="listbox" aria-label={t.session.plural}>
          {visibleSessions.length === 0 ? (
            <SessionSearchEmpty>No {t.session.lowerPlural} found</SessionSearchEmpty>
          ) : (
            visibleSessions.map((session, index) => (
              <SessionOption
                key={session.id}
                type="button"
                role="option"
                aria-selected={session.id === value}
                $highlighted={index === highlightedIndex}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => chooseSession(session.id)}
              >
                {session.name}
              </SessionOption>
            ))
          )}
        </SessionOptionList>
      </SessionSelectMenu>
    </Popover.Root>
  );
}

const SessionTabsTrigger = styled(Tabs.Trigger)`
  flex: 1;
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color ${({ theme }) => theme.transitions.fast},
    border-color ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.secondary};
  }

  &[data-state='active'] {
    color: ${({ theme }) => theme.colors.text.primary};
    border-bottom-color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const StyledInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  outline: none;
  transition: all ${({ theme }) => theme.transitions.fast};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 24px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  font-weight: 500;
  color: white;
  background: ${({ theme }) => theme.colors.accent.main};
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.accent.hover};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const GoogleButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 24px;
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    border-color: ${({ theme }) => theme.colors.border.default};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path
      d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      fill="#4285F4"
    />
    <path
      d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      fill="#34A853"
    />
    <path
      d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      fill="#FBBC05"
    />
    <path
      d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      fill="#EA4335"
    />
  </svg>
);

function getStoredProject(): Project | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PROJECT);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProject(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECT, JSON.stringify(project));
  } catch {
    // Ignore storage errors
  }
}

function clearStoredEmail(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
  } catch {
    // Ignore storage errors
  }
}

function clearStoredProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.PROJECT);
  } catch {
    // Ignore storage errors
  }
}

export function clearUserSession(): void {
  clearStoredEmail();
  clearStoredProject();
}

export function ProjectSelector({ onSelectionComplete }: ProjectSelectorProps) {
  const queryClient = useQueryClient();
  const t = useNomenclature();
  const { sessionsEnabled } = useFeatureFlags();
  const { isAuthenticated, isLoading: isAuthLoading, user, signIn, signInWithEmail, signOut, authProvider } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [step, setStep] = useState<Step>('loading');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [chosenSessionMode, setChosenSessionMode] = useState<
    'existing' | 'create' | null
  >(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [sessionOpenError, setSessionOpenError] = useState<string | null>(null);

  const userEmail = user?.email || null;

  useEffect(() => {
    if (isAuthLoading) {
      setStep('loading');
      return;
    }

    if (!isAuthenticated || !userEmail) {
      setStep('signin');
      return;
    }

    const storedProject = getStoredProject();

    if (storedProject) {
      setSelectedProject(storedProject);
      setStep(sessionsEnabled ? 'session' : 'playlist');
    } else {
      setStep('project');
    }
  }, [isAuthenticated, isAuthLoading, userEmail, sessionsEnabled]);

  const {
    data: projects,
    isLoading: isLoadingProjects,
    isError: isProjectsError,
    error: projectsError,
  } = useGetProjectsForUser(userEmail);

  const {
    data: playlists,
    isLoading: isLoadingPlaylists,
    isError: isPlaylistsError,
    error: playlistsError,
  } = useGetPlaylistsForProject(selectedProject?.id ?? null);

  const {
    data: sessions,
    isLoading: isLoadingSessions,
    isError: isSessionsError,
    error: sessionsError,
  } = useGetSessionsForProject(
    sessionsEnabled ? (selectedProject?.id ?? null) : null
  );
  const createSession = useCreateSession(selectedProject?.id ?? null);
  const hasSessions = (sessions?.length ?? 0) > 0;
  const sessionMode = chosenSessionMode ?? (hasSessions ? 'existing' : 'create');

  const handleSessionModeChange = (value: string) => {
    if (value === 'create') {
      setChosenSessionMode('create');
      setSelectedSessionId('');
      return;
    }
    setChosenSessionMode('existing');
    setNewSessionName('');
  };

  const handleProjectSelect = (projectId: string) => {
    const project = projects?.find((p) => p.id === projectId);
    if (project) {
      setSelectedProject(project);
      saveProject(project);
      setSelectedPlaylistId('');
      setSelectedSession(null);
      setSelectedSessionId('');
      setNewSessionName('');
      setChosenSessionMode(null);
      setStep(sessionsEnabled ? 'session' : 'playlist');
    }
  };

  const handlePlaylistSelect = (playlistId: string) => {
    setSelectedPlaylistId(playlistId);
  };

  const handleContinue = () => {
    if (selectedPlaylistId && playlists && userEmail && selectedProject) {
      const playlist = playlists.find(
        (p) => p.id.toString() === selectedPlaylistId
      );
      if (playlist) {
        if (sessionsEnabled && !selectedSession) return;
        onSelectionComplete(
          selectedProject,
          playlist,
          userEmail,
          selectedSession ?? undefined
        );
      }
    }
  };

  const handleSessionContinue = async () => {
    if (!selectedProject || !userEmail) return;
    setSessionOpenError(null);
    if (sessionMode === 'create') {
      const name = newSessionName.trim();
      if (!name) return;
      const created = await createSession.mutateAsync(name);
      setSelectedSession(created);
      setStep('playlist');
      return;
    }
    const existing = sessions?.find((session) => session.id === selectedSessionId);
    if (!existing) return;
    setIsOpeningSession(true);
    try {
      const linked = await apiHandler.getSessionPlaylists({
        sessionId: existing.id,
      });
      const playlist = linked.playlist_ids
        .map((id) => playlists?.find((item) => item.id.toString() === id))
        .find((item): item is Playlist => item != null);
      setSelectedSession(existing);
      if (playlist) {
        queryClient.setQueryData(['sessionPlaylists', existing.id], linked);
        onSelectionComplete(selectedProject, playlist, userEmail, existing);
        return;
      }
      setStep('playlist');
    } catch (error) {
      setSessionOpenError(
        error instanceof Error
          ? error.message
          : `Failed to open ${t.session.lower}`
      );
    } finally {
      setIsOpeningSession(false);
    }
  };

  const handleSignOut = () => {
    clearStoredProject();
    setSelectedProject(null);
    setSelectedPlaylistId('');
    setSelectedSession(null);
    setSelectedSessionId('');
    setNewSessionName('');
    setChosenSessionMode(null);
    signOut();
    setStep('signin');
  };

  const handleChangeProject = () => {
    clearStoredProject();
    setSelectedProject(null);
    setSelectedPlaylistId('');
    setSelectedSession(null);
    setSelectedSessionId('');
    setNewSessionName('');
    setChosenSessionMode(null);
    setStep('project');
  };

  const handleChangeSession = () => {
    setSelectedSession(null);
    setSelectedPlaylistId('');
    setStep('session');
  };

  if (step === 'loading') {
    return (
      <PageWrapper>
        <CardContainer>
          <LogoWrapper>
            <Logo showText width={160} />
          </LogoWrapper>
          <LoadingWrapper>
            <Spinner size="3" />
            <LoadingText>Loading...</LoadingText>
          </LoadingWrapper>
        </CardContainer>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <CardContainer>
        <LogoWrapper>
          <Logo showText width={160} />
        </LogoWrapper>

        <Title>Welcome to DNA</Title>
        <Subtitle>Dailies Notes Assistant</Subtitle>

        {step === 'signin' && authProvider === 'none' && (
          <FormSection>
            <StyledForm
              onSubmit={(e) => {
                e.preventDefault();
                if (emailInput.trim()) {
                  signInWithEmail(emailInput.trim());
                }
              }}
            >
              <Label>Enter your email</Label>
              <StyledInput
                type="email"
                placeholder="you@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                autoFocus
              />
              <SubmitButton type="submit" disabled={!emailInput.trim()}>
                Continue
              </SubmitButton>
            </StyledForm>
          </FormSection>
        )}

        {step === 'signin' && authProvider === 'google' && (
          <FormSection>
            <GoogleButton onClick={signIn} disabled={isAuthLoading}>
              <GoogleIcon />
              Sign in with Google
            </GoogleButton>
          </FormSection>
        )}

        {step === 'project' && (
          <FormSection>
            <SelectionDisplay>
              <SelectionText>{userEmail}</SelectionText>
              <ChangeButton onClick={handleSignOut}>Sign out</ChangeButton>
            </SelectionDisplay>

            {isLoadingProjects && (
              <LoadingWrapper>
                <Spinner size="3" />
                <LoadingText>Loading {t.project.lowerPlural}...</LoadingText>
              </LoadingWrapper>
            )}

            {isProjectsError && (
              <ErrorText>
                {projectsError?.message || `Failed to load ${t.project.lowerPlural}`}
              </ErrorText>
            )}

            {projects && projects.length === 0 && (
              <EmptyText>No {t.project.lowerPlural} found for this email.</EmptyText>
            )}

            {projects && projects.length > 0 && (
              <Flex direction="column" gap="2">
                <Label>Select a {t.project.lower}</Label>
                <Select.Root size="3" onValueChange={handleProjectSelect}>
                  <StyledSelectTrigger placeholder={`Choose a ${t.project.lower}...`} />
                  <StyledSelectContent>
                    {projects.map((project) => (
                      <Select.Item
                        key={project.id}
                        value={project.id.toString()}
                      >
                        {project.name || `${t.project.singular} ${project.id}`}
                      </Select.Item>
                    ))}
                  </StyledSelectContent>
                </Select.Root>
              </Flex>
            )}
          </FormSection>
        )}

        {step === 'session' && (
          <FormSection>
            <SelectionDisplay>
              <SelectionText>{userEmail}</SelectionText>
              <ChangeButton onClick={handleSignOut}>Sign out</ChangeButton>
            </SelectionDisplay>

            <SelectionDisplay>
              <SelectionText>
                {selectedProject?.name || `${t.project.singular} ${selectedProject?.id}`}
              </SelectionText>
              <ChangeButton onClick={handleChangeProject}>Change</ChangeButton>
            </SelectionDisplay>

            {isLoadingSessions && (
              <LoadingWrapper>
                <Spinner size="3" />
                <LoadingText>Loading {t.session.lowerPlural}...</LoadingText>
              </LoadingWrapper>
            )}

            {isSessionsError && (
              <ErrorText>
                {sessionsError?.message || `Failed to load ${t.session.lowerPlural}`}
              </ErrorText>
            )}

            {!isLoadingSessions && (
              <>
                <SessionModeTabs
                  value={sessionMode}
                  onValueChange={handleSessionModeChange}
                >
                  <SessionTabsList>
                    <SessionTabsTrigger value="existing">
                      Open Existing
                    </SessionTabsTrigger>
                    <SessionTabsTrigger value="create">
                      Create New
                    </SessionTabsTrigger>
                  </SessionTabsList>
                  <Tabs.Content value="existing">
                    {hasSessions ? (
                      <SessionSelect
                        sessions={sessions ?? []}
                        value={selectedSessionId}
                        onValueChange={setSelectedSessionId}
                      />
                    ) : (
                      <EmptyText>No {t.session.lowerPlural} yet.</EmptyText>
                    )}
                  </Tabs.Content>
                  <Tabs.Content value="create">
                    <StyledInput
                      value={newSessionName}
                      placeholder={`${t.session.singular} name`}
                      onChange={(event) => {
                        setNewSessionName(event.target.value);
                      }}
                    />
                  </Tabs.Content>
                </SessionModeTabs>
                {createSession.isError && (
                  <ErrorText>
                    {createSession.error?.message ||
                      `Failed to create ${t.session.lower}`}
                  </ErrorText>
                )}
                {sessionOpenError && <ErrorText>{sessionOpenError}</ErrorText>}
                <Button
                  size="3"
                  onClick={() => {
                    void handleSessionContinue();
                  }}
                  disabled={
                    createSession.isPending ||
                    isOpeningSession ||
                    (sessionMode === 'create'
                      ? newSessionName.trim().length === 0
                      : !selectedSessionId)
                  }
                >
                  Continue
                </Button>
              </>
            )}
          </FormSection>
        )}

        {step === 'playlist' && (
          <FormSection>
            <SelectionDisplay>
              <SelectionText>{userEmail}</SelectionText>
              <ChangeButton onClick={handleSignOut}>Sign out</ChangeButton>
            </SelectionDisplay>

            <SelectionDisplay>
              <SelectionText>
                {selectedProject?.name || `${t.project.singular} ${selectedProject?.id}`}
              </SelectionText>
              <ChangeButton onClick={handleChangeProject}>Change</ChangeButton>
            </SelectionDisplay>

            {sessionsEnabled && selectedSession && (
              <SelectionDisplay>
                <SelectionText>{selectedSession.name}</SelectionText>
                <ChangeButton onClick={handleChangeSession}>Change</ChangeButton>
              </SelectionDisplay>
            )}

            {isLoadingPlaylists && (
              <LoadingWrapper>
                <Spinner size="3" />
                <LoadingText>Loading {t.playlist.lowerPlural}...</LoadingText>
              </LoadingWrapper>
            )}

            {isPlaylistsError && (
              <ErrorText>
                {playlistsError?.message || `Failed to load ${t.playlist.lowerPlural}`}
              </ErrorText>
            )}

            {playlists && playlists.length === 0 && (
              <EmptyText>No {t.playlist.lowerPlural} found for this {t.project.lower}.</EmptyText>
            )}

            {playlists && playlists.length > 0 && (
              <>
                <Flex direction="column" gap="2">
                  <Label>Select a {t.playlist.lower}</Label>
                  <Select.Root
                    size="3"
                    value={selectedPlaylistId}
                    onValueChange={handlePlaylistSelect}
                  >
                    <StyledSelectTrigger placeholder={`Choose a ${t.playlist.lower}...`} />
                    <StyledSelectContent>
                      {playlists.map((playlist) => (
                        <Select.Item
                          key={playlist.id}
                          value={playlist.id.toString()}
                        >
                          {playlist.code || `${t.playlist.singular} ${playlist.id}`}
                        </Select.Item>
                      ))}
                    </StyledSelectContent>
                  </Select.Root>
                </Flex>
                <Button
                  size="3"
                  onClick={handleContinue}
                  disabled={!selectedPlaylistId}
                  style={{ marginTop: '8px' }}
                >
                  Continue
                </Button>
              </>
            )}
          </FormSection>
        )}
      </CardContainer>
    </PageWrapper>
  );
}
