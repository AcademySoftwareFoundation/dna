import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {AssistantNote} from '@dna-app/components/AssistantNote';
import {TRANSCRIPTS} from '../LiveInReviewDemo/transcripts';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import {themeVars} from '../LiveUiDemo/themeVars';
// The Transcript panel, from the in-review demo; the tab strip from the UI demo.
import feedStyles from '../LiveInReviewDemo/styles.module.css';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

/** The review the note is written from: evals/20260620/dataset/transcripts. */
const TRANSCRIPT = TRANSCRIPTS.find((t) => t.shot === 'TST_010_0020') ?? TRANSCRIPTS[0];

/**
 * The reference note for that transcript, the one the prompt evals grade
 * against: evals/20260620/dataset/notes/TST_010_0020_ref.txt.
 */
const NOTE = `- Visibility of surroundings is good. Want to read items in room, but not see where room ends.
- Digi-doubles are looking static. Need movement. Have them walk into their current position.
- Lose highlights on top of throne, should look like alien material, not reflective.`;

/** What the demo types into the AI card's additional instructions. */
const INSTRUCTIONS = 'Needs more cowbell';

/**
 * The same note, regenerated with those instructions: cowbell at the end of
 * every sentence, in bold so styles.module.css can highlight it.
 */
const COWBELL_NOTE = `- Visibility of surroundings is good, **cowbell**. Want to read items in room, but not see where room ends, **cowbell**.
- Digi-doubles are looking static, **cowbell**. Need movement, **cowbell**. Have them walk into their current position, **cowbell**.
- Lose highlights on top of throne, should look like alien material, not reflective, **cowbell**.`;

/** The app's placeholder on the instructions field (AssistantNote). */
const INSTRUCTIONS_PLACEHOLDER = 'Additional instructions for the AI...';

/** "Generating..." before the note shows, as a model call would take. */
const GENERATE_MS = 1500;
/** A beat after the instructions field opens before typing starts, then per character. */
const TYPE_DELAY_MS = 250;
const CHAR_MS = 35;
/** After Insert, before the checkmark. */
const SETTLE_MS = 500;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;
/** The transcript's timestamps: a minute or so per few lines. */
const START = new Date(2026, 0, 1, 10, 42);

type Tab = 'assistant' | 'transcript';
/** none -> (inserted) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** Fills a React-controlled input as if the user had typed into it. */
function fill(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', {bubbles: true}));
}

// Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
export default function AiNoteDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const theme = useMemo(() => getTheme(colorMode, accent), [colorMode, accent]);
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);

  const [tab, setTab] = useState<Tab>('transcript');
  const [note, setNote] = useState<string | null>(null);
  const [generating, setGenerating] = useState<'plain' | 'cowbell' | null>(null);

  // First visit to the AI Assistant tab generates the note. Regenerate on
  // its own does nothing here (the button still looks and hovers as live);
  // with additional instructions it regenerates the cowbell version.
  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => {
      setNote(generating === 'cowbell' ? COWBELL_NOTE : NOTE);
      setGenerating(null);
    }, GENERATE_MS);
    return () => clearTimeout(timer);
  }, [generating]);
  const openAssistant = () => {
    setTab('assistant');
    if (note === null && !generating) setGenerating('plain');
  };
  const regenerate = (instructions?: string) => {
    if (!instructions || generating) return;
    setNote(null);
    setGenerating('cowbell');
  };
  const cowbell = note === COWBELL_NOTE;

  // Inserting the cowbell note finishes the demo: a beat, then the
  // checkmark; reset the demo behind it, then fade it away.
  const [inserted, setInserted] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  // Bumped to remount the AI card on reset, clearing its instructions field.
  const [run, setRun] = useState(0);
  const insert = () => {
    if (cowbell) setInserted(true);
  };
  useEffect(() => {
    if (!inserted || overlay !== 'none') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [inserted, overlay]);
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setTab('transcript');
            setNote(null);
            setGenerating(null);
            setInserted(false);
            setRun((n) => n + 1);
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const times = useMemo(
    () =>
      TRANSCRIPT.lines.map((_, i) =>
        new Date(START.getTime() + Math.floor(i / 3) * 60_000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      ),
    [],
  );

  // The AI card's instructions toggle (the speech bubble beside Regenerate)
  // and its field, which come and go as the card re-renders.
  const rootRef = useRef<HTMLDivElement>(null);
  const [toggle, setToggle] = useState<HTMLButtonElement | null>(null);
  const [field, setField] = useState<HTMLInputElement | null>(null);
  const [insertButton, setInsertButton] = useState<HTMLButtonElement | null>(null);
  const [regenButton, setRegenButton] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const find = () => {
      const regen = [...root.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Regenerate',
      );
      setRegenButton(regen ?? null);
      setToggle((regen?.nextElementSibling as HTMLButtonElement | null) ?? null);
      setField(
        root.querySelector<HTMLInputElement>(`input[placeholder="${INSTRUCTIONS_PLACEHOLDER}"]`),
      );
      setInsertButton(
        [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Insert') ??
          null,
      );
    };
    const observer = new MutationObserver(find);
    observer.observe(root, {subtree: true, childList: true});
    find();
    return () => observer.disconnect();
  }, []);

  // Opening the instructions types the cowbell request into them.
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    setTyped(false);
    if (!field || cowbell) return;
    // The request is typed for you, so on touch screens keep the on-screen
    // keyboard down: it would resize the page under the demo. Regenerate is
    // then tapped rather than Enter pressed (see the guide below).
    if (window.matchMedia('(pointer: coarse)').matches) field.inputMode = 'none';
    let i = 0;
    let timer = setTimeout(function type() {
      i += 1;
      fill(field, INSTRUCTIONS.slice(0, i));
      if (i < INSTRUCTIONS.length) timer = setTimeout(type, CHAR_MS);
      else setTyped(true);
    }, TYPE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [field, cowbell]);

  // The guide: to the AI note, then to the instructions, Enter, and Insert.
  const assistantTabRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useEffect(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const press = touch ? 'Tap' : 'Click';
    // On narrow columns the card's header bubbles go above it, over the tab
    // strip, rather than below, over the note they're asking you to change.
    const narrow = window.matchMedia('(max-width: 720px)').matches;
    const tabButton = assistantTabRef.current;
    if (tab === 'transcript' && note === null && !generating && tabButton) {
      // Below, not beside: to the right it would cover the Transcript tab.
      setStep({
        target: tabButton,
        title: `${press} AI Assistant to generate a note`,
        sides: ['below'],
        align: 'start',
      });
    } else if (tab === 'assistant' && cowbell && !inserted && insertButton) {
      setStep({
        target: insertButton,
        title: `${press} Insert to add it to your notes`,
        sides: ['right', 'below', 'above'],
      });
    } else if (tab === 'assistant' && note === NOTE && field && typed) {
      // No Enter key on a touch screen without the keyboard up: Regenerate
      // sends the same instructions.
      setStep(
        touch && regenButton
          ? {
              target: regenButton,
              title: 'Tap Regenerate',
              sides: narrow ? ['above', 'below'] : ['below', 'above'],
              align: 'end',
            }
          : {target: field, title: 'Press Enter to regenerate', sides: ['below', 'above']},
      );
    } else if (tab === 'assistant' && note === NOTE && !field && toggle) {
      setStep({
        target: toggle,
        title: `${press} to add instructions for the AI`,
        sides: narrow ? ['above', 'below'] : ['below', 'left'],
        align: 'end',
      });
    } else {
      setStep(null);
    }
  }, [tab, note, generating, field, typed, toggle, regenButton, cowbell, inserted, insertButton]);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <ThemeProvider theme={theme}>
        <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
          <div className={clsx(styles.app, tab === 'assistant' && styles.appAssistant)}>
            {/* The app's tab strip above the panel. */}
            <div className={uiStyles.tabs} role="tablist">
              <button
                ref={assistantTabRef}
                type="button"
                role="tab"
                aria-selected={tab === 'assistant'}
                className={clsx(uiStyles.tab, tab === 'assistant' && uiStyles.tabActive)}
                onClick={openAssistant}>
                AI Assistant
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'transcript'}
                className={clsx(uiStyles.tab, tab === 'transcript' && uiStyles.tabActive)}
                onClick={() => setTab('transcript')}>
                Transcript
              </button>
            </div>

            <div className={styles.body}>
              {tab === 'assistant' ? (
                <AssistantNote
                  key={run}
                  suggestion={note}
                  isLoading={generating !== null}
                  onRegenerate={regenerate}
                  onInsertNote={insert}
                />
              ) : (
                <div className={feedStyles.panel}>
                  <div className={feedStyles.statusBar}>
                    <span className={feedStyles.statusDot} />
                    {`Live • ${TRANSCRIPT.lines.length} segments`}
                  </div>
                  <div className={feedStyles.segmentList}>
                    {TRANSCRIPT.lines.map((line, i) => {
                      // The app shows the speaker once per run of their segments.
                      const showSpeaker = i === 0 || TRANSCRIPT.lines[i - 1].speaker !== line.speaker;
                      return (
                        <div
                          key={i}
                          className={clsx(feedStyles.segment, showSpeaker && feedStyles.segmentFirst)}>
                          {showSpeaker && (
                            <div className={feedStyles.segmentHeader}>
                              <span className={feedStyles.speaker}>{line.speaker}</span>
                              <span className={feedStyles.timestamp}>{times[i]}</span>
                            </div>
                          )}
                          <p className={feedStyles.segmentText}>{line.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Theme>
      </ThemeProvider>

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
