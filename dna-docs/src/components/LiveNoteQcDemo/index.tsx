import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Radix only downloads when the demo actually renders.
const NoteQcDemo = lazy(() => import('./NoteQcDemo'));

/**
 * The Settings AI tab's Note QC section, live: the guide walks through
 * adding a check. Used in docs/guides/9-note-qc.mdx.
 */
export default function LiveNoteQcDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      <span className={clsx(loginStyles.badge, uiStyles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <NoteQcDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
