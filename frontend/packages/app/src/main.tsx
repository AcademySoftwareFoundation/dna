import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import App from './App';
import { darkTheme, lightTheme, GlobalStyles } from './styles';
import { EventProvider, ToastProvider, ThemeModeProvider, useThemeMode } from './contexts';
import { HotkeysProvider } from './hotkeys';
import '@radix-ui/themes/styles.css';
import './index.css';

const queryClient = new QueryClient();

function ThemedApp() {
  const { mode } = useThemeMode();
  const activeTheme = mode === 'light' ? lightTheme : darkTheme;
  return (
    <ThemeProvider theme={activeTheme}>
      <Theme appearance={mode} accentColor="violet">
        <GlobalStyles />
        <HotkeysProvider>
          <ToastProvider>
            <EventProvider>
              <App />
            </EventProvider>
          </ToastProvider>
        </HotkeysProvider>
      </Theme>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <ThemedApp />
      </ThemeModeProvider>
    </QueryClientProvider>
  </StrictMode>
);
