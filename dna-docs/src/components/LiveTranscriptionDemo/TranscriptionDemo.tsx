import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {TranscriptionMenu} from '@dna-app/components/TranscriptionMenu';
import {VersionCard} from '@dna-app/components/VersionCard';
import {demoVersion} from '../LiveLoginDemo/appMocks/entities';
import {DEMO_PLAYLISTS, DEMO_PLAYLIST_ID, thumbnailFor} from '../LiveLoginDemo/appMocks/playlists';
import {DEMO_SESSION_ID, TranscriptionDemoProvider, useTranscriptionDemo} from '../LiveLoginDemo/appMocks/transcription';
import {TranscriptFeed} from '../LiveInReviewDemo/TranscriptFeed';
import {ARTIST} from '../LiveUiDemo/data';
import {Guide, type GuideStep, type Side} from '../LiveUiDemo/Guide';
import * as I from '../LiveUiDemo/icons';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
// The sidebar footer, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

/** none -> (last step) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/**
 * A beat to see "Stopped" before the checkmark. Shorter than the other
 * demos': once stopped, the app's menu is back to its starting state, which
 * reads as the demo resetting early if left up for long.
 */
const SETTLE_MS = 400;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/**
 * What the URL field fills with when clicked: a Zoom "Copy Invite Link"
 * link, whose pwd the menu picks up, so it asks for no passcode.
 */
const MEETING_URL = 'https://zoom.us/j/81234567890?pwd=dnaDemoPasscode1';
/** The app's placeholder on the menu's URL field (TranscriptionMenu). */
const URL_PLACEHOLDER = 'Paste meeting URL...';

/** The first few versions of the demos' current playlist; the first is in review. */
const VERSIONS = DEMO_PLAYLISTS[0].versions.slice(0, 3).map(demoVersion);
const IN_REVIEW = VERSIONS[0];

/** Fills a React-controlled input as if the user had pasted into it. */
function paste(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', {bubbles: true}));
}

/** A button in `root` by its text, ignoring icons. */
function findButton(root: ParentNode | null, label: string): HTMLButtonElement | null {
  if (!root) return null;
  return (
    [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === label) ??
    null
  );
}

/** The parts of the menu the guide points at; it renders in a portal outside the demo. */
interface Targets {
  /** The Transcription button, or once live the split button's main half. */
  trigger: HTMLButtonElement | null;
  /** The split button's pause / resume half, once live. */
  pause: HTMLButtonElement | null;
  menuOpen: boolean;
  /** The open menu itself. */
  popover: Element | null;
  urlInput: HTMLInputElement | null;
  start: HTMLButtonElement | null;
  stop: HTMLButtonElement | null;
}

const NO_TARGETS: Targets = {
  trigger: null,
  pause: null,
  menuOpen: false,
  popover: null,
  urlInput: null,
  start: null,
  stop: null,
};

const sameTargets = (a: Targets, b: Targets) =>
  (Object.keys(a) as (keyof Targets)[]).every((key) => a[key] === b[key]);

// The sidebar's foot with the app's real Transcription menu, beside the
// Transcript panel. Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function TranscriptionDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  // The menu reads the user's settings through React Query; the fake API
  // answers, but the client must exist.
  const [queryClient] = useState(() => new QueryClient());

  const [overlay, setOverlay] = useState<Overlay>('none');
  // Bumped to remount everything on reset: the menu, its pretend session
  // and the transcript.
  const [run, setRun] = useState(0);
  const [finished, setFinished] = useState(false);

  // All steps done: a beat to see the result, then the checkmark; reset the
  // demo behind it, then fade it away.
  useEffect(() => {
    if (!finished || overlay !== 'none') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [finished, overlay]);
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setFinished(false);
            setRun((n) => n + 1);
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const rootRef = useRef<HTMLDivElement>(null);
  const onFinished = useCallback(() => setFinished(true), []);
  // Worked out inside the session, drawn out here: inside Radix's Theme the
  // bubble would sit in its stacking context, under the menu's portal.
  const [step, setStep] = useState<GuideStep | null>(null);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
            <TranscriptionDemoProvider key={run}>
              <Session
                rootRef={rootRef}
                active={overlay === 'none'}
                onStep={setStep}
                onFinished={onFinished}
              />
            </TranscriptionDemoProvider>
          </Theme>
        </ThemeProvider>
      </QueryClientProvider>

      {overlay === 'none' && <Guide step={step} rootRef={rootRef} />}

      {overlay !== 'none' && (
        <div
          role="status"
          className={clsx(loginStyles.success, overlay === 'fading' && loginStyles.successOut)}>
          <svg className={loginStyles.check} viewBox="0 0 52 52" aria-hidden="true">
            <circle className={loginStyles.checkCircle} cx="26" cy="26" r="24" />
            <path className={loginStyles.checkMark} d="M15 27l7 7 15-16" />
          </svg>
          <span className={loginStyles.srOnly}>All done. The demo starts over.</span>
        </div>
      )}
    </div>
  );
}

/**
 * One run of the demo, inside the pretend session: the layout, the guide's
 * current step (handed up to be drawn), and the transcript following the
 * session's status.
 */
