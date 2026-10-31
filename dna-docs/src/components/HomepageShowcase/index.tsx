import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Heading from '@theme/Heading';
import SectionLabel from '@site/src/components/SectionLabel';
import styles from './styles.module.css';

// The UI guide's live demo, rendered as a picture (see UiDemo's
// `interactive`). Split out so Radix only downloads for the homepage once
// this section renders.
const UiDemo = lazy(() => import('@site/src/components/LiveUiDemo/UiDemo'));

/**
 * The app's playlist screen fading into the page from left to right, so the
 * sidebar shows and the copy on the right sits over the faded rest. Same
 * mock as docs/guides/3-ui.mdx, so it follows the docs' light/dark mode.
 */
export default function HomepageShowcase(): ReactNode {
  return (
    <section className={styles.showcase}>
      <div className="container">
        <SectionLabel>Designed with studios</SectionLabel>
        <div className={styles.row}>
          <div className={styles.stage} aria-hidden="true">
            <div className={styles.frame}>
              <BrowserOnly>
                {() => (
                  <Suspense fallback={null}>
                    <UiDemo interactive={false} />
                  </Suspense>
                )}
              </BrowserOnly>
            </div>
            <div className={styles.fadeRight} />
            <div className={styles.fadeBottom} />
          </div>
          <div className={styles.copy}>
            <Heading as="h2" className={styles.heading}>
              Built around the people who run dailies
            </Heading>
            <p>
              DNA grew out of user-story research with coordinators, supervisors and artists at
              studios across the industry: the people who sit in reviews every day capturing feedback.
            </p>
            <p>
              It is coordinator-centered by design. For the frontend, the sidebar, notes box and transcript are
              arranged around how a review actually flows, so feedback is captured as it happens
              and nothing is lost between the room and production tracking.
            </p>
            <p>
              And because it is open source under the Academy Software Foundation, every part of it,
              from the AI prompts to the production-tracking integration, is configurable and
              malleable to fit your pipeline.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
