import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure, badge and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Radix, styled-components and the app's VersionCard only
// download when a demo actually renders.
const InReviewDemo = lazy(() => import('./InReviewDemo'));

/**
 * The in-review controls, live: the sidebar's version cards beside the
 * version header, cropped to just those so the eye, pin and header buttons
 * read at full size. Walks through setting a version in review, pinning it,
 * taking over from a pin and setting it back. Used in
 * docs/guides/4-in-review.mdx.
 */
export default function LiveInReviewDemo({caption}: {caption?: ReactNode}): ReactNode {
  const placeholder = <div className={styles.placeholder} />;
  return (
    <figure className={loginStyles.figure}>
      <span className={clsx(loginStyles.badge, uiStyles.badge)}>Demo</span>
      <div className={styles.frame}>
        <BrowserOnly fallback={placeholder}>
          {() => (
            <Suspense fallback={placeholder}>
              <InReviewDemo />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
