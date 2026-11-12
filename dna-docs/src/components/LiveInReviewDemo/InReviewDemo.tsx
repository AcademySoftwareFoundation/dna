import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Avatar, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {VersionCard} from '@dna-app/components/VersionCard';
import {demoVersion} from '../LiveLoginDemo/appMocks/entities';
import {DEMO_PLAYLISTS, thumbnailFor} from '../LiveLoginDemo/appMocks/playlists';
import {ARTIST, DATE_SUBMITTED} from '../LiveUiDemo/data';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import * as I from '../LiveUiDemo/icons';
import {themeVars} from '../LiveUiDemo/themeVars';
import {TranscriptFeed} from './TranscriptFeed';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
// The header chrome, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

/**
 * Laid out at the app's real sizes on this canvas, then scaled to the docs
 * column like the UI demo, so the frame always fits it exactly. The canvas
 * is about a column's width, so the cards and buttons come out life-size.
 */
export const DESIGN_WIDTH = 790;
export const DESIGN_HEIGHT = 520;

/**
 * The guide's steps, in order: set the version on screen in review from the
 * header, pin it, unpin it; then from a card: set another version in review
 * with its eye, jump to it with the header's In Review, and pin it with its
 * pin.
 */
type Phase =
  | 'setHeader'
  | 'pinHeader'
  | 'unpinHeader'
  | 'setCard'
  | 'jump'
  | 'pinCard'
  | 'done';

/** none -> (last step) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** A beat to see the result before the checkmark. */
const SETTLE_MS = 1200;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/** The first few versions of the demos' current playlist. */
const VERSIONS = DEMO_PLAYLISTS[0].versions.slice(0, 4).map(demoVersion);

const INITIALS = ARTIST.split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

/** "TST_010_0020_anim_v060" -> shot "TST_010_0020", version "anim_v060". */
function splitName(name: string): {shot: string; code: string} {
  const parts = name.split('_');
  return {shot: parts.slice(0, 3).join('_'), code: parts.slice(3).join('_')};
}

// Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function InReviewDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  const siteBase = useBaseUrl('/');

  const [selected, setSelected] = useState(0);
  const [inReview, setInReview] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [phase, setPhase] = useState<Phase>('setHeader');
  const [overlay, setOverlay] = useState<Overlay>('none');
  // Bumped to remount the cards on reset, so no hover state carries over.
  const [run, setRun] = useState(0);

  const version = VERSIONS[selected];
  const {shot, code} = splitName(version.name);
  const isCurrentInReview = inReview === selected;

  // Fit the design canvas to the column.
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => setScale(root.clientWidth / DESIGN_WIDTH);
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    fit();
    return () => observer.disconnect();
  }, []);

  // The transcript feed only streams while the demo is on screen.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.2,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // What the app does on each control, with the guide advancing when the
  // click is the one it asked for.
  const setFromCard = (index: number) => {
    setInReview(index);
    setPinned(false);
    if (phase === 'setCard' && index !== selected) setPhase('jump');
  };
  const togglePin = () => {
    setPinned((p) => !p);
    if (phase === 'pinHeader' && !pinned) setPhase('unpinHeader');
    else if (phase === 'unpinHeader' && pinned) setPhase('setCard');
    else if (phase === 'pinCard' && !pinned) setPhase('done');
  };
  const jumpToInReview = () => {
    if (inReview === null) return;
    setSelected(inReview);
    if (phase === 'jump') setPhase('pinCard');
  };
  // The header button: set in review, or pin / unpin the version already
  // in review.
  const headerButton = () => {
    if (isCurrentInReview) {
      togglePin();
    } else {
      setInReview(selected);
      setPinned(false);
      if (phase === 'setHeader') setPhase('pinHeader');
    }
  };

  // Guide targets. The cards' eye and pin buttons are the app's own markup,
  // found by their labels; the header buttons are refs.
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useLayoutEffect(() => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    const header = headerRef.current;
    const headerStep = (title: string): GuideStep | null =>
      header ? {target: header, title, sides: ['right', 'below']} : null;
    // Beside the card where there's room; under it on phones. The card's
    // own border is highlight enough, and its eye and pin only show on hover.
    const cardStep = (card: HTMLDivElement, title: string): GuideStep => ({
      target: card,
      title,
      sides: ['right', 'below', 'above'],
      noRing: true,
    });
    if (phase === 'setHeader') {
      setStep(headerStep(`${press} Set In Review`));
    } else if (phase === 'pinHeader') {
      setStep(headerStep(`${press} Pin in Review`));
    } else if (phase === 'unpinHeader') {
      setStep(headerStep(`${press} Unpin`));
    } else if (phase === 'setCard') {
      const card = cardRefs.current.find((el, i) => el && i !== selected) ?? null;
      setStep(card ? cardStep(card, `Or hover over another version and ${press.toLowerCase()} its eye`) : null);
    } else if (phase === 'jump' && jumpRef.current) {
      setStep({target: jumpRef.current, title: `${press} In Review to jump to it`, sides: ['below', 'left']});
    } else if (phase === 'pinCard') {
      const card = inReview === null ? null : cardRefs.current[inReview];
      setStep(card ? cardStep(card, `Then hover and ${press.toLowerCase()} to pin`) : null);
    } else {
      setStep(null);
    }
  }, [phase, selected, inReview, pinned, scale, run]);

  // All steps done: a beat to see the result, then the checkmark; reset the
  // demo behind it, then fade it away.
  useEffect(() => {
    if (phase !== 'done' || overlay !== 'none') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, overlay]);
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setSelected(0);
            setInReview(null);
            setPinned(false);
            setPhase('setHeader');
            setRun((n) => n + 1);
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const stageStyle: CSSProperties = {
    ...vars,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transform: `scale(${scale})`,
  };

  return (
    <div ref={rootRef} className={styles.root} style={{height: DESIGN_HEIGHT * scale}}>
      <div className={styles.stage} style={stageStyle}>
        <ThemeProvider theme={theme}>
          <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
            <div className={styles.app}>
              {/* ---------- Sidebar: just the version list ---------- */}
              <aside className={styles.sidebar}>
                <div key={run} className={styles.list}>
                  {VERSIONS.map((v, i) => (
                    <div
                      key={v.id}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}>
                      <VersionCard
                        version={v}
                        artistName={ARTIST}
                        thumbnailUrl={thumbnailFor(v.name) && `${siteBase}${thumbnailFor(v.name)}`}
                        selected={i === selected}
                        inReview={i === inReview}
                        inReviewPinned={i === inReview && pinned}
                        onClick={() => setSelected(i)}
                        onSetInReview={() => setFromCard(i)}
                        onTogglePin={togglePin}
                      />
                    </div>
                  ))}
                </div>
              </aside>

              {/* ---------- Version header ---------- */}
              <div className={styles.content}>
                <div className={uiStyles.topBar}>
                  <button type="button" className={uiStyles.button} disabled={selected === 0}>
                    <I.ChevronLeft size={16} />
                    Previous
                  </button>
                  <div className={uiStyles.actions}>
                    <button
                      ref={jumpRef}
                      type="button"
                      className={uiStyles.button}
                      disabled={inReview === null}
                      onClick={jumpToInReview}>
                      <I.Eye size={14} />
                      In Review
                    </button>
                    <button
                      type="button"
                      className={clsx(uiStyles.button, uiStyles.buttonPrimary)}
                      disabled={selected === VERSIONS.length - 1}>
                      Next
                      <I.ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <h1 className={styles.title}>
                  {shot} - <span className={uiStyles.titleCode}>{code}</span>
                </h1>

                <div className={uiStyles.main}>
                  <div className={uiStyles.previewCol}>
                    <div className={styles.preview}>
                      <img src={`${siteBase}${thumbnailFor(version.name)}`} alt={version.name} />
                    </div>
                    <button
                      ref={headerRef}
                      type="button"
                      className={clsx(
                        uiStyles.button,
                        uiStyles.setInReview,
                        isCurrentInReview && styles.setInReviewActive,
                      )}
                      onClick={headerButton}>
                      {isCurrentInReview ? (
                        pinned ? (
                          <>
                            <I.PinOff size={14} />
                            Unpin
                          </>
                        ) : (
                          <>
                            <I.Pin size={14} />
                            Pin in Review
                          </>
                        )
                      ) : (
                        <>
                          <I.Target size={14} />
                          Set In Review
                        </>
                      )}
                    </button>
                  </div>
                  <div className={styles.meta}>
                    <div className={styles.metaRow}>
                      <span className={uiStyles.metaLabel}>Submitted by</span>
                      <span className={uiStyles.metaValue}>
                        <Avatar fallback={INITIALS} size="1" radius="full" variant="solid" color="indigo" />
                        {ARTIST}
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={uiStyles.metaLabel}>Date Submitted</span>
                      <span className={uiStyles.metaValue}>{DATE_SUBMITTED}</span>
                    </div>
                  </div>
                </div>

                {/* The app's Transcript tab: segments land on whichever
                    version is in review. */}
                <TranscriptFeed
                  targetName={inReview === null ? null : VERSIONS[inReview].name}
                  shown={isCurrentInReview}
                  active={visible && overlay === 'none'}
                  resetKey={run}
                />
              </div>
            </div>
          </Theme>
        </ThemeProvider>
      </div>

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
