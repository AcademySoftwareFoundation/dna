import { type ReactNode } from 'react';
import styled from 'styled-components';

interface SquareButtonProps {
  children: ReactNode;
  variant?: 'cta' | 'neutral';
  onClick?: () => void;
}

const StyledSquareButton = styled.button<{ $variant?: 'cta' | 'neutral' }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  gap: 4px;
  border-radius: ${({ theme }) => theme.radii.lg};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  font-family: ${({ theme }) => theme.fonts.sans};
  font-size: 10px;
  font-weight: 500;

  ${({ $variant, theme }) =>
    $variant === 'cta'
      ? `
    background: ${theme.colors.accent.main};
    border: none;
    color: white;

    &:hover {
      background: ${theme.colors.accent.hover};
    }

    &:active {
      transform: translateY(1px);
    }
  `
      : `
    background: transparent;
    border: none;
    color: ${theme.colors.text.muted};

    &:hover {
      color: ${theme.colors.text.primary};
    }

    &:active {
      transform: translateY(1px);
    }
  `}

  svg {
    width: 20px;
    height: 20px;
  }
`;

export function SquareButton({
  children,
  variant = 'neutral',
  onClick,
}: SquareButtonProps) {
  return (
    <StyledSquareButton $variant={variant} onClick={onClick}>
      {children}
    </StyledSquareButton>
  );
}
