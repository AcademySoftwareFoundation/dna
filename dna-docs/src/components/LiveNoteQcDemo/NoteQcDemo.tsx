import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {Pencil, Plus, Trash2} from 'lucide-react';
import {Button, Switch, TextArea, TextField, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS} from '@dna-app/styles/theme';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

type Severity = 'warning' | 'error';

interface Check {
  name: string;
  enabled: boolean;
  severity: Severity;
}

/** The check that's already there. */
const EXISTING: Check = {name: 'Action Item Check', enabled: true, severity: 'warning'};

/** What the demo types in: the check that fires in the publishing demo. */
const NAME = 'Link mentioned shots';
const INSTRUCTIONS =
  "If the note mentions a shot or version that isn't in Links, fail the check and suggest adding it to Links.";

/** A beat after a field is clicked before typing starts, then per character. */
const TYPE_DELAY_MS = 200;
const CHAR_MS = 25;
/** After Save, before the checkmark. */
const SETTLE_MS = 500;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/**
 * add -> (Add check) name -> (field) typingName -> instructions -> (field)
 * typingInstructions -> save -> (Save) saved -> checkmark and reset.
 */
type Phase =
  | 'add'
  | 'name'
  | 'typingName'
  | 'instructions'
  | 'typingInstructions'
  | 'save'
  | 'saved';
/** none -> (saved) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** Types `text` into a setter a character at a time, then calls `done`. */
function useTyping(active: boolean, text: string, set: (v: string) => void, done: () => void) {
  useEffect(() => {
    if (!active) return;
    let i = 0;
    let timer = setTimeout(function type() {
      i += 1;
      set(text.slice(0, i));
      if (i < text.length) timer = setTimeout(type, CHAR_MS);
      else done();
    }, TYPE_DELAY_MS);
    return () => clearTimeout(timer);
    // The setters are stable; only `active` starts and stops the typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/**
 * The AI tab's Note QC section (frontend NoteQCTab) in the app's default
 * terminology, with its New check dialog opening inside the demo rather
 * than over the page. The guide leaves severity at Warning. Browser-only: loaded by
 * ./index.tsx inside <BrowserOnly>.
 */
export default function NoteQcDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);

  const [checks, setChecks] = useState<Check[]>([EXISTING]);
  const [phase, setPhase] = useState<Phase>('add');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [severity, setSeverity] = useState<Severity>('warning');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const dialogOpen = phase !== 'add' && phase !== 'saved';

  useTyping(phase === 'typingName', NAME, setName, () => setPhase('instructions'));
  useTyping(phase === 'typingInstructions', INSTRUCTIONS, setInstructions, () =>
    setPhase('save'),
  );

  const closeDialog = () => {
    setPhase('add');
    setName('');
    setInstructions('');
    setSeverity('warning');
  };
  const save = () => {
    if (phase !== 'save') return;
    setChecks((prev) => [...prev, {name: NAME, enabled: true, severity}]);
    setPhase('saved');
  };

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
            setChecks([EXISTING]);
            closeDialog();
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<GuideStep | null>(null);
  useEffect(() => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    const at = (el: Element | null, title: string, sides: GuideStep['sides']) =>
      el ? {target: el, title, sides} : null;
    setStep(
      phase === 'add'
        ? at(addRef.current, `${press} Add check`, ['left', 'below'])
        : phase === 'name'
          ? at(nameRef.current, `${press} Name to fill it in`, ['above', 'below'])
          : phase === 'instructions'
            ? at(instructionsRef.current, `${press} Instructions to fill them in`, ['above', 'below'])
            : phase === 'save'
              ? at(saveRef.current, `${press} Save`, ['left', 'above'])
              : null,
    );
  }, [phase]);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
        <div className={styles.panel}>
          <section className={styles.section}>
            <h3 className={styles.title}>Note QC</h3>
            <p className={styles.description}>
              Define LLM checks that run when you open Publish. Error-level failures block publishing
              until you fix or ignore them.
            </p>
            <div className={styles.addRow}>
              <Button ref={addRef} size="2" onClick={() => phase === 'add' && setPhase('name')}>
                <Plus size={16} />
                Add check
              </Button>
            </div>
            <div>
              {checks.map((c, i) => (
                <div key={c.name} className={styles.row}>
                  <Switch
                    checked={c.enabled}
                    aria-label={`Enable ${c.name}`}
                    onCheckedChange={(v) =>
                      setChecks((prev) =>
                        prev.map((p, j) => (j === i ? {...p, enabled: v === true} : p)),
                      )
                    }
                  />
                  <div className={styles.rowText}>
                    <span className={styles.rowName}>{c.name}</span>
                    <span className={styles.rowSeverity}>
                      {c.severity === 'error' ? 'Error (blocks publish)' : 'Warning'}
                    </span>
                  </div>
                  <span className={styles.icon} aria-hidden="true">
                    <Pencil size={16} />
                  </span>
                  <span className={clsx(styles.icon, styles.iconDanger)} aria-hidden="true">
                    <Trash2 size={16} />
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* The app's New check dialog, kept inside the demo. */}
          {dialogOpen && (
            <div className={styles.backdrop}>
              <div className={styles.dialog} role="dialog" aria-labelledby="note-qc-demo-title">
                <h2 id="note-qc-demo-title" className={styles.dialogTitle}>
                  New check
                </h2>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Name</span>
                  <TextField.Root
                    ref={nameRef}
                    value={name}
                    readOnly
                    placeholder="Short name"
                    onClick={() => phase === 'name' && setPhase('typingName')}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Instructions</span>
                  <TextArea
                    ref={instructionsRef}
                    className={styles.instructions}
                    value={instructions}
                    readOnly
                    placeholder="Describe what the LLM should verify…"
                    onClick={() => phase === 'instructions' && setPhase('typingInstructions')}
                  />
                </label>
                <div className={styles.severity}>
                  <span>Severity</span>
                  <label>
                    <input
                      type="radio"
                      name="note-qc-demo-severity"
                      checked={severity === 'warning'}
                      onChange={() => setSeverity('warning')}
                    />
                    Warning
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="note-qc-demo-severity"
                      checked={severity === 'error'}
                      onChange={() => setSeverity('error')}
                    />
                    Error
                  </label>
                </div>
                <div className={styles.actions}>
                  <Button variant="soft" color="gray" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button ref={saveRef} disabled={phase !== 'save'} onClick={save}>
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
