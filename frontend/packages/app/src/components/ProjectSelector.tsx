import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Button, Flex, Select, Spinner } from '@radix-ui/themes';
import { Playlist, Project } from '@dna/core';
import {
  useGetProjectsForUser,
  useGetPlaylistsForProject,
  apiHandler,
} from '../api';
import { Logo } from './Logo';
import {
  StyledTextField,
  StyledSelectTrigger,
  StyledSelectContent,
} from './FormInputs';

export const STORAGE_KEYS = {
  USER_EMAIL: 'dna_user_email',
  PROJECT: 'dna_selected_project',
  SESSION_TOKEN: 'dna_session_token',
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

const StyledForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

type Step = 'loading' | 'login' | 'project' | 'playlist';

function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
  } catch {
    return null;
  }
}

function getStoredProject(): Project | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.PROJECT);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
  } catch {
    return null;
  }
}

function saveEmail(email: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
  } catch {
    // Ignore storage errors
  }
}

function saveProject(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECT, JSON.stringify(project));
  } catch {
    // Ignore storage errors
  }
}

function saveSessionToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
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

function clearStoredSessionToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
  } catch {
    // Ignore storage errors
  }
}

export function clearUserSession(): void {
  clearStoredEmail();
  clearStoredProject();
  clearStoredSessionToken();
  apiHandler.setUser(null);
}

export function ProjectSelector({ onSelectionComplete }: ProjectSelectorProps) {
  const [step, setStep] = useState<Step>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');

  useEffect(() => {
    const storedEmail = getStoredEmail();
    const storedProject = getStoredProject();
    const storedToken = getStoredSessionToken();

    if (storedEmail && storedToken) {
      // Restore session from localStorage
      apiHandler.setUser({
        id: storedEmail,
        email: storedEmail,
        token: storedToken,
      });
      setSubmittedEmail(storedEmail);

      if (storedProject) {
        setSelectedProject(storedProject);
        setStep('playlist');
      } else {
        setStep('project');
      }
    } else {
      setStep('login');
    }
  }, []);

  const {
    data: projects,
    isLoading: isLoadingProjects,
    isError: isProjectsError,
    error: projectsError,
  } = useGetProjectsForUser(submittedEmail);

  const {
    data: playlists,
    isLoading: isLoadingPlaylists,
    isError: isPlaylistsError,
    error: playlistsError,
  } = useGetPlaylistsForProject(selectedProject?.id ?? null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const response = await apiHandler.login({
        username: username.trim(),
        password: password.trim(),
      });

      const email = response.email;
      saveEmail(email);
      saveSessionToken(response.session_token);
      apiHandler.setUser({
        id: email,
        email,
        name: response.name,
        token: response.session_token,
      });
      setSubmittedEmail(email);
      setStep('project');
    } catch {
      setLoginError('Invalid username or password');
    } finally {
      setIsLoggingIn(false);
    }
  };

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
    if (selectedPlaylistId && playlists && submittedEmail && selectedProject) {
      const playlist = playlists.find(
        (p) => p.id.toString() === selectedPlaylistId
      );
      if (playlist) {
        onSelectionComplete(selectedProject, playlist, submittedEmail);
      }
    }
  };

  const handleBackToLogin = () => {
    clearStoredEmail();
    clearStoredProject();
    clearStoredSessionToken();
    apiHandler.setUser(null);
    setSubmittedEmail(null);
    setSelectedProject(null);
    setSelectedPlaylistId('');
    setUsername('');
    setPassword('');
    setLoginError(null);
    setStep('login');
  };

  const handleBackToProject = () => {
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

        {step === 'login' && (
          <StyledForm onSubmit={handleLoginSubmit}>
            <FormSection>
              <Label htmlFor="username">Username</Label>
              <StyledTextField
                id="username"
                placeholder="ShotGrid login"
                type="text"
                size="3"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Label htmlFor="password">Password</Label>
              <StyledTextField
                id="password"
                placeholder="Password"
                type="password"
                size="3"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {loginError && <ErrorText>{loginError}</ErrorText>}
            </FormSection>
            <Button
              type="submit"
              size="3"
              disabled={!username.trim() || !password.trim() || isLoggingIn}
              style={{ marginTop: '8px' }}
            >
              {isLoggingIn ? 'Signing in...' : 'Sign In'}
            </Button>
          </StyledForm>
        )}

        {step === 'project' && (
          <FormSection>
            <SelectionDisplay>
              <SelectionText>{submittedEmail}</SelectionText>
              <ChangeButton onClick={handleBackToLogin}>Change</ChangeButton>
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
              <SelectionText>{submittedEmail}</SelectionText>
              <ChangeButton onClick={handleBackToLogin}>Change</ChangeButton>
            </SelectionDisplay>

            <SelectionDisplay>
              <SelectionText>
                {selectedProject?.name || `Project ${selectedProject?.id}`}
              </SelectionText>
              <ChangeButton onClick={handleBackToProject}>Change</ChangeButton>
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
