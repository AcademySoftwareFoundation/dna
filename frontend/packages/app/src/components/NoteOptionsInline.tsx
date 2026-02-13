import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Pencil, X, ChevronDown } from 'lucide-react';
import { SearchResult } from '@dna/core';
import { EntitySearchInput } from './EntitySearchInput';
import { EntityPill } from './EntityPill';
import { useVersionStatuses } from '../hooks';

interface NoteOptionsInlineProps {
  /** Selected users for To field */
  toValue?: SearchResult[];
  /** Selected users for CC field */
  ccValue?: SearchResult[];
  /** Subject line (text) */
  subjectValue?: string;
  /** Selected entities for Links field */
  linksValue?: SearchResult[];
  /** Note status */
  versionStatus?: string;
  /** Project ID for scoping entity search */
  projectId?: number;
  /** Current version to auto-add to links (non-removable) */
  currentVersion?: SearchResult;
  /** Version submitter shown as locked (non-removable) To recipient */
  lockedTo?: SearchResult[];
  onToChange?: (value: SearchResult[]) => void;
  onCcChange?: (value: SearchResult[]) => void;
  onSubjectChange?: (value: string) => void;
  onLinksChange?: (value: SearchResult[]) => void;
  onVersionStatusChange?: (value: string) => void;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const DisplayRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const OptionChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  min-height: 28px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.fonts.sans};
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const ChipLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ChipValue = styled.span`
  color: ${({ theme }) => theme.colors.text.primary};
  font-weight: 500;
`;

const EmptyValue = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

const EditButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const EditForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: ${({ theme }) => theme.colors.bg.base};
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-radius: ${({ theme }) => theme.radii.md};
`;

const EditHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const EditTitle = styled.span`
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const FieldRow = styled.div`
  display: flex;
  gap: 12px;
`;

const FieldGroup = styled.div<{ $flex?: number }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: ${({ $flex }) => $flex ?? 1};
`;

const FieldLabel = styled.label<{ $required?: boolean; $hasError?: boolean }>`
  font-size: 11px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ $hasError, theme }) =>
    $hasError ? theme.colors.status.error : theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;

  ${({ $required }) =>
    $required &&
    `
    &::after {
      content: ' *';
      color: inherit;
    }
  `}
`;

const RequiredIndicator = styled.span`
  font-size: 10px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.status.error};
  margin-left: 4px;
  font-weight: 500;
