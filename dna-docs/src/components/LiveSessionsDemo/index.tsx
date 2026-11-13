import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
// The login demo's frame, badge and caption: this is the same screen.
import styles from '../LiveLoginDemo/styles.module.css';

// Split out: the app's styled-components and Radix code (and Radix's large
// stylesheet) only download when a demo actually renders.
const LoginDemo = lazy(() => import('../LiveLoginDemo/LoginDemo'));

/**
 * Opening a session, live: the app's sign-in screen with sessions switched
 * on, already signed in with a project chosen, so it starts at the step
 * that opens an existing session or creates a new one. Sample sessions; see
 * LiveLoginDemo/appMocks/useSessions.ts. Used in docs/guides/12-sessions.mdx.
 */
export default function LiveSessionsDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={styles.figure}>
      <div className={styles.frame}>
        <span className={styles.badge}>Demo</span>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <LoginDemo sessions />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
