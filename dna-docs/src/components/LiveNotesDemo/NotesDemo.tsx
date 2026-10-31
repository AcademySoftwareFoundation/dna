import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ThemeProvider} from 'styled-components';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {NoteEditor, type LocalDraftNote} from '@dna-app/components/NoteEditor';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {
  DEMO_PROJECT_ID,
  DEMO_SUBMITTER,
  DEMO_VERSION,
} from '../LiveLoginDemo/appMocks/entities';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import styles from './styles.module.css';

/** What the Attach Image button adds, instead of opening a file picker. */
const MARKUP_IMAGE = 'img/demo/TST_010_0040_markup.png';
/** Let the "1 Image" pill glow on its own for a moment before the tray opens. */
const OPEN_TRAY_MS = 500;

// The app's real NoteEditor over a local draft (see ./index.tsx and the
// fakes in ../LiveLoginDemo/appMocks). Browser-only: loaded inside
// <BrowserOnly>.
export default function NotesDemo() {
  const {colorMode} = useColorMode();
  const theme = useMemo(() => getTheme(colorMode, 'blue'), [colorMode]);
  const imageUrl = useBaseUrl(MARKUP_IMAGE);

  // Starts as the app does for a fresh version: the submitter in To, the
  // version in Links (both shown as locked pills), nothing else.
  const [draft, setDraft] = useState<LocalDraftNote>({
    content: '',
    subject: '',
    to: [DEMO_SUBMITTER],
    cc: [],
    links: [],
    versionStatus: '',
    published: false,
    edited: false,
    publishedNoteId: null,
    attachmentIds: [],
  });
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

  // "Try typing here" over the editor until something is typed. The editor
  // mounts a frame after the rest (Tiptap sets up first), so watch for it.
  const [editorEl, setEditorEl] = useState<Element | null>(null);
  useEffect(() => {
    const app = appRef.current;
    if (!app) return;
    const observer = new MutationObserver(find);
    function find() {
      const el = app?.querySelector('.tiptap');
      if (el) {
        setEditorEl(el);
        observer.disconnect();
      }
    }
    observer.observe(app, {subtree: true, childList: true});
    find();
    return () => observer.disconnect();
  }, []);
  const step = useMemo(
    (): GuideStep | null =>
      editorEl && !draft.content.trim()
        ? // Pointing down at where typing starts.
          {target: editorEl, title: 'Try typing here', sides: ['above'], align: 'start', noRing: true}
        : null,
    [editorEl, draft.content],
  );

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
            projectId={DEMO_PROJECT_ID}
            currentVersion={DEMO_VERSION}
            draftNote={draft}
            updateDraftNote={updateDraftNote}
            saveAttachmentIds={saveAttachmentIds}
          />
        </Theme>
      </ThemeProvider>
      <Guide step={step} rootRef={appRef} />
    </div>
  );
}
