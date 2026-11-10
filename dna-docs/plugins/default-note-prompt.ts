import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type {LoadContext, Plugin} from '@docusaurus/types';

/** What the docs read from the plugin's global data. */
export interface DefaultNotePromptData {
  body: string;
}

/**
 * Reads the backend's default note-generation prompt
 * (backend/src/dna/config/default_note_prompt.yaml, the
 * `default_note_prompt` the settings API returns) at build time, so docs
 * pages show the real prompt rather than a copy that drifts. Pages read it
 * with usePluginData('default-note-prompt'). Fails the build if the file or
 * its `default_note_prompt.body` is missing, as the backend would.
 */
export default function defaultNotePrompt(context: LoadContext): Plugin {
  const file = path.resolve(
    context.siteDir,
    '../backend/src/dna/config/default_note_prompt.yaml',
  );

  return {
    name: 'default-note-prompt',
    getPathsToWatch() {
      return [file];
    },
    async loadContent(): Promise<DefaultNotePromptData> {
      const data = yaml.load(await fs.promises.readFile(file, 'utf8')) as {
        default_note_prompt?: {body?: unknown};
      } | null;
      const body = data?.default_note_prompt?.body;
      if (typeof body !== 'string' || !body.trim()) {
        throw new Error(`default-note-prompt: no default_note_prompt.body in ${file}`);
      }
      return {body};
    },
    async contentLoaded({content, actions}) {
      actions.setGlobalData(content);
    },
  };
}
