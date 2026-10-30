import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Carousel from '@site/src/components/Carousel';
import SectionLabel from '@site/src/components/SectionLabel';
import styles from './styles.module.css';

type Backer = {
  name: string;
  href: string;
  /** White-on-transparent PNG under static/img; inverted in light mode. */
  logo: string;
  /** Per-logo sizing tweak, for marks that read bigger than the others. */
  logoClassName?: string;
};

const Backers: Backer[] = [
  {
    name: 'Academy Software Foundation',
    href: 'https://www.aswf.io/',
    logo: 'img/aswf_logo.png',
    logoClassName: styles.logoAswf,
  },
  {
    name: 'Autodesk',
    href: 'https://www.autodesk.com/',
    logo: 'img/autodesk_logo.png',
  },
  {
    name: 'Industrial Light & Magic',
    href: 'https://www.ilm.com/',
    logo: 'img/ilm_logo.png',
  },
  {
    name: 'Sony Pictures Imageworks',
    href: 'https://www.imageworks.com/',
    logo: 'img/spi_logo.png',
    logoClassName: styles.logoSpi,
  },
];

function BackerLogo({name, href, logo, logoClassName}: Backer) {
  return (
    <Link href={href} className={styles.backer} title={name}>
      <img src={useBaseUrl(logo)} alt={name} className={clsx(styles.logo, logoClassName)} />
    </Link>
  );
}

/** Logos of the organisations behind DNA, under the homepage features. */
export default function HomepageBackers(): ReactNode {
  return (
    <section className={styles.backers}>
      <div className="container">
        <SectionLabel>Backed by</SectionLabel>
        <Carousel label="Organisations backing DNA">
          {Backers.map((backer) => (
            <BackerLogo key={backer.name} {...backer} />
          ))}
        </Carousel>
      </div>
    </section>
  );
}
