import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import styles from './styles.module.css';

// Split out: the app's styled-components and Radix code (and Radix's large
// stylesheet) only download when a demo actually renders.
const LoginDemo = lazy(() => import('./LoginDemo'));

/**
 * A live, clickable copy of the DNA login screen: the app's own
 * ProjectSelector component running against sample data. Used in
 * docs/guides/2-login.mdx.
 */
export default function LiveLoginDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={styles.figure}>
      <div className={styles.frame}>
        <span className={styles.badge}>Demo</span>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <LoginDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
    </figure>
  );
}
