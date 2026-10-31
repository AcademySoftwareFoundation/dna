import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the login demo.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import styles from './styles.module.css';

// Split out like the login demo: Radix and the app theme only download when
// a demo renders.
const UiDemo = lazy(() => import('./UiDemo'));

/**
 * A live, clickable mock of the DNA playlist screen: sidebar, version
 * header, notes box and AI Assistant panel over sample data. Only version
 * selection and loading notes work. Used in docs/guides/3-ui.mdx.
 */
export default function LiveUiDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      {/* Above the frame: every corner of the app's layout is in use. */}
      <span className={clsx(loginStyles.badge, styles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <UiDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