`;

const TextInput = styled.input`
  padding: 8px 10px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.sm};
  outline: none;
  transition: all ${({ theme }) => theme.transitions.fast};

  &::placeholder {
    color: ${({ theme }) => theme.colors.text.muted};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const SelectWrapper = styled.div`
  position: relative;
`;

const StyledSelect = styled.select`
  appearance: none;
  width: 100%;
  padding: 8px 30px 8px 10px;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.primary};
  background: ${({ theme }) => theme.colors.bg.surface};
  border: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-radius: ${({ theme }) => theme.radii.sm};
  outline: none;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent.main};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.accent.subtle};
  }
`;

const SelectIcon = styled.div`
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const PillsDisplay = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

export function NoteOptionsInline({
  toValue = [],
  ccValue = [],
  subjectValue = '',
  linksValue = [],
  versionStatus = '',
  projectId,
  currentVersion,
  lockedTo = [],
  onToChange,
  onCcChange,
  onSubjectChange,
  onLinksChange,
  onVersionStatusChange,
}: NoteOptionsInlineProps) {
  const [isEditing, setIsEditing] = useState(false);
  const { statuses, isLoading: isLoadingStatuses } = useVersionStatuses({
    projectId,
  });

  const statusLabels = useMemo(
    () =>
      statuses.reduce(
        (acc, s) => {
          acc[s.code] = s.name;
          return acc;
        },
        {} as Record<string, string>
      ),
    [statuses]
  );

  if (isEditing) {
    return (
      <Wrapper>
        <EditForm>
          <EditHeader>
            <EditTitle>Note Options</EditTitle>
            <CloseButton onClick={() => setIsEditing(false)}>
              <X size={14} />
            </CloseButton>
          </EditHeader>

          <FieldRow>
            <FieldGroup>
              <FieldLabel $required $hasError={lockedTo.length === 0 && toValue.length === 0}>
                To
              </FieldLabel>
              <EntitySearchInput
                entityTypes={['user']}
                projectId={projectId}
                value={toValue}
                onChange={(entities) => onToChange?.(entities)}
                placeholder="Search users..."
                lockedEntities={lockedTo}
              />
            </FieldGroup>
          </FieldRow>

          <FieldRow>
            <FieldGroup>
              <FieldLabel>CC</FieldLabel>
              <EntitySearchInput
                entityTypes={['user']}
                projectId={projectId}
                value={ccValue}
                onChange={(entities) => onCcChange?.(entities)}
                placeholder="Search users..."
              />
            </FieldGroup>
          </FieldRow>

          <FieldRow>
            <FieldGroup>
              <FieldLabel>Subject</FieldLabel>
              <TextInput
                type="text"
                placeholder="Subject..."
                value={subjectValue}
                onChange={(e) => onSubjectChange?.(e.target.value)}
              />
            </FieldGroup>
          </FieldRow>

          <FieldRow>
            <FieldGroup>
              <FieldLabel>Links</FieldLabel>
              <EntitySearchInput
                entityTypes={['shot', 'asset', 'task', 'version']}
                projectId={projectId}
                value={linksValue}
                onChange={(entities) => onLinksChange?.(entities)}
                placeholder="Search shots, assets, tasks..."
                lockedEntities={currentVersion ? [currentVersion] : []}
              />
            </FieldGroup>
          </FieldRow>

          <FieldGroup $flex={0}>
            <FieldLabel>Status</FieldLabel>
            <SelectWrapper>
              <StyledSelect
                value={versionStatus}
                onChange={(e) => onVersionStatusChange?.(e.target.value)}
                disabled={isLoadingStatuses}
              >
                <option value="">
                  {isLoadingStatuses ? 'Loading...' : 'Select...'}
                </option>
                {statuses.map((status) => (
                  <option key={status.code} value={status.code}>
                    {status.name}
                  </option>
                ))}
              </StyledSelect>
              <SelectIcon>
                <ChevronDown size={14} />
              </SelectIcon>
            </SelectWrapper>
          </FieldGroup>
        </EditForm>
      </Wrapper>
    );
  }

  // Combine locked + editable for display only
  const allTo = [...lockedTo, ...toValue];
  const allLinks = currentVersion ? [currentVersion, ...linksValue] : linksValue;

  return (
    <Wrapper>
      <DisplayRow>
        <OptionChip>
          <ChipLabel>To:</ChipLabel>
          {allTo.length > 0 ? (
            <PillsDisplay>
              {allTo.slice(0, 2).map((entity) => (
                <EntityPill
                  key={`${entity.type}-${entity.id}`}
                  entity={entity}
                  removable={false}
                />
              ))}
              {allTo.length > 2 && (
                <ChipValue>+{allTo.length - 2} more</ChipValue>
              )}
            </PillsDisplay>
          ) : (
            <>
              <EmptyValue>—</EmptyValue>
              <RequiredIndicator>(required)</RequiredIndicator>
            </>
          )}
        </OptionChip>
        <OptionChip>
          <ChipLabel>CC:</ChipLabel>
          {ccValue.length > 0 ? (
            <PillsDisplay>
              {ccValue.slice(0, 2).map((entity) => (
                <EntityPill
                  key={`${entity.type}-${entity.id}`}
                  entity={entity}
                  removable={false}
                />
              ))}
              {ccValue.length > 2 && (
                <ChipValue>+{ccValue.length - 2} more</ChipValue>
              )}
            </PillsDisplay>
          ) : (
            <EmptyValue>—</EmptyValue>
          )}
        </OptionChip>
        <OptionChip>
          <ChipLabel>Subject:</ChipLabel>
          {subjectValue ? (
            <ChipValue>{subjectValue}</ChipValue>
          ) : (
            <EmptyValue>—</EmptyValue>
          )}
        </OptionChip>
        <OptionChip>
          <ChipLabel>Links:</ChipLabel>
          {allLinks.length > 0 ? (
            <PillsDisplay>
              {allLinks.slice(0, 2).map((entity) => (
                <EntityPill
                  key={`${entity.type}-${entity.id}`}
                  entity={entity}
                  removable={false}
                />
              ))}
              {allLinks.length > 2 && (
                <ChipValue>+{allLinks.length - 2} more</ChipValue>
              )}
            </PillsDisplay>
          ) : (
            <EmptyValue>—</EmptyValue>
          )}
        </OptionChip>
        <OptionChip>
          <ChipLabel>Status:</ChipLabel>
          {versionStatus ? (
            <ChipValue>
              {statusLabels[versionStatus] || versionStatus}
            </ChipValue>
          ) : (
            <EmptyValue>—</EmptyValue>
          )}
        </OptionChip>
        <EditButton
          onClick={() => setIsEditing(true)}
          title="Edit note options"
        >
          <Pencil size={14} />
        </EditButton>
      </DisplayRow>
    </Wrapper>
  );
}
