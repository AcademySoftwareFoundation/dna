import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Button, Flex, Select, Spinner } from '@radix-ui/themes';
import { Playlist, Project } from '@dna/core';
import { useGetProjectsForUser, useGetPlaylistsForProject } from '../api';
import { AuthCard, AuthFormSection as FormSection, AuthLabel as Label } from './AuthCard';
import { SignInForm } from './SignInForm';
import {
  StyledSelectTrigger,
  StyledSelectContent,
} from './FormInputs';
import { useAuth } from '../contexts';
import { useNomenclature } from '../nomenclature';

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
  const t = useNomenclature();
  const { isAuthenticated, isLoading: isAuthLoading, user, signOut } = useAuth();
  const [step, setStep] = useState<Step>('loading');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');

  const userEmail = user?.email || null;

  useEffect(() => {
    if (!isAuthenticated || !userEmail) {
      // Keep the sign-in form mounted while a login attempt is in flight so
      // failures can show an error instead of remounting a blank form.
      setStep('signin');
      return;
    }

    if (isAuthLoading) {
      setStep('loading');
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
    const project = projects?.find((p) => p.id === projectId);
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
      <AuthCard showHeading={false}>
        <LoadingWrapper>
          <Spinner size="3" />
          <LoadingText>Loading...</LoadingText>
        </LoadingWrapper>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      {step === 'signin' && <SignInForm />}

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
    </AuthCard>
  );
}
