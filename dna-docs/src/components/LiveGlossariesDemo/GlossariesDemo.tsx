import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {Info} from 'lucide-react';
import {Button, TextArea, Theme, Tooltip} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {useColorMode} from '@docusaurus/theme-common';
import {ACCENTS} from '@dna-app/styles/theme';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

/** The app's Contribute link (GLOBAL_GLOSSARY_GITHUB_URL in SettingsModal). */
const GLOBAL_GLOSSARY_URL =
  'https://github.com/AcademySoftwareFoundation/dna/blob/main/backend/src/dna/config/glossary_global.yaml';

/** What the demo types into the project glossary. */
const ENTRY = 'Ornithopter: Flapping-wing aircraft used for scouting and short-range transport.';

/** A beat after the text box is clicked before typing starts, then per character. */
const TYPE_DELAY_MS = 200;
const CHAR_MS = 30;
/** After Save, before the checkmark. */
const SETTLE_MS = 500;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/** edit -> (Edit) focus -> (text box) typing -> save -> (Save) saved -> checkmark and reset. */
type Phase = 'edit' | 'focus' | 'typing' | 'save' | 'saved';
/** none -> (saved) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/**
 * The AI tab's Glossaries section (frontend SettingsModal: the Global
 * glossary row and ProjectGlossaryEditor) in the app's default terminology.
 * The project glossary's dialog opens inside the demo rather than over the
 * whole page. Browser-only: loaded by ./index.tsx inside <BrowserOnly>.
 */
export default function GlossariesDemo() {
  const {colorMode} = useColorMode();
  const vars = useMemo(() => themeVars(colorMode), [colorMode]);

  const [phase, setPhase] = useState<Phase>('edit');
  const [draft, setDraft] = useState('');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const dialogOpen = phase === 'focus' || phase === 'typing' || phase === 'save';

  // Type the entry in once the text box is clicked, then point at Save.
  useEffect(() => {
    if (phase !== 'typing') return;
    let i = 0;
    let timer = setTimeout(function type() {
      i += 1;
      setDraft(ENTRY.slice(0, i));
      if (i < ENTRY.length) timer = setTimeout(type, CHAR_MS);
      else setPhase('save');
    }, TYPE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Saved: a beat, then the checkmark; reset the demo behind it, then fade
  // it away.
  useEffect(() => {
    if (phase !== 'saved' || overlay !== 'none') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [phase, overlay]);
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setPhase('edit');
            setDraft('');
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const cancel = () => {
    setPhase('edit');
    setDraft('');
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const textBoxRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useEffect(() => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    if (phase === 'edit' && editRef.current) {
      setStep({
        target: editRef.current,
        title: `${press} Edit to open the project glossary`,
        sides: ['left', 'above', 'below'],
      });
    } else if (phase === 'focus' && textBoxRef.current) {
      setStep({
        target: textBoxRef.current,
        title: `${press} the text box to add a term`,
        sides: ['above', 'below'],
      });
    } else if (phase === 'save' && saveRef.current) {
      setStep({target: saveRef.current, title: `${press} Save`, sides: ['left', 'above']});
    } else {
      setStep(null);
    }
  }, [phase]);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <Theme appearance={colorMode} accentColor={ACCENTS.blue.radix} hasBackground={false}>
        <div className={styles.panel}>
          <section className={styles.section}>
            <h3 className={styles.title}>
              Glossaries
              <Tooltip content="Glossaries are supplied to the AI as context whenever a note is generated, helping it expand VFX shorthand and production-specific terms correctly.">
                <span className={styles.info}>
                  <Info size={14} />
                </span>
              </Tooltip>
            </h3>
            <p className={styles.description}>
              Terms supplied to the AI as context when generating notes.
            </p>

            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>Global glossary</span>
                <span className={styles.rowDescription}>
                  Industry-wide VFX terms, shared across all productions. Maintained in the
                  open-source repo — open a PR to contribute.
                </span>
              </div>
              <Button asChild variant="soft" size="2">
                <a href={GLOBAL_GLOSSARY_URL} target="_blank" rel="noopener noreferrer">
                  Contribute
                </a>
              </Button>
            </div>

            <div className={styles.row}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>Project glossary</span>
                <span className={styles.rowDescription}>
                  Terms specific to the current production. Saved to this ShotGrid project.
                </span>
              </div>
              <Button
                ref={editRef}
                variant="soft"
                size="2"
                onClick={() => phase === 'edit' && setPhase('focus')}>
                Edit
              </Button>
            </div>
          </section>

          {/* The app's project glossary dialog, kept inside the demo. */}
          {dialogOpen && (
            <div className={styles.backdrop}>
              <div
                className={styles.dialog}
                role="dialog"
                aria-modal="false"
                aria-labelledby="glossary-demo-title">
                <h2 id="glossary-demo-title" className={styles.dialogTitle}>
                  Project glossary
                </h2>
                <p className={styles.dialogDescription}>
                  Terms unique to this production. One term per line, in{' '}
                  <code>term: definition</code> format.
                </p>
                <TextArea
                  ref={textBoxRef}
                  className={styles.glossary}
                  value={draft}
                  readOnly
                  onClick={() => phase === 'focus' && setPhase('typing')}
                  placeholder="Carryall: Large transport aircraft used to airlift Harvesters."
                  aria-label="Project glossary"
                />
                <div className={styles.footer}>
                  <Button variant="soft" color="gray" onClick={cancel}>
                    Cancel
                  </Button>
                  <Button
                    ref={saveRef}
                    disabled={phase !== 'save'}
                    onClick={() => setPhase('saved')}>
                    Save
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
