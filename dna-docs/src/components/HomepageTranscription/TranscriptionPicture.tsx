import {useEffect, useMemo, useRef, useState} from 'react';
import clsx from 'clsx';
import {Avatar, Badge, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS} from '@dna-app/styles/theme';
import {themeVars} from '../LiveUiDemo/themeVars';
import {ARTIST, NOTE_TO, VERSIONS} from '../LiveUiDemo/data';
import * as I from '../LiveUiDemo/icons';
import {TranscriptFeed} from '../LiveInReviewDemo/TranscriptFeed';
// The app's sidebar cards and notes box, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

/** Any version name will do: the feed only uses it to know it has a target. */
const TARGET = 'TST_010_0010_comp_v001';

/** The sidebar's cards: enough to fill the stage, no half card at the foot. */
const CARDS = VERSIONS.slice(0, 5);

const INITIALS = ARTIST.split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

/**
 * The bottom-right corner of the app, as a picture: the Transcript panel
 * with the eval transcripts streaming in word by word, one after another,
 * for as long as it's on screen. Around it, for context, the right edge of
 * the sidebar's version cards and the bottom of the notes box, cropped by
 * the picture's edges and faded by the stage. Nothing responds to input.
 */
// Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function TranscriptionPicture() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  const thumbBase = useBaseUrl('img/demo/');
  const version = VERSIONS[0];

  // Stream only while the picture is on screen.
  const rootRef = useRef<HTMLDivElement>(null);
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

  return (
    <div ref={rootRef} className={styles.picture} style={vars} inert>
      <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
        <div className={styles.app}>
          {/* ---------- Sidebar: the right edge of the version list ---------- */}
          <aside className={clsx(uiStyles.sidebar, styles.sidebarSlice)}>
            <div className={uiStyles.list}>
              {CARDS.map((v, i) => (
                <div
                  key={v.shot}
                  className={clsx(uiStyles.card, i === 0 && uiStyles.cardSelected)}>
                  <span className={uiStyles.thumb}>
                    <img src={`${thumbBase}${v.thumb}`} alt="" />
                  </span>
                  <span className={uiStyles.cardBody}>
                    <span className={uiStyles.cardTitle}>
                      {v.shot}_{v.version}
                    </span>
                    <span className={uiStyles.artistRow}>
                      <Avatar fallback={INITIALS} size="1" radius="full" variant="solid" color="indigo" />
                      {ARTIST}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </aside>

          {/* ---------- Content: the bottom of the notes box, then the tabs ---------- */}
          <div className={styles.content}>
            <div className={clsx(uiStyles.notes, styles.notesSlice)}>
              <h2 className={uiStyles.notesTitle}>Notes</h2>
              <div className={uiStyles.chips}>
                <span className={uiStyles.chip}>
                  To:
                  <Badge color="blue" size="2">
                    <I.User size={12} />
                    {NOTE_TO}
                  </Badge>
                </span>
                <span className={uiStyles.chip}>
                  Links:
                  <Badge color="orange" size="2">
                    <I.Layers size={12} />
                    <span className={uiStyles.badgeText}>
                      {version.shot}_{version.version}
                    </span>
                  </Badge>
                </span>
              </div>
              <div className={uiStyles.editorBox}>
                <div className={clsx(uiStyles.editorArea, styles.editorArea)}>
                  <ul className={uiStyles.noteList}>
                    {version.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
                <div className={uiStyles.editorToolbar}>
                  <I.Bold /> <I.Italic /> <I.Strikethrough /> <I.Code />
                  <span className={uiStyles.toolSep} />
                  <I.Heading1 /> <I.Heading2 />
                  <span className={uiStyles.toolSep} />
                  <I.List /> <I.ListOrdered /> <I.Quote /> <I.Minus />
                  <span className={uiStyles.toolSep} />
                  <I.Image />
                </div>
              </div>
              <div className={uiStyles.handle} />
            </div>

            <TranscriptFeed targetName={TARGET} shown active={visible} resetKey={0} loop allTabs />
          </div>
        </div>
      </Theme>
      {/* Sized to the picture, so the fades always end at its edges whatever
          the stage's width. */}
      <div className={styles.fadeLeft} />
      <div className={styles.fadeTop} />
      <div className={styles.fadeBottom} />
    </div>
  );
}
