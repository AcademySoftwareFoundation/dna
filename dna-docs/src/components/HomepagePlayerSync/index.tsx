import {lazy, Suspense, type ReactNode} from 'react';
import clsx from 'clsx';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Heading from '@theme/Heading';
import Carousel from '@site/src/components/Carousel';
import SectionLabel from '@site/src/components/SectionLabel';
// The fading picture-and-copy layout, shared with HomepageShowcase.
import showcase from '@site/src/components/HomepageShowcase/styles.module.css';
// The logo row, shared with the production tracking section.
import integrations from '@site/src/components/HomepageIntegrations/styles.module.css';
import styles from './styles.module.css';

// Split out so Radix only downloads for the homepage once this section
// renders.
const PlayerSyncPicture = lazy(() => import('./PlayerSyncPicture'));

type Player = {
  name: string;
  href: string;
  /** Full-colour icon under static/img; the same on both themes. */
  logo: string;
  /** On the roadmap rather than shipped: dimmed, with "Planned" by its name. */
  planned?: boolean;
};

const Players: Player[] = [
  {
    // RV ships with Flow Production Tracking, so it goes by Flow PTR's icon.
    name: 'RV',
    href: 'https://www.autodesk.com/products/flow-production-tracking/overview',
    logo: 'img/players/flow-ptr.png',
  },
  {
    name: 'OpenRV',
    href: 'https://github.com/AcademySoftwareFoundation/OpenRV',
    logo: 'img/players/openrv.svg',
  },
  {
    name: 'xSTUDIO',
    href: 'https://github.com/AcademySoftwareFoundation/xstudio',
    logo: 'img/players/xstudio.svg',
    planned: true,
  },
  {
    // cineSync Play's app icon, trimmed of the macOS icon padding.
    name: 'cineSync',
    href: 'https://www.cinesync.io/',
    logo: 'img/players/cinesync.png',
    planned: true,
  },
];

function PlayerLogo({name, href, logo, planned = false}: Player) {
  const src = useBaseUrl(logo);
  const label = planned ? `${name} (planned)` : name;
  return (
    <div className={clsx(integrations.platformItem, planned && integrations.planned)}>
      <Link href={href} className={clsx(integrations.platform, styles.iconLink)} title={label}>
        <img src={src} alt={label} className={styles.logo} />
      </Link>
      {/* The player's name, since the logos are icons without one. */}
      <span className={integrations.tag} aria-hidden="true">
        {planned ? `${name} · Planned` : name}
      </span>
    </div>
  );
}

/**
 * A review player driving DNA's in-review version over HTTP: the player
 * steps through its sources, each change sends DNA a request, and DNA's
 * sidebar follows. Fades into the page from left to right like
 * HomepageShowcase, and follows the docs' light/dark mode.
 */
export default function HomepagePlayerSync(): ReactNode {
  return (
    <section className={showcase.showcase}>
      <div className="container">
        <SectionLabel>Review player integration</SectionLabel>
        <div className={showcase.row}>
          <div className={showcase.stage} aria-hidden="true">
            <div className={showcase.frame}>
              <BrowserOnly>
                {() => (
                  <Suspense fallback={null}>
                    <PlayerSyncPicture />
                  </Suspense>
                )}
              </BrowserOnly>
            </div>
            <div className={styles.fadeRight} />
            <div className={showcase.fadeBottom} />
          </div>
          <div className={showcase.copy}>
            <Heading as="h2" className={showcase.heading}>
              Use HTTP events to drive what&apos;s in review
            </Heading>
            <p>
              Review players can tell DNA what&apos;s on screen. When the viewed version changes,
              players can send an HTTP request, DNA sets that version in review, and every open
              session gets the change as a live event. Anyone following along jumps to it, so notes
              and transcript segments land on the shot being looked at.
            </p>
            <p>
              Any player that can make an HTTP call can do this, whether it&apos;s RV, a
              studio&apos;s in-house viewer or a web player. Desktop players sign in through DNA&apos;s
              own sign-in page, which hands the session, show and playlist straight to the app.{' '}
              <Link to="/docs/7-rv-integration">An RV package</Link> has been built to link DNA with RV.
            </p>
            <p>
              The request is a <code>PUT</code> to the playlist&apos;s metadata with the version ID as{' '}
              <code>in_review</code>. DNA refuses a version that isn&apos;t on the playlist. If a
              coordinator has pinned the version in review, DNA refuses the change until they unpin
              it, so skipping ahead in the player doesn&apos;t move what's in review.
            </p>
          </div>
        </div>

        <div className={styles.platforms}>
          <SectionLabel>Supported &amp; Planned Players</SectionLabel>
          <Carousel label="Supported and planned review players">
            {Players.map((player) => (
              <PlayerLogo key={player.name} {...player} />
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
