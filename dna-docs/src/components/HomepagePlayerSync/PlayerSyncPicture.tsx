import {useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Avatar, Switch, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {VersionCard} from '@dna-app/components/VersionCard';
import {demoVersion} from '../LiveLoginDemo/appMocks/entities';
import {DEMO_PLAYLISTS, DEMO_PLAYLIST_ID, thumbnailFor} from '../LiveLoginDemo/appMocks/playlists';
import {DATE_SUBMITTED} from '../LiveUiDemo/data';
import {themeVars} from '../LiveUiDemo/themeVars';
import * as I from '../LiveUiDemo/icons';
// The app's sidebar and header chrome, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

/**
 * Laid out at the app's real sizes on this canvas, then scaled to the
 * stage's width (never below MIN_SCALE, so the stacked layout crops rather
 * than shrinks to nothing). A little wider than the row, so the app's full
 * sidebar and the player's source list both sit clear of the fade.
 */
const DESIGN_WIDTH = 1440;
const DESIGN_HEIGHT = 880;
const MIN_SCALE = 0.6;

type PlayerSyncPictureProps = {
  /** The canvas, in the app's own pixels; scaled to the stage's width. */
  designWidth?: number;
  designHeight?: number;
  /** Never scale below this; the stage crops instead. */
  minScale?: number;
  /** Names the player's window: generic on the homepage, RV in its guide. */
  playerName?: string;
};

const ARTIST = 'Ken Ralston';
const INITIALS = 'KR';

/** Today's review, in the player's source list and DNA's sidebar alike. */
const VERSIONS = DEMO_PLAYLISTS[0].versions.map(demoVersion);

/** Production-tracking style version IDs, for the request body. */
const trackingId = (i: number) => String(6482 + i);

/** "TST_010_0020_anim_v060" -> shot, version code and department. */
function splitName(name: string) {
  const parts = name.split('_');
  const code = parts.slice(3).join('_');
  const dept = code.split('_')[0];
  return {
    shot: parts.slice(0, 3).join('_'),
    code,
    department: dept.charAt(0).toUpperCase() + dept.slice(1),
  };
}

/** Step to the next source this often. */
const STEP_MS = 2600;
/** Within a step: the cursor travels, clicks, the request goes, DNA answers. */
const CLICK_MS = 600;
const SEND_MS = 800;
const RESPOND_MS = 1150;

/** Player list rows: the cursor parks on a row by its index. */
const ROW_HEIGHT = 28;

type LogEntry = {id: number; index: number; done: boolean};

/**
 * DNA's sidebar following a review player. The player (a generic desktop
 * player, standing in for RV or a studio's own) steps through its sources;
 * each change sends DNA one HTTP request setting the version in review,
 * shown in the player's request log, and DNA's sidebar, with Follow In
 * Review on, moves to it. Loops while on screen; nothing responds to input.
 */
// Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function PlayerSyncPicture({
  designWidth = DESIGN_WIDTH,
  designHeight = DESIGN_HEIGHT,
  minScale = MIN_SCALE,
  playerName = 'Review Player',
}: PlayerSyncPictureProps) {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  const siteBase = useBaseUrl('/');
  const logo = useBaseUrl(
    colorMode === 'light' ? 'img/logo-full-light.svg' : 'img/logo-full-dark.svg',
  );

  // What the cursor is over, what the player shows, what DNA has in review.
  const [cursor, setCursor] = useState(0);
  const [player, setPlayer] = useState(0);
  const [dna, setDna] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([{id: 0, index: 0, done: true}]);

  // Fit the canvas to the stage.
  const rootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fit = () =>
      setScale(Math.min(1, Math.max(minScale, root.clientWidth / designWidth)));
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    fit();
    return () => observer.disconnect();
  }, [designWidth, minScale]);

  // Run only while on screen.
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

  // One step: the cursor moves to the next source and clicks it, the player
  // switches, the request goes out, DNA answers and follows.
  const nextRef = useRef(1);
  useEffect(() => {
    if (!visible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = () => {
      const index = nextRef.current;
      nextRef.current = (index + 1) % VERSIONS.length;
      const id = Date.now();
      setCursor(index);
      timers.push(
        setTimeout(() => setPlayer(index), CLICK_MS),
        setTimeout(
          () => setLog((entries) => [{id, index, done: false}, ...entries].slice(0, 2)),
          SEND_MS,
        ),
        setTimeout(() => {
          setLog((entries) => entries.map((e) => (e.id === id ? {...e, done: true} : e)));
          setDna(index);
        }, RESPOND_MS),
      );
    };
    const interval = setInterval(step, STEP_MS);
    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, [visible]);

  const shown = splitName(VERSIONS[dna].name);
  const playing = VERSIONS[player];
  const playingThumb = thumbnailFor(playing.name);

  const stageStyle: CSSProperties = {
    ...vars,
    width: designWidth,
    height: designHeight,
    transform: `scale(${scale})`,
  };

  return (
    <div ref={rootRef} className={styles.picture} inert>
      <div className={styles.canvas} style={stageStyle}>
        <ThemeProvider theme={theme}>
          <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
            {/* ---------- DNA ---------- */}
            <div className={uiStyles.app}>
              <aside className={uiStyles.sidebar}>
                <div className={uiStyles.sidebarHeader}>
                  <img className={uiStyles.logo} src={logo} alt="" />
                  <div className={uiStyles.headerActions}>
                    <span className={clsx(uiStyles.button, uiStyles.buttonPrimary)}>Publish</span>
                    <Avatar fallback={INITIALS} size="2" radius="full" variant="solid" color="indigo" />
                    <span className={uiStyles.iconButton}>
                      <I.PanelLeftClose size={20} />
                    </span>
                  </div>
                </div>

                <div className={clsx(uiStyles.toolbar, styles.toolbar)}>
                  <div className={styles.toolbarLeft}>
                    <div className={uiStyles.split}>
                      <span className={uiStyles.splitMain}>Reload Playlist</span>
                      <span className={uiStyles.splitTrigger}>
                        <I.ChevronDown size={14} />
                      </span>
                    </div>
                    <span className={styles.follow}>
                      Follow In Review
                      <Switch size="1" checked />
                    </span>
                  </div>
                  <span className={uiStyles.iconButton}>
                    <I.Search size={18} />
                  </span>
                </div>

                <div className={uiStyles.list}>
                  {VERSIONS.map((v, i) => {
                    const thumb = thumbnailFor(v.name);
                    return (
                      <VersionCard
                        key={v.id}
                        version={v}
                        artistName={ARTIST}
                        department={splitName(v.name).department}
                        thumbnailUrl={thumb && `${siteBase}${thumb}`}
                        selected={i === dna}
                        inReview={i === dna}
                      />
                    );
                  })}
                </div>
              </aside>

              <div className={uiStyles.content}>
                <div className={uiStyles.topBar}>
                  <span className={uiStyles.button}>
                    <I.ChevronLeft size={16} />
                    Previous Version
                  </span>
                  <div className={uiStyles.actions}>
                    <span className={uiStyles.button}>
                      <I.Eye size={14} />
                      In Review
                    </span>
                    <span className={clsx(uiStyles.button, uiStyles.buttonPrimary)}>
                      Next Version
                      <I.ChevronRight size={16} />
                    </span>
                  </div>
                </div>
                <div className={uiStyles.main}>
                  <div className={uiStyles.previewCol}>
                    <div className={uiStyles.preview}>
                      {thumbnailFor(VERSIONS[dna].name) && (
                        <img src={`${siteBase}${thumbnailFor(VERSIONS[dna].name)}`} alt="" />
                      )}
                    </div>
                  </div>
                  <div className={uiStyles.meta}>
                    <h1 className={uiStyles.title}>
                      {shown.shot} - <span className={uiStyles.titleCode}>{shown.code}</span>
                    </h1>
                    <div className={uiStyles.metaRow}>
                      <span className={uiStyles.metaLabel}>Submitted by:</span>
                      <span className={uiStyles.metaValue}>
                        <Avatar fallback={INITIALS} size="1" radius="full" variant="solid" color="indigo" />
                        {ARTIST}
                      </span>
                    </div>
                    <div className={uiStyles.metaRow}>
                      <span className={uiStyles.metaLabel}>Date Submitted:</span>
                      <span className={uiStyles.metaValue}>{DATE_SUBMITTED}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- The review player, over DNA's content ---------- */}
            <div className={styles.player}>
              <div className={styles.titleBar}>
                <span className={styles.lights}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.windowTitle}>
                  {playerName} — {playing.name}
                </span>
              </div>
              <div className={styles.playerBody}>
                <div className={styles.sources}>
                  <div className={styles.sourcesLabel}>Sources</div>
                  <div className={styles.rows}>
                    {VERSIONS.map((v, i) => (
                      <div key={v.id} className={clsx(styles.row, i === player && styles.rowActive)}>
                        <I.Layers size={13} />
                        {v.name}
                      </div>
                    ))}
                    <svg
                      className={styles.cursor}
                      style={{top: cursor * ROW_HEIGHT + ROW_HEIGHT / 2}}
                      viewBox="0 0 16 22"
                      aria-hidden="true">
                      <path d="M1 1v17l4.5-4.2 3 6.7 2.8-1.3-3-6.5H15z" />
                    </svg>
                  </div>

                  <div className={styles.log}>
                    <div className={styles.sourcesLabel}>HTTP events</div>
                    {log.map((entry) => (
                      <div key={entry.id} className={styles.logEntry}>
                        <div className={styles.logLine}>
                          <span className={styles.method}>PUT</span>
                          /playlists/{DEMO_PLAYLIST_ID}/metadata
                        </div>
                        <div className={styles.logLine}>
                          <span className={styles.logBody}>
                            {`{"in_review": "${trackingId(entry.index)}"}`}
                          </span>
                          <span className={clsx(styles.status, entry.done && styles.statusDone)}>
                            {entry.done ? '200' : '···'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.viewer}>
                  <div className={styles.frame}>
                    {playingThumb && <img src={`${siteBase}${playingThumb}`} alt="" />}
                  </div>
                  <div className={styles.timeline}>
                    <span className={styles.frameNumber}>{1001 + player * 37}</span>
                    <span className={styles.track}>
                      <span key={player} className={styles.playhead} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Theme>
        </ThemeProvider>
      </div>
    </div>
  );
}
