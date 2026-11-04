import {useRef, useState, type ReactNode} from 'react';
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
  /**
   * Muted clip under static/, played over part of the logo while hovered.
   * Its black background is blended away, and the class positions it and
   * says which part of the PNG to hide while it plays.
   */
  hoverVideo?: {src: string; className: string};
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
    logoClassName: styles.logoIlm,
    // Redraws the lightbulb mark; the wordmark stays put.
    hoverVideo: {src: 'video/ilm_mark.mp4', className: styles.videoIlm},
  },
  {
    name: 'Sony Pictures Imageworks',
    href: 'https://www.imageworks.com/',
    logo: 'img/spi_logo.png',
    logoClassName: styles.logoSpi,
  },
];

function BackerLogo({name, href, logo, logoClassName, hoverVideo}: Backer) {
  const logoSrc = useBaseUrl(logo);
  const videoSrc = useBaseUrl(hoverVideo?.src ?? '');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  // Plays from the top on every hover; when the clip ends it fades back to
  // the still logo. Skipped entirely under reduced motion.
  const start = () => {
    const video = videoRef.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    video.currentTime = 0;
    setPlaying(true);
    video.play().catch(() => setPlaying(false));
  };
  const stop = () => {
    videoRef.current?.pause();
    setPlaying(false);
  };

  return (
    <Link
      href={href}
      className={styles.backer}
      title={name}
      onMouseEnter={hoverVideo && start}
      onMouseLeave={hoverVideo && stop}
      onFocus={hoverVideo && start}
      onBlur={hoverVideo && stop}>
      <span className={clsx(styles.logoWrap, playing && styles.playing)}>
        <img src={logoSrc} alt={name} className={clsx(styles.logo, logoClassName)} />
        {hoverVideo && (
          <video
            ref={videoRef}
            src={videoSrc}
            className={clsx(styles.video, hoverVideo.className)}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onEnded={() => setPlaying(false)}
          />
        )}
      </span>
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
