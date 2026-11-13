import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import '@radix-ui/themes/styles.css';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {
  ProjectSelector,
  STORAGE_KEYS,
} from '@dna-app/components/ProjectSelector';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {PROJECTS} from './appMocks/api';
import {DemoStateProvider} from './appMocks/demoState';
import {Guide} from './Guide';
import {isTouch, usePinPopoverOnTouch} from './pinPopover';
import styles from './styles.module.css';

const SAMPLE_EMAIL = 'you@example.com';
/** What tapping the new session's name field fills in, on touch screens. */
const SAMPLE_SESSION_NAME = 'Friday Review';
/** The app's placeholders on the session step's two text fields (ProjectSelector). */
const SESSION_NAME_PLACEHOLDER = 'Session name';
const SESSION_SEARCH_PLACEHOLDER = 'Search sessions...';


/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches styles.successOut. */
const FADE_MS = 400;

/** demo -> (final Continue) success -> fading -> demo, from the start. */
type Phase = 'demo' | 'success' | 'fading';

// The app's real login screen, with sample projects and playlists and a
// sign-in that always succeeds (see ./appMocks). Browser-only: loaded by
// ./index.tsx inside <BrowserOnly>.
//
// With `sessions`, the screen has the sessions feature on and opens where
// the sessions guide picks up: signed in, project chosen, at the step that
// opens or creates a session (LiveSessionsDemo).
export default function LoginDemo({sessions = false}: {sessions?: boolean}) {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const [run, setRun] = useState(0);
  // The sign-in screen keeps a query client for its session step; nothing
  // here fetches.
  const [queryClient] = useState(() => new QueryClient());
  const [phase, setPhase] = useState<Phase>('demo');
  const [playlist, setPlaylist] = useState('');

  // Show the checkmark, reset the demo behind it, then fade it away.
  useEffect(() => {
    if (phase === 'demo') return;
    const timer =
      phase === 'success'
        ? setTimeout(() => {
            setRun((n) => n + 1);
            setPhase('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setPhase('demo'), FADE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // The app remembers the last project, and reads it as it mounts: clear it
  // so every run starts from sign-in, or, for the sessions demo, set it so
  // every run starts with the project chosen. Done while rendering, ahead
  // of the screen below mounting; an effect here would run after it.
  const primedRun = useRef(-1);
  if (primedRun.current !== run) {
    primedRun.current = run;
    if (sessions) localStorage.setItem(STORAGE_KEYS.PROJECT, JSON.stringify(PROJECTS[0]));
    else localStorage.removeItem(STORAGE_KEYS.PROJECT);
  }

  // The app autofocuses its email field once its loading step clears. On a
  // docs page that would steal focus and scroll to the demo, on load and on
  // every automatic reset (most of a phone screen), so undo focus that
  // arrives before the reader next touches the page.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // The focus jump fires its scroll event a frame later, so this still
    // holds the position from before it when focusin runs.
    let scrollTop = window.scrollY;
    const onScroll = () => {
      scrollTop = window.scrollY;
    };
    const onFocusIn = (event: FocusEvent) => {
      stop();
      (event.target as HTMLElement).blur();
      window.scrollTo({top: scrollTop});
    };
    const stop = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointerdown', stop, true);
      window.removeEventListener('keydown', stop, true);
      root.removeEventListener('focusin', onFocusIn);
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
    root.addEventListener('focusin', onFocusIn);
    return stop;
  }, [run]);

  // Clicking the empty email field fills in a sample address. The field is
  // React-controlled, so set it the way typing would and let onChange run.
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const onClick = (event: MouseEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.value) return;
      // The email field always; the new session's name only on touch
      // screens, where it saves bringing up the keyboard (see below).
      const sample =
        input.type === 'email'
          ? SAMPLE_EMAIL
          : input.placeholder === SESSION_NAME_PLACEHOLDER && isTouch()
            ? SAMPLE_SESSION_NAME
            : null;
      if (sample === null) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, sample);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    };
    app.addEventListener('click', onClick);
    return () => app.removeEventListener('click', onClick);
  }, []);

  // On touch screens, keep the on-screen keyboard down for the new session's
  // name too: a tap fills it in (above), and the keyboard would resize the
  // page under the demo.
  useEffect(() => {
    const app = appRef.current;
    if (!sessions || !app || !isTouch()) return;
    const quiet = () => {
      const input = app.querySelector<HTMLInputElement>(
        `input[placeholder="${SESSION_NAME_PLACEHOLDER}"]`,
      );
      if (input && input.inputMode !== 'none') input.inputMode = 'none';
    };
    const observer = new MutationObserver(quiet);
    observer.observe(app, {subtree: true, childList: true});
    quiet();
    return () => observer.disconnect();
  }, [sessions]);

  // On touch screens, the session picker's list stays where it opened as
  // the page scrolls, and its search field leaves the keyboard down.
  usePinPopoverOnTouch(sessions, SESSION_SEARCH_PLACEHOLDER);

  // Keep readers' password managers and browser autofill out of the field:
  // it's read-only (which everything skips) and opted out by name for the
  // managers that document one. The click-to-fill above still works, as it
  // sets the value programmatically. Every reset remounts the form, so
  // re-apply whenever the demo's markup changes.
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const optOut = () => {
      const input = app.querySelector<HTMLInputElement>('input[type="email"]');
      if (!input || input.readOnly) return;
      input.readOnly = true;
      input.autocomplete = 'off';
      input.setAttribute('data-1p-ignore', ''); // 1Password
      input.setAttribute('data-lpignore', 'true'); // LastPass
      input.setAttribute('data-bwignore', ''); // Bitwarden
      input.setAttribute('data-form-type', 'other'); // Dashlane
      input.form?.setAttribute('autocomplete', 'off');
    };
    const observer = new MutationObserver(optOut);
    observer.observe(app, {subtree: true, childList: true});
    optOut();
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={styles.root}>
      <div ref={appRef} className={styles.app}>
        <DemoStateProvider
          key={run}
          mode={colorMode}
          sessions={sessions}
          initialEmail={sessions ? SAMPLE_EMAIL : null}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider theme={theme}>
              <Theme
                appearance={colorMode}
                accentColor={ACCENTS[accent].radix}
                // The card sits straight on the docs page: no Radix background.
                hasBackground={false}>
                <ProjectSelector
                  onSelectionComplete={(_project, selected) => {
                    setPlaylist(selected.code ?? `Playlist ${selected.id}`);
                    setPhase('success');
                  }}
                />
              </Theme>
            </ThemeProvider>
          </QueryClientProvider>
        </DemoStateProvider>
      </div>

      {phase === 'demo' && <Guide rootRef={rootRef} appRef={appRef} />}

      {phase !== 'demo' && (
        <div
          role="status"
          className={clsx(styles.success, phase === 'fading' && styles.successOut)}>
          <svg className={styles.check} viewBox="0 0 52 52" aria-hidden="true">
            <circle className={styles.checkCircle} cx="26" cy="26" r="24" />
            <path className={styles.checkMark} d="M15 27l7 7 15-16" />
          </svg>
          <span className={styles.srOnly}>Signed in. DNA opens {playlist}.</span>
        </div>
      )}
    </div>
  );
}
