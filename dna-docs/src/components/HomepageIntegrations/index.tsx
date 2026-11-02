import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import Heading from '@theme/Heading';
import Carousel from '@site/src/components/Carousel';
import SectionLabel from '@site/src/components/SectionLabel';
// The fading picture-and-copy layout, shared with HomepageShowcase.
import showcase from '@site/src/components/HomepageShowcase/styles.module.css';
import styles from './styles.module.css';

type Platform = {
  name: string;
  href: string;
  /** White-on-transparent PNG under static/img; inverted in light mode. */
  logo: string;
  /** Per-logo sizing tweak, for marks that read bigger than the others. */
  logoClassName?: string;
};

const Platforms: Platform[] = [
  {
    name: 'Autodesk Flow Production Tracking (ShotGrid)',
    href: 'https://www.autodesk.com/products/flow-production-tracking/overview',
    logo: 'img/prodtracking/sg.png',
    logoClassName: styles.logoShotgrid,
  },
  {name: 'ftrack', href: 'https://www.ftrack.com/', logo: 'img/prodtracking/FtrackBacklight-Black.png'},
  {name: 'AYON', href: 'https://ayon.ynput.io/', logo: 'img/prodtracking/AYON_white.png'},
  {
    name: 'Kitsu',
    href: 'https://www.cg-wire.com/kitsu',
    logo: 'img/prodtracking/kitsu.png',
    logoClassName: styles.logoKitsu,
  },
];

function PlatformLogo({name, href, logo, logoClassName}: Platform) {
  return (
    <Link href={href} className={styles.platform} title={name}>
      <img src={useBaseUrl(logo)} alt={name} className={clsx(styles.logo, logoClassName)} />
    </Link>
  );
}

/**
 * Same layout as HomepageShowcase, with a screenshot of DNA's transcripts in
 * production tracking (a light and a dark capture, swapped with the docs'
 * colour mode), then the supported platforms' logos.
 */
export default function HomepageIntegrations(): ReactNode {
  return (
    <section className={showcase.showcase}>
      <div className="container">
        <SectionLabel>Connected to production tracking</SectionLabel>
        <div className={showcase.row}>
          <div className={showcase.stage} aria-hidden="true">
            <ThemedImage
              className={styles.screenshot}
              alt=""
              sources={{
                light: useBaseUrl('img/prodtracking/prod-tracking-example-light.png'),
                dark: useBaseUrl('img/prodtracking/prod-tracking-example.png'),
              }}
            />
            <div className={showcase.fadeRight} />
            <div className={showcase.fadeBottom} />
          </div>
          <div className={showcase.copy}>
            <Heading as="h2" className={showcase.heading}>
              Links up to where production lives
            </Heading>
            <p>
              DNA reads its projects, playlists, versions and people straight from your production
              tracking platform, so there is nothing to import and no second source of truth to keep
              in sync.
            </p>
            <p>
              When the review ends, notes publish back as native notes on each version, addressed to
              the right artists and linked to the right shots, and full meeting transcripts can be
              stored alongside them for anyone who missed a review.
            </p>
            <p>
              Each platform plugs in through one provider class, so supporting a new tracker, or
              matching your studio's own schema, is a contained piece of work rather than a fork.
            </p>
          </div>
        </div>

        <div className={styles.platforms}>
          <SectionLabel>Supported Platforms</SectionLabel>
          <Carousel label="Supported production tracking platforms">
            {Platforms.map((platform) => (
              <PlatformLogo key={platform.name} {...platform} />
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
