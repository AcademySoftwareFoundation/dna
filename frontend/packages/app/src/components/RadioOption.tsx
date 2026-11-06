import styled from 'styled-components';
import * as RadioGroup from '@radix-ui/react-radio-group';

export const RadioOptionGroup = styled(RadioGroup.Root)`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const OptionContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const OptionLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

export const OptionDescription = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
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

interface RadioOptionProps {
  value: string;
  id: string;
  label: string;
  description: string;
}

/** One choice in a RadioOptionGroup, with its label and description. */
export function RadioOption({ value, id, label, description }: RadioOptionProps) {
  return (
    <RadioItem>
      <RadioIndicator value={value} id={id}>
        <RadioDot />
      </RadioIndicator>
      <OptionContent>
        <OptionLabel>{label}</OptionLabel>
        <OptionDescription>{description}</OptionDescription>
      </OptionContent>
    </RadioItem>
  );
}
