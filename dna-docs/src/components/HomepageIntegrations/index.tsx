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
  /**
   * PNG under static/img. A single white-on-transparent logo is inverted in
   * light mode; a full-colour one comes as `{dark, light}`: white lettering
   * for dark mode, black for light, colours untouched.
   */
  logo: string | {dark: string; light: string};
  /** On the roadmap rather than shipped: dimmed, with a "Planned" tag. */
  planned?: boolean;
};

const Platforms: Platform[] = [
  {
    name: 'Autodesk Flow Production Tracking',
    href: 'https://www.autodesk.com/products/flow-production-tracking/overview',
    logo: {dark: 'img/prodtracking/flow_white.png', light: 'img/prodtracking/flow_black.png'},
  },
  {
    name: 'ftrack by Backlight',
    href: 'https://www.ftrack.com/',
    logo: 'img/prodtracking/ftrack.png',
    planned: true,
  },
  {
    name: 'Kitsu',
    href: 'https://www.cg-wire.com/kitsu',
    logo: {dark: 'img/prodtracking/kitsu_white.png', light: 'img/prodtracking/kitsu_black.png'},
    planned: true,
  },
  {
    name: 'AYON',
    href: 'https://ayon.ynput.io/',
    logo: {dark: 'img/prodtracking/AYON_whiteG_dot.png', light: 'img/prodtracking/AYON_blackG_dot.png'},
    planned: true,
  },
];

function PlatformLogo({name, href, logo, planned = false}: Platform) {
  const dark = useBaseUrl(typeof logo === 'string' ? logo : logo.dark);
  const light = useBaseUrl(typeof logo === 'string' ? logo : logo.light);
  const label = planned ? `${name} (planned)` : name;
  return (
    <div className={clsx(styles.platformItem, planned && styles.planned)}>
      <Link href={href} className={styles.platform} title={label}>
        {typeof logo === 'string' ? (
          <img src={dark} alt={label} className={clsx(styles.logo, styles.logoInvert)} />
        ) : (
          <ThemedImage alt={label} className={styles.logo} sources={{dark, light}} />
        )}
      </Link>
      {/* Shipped platforms keep the line empty so every logo sits level. */}
      <span className={styles.tag} aria-hidden="true">
        {planned ? 'Planned' : '\u00a0'}
      </span>
    </div>
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
              Links up with where production lives
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
          <SectionLabel>Supported &amp; Planned Platforms</SectionLabel>
          <Carousel label="Supported and planned production tracking platforms">
            {Platforms.map((platform) => (
              <PlatformLogo key={platform.name} {...platform} />
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
