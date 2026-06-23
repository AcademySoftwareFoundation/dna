import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeModeProvider, FeatureFlagsProvider } from './contexts';
import { ThemedApp } from './ThemedApp';
import '@radix-ui/themes/styles.css';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <FeatureFlagsProvider>
          <ThemedApp />
        </FeatureFlagsProvider>
      </ThemeModeProvider>
    </QueryClientProvider>
  </StrictMode>
);
