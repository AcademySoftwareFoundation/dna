import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Radix, React Query and the app's components only download when
// a demo actually renders.
const TranscriptionDemo = lazy(() => import('./TranscriptionDemo'));

/**
 * The Transcription menu, live: the app's real menu in the sidebar footer
 * beside the Transcript panel, with a pretend meeting bot behind it. Walks
 * through joining a call, pausing and resuming, and stopping. Used in
 * docs/guides/5-transcription.mdx.
 */
export default function LiveTranscriptionDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      <span className={clsx(loginStyles.badge, uiStyles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <TranscriptionDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