function Session({
  rootRef,
  active,
  onStep,
  onFinished,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  /** Off while the checkmark shows. */
  active: boolean;
  onStep: (step: GuideStep | null) => void;
  onFinished: () => void;
}) {
  const siteBase = useBaseUrl('/');
  const {status, paused, isDispatching, isStopping} = useTranscriptionDemo();
  const live = status === 'transcribing';

  // Pause, then resume, before stopping: the guide asks for both.
  const [pausedOnce, setPausedOnce] = useState(false);
  useEffect(() => {
    if (live && paused) setPausedOnce(true);
  }, [live, paused]);

  // Stopped after trying pause: done.
  useEffect(() => {
    if (status === 'stopped' && pausedOnce) onFinished();
  }, [status, pausedOnce, onFinished]);

  // The transcript only streams while the demo is on screen.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  // Find the menu's parts as they come and go. The menu's popover renders
  // in a portal, so watch the whole page, not just the demo.
  const menuRef = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<Targets>(NO_TARGETS);
  useEffect(() => {
    const find = () => {
      const triggerWrap = menuRef.current?.firstElementChild ?? null;
      const buttons = triggerWrap ? [...triggerWrap.querySelectorAll('button')] : [];
      const menuOpen = triggerWrap?.getAttribute('data-state') === 'open';
      const popover = menuOpen ? document.querySelector('.rt-PopoverContent') : null;
      const next: Targets = {
        trigger: buttons[0] ?? null,
        pause: buttons.length > 1 ? buttons[buttons.length - 1] : null,
        menuOpen,
        popover,
        urlInput:
          popover?.querySelector<HTMLInputElement>(`input[placeholder="${URL_PLACEHOLDER}"]`) ??
          null,
        start: findButton(popover, 'Start Transcription'),
        stop: findButton(popover, 'Stop Transcription'),
      };
      setTargets((prev) => (sameTargets(prev, next) ? prev : next));
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'disabled'],
    });
    find();
    return () => observer.disconnect();
  }, []);

  // Clicking (or typing in) the empty URL field pastes the sample link.
  // Not on focus: the menu focuses the field itself when it opens.
  const [urlFilled, setUrlFilled] = useState(false);
  useEffect(() => {
    const input = targets.urlInput;
    setUrlFilled(!!input?.value);
    if (!input) return;
    // The link is pasted for you, so keep phones' on-screen keyboard down:
    // it would resize the page and throw the demo's layout around. The
    // field still focuses, and a hardware keyboard still works.
    input.inputMode = 'none';
    const fill = (event: Event) => {
      if (input.value) return;
      event.preventDefault();
      paste(input, MEETING_URL);
      setUrlFilled(true);
    };
    input.addEventListener('click', fill);
    input.addEventListener('keydown', fill);
    return () => {
      input.removeEventListener('click', fill);
      input.removeEventListener('keydown', fill);
    };
  }, [targets.urlInput]);

  // The popover settles into place over a few frames after it opens or
  // changes, later still on a slow phone; re-place the bubble a few times.
  const [settle, setSettle] = useState(0);
  useEffect(() => {
    const timers = [60, 220, 500].map((ms) => setTimeout(() => setSettle((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [targets, status]);

  const step = useMemo((): GuideStep | null => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    const t = targets;
    // Nothing to do while the bot joins or leaves.
    if (settle < 0 || isDispatching || isStopping || status === 'joining') return null;
    // Something in the open menu. Beside it where there's room; on narrow
    // columns, right above or below the control itself (`narrow` says
    // which, so the bubble covers the part of the menu that matters least).
    const inMenu = (target: Element, title: string, narrow: Side[]): GuideStep =>
      window.matchMedia('(max-width: 720px)').matches
        ? {target, title, sides: narrow}
        : {target, title, sides: ['right', 'above', 'below']};

    if (live) {
      if (paused && t.pause) {
        return {
          target: t.pause,
          title: `${press} play to resume`,
          sides: ['right', 'above'],
        };
      }
      if (!pausedOnce && t.pause) {
        return {
          target: t.pause,
          title: `${press} pause, e.g. for a break`,
          sides: ['right', 'above'],
        };
      }
      if (t.menuOpen && t.stop) return inMenu(t.stop, `${press} Stop Transcription`, ['below', 'above']);
      return t.trigger
        ? {
            target: t.trigger,
            title: `${press} Live to open the menu`,
            sides: ['right', 'above'],
          }
        : null;
    }

    if (status === 'stopped' && pausedOnce) return null;
    if (!t.menuOpen) {
      return t.trigger
        ? {
            target: t.trigger,
            title: `${press} Transcription`,
            sides: ['right', 'above'],
          }
        : null;
    }
    if (t.urlInput && !urlFilled) return inMenu(t.urlInput, `${press} to paste a Zoom invite link`, ['above', 'below']);
    return t.start ? inMenu(t.start, `${press} Start Transcription`, ['below', 'above']) : null;
  }, [targets, settle, status, live, paused, pausedOnce, isDispatching, isStopping, urlFilled]);
  useEffect(() => onStep(step), [step, onStep]);

  return (
    <div className={styles.app}>
      {/* ---------- Sidebar: a few cards, then the footer ---------- */}
      <aside className={styles.sidebar}>
        <div className={styles.list}>
          {VERSIONS.map((v, i) => (
            <VersionCard
              key={v.id}
              version={v}
              artistName={ARTIST}
              thumbnailUrl={thumbnailFor(v.name) && `${siteBase}${thumbnailFor(v.name)}`}
              selected={i === 0}
              inReview={i === 0}
            />
          ))}
        </div>
        <div className={uiStyles.footer}>
          <div ref={menuRef}>
            <TranscriptionMenu sessionId={DEMO_SESSION_ID} playlistId={DEMO_PLAYLIST_ID} />
          </div>
          <button type="button" className={styles.settings} tabIndex={-1}>
            <I.Settings size={16} />
            Settings
          </button>
        </div>
      </aside>

      {/* ---------- The Transcript panel ---------- */}
      <div className={styles.content}>
        <TranscriptFeed
          targetName={live || status === 'stopped' ? IN_REVIEW.name : null}
          shown
          active={visible && active && live && !paused}
          resetKey={0}
        />
      </div>
    </div>
  );
}
