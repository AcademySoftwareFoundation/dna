import { ThemeProvider } from 'styled-components';
import { Theme } from '@radix-ui/themes';
import App from './App';
import { darkTheme, lightTheme, GlobalStyles } from './styles';
import { EventProvider, ToastProvider, AuthProvider, useThemeMode } from './contexts';
import { HotkeysProvider } from './hotkeys';

export function ThemedApp() {
  const { mode } = useThemeMode();
  const activeTheme = mode === 'light' ? lightTheme : darkTheme;
  return (
    <ThemeProvider theme={activeTheme}>
      <Theme appearance={mode} accentColor="violet">
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
