import { useState } from 'react';
import styled from 'styled-components';
import { Pencil, X, ChevronDown } from 'lucide-react';

interface NoteOptionsInlineProps {
  toValue?: string;
  ccValue?: string;
  subjectValue?: string;
  linksValue?: string;
  versionStatus?: string;
  onToChange?: (value: string) => void;
  onCcChange?: (value: string) => void;
  onSubjectChange?: (value: string) => void;
  onLinksChange?: (value: string) => void;
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

const FieldLabel = styled.label`
  font-size: 11px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.5px;
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

const statusLabels: Record<string, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  needs_revision: 'Needs Revision',
  final: 'Final',
};

export function NoteOptionsInline({
  toValue = '',
  ccValue = '',
  subjectValue = '',
  linksValue = '',
  versionStatus = '',
  onToChange,
  onCcChange,
  onSubjectChange,
  onLinksChange,
  onVersionStatusChange,
}: NoteOptionsInlineProps) {
  const [isEditing, setIsEditing] = useState(false);

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
              <FieldLabel>To</FieldLabel>
              <TextInput
                type="text"
                placeholder="Recipients..."
                value={toValue}
                onChange={(e) => onToChange?.(e.target.value)}
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>CC</FieldLabel>
              <TextInput
                type="text"
                placeholder="CC..."
                value={ccValue}
                onChange={(e) => onCcChange?.(e.target.value)}
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
            <FieldGroup>
              <FieldLabel>Links</FieldLabel>
              <TextInput
                type="text"
                placeholder="Links..."
                value={linksValue}
                onChange={(e) => onLinksChange?.(e.target.value)}
              />
            </FieldGroup>
          </FieldRow>

          <FieldGroup $flex={0}>
            <FieldLabel>Version Status</FieldLabel>
            <SelectWrapper>
              <StyledSelect
                value={versionStatus}
                onChange={(e) => onVersionStatusChange?.(e.target.value)}
              >
                <option value="">Select...</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="needs_revision">Needs Revision</option>
                <option value="final">Final</option>
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

  return (
    <Wrapper>
      <DisplayRow>
        <OptionChip>
          <ChipLabel>To:</ChipLabel>
          {toValue ? (
            <ChipValue>{toValue}</ChipValue>
          ) : (
            <EmptyValue>—</EmptyValue>
          )}
        </OptionChip>
        <OptionChip>
          <ChipLabel>CC:</ChipLabel>
          {ccValue ? (
            <ChipValue>{ccValue}</ChipValue>
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
          {linksValue ? (
            <ChipValue>{linksValue}</ChipValue>
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
