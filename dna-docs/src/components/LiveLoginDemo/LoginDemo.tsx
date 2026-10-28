import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {useColorMode} from '@docusaurus/theme-common';
import {
  ProjectSelector,
  STORAGE_KEYS,
} from '@dna-app/components/ProjectSelector';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {DemoStateProvider} from './appMocks/demoState';
import {Guide} from './Guide';
import styles from './styles.module.css';

const SAMPLE_EMAIL = 'you@example.com';

/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches styles.successOut. */
const FADE_MS = 400;

/** demo -> (final Continue) success -> fading -> demo, from the start. */
type Phase = 'demo' | 'success' | 'fading';

// The app's real login screen, with sample projects and playlists and a
// sign-in that always succeeds (see ./appMocks). Browser-only: loaded by
// ./index.tsx inside <BrowserOnly>.
export default function LoginDemo() {
  const {colorMode} = useColorMode();
  const theme = useMemo(() => getTheme(colorMode, 'blue'), [colorMode]);
  const [run, setRun] = useState(0);
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

  // The app remembers the last project; start every run from sign-in.
  useEffect(() => {
    localStorage.removeItem(STORAGE_KEYS.PROJECT);
  }, [run]);

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
      if (!(input instanceof HTMLInputElement) || input.type !== 'email' || input.value) {
        return;
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, SAMPLE_EMAIL);
      input.dispatchEvent(new Event('input', {bubbles: true}));
    };
    app.addEventListener('click', onClick);
    return () => app.removeEventListener('click', onClick);
  }, []);

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
        <DemoStateProvider key={run} mode={colorMode}>
          <ThemeProvider theme={theme}>
            <Theme
              appearance={colorMode}
              accentColor={ACCENTS.blue.radix}
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
