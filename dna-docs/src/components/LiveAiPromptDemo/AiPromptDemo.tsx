import {useMemo, type CSSProperties} from 'react';
import {Info} from 'lucide-react';
import {TextArea, Theme, Tooltip} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {usePluginData} from '@docusaurus/useGlobalData';
import {useColorMode} from '@docusaurus/theme-common';
import {useAccent} from '@site/src/accent';
import {ACCENTS} from '@dna-app/styles/theme';
import type {DefaultNotePromptData} from '../../../plugins/default-note-prompt';
import {themeVars} from '../LiveUiDemo/themeVars';
import styles from './styles.module.css';

/**
 * The AI tab's Note Generation section (frontend SettingsModal, AITab) in
 * the app's default terminology: title, tag tooltip, description, and the
 * prompt box showing the default prompt, as the app does before a user saves
 * their own. Read-only: scroll it, don't edit it. Browser-only: loaded by
 * ./index.tsx inside <BrowserOnly>.
 */
export default function AiPromptDemo() {
  const {colorMode} = useColorMode();
  const accent = useAccent();
  const vars = useMemo(() => themeVars(colorMode, accent), [colorMode, accent]);
  const {body} = usePluginData('default-note-prompt') as DefaultNotePromptData;

  return (
    <div className={styles.root} style={vars as CSSProperties}>
      <Theme appearance={colorMode} accentColor={ACCENTS[accent].radix} hasBackground={false}>
        <section className={styles.section}>
          <h3 className={styles.title}>
            Note Generation
            <Tooltip
              content={
                <>
                  Customize the prompt used when generating notes from transcript and version
                  information. You can include the following tags in the prompt:
                  <br />
                  <br />
                  {'{{ transcript }}'} - What was said on this version
                  <br />
                  {'{{ context }}'} - Includes context for the version
                  <br />
                  {'{{ notes }}'} - Any notes you took on this version already
                  <br />
                  {'{{ glossary_global }}'} - The global VFX glossary
                  <br />
                  {'{{ glossary_project }}'} - The project glossary
                </>
              }>
              <span className={styles.info}>
                <Info size={14} />
              </span>
            </Tooltip>
          </h3>
          <p className={styles.description}>
            This prompt is used when generating notes via the transcript and version information.
          </p>
          <TextArea
            className={styles.prompt}
            value={body}
            readOnly
            aria-label="Default note generation prompt"
          />
        </section>
      </Theme>
    </div>
  );
}
