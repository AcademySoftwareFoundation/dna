import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Radix, styled-components and the app's tabs and VersionCard
// only download when a demo actually renders.
const SessionTabsDemo = lazy(() => import('./SessionTabsDemo'));

/**
 * A session's header, live: the app's playlist tabs and + Add playlist
 * menu, over the active playlist's versions. Walks through opening another
 * playlist, moving in review to it, pinning it, and adding a playlist. Used
 * in docs/guides/12-sessions.mdx.
 */
export default function LiveSessionTabsDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      <span className={clsx(loginStyles.badge, uiStyles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <SessionTabsDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
