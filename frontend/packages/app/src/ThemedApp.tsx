import { useMemo } from 'react';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import { isDesktopSignInPath } from '@dna/core';
import App from './App';
import { DesktopSignIn } from './components/DesktopSignIn';
import { ACCENTS, getTheme, GlobalStyles } from './styles';
import {
  EventProvider,
  ToastProvider,
  AuthProvider,
  NoteFocusProvider,
  useThemeMode,
} from './contexts';
import { HotkeysProvider } from './hotkeys';

export function ThemedApp() {
  const { mode, accent } = useThemeMode();
  const activeTheme = useMemo(() => getTheme(mode, accent), [mode, accent]);
  return (
    <ThemeProvider theme={activeTheme}>
      <Theme appearance={mode} accentColor={ACCENTS[accent].radix}>
        <GlobalStyles />
        <AuthProvider>
          {isDesktopSignInPath(window.location.pathname) ? (
            <DesktopSignIn />
          ) : (
            <HotkeysProvider>
              <ToastProvider>
                <EventProvider>
                  <NoteFocusProvider>
                    <App />
                  </NoteFocusProvider>
                </EventProvider>
              </ToastProvider>
            </HotkeysProvider>
          )}
        </AuthProvider>
      </Theme>
    </ThemeProvider>
  );
}
