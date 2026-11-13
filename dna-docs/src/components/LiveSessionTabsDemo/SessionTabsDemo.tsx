import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {SessionTabs} from '@dna-app/components/SessionTabs';
import {VersionCard} from '@dna-app/components/VersionCard';
import {demoVersion} from '../LiveLoginDemo/appMocks/entities';
import {
  SESSION_TABS_PLAYLISTS,
  SESSION_TABS_PROJECT_ID,
  thumbnailFor,
} from '../LiveLoginDemo/appMocks/playlists';
import {
  DEMO_TABS_SESSION_ID,
  SessionTabsDemoProvider,
  useSessionTabsDemo,
} from '../LiveLoginDemo/appMocks/sessionTabs';
import {usePinPopoverOnTouch} from '../LiveLoginDemo/pinPopover';
import {ARTIST} from '../LiveUiDemo/data';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import * as I from '../LiveUiDemo/icons';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

const SESSION_NAME = 'Morning Dailies';
/** The app's placeholder on the + Add playlist menu's field (AddPlaylistToSessionPopover). */
const ADD_PLAYLIST_PLACEHOLDER = 'Find or create a playlist...';

interface TabPlaylist {
  type: 'Playlist';
  id: string;
  code?: string;
}

/** The project's sample playlists, as the tabs take them. */
const PLAYLISTS: TabPlaylist[] = SESSION_TABS_PLAYLISTS.map(({id, code}) => ({
  type: 'Playlist' as const,
  id,
  code,
}));

/** Each sample playlist's versions; one made in the demo starts empty. */
const VERSIONS = new Map(SESSION_TABS_PLAYLISTS.map((p) => [p.id, p.versions.map(demoVersion)]));

/** In review to begin with: the first version of the first playlist. */
const INITIAL_IN_REVIEW = {
  playlistId: PLAYLISTS[0].id,
  versionId: VERSIONS.get(PLAYLISTS[0].id)![0].id,
};

/**
 * The guide's steps: open another playlist's tab, set one of its versions
 * in review (the dot moves to that tab), pin it (the tab gains a pin), then
 * add a third playlist. Removing a tab works too, without a label.
 */
type Phase = 'switch' | 'setInReview' | 'pin' | 'add' | 'done';
/** none -> (done) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** A beat to see the result before the checkmark. */
const SETTLE_MS = 1200;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/**
 * A session's header, live: the app's own playlist tabs and + Add playlist
 * menu (frontend SessionTabs) beside the session's name, over the active
 * playlist's version cards, so setting and pinning in review shows on the
 * tabs. The rest of the app's header (logo, Publish, avatar) is left out:
 * at the docs column's width it would leave the tabs no room. One pretend session behind it all (appMocks/sessionTabs.tsx).
 * Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
 */
export default function SessionTabsDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  const [queryClient] = useState(() => new QueryClient());
  // Bumped to remount the session on reset.
  const [run, setRun] = useState(0);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [finished, setFinished] = useState(false);

  // Done: a beat, then the checkmark; reset the demo behind it, then fade
  // it away.
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
  const [step, setStep] = useState<GuideStep | null>(null);

  // On touch screens, the + Add playlist menu stays where it opened as the
  // page scrolls, and its search field leaves the keyboard down.
  usePinPopoverOnTouch(true, ADD_PLAYLIST_PLACEHOLDER);
  const onFinished = useCallback(() => setFinished(true), []);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
            <SessionTabsDemoProvider key={run} initialInReview={INITIAL_IN_REVIEW}>
              <Session onStep={setStep} onFinished={onFinished} />
            </SessionTabsDemoProvider>
          </Theme>
        </ThemeProvider>
      </QueryClientProvider>

      {/* Outside Radix's Theme, so the bubble sits over the add menu's portal. */}
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

