import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {NoteEditor, type LocalDraftNote} from '@dna-app/components/NoteEditor';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {
  DEMO_CC,
  DEMO_PROJECT_ID,
  DEMO_SUBMITTER,
  DEMO_VERSION,
} from '../LiveLoginDemo/appMocks/entities';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import clsx from 'clsx';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

/** What the Attach Image button adds, instead of opening a file picker. */
const MARKUP_IMAGE = 'img/demo/TST_010_0040_markup.png';
/** Let the "1 Image" pill glow on its own for a moment before the tray opens. */
const OPEN_TRAY_MS = 500;

/** none -> (last step) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** A beat to see the finished note before the checkmark. */
const SETTLE_MS = 1000;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

// Starts as the app does for a fresh version: the submitter in To, the
// version in Links (both shown as locked pills), plus a CC to show.
const freshDraft = (): LocalDraftNote => ({
  content: '',
  subject: '',
  to: [DEMO_SUBMITTER],
  cc: [DEMO_CC],
  links: [],
  versionStatus: '',
  published: false,
  edited: false,
  publishedNoteId: null,
  attachmentIds: [],
});

// The app's real NoteEditor over a local draft (see ./index.tsx and the
// fakes in ../LiveLoginDemo/appMocks). Browser-only: loaded inside
// <BrowserOnly>.
export default function NotesDemo() {
  const {colorMode} = useColorMode();
  const theme = useMemo(() => getTheme(colorMode, 'blue'), [colorMode]);
  const imageUrl = useBaseUrl(MARKUP_IMAGE);

  const [draft, setDraft] = useState<LocalDraftNote>(freshDraft);
  // Bumped to remount the editor on reset: attachments live in its own state.
  const [run, setRun] = useState(0);
  const updateDraftNote = useCallback(
    (updates: Partial<LocalDraftNote>) => setDraft((prev) => ({...prev, ...updates})),
    [],
  );
  const saveAttachmentIds = useCallback(async () => {}, []);

  // Attach Image: the app opens a file picker. Here the click is stopped
  // before React sees it (so no picker), and the sample markup is "picked"
  // instead: put on the editor's hidden file input and announced with the
  // change event a real pick fires. Then open the tray so the thumbnail
  // shows.
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('button[title="Attach Image"]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const blob = await (await fetch(imageUrl)).blob();
        const file = new File([blob], 'TST_010_0040_markup.png', {type: blob.type || 'image/png'});
        const input = app.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input) return;
        try {
          const picked = new DataTransfer();
          picked.items.add(file);
          input.files = picked.files;
          input.dispatchEvent(new Event('change', {bubbles: true}));
        } catch {
          // No DataTransfer constructor: call the input's React handler
          // directly with the shape it reads (files, and value to clear).
          const propsKey = Object.keys(input).find((key) => key.startsWith('__reactProps$'));
          const props = propsKey
            ? (input as unknown as Record<string, {onChange?: (event: unknown) => void}>)[propsKey]
            : undefined;
          props?.onChange?.({target: {files: [file], value: ''}});
        }
        timer = setTimeout(() => {
          const trayOpen = app.querySelector('button[title="Remove attachment"]');
          if (!trayOpen) {
            app.querySelector<HTMLButtonElement>('button[title="View attached images"]')?.click();
          }
        }, OPEN_TRAY_MS);
      })();
    };
    app.addEventListener('click', onClick, true);
    return () => {
      app.removeEventListener('click', onClick, true);
      clearTimeout(timer);
    };
  }, [imageUrl]);

  // Guide steps: type a note, attach the image, open the note options, give
  // it a subject, close the options; then the checkmark and a reset. The
  // targets come and go (Tiptap mounts a frame late; the pencil swaps for
  // the options form while editing; the image pill appears on attach), so
  // keep watching the markup for them.
  interface Targets {
    editor: Element | null;
    attach: Element | null;
    /** The "1 Image" pill: present once an image is attached. */
    pill: Element | null;
    pencil: Element | null;
    subject: Element | null;
    /** The options form's close button. */
    close: Element | null;
  }
  const [targets, setTargets] = useState<Targets>({
    editor: null,
    attach: null,
    pill: null,
    pencil: null,
    subject: null,
    close: null,
  });
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const find = () => {
      const subject = app.querySelector('input[placeholder="Subject..."]');
      // Subject field -> its group -> its row -> the form, whose first
      // button is the close X in its header.
      const form = subject?.parentElement?.parentElement?.parentElement ?? null;
      const next: Targets = {
        editor: app.querySelector('.tiptap'),
        attach: app.querySelector('button[title="Attach Image"]'),
        pill: app.querySelector('button[title="View attached images"]'),
        pencil: app.querySelector('button[title="Edit note options"]'),
        subject,
        close: form?.querySelector('button') ?? null,
      };
      setTargets((prev) =>
        (Object.keys(next) as (keyof Targets)[]).every((key) => prev[key] === next[key])
          ? prev
          : next,
      );
    };
    const observer = new MutationObserver(find);
    observer.observe(app, {subtree: true, childList: true});
    find();
    return () => observer.disconnect();
  }, []);

  const typed = draft.content.trim() !== '';
  const hasSubject = draft.subject.trim() !== '';
  const editing = targets.subject !== null;
  const finished = typed && targets.pill !== null && hasSubject && !editing;

  const step = useMemo((): GuideStep | null => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    if (!typed) {
      // Pointing down at where typing starts.
      return targets.editor
        ? {target: targets.editor, title: 'Try typing here', sides: ['above'], align: 'start', noRing: true}
        : null;
    }
    if (!targets.pill) {
      return targets.attach
        ? {target: targets.attach, title: `${press} the picture button to add an image`, sides: ['right', 'above']}
        : null;
    }
    if (editing) {
      if (hasSubject) {
        return targets.close
          ? {target: targets.close, title: `${press} to close the note options`, sides: ['left', 'below']}
          : null;
      }
      return targets.subject
        ? {target: targets.subject, title: 'Give the note a subject', sides: ['above'], align: 'end'}
        : null;
    }
    if (hasSubject) return null;
    return targets.pencil
      ? {target: targets.pencil, title: `${press} the pencil to set a subject`, sides: ['right', 'left', 'below']}
      : null;
  }, [targets, typed, hasSubject, editing]);

  // All steps done: a beat to see the note, then the checkmark; reset the
  // demo behind it, then fade it away.
  const [overlay, setOverlay] = useState<Overlay>('none');
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
            setDraft(freshDraft());
            setRun((n) => n + 1);
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  // The editor ids new attachments with crypto.randomUUID, which browsers
  // only provide on secure origins; a plain-http preview (e.g. the dev
  // server over the LAN) gets a stand-in.
  useEffect(() => {
    if (typeof crypto.randomUUID !== 'function') {
      (crypto as {randomUUID?: () => string}).randomUUID = () =>
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    }
  }, []);

  return (
    <div ref={appRef} className={styles.app}>
      <ThemeProvider theme={theme}>
        <Theme appearance={colorMode} accentColor={ACCENTS.blue.radix} hasBackground={false}>
          <NoteEditor
            key={run}
            projectId={DEMO_PROJECT_ID}
            currentVersion={DEMO_VERSION}
            draftNote={draft}
            updateDraftNote={updateDraftNote}
            saveAttachmentIds={saveAttachmentIds}
          />
        </Theme>
      </ThemeProvider>
      {overlay === 'none' && <Guide step={step} rootRef={appRef} />}

      {overlay !== 'none' && (
        <div
          role="status"
          className={clsx(loginStyles.success, overlay === 'fading' && loginStyles.successOut)}>
          <svg className={loginStyles.check} viewBox="0 0 52 52" aria-hidden="true">
            <circle className={loginStyles.checkCircle} cx="26" cy="26" r="24" />
            <path className={loginStyles.checkMark} d="M15 27l7 7 15-16" />
          </svg>
          <span className={loginStyles.srOnly}>Note done. The demo starts over.</span>
        </div>
      )}
    </div>
  );
}
