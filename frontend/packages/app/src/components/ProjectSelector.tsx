import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Button, Flex, Select, Spinner } from '@radix-ui/themes';
import { Playlist, Project } from '@dna/core';
import { useGetProjectsForUser, useGetPlaylistsForProject } from '../api';
import { Logo } from './Logo';
import {
  StyledSelectTrigger,
  StyledSelectContent,
} from './FormInputs';
import { useAuth } from '../contexts';

export const STORAGE_KEYS = {
  USER_EMAIL: 'dna_user_email',
  PROJECT: 'dna_selected_project',
};

interface ProjectSelectorProps {
  onSelectionComplete: (
    project: Project,
    playlist: Playlist,
    userEmail: string
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

type Step = 'loading' | 'signin' | 'project' | 'playlist';

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  const { isAuthenticated, isLoading: isAuthLoading, user, signIn, signInWithEmail, signOut, authProvider } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [step, setStep] = useState<Step>('loading');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');

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
      setStep('playlist');
    } else {
      setStep('project');
    }
  }, [isAuthenticated, isAuthLoading, userEmail]);

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

  const handleProjectSelect = (projectId: string) => {
    const project = projects?.find((p) => p.id.toString() === projectId);
    if (project) {
      setSelectedProject(project);
      saveProject(project);
      setSelectedPlaylistId('');
      setStep('playlist');
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
        onSelectionComplete(selectedProject, playlist, userEmail);
      }
    }
  };

  const handleSignOut = () => {
    clearStoredProject();
    setSelectedProject(null);
    setSelectedPlaylistId('');
    signOut();
    setStep('signin');
  };

  const handleChangeProject = () => {
    clearStoredProject();
    setSelectedProject(null);
    setSelectedPlaylistId('');
    setStep('project');
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
              <Label>Enter your ShotGrid email</Label>
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
                <LoadingText>Loading projects...</LoadingText>
              </LoadingWrapper>
            )}

            {isProjectsError && (
              <ErrorText>
                {projectsError?.message || 'Failed to load projects'}
              </ErrorText>
            )}

            {projects && projects.length === 0 && (
              <EmptyText>No projects found for this email.</EmptyText>
            )}

            {projects && projects.length > 0 && (
              <Flex direction="column" gap="2">
                <Label>Select a project</Label>
                <Select.Root size="3" onValueChange={handleProjectSelect}>
                  <StyledSelectTrigger placeholder="Choose a project..." />
                  <StyledSelectContent>
                    {projects.map((project) => (
                      <Select.Item
                        key={project.id}
                        value={project.id.toString()}
                      >
                        {project.name || `Project ${project.id}`}
                      </Select.Item>
                    ))}
                  </StyledSelectContent>
                </Select.Root>
              </Flex>
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
                {selectedProject?.name || `Project ${selectedProject?.id}`}
              </SelectionText>
              <ChangeButton onClick={handleChangeProject}>Change</ChangeButton>
            </SelectionDisplay>

            {isLoadingPlaylists && (
              <LoadingWrapper>
                <Spinner size="3" />
                <LoadingText>Loading playlists...</LoadingText>
              </LoadingWrapper>
            )}

            {isPlaylistsError && (
              <ErrorText>
                {playlistsError?.message || 'Failed to load playlists'}
              </ErrorText>
            )}

            {playlists && playlists.length === 0 && (
              <EmptyText>No playlists found for this project.</EmptyText>
            )}

            {playlists && playlists.length > 0 && (
              <>
                <Flex direction="column" gap="2">
                  <Label>Select a playlist</Label>
                  <Select.Root
                    size="3"
                    value={selectedPlaylistId}
                    onValueChange={handlePlaylistSelect}
                  >
                    <StyledSelectTrigger placeholder="Choose a playlist..." />
                    <StyledSelectContent>
                      {playlists.map((playlist) => (
                        <Select.Item
                          key={playlist.id}
                          value={playlist.id.toString()}
                        >
                          {playlist.code || `Playlist ${playlist.id}`}
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
