import {useMemo, useState, type CSSProperties, type ReactNode} from 'react';
import clsx from 'clsx';
import {Check, Info, Pencil, Plus, Trash2} from 'lucide-react';
import {Button, Checkbox, Select, Switch, TextArea, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {usePluginData} from '@docusaurus/useGlobalData';
import {useColorMode} from '@docusaurus/theme-common';
import {ACCENTS, ACCENT_NAMES} from '@dna-app/styles/theme';
import {buildHotkeyActions} from '@dna-app/hotkeys/hotkeysConfig';
import {DEFAULT_RESOLVED_NOMENCLATURE} from '@dna-app/nomenclature/nomenclature';
import type {DefaultNotePromptData} from '../../../plugins/default-note-prompt';
import {themeVars} from '../LiveUiDemo/themeVars';
import styles from './styles.module.css';

type Tab = 'general' | 'keybindings' | 'transcription' | 'ai';

const TABS: {id: Tab; label: string}[] = [
  {id: 'general', label: 'General'},
  {id: 'keybindings', label: 'Keybindings'},
  {id: 'transcription', label: 'Transcription'},
  {id: 'ai', label: 'AI'},
];

/** The app's shortcuts and default keys (frontend hotkeysConfig). */
const HOTKEYS = buildHotkeyActions(DEFAULT_RESOLVED_NOMENCLATURE);

/** The app's formatKeysForDisplay (SettingsModal), as on a Mac. */
function formatKeys(keys: string): string {
  const named: Record<string, string> = {
    meta: '⌘',
    shift: '⇧',
    alt: '⌥',
    ctrl: 'Ctrl',
    down: '↓',
    arrowdown: '↓',
    up: '↑',
    arrowup: '↑',
    left: '←',
    arrowleft: '←',
    right: '→',
    arrowright: '→',
    space: 'Space',
    escape: 'Esc',
  };
  return keys
    .split('+')
    .map((part) => {
      const p = part.trim().toLowerCase();
      return named[p] ?? p.toUpperCase();
    })
    .join(' + ');
}

/**
 * The Settings dialog (frontend SettingsModal) at its defaults, in the
 * app's default terminology: the tabs switch and each tab scrolls, and
 * every control in them is for show (inert). The shortcut list and the
 * note prompt come from the app and backend sources. Browser-only: loaded
 * by ./index.tsx inside <BrowserOnly>.
 */
export default function SettingsDemo() {
  const {colorMode} = useColorMode();
  const vars = useMemo(() => themeVars(colorMode), [colorMode]);
  const [tab, setTab] = useState<Tab>('general');

  return (
    <div className={styles.root} style={vars as CSSProperties}>
      <Theme appearance={colorMode} accentColor={ACCENTS.blue.radix} hasBackground={false}>
        <div className={styles.dialog}>
          <h2 className={styles.title}>Settings</h2>
          <p className={styles.description}>
            Configure your preferences for note generation, AI assistance, and keyboard shortcuts.
          </p>

          <div className={styles.tabs} role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={clsx(styles.tab, tab === t.id && styles.tabActive)}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Keyed so each tab opens scrolled to its top. */}
          <div key={tab} className={styles.content} role="tabpanel">
            <div inert className={styles.sections}>
              {tab === 'general' && <GeneralTab lightMode={colorMode === 'light'} />}
              {tab === 'keybindings' && <KeybindingsTab />}
              {tab === 'transcription' && <TranscriptionTab />}
              {tab === 'ai' && <AiTab />}
            </div>
          </div>

          <div className={styles.footer}>
            <Button variant="soft" color="gray" tabIndex={-1}>
              Close
            </Button>
          </div>
        </div>
      </Theme>
    </div>
  );
}

// ---------- Building blocks, after the app's styled components ----------

function Section({title, children}: {title?: ReactNode; children: ReactNode}) {
  return (
    <section className={styles.section}>
      {title && <h3 className={styles.sectionTitle}>{title}</h3>}
      {children}
    </section>
  );
}

/** A label and description beside a control (the app's AppearanceRow / KeybindingRow). */
function Row({
  name,
  desc,
  bordered,
  children,
}: {
  name: ReactNode;
  desc: ReactNode;
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={clsx(styles.row, bordered && styles.rowBordered)}>
      <div className={styles.label}>
        <span className={styles.name}>{name}</span>
        <span className={styles.desc}>{desc}</span>
      </div>
      {children}
    </div>
  );
}

/** The app's FeatureEnableRow at the top of the Transcription and AI tabs. */
function EnableFeature({desc}: {desc: string}) {
  return (
    <div className={styles.enableRow}>
      <div className={styles.label}>
        <span className={styles.enableName}>Enable Feature</span>
        <span className={styles.enableDesc}>{desc}</span>
      </div>
      <Switch checked />
    </div>
  );
}

/** A checkbox with its label and description (the app's CheckboxRow). */
function CheckboxRow({checked, label, desc}: {checked: boolean; label: string; desc: string}) {
  return (
    <div className={styles.checkboxRow}>
      <Checkbox checked={checked} />
      <div className={styles.label}>
        <span className={styles.name}>{label}</span>
        <span className={styles.desc}>{desc}</span>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <span className={styles.info}>
      <Info size={14} />
    </span>
  );
}

// ---------- Tabs ----------

