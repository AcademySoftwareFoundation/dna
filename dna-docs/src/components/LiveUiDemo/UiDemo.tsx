import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {Avatar, Badge, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {ARTIST, DATE_SUBMITTED, VERSIONS} from './data';
import {Guide, type GuideStep} from './Guide';
import * as I from './icons';
// The success checkmark, shared with the login demo.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

/**
 * The mock is laid out at the app's real sizes on this canvas, then scaled
 * to the docs column, so it keeps the proportions of the screenshot it
 * replaces.
 */
export const DESIGN_WIDTH = 1140;
export const DESIGN_HEIGHT = 880;

/**
 * Which guide step is up: pick a version, load its notes, collapse the
 * sidebar, expand it again, or done.
 */
type Phase = 'pickVersion' | 'loadNotes' | 'collapseSidebar' | 'expandSidebar' | 'done';

/** none -> (final step) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** Let the sidebar's re-expand (200ms) finish and settle before the checkmark. */
const SETTLE_MS = 1200;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

const INITIALS = ARTIST.split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

// The app's styled-components theme, handed to the CSS module as custom
// properties so the mock takes the real app's colours in both modes.
function themeVars(mode: 'dark' | 'light'): CSSProperties {
  const {colors} = getTheme(mode, 'blue');
  return {
    '--c-bg-base': colors.bg.base,
    '--c-bg-surface': colors.bg.surface,
    '--c-bg-hover': colors.bg.surfaceHover,
    '--c-bg-overlay': colors.bg.overlay,
    '--c-sidebar-bg': colors.sidebar.bg,
    '--c-sidebar-border': colors.sidebar.border,
    '--c-text': colors.text.primary,
    '--c-text-2': colors.text.secondary,
    '--c-text-muted': colors.text.muted,
    '--c-border-subtle': colors.border.subtle,
    '--c-border': colors.border.default,
    '--c-border-strong': colors.border.strong,
    '--c-accent': colors.accent.main,
    '--c-accent-hover': colors.accent.hover,
    '--c-accent-subtle': colors.accent.subtle,
    '--c-accent-gradient': colors.accent.gradient,
    '--c-error': colors.status.error,
  } as CSSProperties;
}

// Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function UiDemo() {
  const {colorMode} = useColorMode();
  const vars = useMemo(() => themeVars(colorMode), [colorMode]);
  const thumbBase = useBaseUrl('img/demo/');
  const logo = useBaseUrl(
    colorMode === 'light' ? 'img/logo-full-light.svg' : 'img/logo-full-dark.svg',
  );
  // The favicon is the app's icon-only logo at 32px.
  const logoIcon = useBaseUrl('img/favicon.svg');

  const [selected, setSelected] = useState(0);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [phase, setPhase] = useState<Phase>('pickVersion');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const version = VERSIONS[selected];

  // Once the last step is done, wait for the sidebar to re-expand, then
  // show the checkmark.
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Show the checkmark, reset the demo behind it, then fade it away.
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setSelected(0);
            setNotesLoaded(false);
            setCollapsed(false);
            setPhase('pickVersion');
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  // Fit the design canvas to the column.
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () => setScale(Math.min(1, root.clientWidth / DESIGN_WIDTH));
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    fit();
    return () => observer.disconnect();
  }, []);

  // Guide targets: the first card that isn't selected, the editor, then the
  // sidebar toggle twice.
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const editorRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useLayoutEffect(() => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    if (phase === 'pickVersion') {
      const card = cardRefs.current.find((el, i) => el && i !== selected);
      // The card's own selection border is highlight enough.
      setStep(
        card ? {target: card, title: `${press} another version`, sides: ['right'], noRing: true} : null,
      );
    } else if (phase === 'loadNotes' && editorRef.current) {
      setStep({
        target: editorRef.current,
        title: `${press} the notes box to see example notes`,
        sides: ['above', 'below'],
      });
    } else if ((phase === 'collapseSidebar' || phase === 'expandSidebar') && toggleRef.current) {
      setStep({
        target: toggleRef.current,
        title: `${press} to ${collapsed ? 'expand' : 'collapse'} the sidebar`,
        sides: ['right'],
      });
    } else {
      setStep(null);
    }
  }, [phase, selected, collapsed, scale]);

  // Re-place the guide once the sidebar's width transition has run.
  useEffect(() => {
    const timer = setTimeout(() => setStep((s) => (s ? {...s} : s)), 220);
    return () => clearTimeout(timer);
  }, [collapsed]);

  // Scroll a selected card into view, as the app does for keyboard stepping.
  useEffect(() => {
    cardRefs.current[selected]?.scrollIntoView({block: 'nearest'});
  }, [selected]);

  const selectVersion = (index: number) => {
    if (index === selected) return;
    setSelected(index);
    setNotesLoaded(false);
    setPhase('loadNotes');
  };

  const loadNotes = () => {
    if (notesLoaded) return;
    setNotesLoaded(true);
    setPhase('collapseSidebar');
  };

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
    if (phase === 'collapseSidebar') {
      setPhase('expandSidebar');
    } else if (phase === 'expandSidebar') {
      setPhase('done');
    }
  };

  const stageStyle: CSSProperties = {
    ...vars,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transform: `scale(${scale})`,
  };

  return (
    <div ref={rootRef} className={styles.root} style={{height: DESIGN_HEIGHT * scale}}>
      <div className={styles.stage} style={stageStyle}>
        <Theme
          appearance={colorMode}
          accentColor={ACCENTS.blue.radix}
          hasBackground={false}>
          <div className={styles.app}>
            {/* ---------- Sidebar ---------- */}
            <aside className={clsx(styles.sidebar, collapsed && styles.sidebarCollapsed)}>
              <div className={styles.sidebarHeader}>
                {collapsed ? (
                  <img className={styles.logoIcon} src={logoIcon} alt="DNA" />
                ) : (
                  <img className={styles.logo} src={logo} alt="DNA - Dailies Notes Assistant" />
                )}
                <div className={styles.headerActions}>
                  {!collapsed && (
                    <>
                      <button type="button" className={clsx(styles.button, styles.buttonPrimary)}>
                        Publish
                      </button>
                      <Avatar fallback={INITIALS} size="2" radius="full" variant="solid" color="indigo" />
                    </>
                  )}
                  <button
                    ref={toggleRef}
                    type="button"
                    className={styles.iconButton}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    onClick={toggleSidebar}>
                    {collapsed ? <I.PanelLeft size={20} /> : <I.PanelLeftClose size={20} />}
                  </button>
                </div>
              </div>

              {collapsed ? (
                <>
                  <div className={styles.collapsedToolbar}>
                    <div className={styles.publishVertical}>
                      <button type="button" className={clsx(styles.button, styles.buttonPrimary)}>
                        Publish
                      </button>
                      <button
                        type="button"
                        className={clsx(styles.button, styles.buttonPrimary)}
                        aria-label="More publish options">
                        <I.ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                  <div className={styles.collapsedFooter}>
                    <button type="button" className={styles.squarePhone} aria-label="Transcription">
                      <span className={styles.phone}>
                        <I.Phone size={18} />
                      </span>
                    </button>
                    <button type="button" className={styles.squareButton}>
                      <I.Settings size={20} />
                      Settings
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.toolbar}>
                    <div className={styles.split}>
                      <button type="button" className={styles.splitMain}>
                        Reload Playlist
                      </button>
                      <button type="button" className={styles.splitTrigger} aria-label="Playlist options">
                        <I.ChevronDown size={14} />
                      </button>
                    </div>
                    <button type="button" className={styles.iconButton} aria-label="Search versions">
                      <I.Search size={18} />
                    </button>
                  </div>

                  <div className={styles.list}>
                    {VERSIONS.map((v, i) => (
                      <button
                        key={v.shot}
                        ref={(el) => {
                          cardRefs.current[i] = el;
                        }}
                        type="button"
                        className={clsx(styles.card, i === selected && styles.cardSelected)}
                        aria-pressed={i === selected}
                        onClick={() => selectVersion(i)}>
                        <span className={styles.thumb}>
                          <img src={`${thumbBase}${v.thumb}`} alt="" />
                        </span>
                        <span className={styles.cardBody}>
                          <span className={styles.cardTitle}>
                            {v.shot}_{v.version}
                          </span>
                          <span className={styles.artistRow}>
                            <Avatar fallback={INITIALS} size="1" radius="full" variant="solid" color="indigo" />
                            {ARTIST}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.footer}>
                    <button type="button" className={styles.button}>
                      <span className={styles.phone}>
                        <I.Phone size={16} />
                      </span>
                      Transcription
                    </button>
                    <button type="button" className={styles.button}>
                      <I.Settings size={16} />
                      Settings
                    </button>
                  </div>
                </>
              )}
            </aside>

            {/* ---------- Content ---------- */}
            <div className={styles.content}>
              <div className={styles.topBar}>
                <button type="button" className={styles.button} disabled={selected === 0}>
                  <I.ChevronLeft size={16} />
                  Previous Version
                </button>
                <div className={styles.actions}>
                  <button type="button" className={styles.button}>
                    <I.Eye size={14} />
                    In Review
                  </button>
                  <button type="button" className={styles.button}>
                    <I.ExternalLink size={14} />
                    PT tab
                  </button>
                  <button
                    type="button"
                    className={clsx(styles.button, styles.buttonPrimary)}
                    disabled={selected === VERSIONS.length - 1}>
                    Next Version
                    <I.ChevronRight size={16} />
                  </button>
                  <button type="button" className={styles.refresh} aria-label="Refresh">
                    <I.RotateCw size={16} />
                  </button>
                </div>
              </div>

              <div className={styles.main}>
                <div className={styles.previewCol}>
                  <div className={styles.preview}>
                    <img src={`${thumbBase}${version.thumb}`} alt={`${version.shot} ${version.version}`} />
                  </div>
                  <button type="button" className={clsx(styles.button, styles.setInReview)}>
                    <I.Target size={14} />
                    Set In Review
                  </button>
                </div>
                <div className={styles.meta}>
                  <h1 className={styles.title}>
                    {version.shot} - <span className={styles.titleCode}>{version.version}</span>
                  </h1>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Submitted by:</span>
                    <span className={styles.metaValue}>
                      <Avatar fallback={INITIALS} size="1" radius="full" variant="solid" color="indigo" />
                      {ARTIST}
                    </span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Date Submitted:</span>
                    <span className={styles.metaValue}>{DATE_SUBMITTED}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Version Status:</span>
                    <span className={clsx(styles.pill, styles.statusSelect)}>
                      Approved
                      <I.ChevronDown size={12} />
                    </span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.metaLabel}>Links:</span>
                    <span className={styles.pill}>{version.shot}</span>
                  </div>
                </div>
              </div>

              <div className={styles.notes}>
                <h2 className={styles.notesTitle}>Notes</h2>
                <div className={styles.chips}>
                  <span className={styles.chip}>
                    To:
                    <Badge color="blue" size="2">
                      <I.User size={12} />
                      {ARTIST}
                    </Badge>
                  </span>
                  <span className={styles.chip}>
                    CC: <span className={styles.chipEmpty}>—</span>
                  </span>
                  <span className={styles.chip}>
                    Subject: <span className={styles.chipEmpty}>—</span>
                  </span>
                  <span className={styles.chip}>
                    Links:
                    <Badge color="orange" size="2">
                      <I.Layers size={12} />
                      <span className={styles.badgeText}>
                        {version.shot}_{version.version}
                      </span>
                    </Badge>
                  </span>
                  <button type="button" className={styles.editButton} aria-label="Edit note options">
                    <I.Pencil size={14} />
                  </button>
                </div>
                <div className={styles.editorBox}>
                  <button
                    ref={editorRef}
                    type="button"
                    className={styles.editorArea}
                    aria-label={notesLoaded ? 'Notes' : 'Notes (shows example notes)'}
                    onClick={loadNotes}>
                    {notesLoaded ? (
                      <ul className={styles.noteList}>
                        {version.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className={styles.placeholderText}>
                        Write your notes here... (supports **markdown**, type @ to mention)
                      </span>
                    )}
                  </button>
                  <div className={styles.editorToolbar}>
                    <I.Bold /> <I.Italic /> <I.Strikethrough /> <I.Code />
                    <span className={styles.toolSep} />
                    <I.Heading1 /> <I.Heading2 />
                    <span className={styles.toolSep} />
                    <I.List /> <I.ListOrdered /> <I.Quote /> <I.Minus />
                    <span className={styles.toolSep} />
                    <I.Image />
                  </div>
                </div>
                <div className={styles.handle} />
              </div>

              <div className={styles.tabs}>
                <button type="button" className={clsx(styles.tab, styles.tabActive)}>
                  AI Assistant
                </button>
                <button type="button" className={styles.tab}>
                  Transcript
                </button>
              </div>

              <div className={styles.assistant}>
                <div className={styles.assistantHeader}>
                  <span className={styles.botIcon}>
                    <I.Bot size={22} />
                  </span>
                  <span className={styles.assistantTitle}>AI Assistant</span>
                  <button type="button" className={styles.button}>
                    Regenerate
                  </button>
                  <button type="button" className={styles.refresh} aria-label="Comments">
                    <I.MessageSquare size={16} />
                  </button>
                </div>
                <p className={styles.assistantEmpty}>
                  No note has been generated yet. Click Regenerate to create an AI-powered note
                  suggestion.
                </p>
              </div>
            </div>
          </div>
        </Theme>
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
