import { useState, type ReactNode } from 'react';
import styled from 'styled-components';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';

interface ExpandableSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

const StyledRoot = styled(Collapsible.Root)`
  display: flex;
  flex-direction: column;
`;

const Trigger = styled(Collapsible.Trigger)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 500;
  font-family: ${({ theme }) => theme.fonts.sans};
  color: ${({ theme }) => theme.colors.text.secondary};
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const IconWrapper = styled.span<{ $open: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform ${({ theme }) => theme.transitions.fast};
  transform: rotate(${({ $open }) => ($open ? '90deg' : '0deg')});
`;

const Content = styled(Collapsible.Content)`
  overflow: hidden;

  &[data-state='open'] {
    animation: slideDown 200ms ease-out;
  }

  &[data-state='closed'] {
    animation: slideUp 200ms ease-out;
  }

  @keyframes slideDown {
    from {
      height: 0;
      opacity: 0;
    }
    to {
      height: var(--radix-collapsible-content-height);
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      height: var(--radix-collapsible-content-height);
      opacity: 1;
    }
    to {
      height: 0;
      opacity: 0;
    }
  }
`;

const ContentInner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0 4px 0;
`;

export function ExpandableSection({
  title,
  children,
  defaultOpen = false,
}: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <StyledRoot open={open} onOpenChange={setOpen}>
      <Trigger>
        <IconWrapper $open={open}>
          <ChevronRight size={14} />
        </IconWrapper>
        {title}
      </Trigger>
      <Content>
        <ContentInner>{children}</ContentInner>
      </Content>
    </StyledRoot>
  );
}
