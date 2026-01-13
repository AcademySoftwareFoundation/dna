import styled from 'styled-components';
import { Select, TextField } from '@radix-ui/themes';

export const StyledTextField = styled(TextField.Root)`
  &.rt-TextFieldRoot {
    height: 44px;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.subtle};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: none;
    transition: border-color ${({ theme }) => theme.transitions.fast},
      box-shadow ${({ theme }) => theme.transitions.fast};

    &:focus-within {
      border-color: ${({ theme }) => theme.colors.accent.main};
      box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.accent.main};
    }

    input {
      font-family: ${({ theme }) => theme.fonts.sans};
      font-size: 14px;
      color: ${({ theme }) => theme.colors.text.primary};

      &::placeholder {
        color: ${({ theme }) => theme.colors.text.muted};
      }
    }
  }
`;

export const StyledSelectTrigger = styled(Select.Trigger)`
  &&.rt-SelectTrigger {
    height: 44px;
    background: ${({ theme }) => theme.colors.bg.surface};
    border: 1px solid ${({ theme }) => theme.colors.border.subtle};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: none;
    font-family: ${({ theme }) => theme.fonts.sans};
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text.primary};
    transition: border-color ${({ theme }) => theme.transitions.fast},
      box-shadow ${({ theme }) => theme.transitions.fast};

    &:focus,
    &[data-state='open'] {
      border-color: ${({ theme }) => theme.colors.accent.main};
      box-shadow: 0 0 0 1px ${({ theme }) => theme.colors.accent.main};
    }

    span {
      color: ${({ theme }) => theme.colors.text.primary};
    }

    span[data-placeholder] {
      color: ${({ theme }) => theme.colors.text.muted};
    }
  }
`;

export const StyledSelectContent = styled(Select.Content)`
  &&.rt-SelectContent {
    background: ${({ theme }) => theme.colors.bg.elevated};
    border: 1px solid ${({ theme }) => theme.colors.border.subtle};
    border-radius: ${({ theme }) => theme.radii.md};
    box-shadow: ${({ theme }) => theme.shadows.lg};
  }

  && .rt-SelectItem {
    font-family: ${({ theme }) => theme.fonts.sans};
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text.primary};
    border-radius: ${({ theme }) => theme.radii.sm};

    span {
      color: ${({ theme }) => theme.colors.text.primary};
    }

    &[data-highlighted] {
      background: ${({ theme }) => theme.colors.accent.subtle};
      color: ${({ theme }) => theme.colors.accent.main};

      span {
        color: ${({ theme }) => theme.colors.accent.main};
      }
    }
  }
`;
