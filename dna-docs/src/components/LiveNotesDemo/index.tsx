import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Tiptap, the app's editor and Radix only download when a demo
// actually renders.
const NotesDemo = lazy(() => import('./NotesDemo'));

/**
 * The app's real notes box, working against sample data: type markdown,
 * @mention people and shots, edit the To/CC/Subject/Links options, and
 * attach an image. Used in docs/guides/3-ui.mdx.
 */
export default function LiveNotesDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      <span className={clsx(loginStyles.badge, uiStyles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <NotesDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
