import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {ChevronDown, MoreVertical} from 'lucide-react';
import {Avatar, Badge, Button, Checkbox, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {ACCENTS} from '@dna-app/styles/theme';
import {thumbnailFor} from '../LiveLoginDemo/appMocks/playlists';
import {TRANSCRIPTS} from '../LiveInReviewDemo/transcripts';
import {ARTIST, NOTE_TO} from '../LiveUiDemo/data';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import * as I from '../LiveUiDemo/icons';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
// The notes box (chips, editor, toolbar), from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

const VERSION_NAME = 'TST_010_0020_anim_v060';
/** Who wrote the note: the dialog titles it "<name>'s Note". */
const NOTE_OWNER = 'Dennis Muren';

/** The review it's from: evals/20260620/dataset/transcripts. */
const TRANSCRIPT = TRANSCRIPTS.find((t) => t.shot === 'TST_010_0020') ?? TRANSCRIPTS[0];
const SPEAKERS = new Set(TRANSCRIPT.lines.map((l) => l.speaker)).size;

/** A shot the note mentions but doesn't link, for Note QC to catch; Fix links it. */
const MENTIONED_SHOT = 'TST_010_0030';

/** The note (evals/20260620/dataset/notes/TST_010_0020_ref.txt), plus a mention of that shot. */
const NOTE_LINES = [
  'Visibility of surroundings is good. Want to read items in room, but not see where room ends.',
  'Digi-doubles are looking static. Need movement. Have them walk into their current position.',
  `Lose highlights on top of throne, should look like alien material, not reflective. Match the throne in ${MENTIONED_SHOT}.`,
];

/** The project's version statuses, and the version's current one. */
const STATUSES = ['Approved', 'Viewed', 'Pending Review', 'Final'];
const CURRENT_STATUS = 'Approved';

/** After Publish, before the checkmark. */
const SETTLE_MS = 500;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/**
 * The guide's steps: transcript off, back on, then open Note QC, Fix,
 * Apply, and Publish. The other checkboxes and the status work too, without
 * labels.
 */
type Phase = 'uncheck' | 'recheck' | 'openQc' | 'fix' | 'apply' | 'publish' | 'done';
/** none -> (done) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/**
 * The Publish Notes dialog (frontend PublishNotesDialog: VersionPublishCard,
 * the Note QC pill and its Apply QC suggestion dialog) for one version, in
 * the app's default terminology. Everything opens inside the demo rather
 * than over the page. Browser-only: loaded by ./index.tsx inside
 * <BrowserOnly>.
 */
export default function PublishDemo() {
  const {colorMode} = useColorMode();
  const vars = useMemo(() => themeVars(colorMode), [colorMode]);
  const siteBase = useBaseUrl('/');

  const [status, setStatus] = useState('Viewed');
  const [statusChecked, setStatusChecked] = useState(true);
  const [noteChecked, setNoteChecked] = useState(true);
  const [transcriptChecked, setTranscriptChecked] = useState(true);
  const [transcriptShown, setTranscriptShown] = useState(false);
  const [phase, setPhase] = useState<Phase>('uncheck');
  const [overlay, setOverlay] = useState<Overlay>('none');

  const statusChanged = status !== CURRENT_STATUS;
  const fixed = phase === 'publish' || phase === 'done';
  const qcOpen = phase === 'fix';
  const diffOpen = phase === 'apply';
  const selectedCount = (noteChecked ? 1 : 0) + (statusChanged && statusChecked ? 1 : 0);

  const toggleTranscript = (checked: boolean) => {
    setTranscriptChecked(checked);
    if (phase === 'uncheck' && !checked) setPhase('recheck');
    else if (phase === 'recheck' && checked) setPhase('openQc');
  };
  // The pill opens its check list once the transcript steps are done; before
  // that, and once fixed, it does nothing.
  const togglePill = () => {
    if (phase === 'openQc') setPhase('fix');
    else if (phase === 'fix') setPhase('openQc');
  };

  // Done: a beat, then the checkmark; reset the demo behind it, then fade
  // it away.
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
            setStatus('Viewed');
            setStatusChecked(true);
            setNoteChecked(true);
            setTranscriptChecked(true);
            setTranscriptShown(false);
            setPhase('uncheck');
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const rootRef = useRef<HTMLDivElement>(null);
  const transcriptBoxRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const fixRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const publishRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useEffect(() => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    const at = (el: Element | null, title: string, sides: GuideStep['sides']) =>
      el ? {target: el, title, sides} : null;
    setStep(
      phase === 'uncheck'
        ? // Above, not beside: to the right it would cover the row's label.
          at(transcriptBoxRef.current, 'Uncheck to leave the transcript out', ['above', 'right'])
        : phase === 'recheck'
          ? at(transcriptBoxRef.current, `${press} to include it again`, ['above', 'right'])
          : phase === 'openQc'
            ? at(pillRef.current, `${press} the Note QC warning`, ['below', 'right'])
            : phase === 'fix'
              ? at(fixRef.current, `${press} Fix`, ['left', 'below'])
              : phase === 'apply'
                ? at(applyRef.current, `${press} Apply to draft`, ['above', 'left'])
                : phase === 'publish'
                  ? at(publishRef.current, `${press} Publish to finish`, ['above', 'left'])
                  : null,
    );
  }, [phase]);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <Theme appearance={colorMode} accentColor={ACCENTS.blue.radix} hasBackground={false}>
        <div className={styles.dialog}>
          {/* ---------- Header ---------- */}
          <div className={styles.header}>
            <h2 className={styles.title}>Publish Notes</h2>
            <span className={styles.iconButton} aria-hidden="true">
              <MoreVertical size={18} />
            </span>
          </div>

          {/* ---------- One version's card ---------- */}
          <div className={styles.body}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.thumb}>
                  <img src={`${siteBase}${thumbnailFor(VERSION_NAME)}`} alt="" />
                </div>
                <div className={styles.cardHeading}>
                  <span className={styles.versionName}>{VERSION_NAME}</span>
                  <span className={styles.submitter}>
                    <Avatar fallback="JD" size="1" radius="full" variant="solid" color="indigo" />
                    {ARTIST}
                  </span>
                </div>
              </div>

              <div className={styles.rows}>
                {/* Version status */}
                <div className={styles.row}>
                  <Checkbox
                    aria-label="Apply version status"
                    checked={statusChanged && statusChecked}
                    disabled={!statusChanged}
                    onCheckedChange={(c) => setStatusChecked(c === true)}
                  />
                  <span className={clsx(styles.rowLabel, !statusChanged && styles.muted)}>
                    Version Status
                  </span>
                  <span className={styles.selectWrap}>
                    <select
                      className={styles.select}
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      aria-label="Version status">
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className={styles.selectIcon} />
                  </span>
                  <span className={styles.hint}>
                    {statusChanged ? `was ${CURRENT_STATUS}` : 'No change'}
                  </span>
                </div>

                {/* The note, with its Note QC pill */}
                <div className={styles.row}>
                  <Checkbox
                    aria-label={`Select ${NOTE_OWNER}'s Note`}
                    checked={noteChecked}
                    onCheckedChange={(c) => setNoteChecked(c === true)}
                  />
                  <span className={styles.rowLabel}>{NOTE_OWNER}'s Note</span>
                  <Badge color="blue" variant="soft" size="1">
                    Draft
                  </Badge>
                  <span className={styles.pillWrap}>
                    <button
                      ref={pillRef}
                      type="button"
                      className={clsx(styles.pill, fixed ? styles.pillOk : styles.pillWarn)}
                      aria-label="Note QC status"
                      aria-expanded={qcOpen}
                      onClick={togglePill}>
                      <span className={styles.pillText}>
                        {fixed ? 'Note QC: All checks pass' : `Note QC: ${MENTIONED_SHOT} isn't linked`}
                      </span>
                      <ChevronDown size={14} />
                    </button>
                    {qcOpen && (
                      <div className={styles.popover} role="dialog" aria-label="Note QC">
                        <span className={styles.popoverTitle}>Note QC</span>
                        <div className={styles.check}>
                          <span className={styles.checkName}>
                            Link mentioned shots <span className={styles.warning}>Warning</span>
                          </span>
                          <span className={styles.checkIssue}>
                            The note mentions {MENTIONED_SHOT} but doesn't link it. Suggested: add it
                            to Links.
                          </span>
                          <div className={styles.checkActions}>
                            <Button variant="ghost" size="1" onClick={() => setPhase('openQc')}>
                              Ignore
                            </Button>
                            <Button ref={fixRef} size="1" onClick={() => setPhase('apply')}>
                              Fix
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </span>
                </div>

                <div className={clsx(styles.note, !noteChecked && styles.excluded)}>
                  <div className={clsx(uiStyles.chips, styles.chips)}>
                    <span className={uiStyles.chip}>
                      To:
                      <Badge color="blue" size="2">
                        <I.User size={12} />
                        {NOTE_TO}
                      </Badge>
                    </span>
                    <span className={clsx(uiStyles.chip, styles.linksChip)}>
                      Links:
                      <Badge color="orange" size="2">
                        <I.Layers size={12} />
                        <span className={uiStyles.badgeText}>{VERSION_NAME}</span>
                      </Badge>
                      {fixed && (
                        <Badge color="orange" size="2">
                          <I.Layers size={12} />
                          <span className={uiStyles.badgeText}>{MENTIONED_SHOT}</span>
                        </Badge>
                      )}
                    </span>
                  </div>
                  <div className={uiStyles.editorBox}>
                    <div className={clsx(uiStyles.editorArea, styles.editorArea)}>
                      <ul className={uiStyles.noteList}>
                        {NOTE_LINES.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Transcript */}
                <div className={clsx(styles.row, styles.transcriptRow)}>
                  <Checkbox
                    ref={transcriptBoxRef}
                    aria-label="Include transcript"
                    checked={transcriptChecked}
                    onCheckedChange={(c) => toggleTranscript(c === true)}
                  />
                  <span className={styles.rowLabel}>Transcript</span>
                  <span className={styles.hint}>{SPEAKERS} speakers</span>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setTranscriptShown((v) => !v)}>
                    {transcriptShown ? 'Hide' : 'Show'}
                  </button>
                </div>
                {transcriptShown && (
                  <div className={styles.transcript}>
                    {TRANSCRIPT.lines.map((line, i) => {
                      const showSpeaker =
                        i === 0 || TRANSCRIPT.lines[i - 1].speaker !== line.speaker;
                      return (
                        <div key={i} className={clsx(showSpeaker && styles.segmentFirst)}>
                          {showSpeaker && <span className={styles.speaker}>{line.speaker}</span>}
                          <p className={styles.segmentText}>{line.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------- Footer ---------- */}
          <div className={styles.footer}>
            <Button variant="soft" color="gray" tabIndex={-1}>
              Close
            </Button>
            <Button
              ref={publishRef}
              disabled={selectedCount === 0}
              onClick={() => phase === 'publish' && setPhase('done')}>
              Publish
            </Button>
          </div>

          {/* ---------- Apply QC suggestion, inside the demo ---------- */}
          {diffOpen && (
            <div className={styles.backdrop}>
              <div className={styles.diff} role="dialog" aria-labelledby="qc-diff-title">
                <h3 id="qc-diff-title" className={styles.diffTitle}>
                  Apply QC suggestion
                </h3>
                <p className={styles.diffDescription}>
                  Review the suggested changes before updating your draft.
                </p>
                <span className={styles.diffField}>Links</span>
                <div className={styles.diffColumns}>
                  <div>
                    <span className={styles.diffLabel}>Current</span>
                    <p className={styles.diffText}>{VERSION_NAME}</p>
                  </div>
                  <div>
                    <span className={styles.diffLabel}>Suggested</span>
                    <p className={styles.diffText}>
                      {VERSION_NAME}, <ins>{MENTIONED_SHOT}</ins>
                    </p>
                  </div>
                </div>
                <p className={styles.diffHint}>Only fields listed above are updated when you apply.</p>
                <div className={styles.diffActions}>
                  <Button variant="soft" color="gray" onClick={() => setPhase('openQc')}>
                    Cancel
                  </Button>
                  <Button ref={applyRef} onClick={() => setPhase('publish')}>
                    Apply to draft
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Theme>

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
