import { type ReactNode } from 'react';
import styled from 'styled-components';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from '@radix-ui/themes';

interface SplitButtonMenuItem {
  label: string;
  onSelect?: () => void;
}

interface SplitButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  menuItems?: SplitButtonMenuItem[];
  onRightClick?: () => void;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

const SplitButtonWrapper = styled.div`
  display: flex;
  align-items: stretch;
  height: 32px;

  &:hover button {
    border-color: ${({ theme }) => theme.colors.border.strong};
  }
`;

const MainButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  font-size: 14px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-right: none;
  border-top-left-radius: ${({ theme }) => theme.radii.md};
  border-bottom-left-radius: ${({ theme }) => theme.radii.md};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};
  white-space: nowrap;

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:active {
    background: ${({ theme }) => theme.colors.bg.overlay};
    transform: translateY(1px);
  }
`;

const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  border: 1px solid ${({ theme }) => theme.colors.border.default};
  border-left: 1px solid ${({ theme }) => theme.colors.border.subtle};
  border-top-right-radius: ${({ theme }) => theme.radii.md};
  border-bottom-right-radius: ${({ theme }) => theme.radii.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.text.secondary};
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background: ${({ theme }) => theme.colors.bg.surfaceHover};
    color: ${({ theme }) => theme.colors.text.primary};
    border-color: ${({ theme }) => theme.colors.border.strong};
  }

  &:active {
    background: ${({ theme }) => theme.colors.bg.overlay};
    transform: translateY(1px);
  }
`;

export function SplitButton({
  children,
  onClick,
  menuItems,
  onRightClick,
  leftSlot,
  rightSlot,
}: SplitButtonProps) {
  const renderRightButton = () => {
    if (menuItems && menuItems.length > 0) {
      return (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <TriggerButton>
              {rightSlot ?? <ChevronDown size={14} />}
            </TriggerButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {menuItems.map((item, index) => (
              <DropdownMenu.Item key={index} onSelect={item.onSelect}>
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      );
    }

    return (
      <TriggerButton onClick={onRightClick}>
        {rightSlot ?? <ChevronDown size={14} />}
      </TriggerButton>
    );
  };

  return (
    <SplitButtonWrapper>
      <MainButton onClick={onClick}>
        {leftSlot}
        {children}
      </MainButton>
      {renderRightButton()}
    </SplitButtonWrapper>
  );
}
