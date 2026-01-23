import * as Toast from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import styled from 'styled-components';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: Omit<ToastMessage, 'id'>) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ToastViewport = styled(Toast.Viewport)`
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 380px;
  max-width: 100vw;
  margin: 0;
  list-style: none;
  z-index: 9999;
  outline: none;
`;

const ToastRoot = styled(Toast.Root)<{ $type: ToastType }>`
  background-color: ${({ $type }) => {
    switch ($type) {
      case 'warning':
        return '#fef3c7';
      case 'error':
        return '#fee2e2';
      case 'success':
        return '#d1fae5';
      default:
        return '#e0e7ff';
    }
  }};
  border: 1px solid
    ${({ $type }) => {
      switch ($type) {
        case 'warning':
          return '#f59e0b';
        case 'error':
          return '#ef4444';
        case 'success':
          return '#10b981';
        default:
          return '#6366f1';
      }
    }};
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 4px;

  &[data-state='open'] {
    animation: slideIn 200ms ease-out;
  }

  &[data-state='closed'] {
    animation: slideOut 200ms ease-in;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;

const ToastTitle = styled(Toast.Title)<{ $type: ToastType }>`
  font-weight: 600;
  font-size: 14px;
  color: ${({ $type }) => {
    switch ($type) {
      case 'warning':
        return '#92400e';
      case 'error':
        return '#991b1b';
      case 'success':
        return '#065f46';
      default:
        return '#3730a3';
    }
  }};
`;

const ToastDescription = styled(Toast.Description)<{ $type: ToastType }>`
  font-size: 13px;
  color: ${({ $type }) => {
    switch ($type) {
      case 'warning':
        return '#a16207';
      case 'error':
        return '#b91c1c';
      case 'success':
        return '#047857';
      default:
        return '#4338ca';
    }
  }};
`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: Omit<ToastMessage, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { ...message, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      <Toast.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastRoot
            key={toast.id}
            $type={toast.type}
            duration={toast.duration ?? 8000}
            onOpenChange={(open) => {
              if (!open) dismissToast(toast.id);
            }}
          >
            <ToastTitle $type={toast.type}>{toast.title}</ToastTitle>
            {toast.description && (
              <ToastDescription $type={toast.type}>{toast.description}</ToastDescription>
            )}
          </ToastRoot>
        ))}
        <ToastViewport />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