function GeneralTab({lightMode}: {lightMode: boolean}) {
  return (
    <>
      <Section title="Appearance">
        <Row name="Light Mode" desc="Switch between dark and light theme">
          <Switch checked={lightMode} />
        </Row>
        <Row name="Accent Color" desc="Recolors highlights and the background glow">
          <div className={styles.swatches}>
            {ACCENT_NAMES.map((name) => (
              <span
                key={name}
                className={clsx(styles.swatch, name === 'blue' && styles.swatchSelected)}
                style={{'--swatch': ACCENTS[name].colors.main} as CSSProperties}
                title={ACCENTS[name].label}>
                {name === 'blue' && <Check size={16} strokeWidth={3} />}
              </span>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="In Review">
        <Row
          name="Enable In Review"
          desc="Show In Review / Set In Review controls and the version indicator">
          <Switch checked />
        </Row>
      </Section>

      <Section title="ShotGrid (browser)">
        <p className={styles.sectionDescription}>Requires the DNA tab sync Chrome extension.</p>
        <CheckboxRow
          checked
          label="Sync SG tab when version changes"
          desc={
            'When enabled (default), the extension updates your ShotGrid tab whenever you select a different version. Turn off to update the SG tab only with the "SG tab" button in the version header.'
          }
        />
        <div className={clsx(styles.label, styles.pageToSync)}>
          <span className={styles.name}>Page to sync</span>
          <span className={styles.desc}>
            Which ShotGrid page opens when a version is selected.
          </span>
        </div>
        <div className={styles.radios}>
          <div className={styles.radioRow}>
            <span className={clsx(styles.radio, styles.radioChecked)} />
            <div className={styles.label}>
              <span className={styles.name}>Version Detail</span>
              <span className={styles.desc}>Open the version's detail page</span>
            </div>
          </div>
          <div className={styles.radioRow}>
            <span className={styles.radio} />
            <div className={styles.label}>
              <span className={styles.name}>Shot / Asset Detail</span>
              <span className={styles.desc}>Open the linked shot or asset detail page</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Reset Settings">
        <p className={styles.sectionDescription}>
          Resets user settings. Glossaries, keybindings, and QC checks are not affected.
        </p>
        <div className={styles.center}>
          <Button variant="soft" color="red">
            Reset Settings
          </Button>
        </div>
      </Section>
    </>
  );
}

function KeybindingsTab() {
  return (
    <Section>
      <p className={styles.sectionDescription}>
        Click a shortcut to record a new key combination. Press Escape to cancel.
      </p>
      <div>
        {HOTKEYS.map((action) => (
          <Row key={action.id} name={action.label} desc={action.description} bordered>
            <span className={styles.keys}>{formatKeys(action.defaultKeys)}</span>
          </Row>
        ))}
      </div>
      <div className={styles.center}>
        <Button variant="soft" color="red">
          Reset to Defaults
        </Button>
      </div>
    </Section>
  );
}

function TranscriptionTab() {
  return (
    <>
      <EnableFeature desc="Show transcription controls and the Transcript tab" />
      <Row
        name="Language"
        desc="Spoken language of your reviews. Use Auto-detect for mixed languages.">
        <Select.Root value="en">
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="en">English</Select.Item>
          </Select.Content>
        </Select.Root>
      </Row>
    </>
  );
}

function AiTab() {
  const {body} = usePluginData('default-note-prompt') as DefaultNotePromptData;
  return (
    <>
      <EnableFeature desc="Show AI note suggestions and Note QC checks" />

      <Section title="AI Model">
        <p className={styles.sectionDescription}>Select which model to use for note generation.</p>
        <Select.Root value="__default__">
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="__default__">gpt-4o-mini (default)</Select.Item>
          </Select.Content>
        </Select.Root>
      </Section>

      <Section
        title={
          <>
            Note Generation
            <InfoIcon />
          </>
        }>
        <p className={styles.sectionDescription}>
          This prompt is used when generating notes via the transcript and version information.
        </p>
        <TextArea className={styles.prompt} value={body} readOnly />
        <CheckboxRow
          checked={false}
          label="Regenerate notes on version change"
          desc="When you switch to a version that has no AI note yet, generate one automatically. Versions that already have a note are left as they are."
        />
        <CheckboxRow
          checked={false}
          label="Regenerate on transcript update"
          desc="Automatically regenerate the AI note when a new transcript segment comes in or an existing segment is updated."
        />
      </Section>

      <Section
        title={
          <>
            Glossaries
            <InfoIcon />
          </>
        }>
        <p className={styles.sectionDescription}>
          Terms supplied to the AI as context when generating notes.
        </p>
        <Row
          name="Global glossary"
          desc="Industry-wide VFX terms, shared across all productions. Maintained in the open-source repo — open a PR to contribute.">
          <Button variant="soft" size="2">
            Contribute
          </Button>
        </Row>
        <Row
          name="Project glossary"
          desc="Terms specific to the current production. Saved to this ShotGrid project.">
          <Button variant="soft" size="2">
            Edit
          </Button>
        </Row>
      </Section>

      <Section title="Note QC">
        <p className={styles.sectionDescription}>
          Define LLM checks that run when you open Publish. Error-level failures block publishing
          until you fix or ignore them.
        </p>
        <div className={styles.addRow}>
          <Button size="2">
            <Plus size={16} />
            Add check
          </Button>
        </div>
        <div className={styles.checkRow}>
          <Switch checked />
          <div className={clsx(styles.label, styles.grow)}>
            <span className={styles.name}>Action Item Check</span>
            <span className={styles.desc}>Warning</span>
          </div>
          <span className={styles.icon}>
            <Pencil size={16} />
          </span>
          <span className={clsx(styles.icon, styles.iconDanger)}>
            <Trash2 size={16} />
          </span>
        </div>
      </Section>
    </>
  );
}
