import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import App from './App';
import { theme, GlobalStyles } from './styles';
import { EventProvider, ToastProvider } from './contexts';
import '@radix-ui/themes/styles.css';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <Theme appearance="dark" accentColor="violet">
          <GlobalStyles />
          <ToastProvider>
            <EventProvider>
              <App />
            </EventProvider>
          </ToastProvider>
        </Theme>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
