import {lazy, Suspense, type ReactNode} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import clsx from 'clsx';
// Figure and caption styling shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
// The rounded hairline frame and the app's fonts, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

// Split out: Radix, styled-components and the app's VersionCard only
// download when the picture actually renders.
const PlayerSyncPicture = lazy(() => import('../HomepagePlayerSync/PlayerSyncPicture'));

/** The canvas: DNA's sidebar plus the whole player window, nothing cropped. */
const DESIGN_WIDTH = 1010;
const DESIGN_HEIGHT = 620;

/**
 * RV driving DNA's in-review version, as a looping picture: the homepage's
 * player-sync mock with the player named RV, framed like the other guides'
 * demos and sized so the whole RV window shows. Nothing responds to input,
 * so it carries no Demo badge. Used in docs/guides/7-rv-integration.mdx and
 * integrations/rv.mdx.
 */
export default function LiveRvSyncDemo({caption}: {caption?: ReactNode}): ReactNode {
  return (
    <figure className={loginStyles.figure}>
      <div className={clsx(uiStyles.frame, styles.frame)} aria-hidden="true">
        <BrowserOnly>
          {() => (
            <Suspense fallback={null}>
              <PlayerSyncPicture
                designWidth={DESIGN_WIDTH}
                designHeight={DESIGN_HEIGHT}
                minScale={0}
                playerName="RV"
              />
            </Suspense>
          )}
        </BrowserOnly>
      </div>
      {caption && <figcaption className={loginStyles.caption}>{caption}</figcaption>}
    </figure>
  );
}
