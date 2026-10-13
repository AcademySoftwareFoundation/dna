import { useMemo } from 'react';
import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import App from './App';
import { ACCENTS, getTheme, GlobalStyles } from './styles';
import { EventProvider, ToastProvider, AuthProvider, useThemeMode } from './contexts';
import { HotkeysProvider } from './hotkeys';

export function ThemedApp() {
  const { mode, accent } = useThemeMode();
  const activeTheme = useMemo(() => getTheme(mode, accent), [mode, accent]);
  return (
    <ThemeProvider theme={activeTheme}>
      <Theme appearance={mode} accentColor={ACCENTS[accent].radix}>
        <GlobalStyles />
        <AuthProvider>
          <HotkeysProvider>
            <ToastProvider>
              <EventProvider>
                <App />
              </EventProvider>
            </ToastProvider>
          </HotkeysProvider>
        </AuthProvider>
      </Theme>
    </ThemeProvider>
  );
}