/** The header and cards, inside the pretend session. */
function Session({
  onStep: setGuideStep,
  onFinished,
}: {
  onStep: (step: GuideStep | null) => void;
  onFinished: () => void;
}) {
  const lastStep = useRef<GuideStep | null>(null);
  const revealedTab = useRef(false);
  const siteBase = useBaseUrl('/');
  const {playlistIds, inReview, pinned, setInReview, setPinned} = useSessionTabsDemo();
  const [active, setActive] = useState<TabPlaylist>(PLAYLISTS[0]);
  const [phase, setPhase] = useState<Phase>('switch');
  const versions = VERSIONS.get(active.id) ?? [];
  // Pinned on another playlist: in review can't move here until it's unpinned.
  const heldElsewhere = pinned && inReview !== null && inReview.playlistId !== active.id;

  const changePlaylist = (playlist: TabPlaylist) => {
    setActive(playlist);
    if (phase === 'switch' && playlist.id !== inReview?.playlistId) setPhase('setInReview');
  };
  const setFromCard = (versionId: string) => {
    if (heldElsewhere) return;
    setInReview({playlistId: active.id, versionId});
    setPinned(false);
    if (phase === 'setInReview') setPhase('pin');
  };
  const togglePin = () => {
    setPinned(!pinned);
    if (phase === 'pin' && !pinned) setPhase('add');
  };

  // A third tab: the last step.
  useEffect(() => {
    if (phase === 'add' && playlistIds.length > 2) {
      setPhase('done');
      onFinished();
    }
  }, [phase, playlistIds.length, onFinished]);

  // The tabs and the add button are the app's own markup: find them as they
  // change, and note when the add menu is open (its bubble steps aside).
  // Watches the app only, not the root: the guide's bubble renders into the
  // root, and watching it would have each placement trigger the next.
  const appRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const observer = new MutationObserver(() => setTick((n) => n + 1));
    observer.observe(app, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-expanded'],
    });
    return () => observer.disconnect();
  }, []);

  const cardRefs = useRef(new Map<string, HTMLDivElement | null>());
  useLayoutEffect(() => {
    const root = appRef.current;
    if (!root) return;
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    // The same object while nothing changed, so the bubble isn't re-placed.
    const onStep = (next: GuideStep | null) => {
      const prev = lastStep.current;
      if (prev && next && prev.target === next.target && prev.title === next.title) return;
      if (!prev && !next) return;
      lastStep.current = next;
      setGuideStep(next);
    };
    // The card's own border is highlight enough; its eye and pin only show
    // on hover.
    const cardStep = (card: HTMLDivElement, title: string): GuideStep => ({
      target: card,
      title,
      sides: ['right', 'below', 'above'],
      noRing: true,
    });
    if (phase === 'switch') {
      const tab = [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find(
        (el) => el.getAttribute('data-state') !== 'active',
      );
      // Ring the whole tab, its remove button included: the label alone sits
      // off-centre in its own padding (16px before it, 4px after).
      const group = tab?.parentElement ?? tab;
      // On a narrow header the tab to click starts off the strip's right
      // edge. Bring it into view once, by scrolling the strip itself:
      // scrollIntoView would also scroll the page to the demo. After that
      // the strip is the reader's to scroll.
      const strip = group?.closest<HTMLElement>('[role="tablist"]');
      if (group && strip && !revealedTab.current) {
        revealedTab.current = true;
        const hiddenBy =
          group.getBoundingClientRect().right - strip.getBoundingClientRect().right;
        if (hiddenBy > 0) strip.scrollLeft += hiddenBy;
      }
      onStep(group ? {target: group, title: `${press} another playlist`, sides: ['below']} : null);
    } else if (phase === 'setInReview') {
      const card = versions[0] && cardRefs.current.get(versions[0].id);
      onStep(card ? cardStep(card, `Hover over a version and ${press.toLowerCase()} its eye`) : null);
    } else if (phase === 'pin') {
      const card = inReview && cardRefs.current.get(inReview.versionId);
      onStep(card ? cardStep(card, `Then hover and ${press.toLowerCase()} its pin`) : null);
    } else if (phase === 'add') {
      const add = [...root.querySelectorAll<HTMLElement>('button')].find((button) =>
        button.textContent?.trim().startsWith('+ Add'),
      );
      const open = add?.getAttribute('data-state') === 'open';
      onStep(
        add && !open
          ? {target: add, title: `${press} + Add playlist and pick one`, sides: ['below'], align: 'end'}
          : null,
      );
    } else {
      onStep(null);
    }
    // `versions` follows `active`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, active, inReview, pinned, playlistIds, tick, setGuideStep]);

  return (
    <div ref={appRef} className={styles.app}>
      {/* ---------- The header bar ---------- */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.context}>
            <span className={styles.contextLabel}>{SESSION_NAME}</span>
            <I.ChevronDown size={12} />
          </span>
          <span className={styles.divider} />
        </div>
        <div className={styles.tabs}>
          <SessionTabs
            sessionId={DEMO_TABS_SESSION_ID}
            projectId={SESSION_TABS_PROJECT_ID}
            activePlaylist={active}
            onPlaylistChange={changePlaylist}
          />
        </div>
      </header>

      {/* ---------- The active playlist's versions ---------- */}
      <div className={styles.body}>
        <div className={styles.list}>
          {versions.map((version) => {
            const isInReview =
              inReview?.playlistId === active.id && inReview.versionId === version.id;
            return (
              <div
                key={`${active.id}-${version.id}`}
                ref={(el) => {
                  cardRefs.current.set(version.id, el);
                }}>
                <VersionCard
                  version={version}
                  artistName={ARTIST}
                  thumbnailUrl={thumbnailFor(version.name) && `${siteBase}${thumbnailFor(version.name)}`}
                  inReview={isInReview}
                  inReviewPinned={isInReview && pinned}
                  onSetInReview={() => setFromCard(version.id)}
                  onTogglePin={togglePin}
                />
              </div>
            );
          })}
          {versions.length === 0 && <p className={styles.note}>No versions in this playlist yet.</p>}
        </div>
        {heldElsewhere && (
          <p className={styles.note}>
            In review is pinned on another playlist. Unpin it there to set a version here.
          </p>
        )}
      </div>
    </div>
  );
}
