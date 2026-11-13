import {lazy, Suspense, type ReactNode} from 'react';
import clsx from 'clsx';
import BrowserOnly from '@docusaurus/BrowserOnly';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Heading from '@theme/Heading';
import Carousel from '@site/src/components/Carousel';
import SectionLabel from '@site/src/components/SectionLabel';
// The fading picture-and-copy layout, shared with HomepageShowcase, mirrored.
import showcase from '@site/src/components/HomepageShowcase/styles.module.css';
// The logo row, shared with the production tracking section.
import integrations from '@site/src/components/HomepageIntegrations/styles.module.css';
import styles from './styles.module.css';

// Split out so Radix only downloads for the homepage once this section
// renders.
const TranscriptionPicture = lazy(() => import('./TranscriptionPicture'));

type Platform = {
  name: string;
  href: string;
  /** Full-colour SVG under static/img/conferencing; the same on both themes. */
  logo: string;
  /** A wordmark rather than an icon: shown a little shorter. */
  wordmark?: boolean;
};

const Platforms: Platform[] = [
  {
    name: 'Google Meet',
    href: 'https://meet.google.com/',
    logo: 'img/conferencing/google-meet.svg',
  },
  {
    name: 'Microsoft Teams',
    href: 'https://www.microsoft.com/microsoft-teams/',
    logo: 'img/conferencing/teams.svg',
  },
  {
    name: 'Zoom',
    href: 'https://zoom.us/',
    logo: 'img/conferencing/zoom.svg',
    wordmark: true,
  },
];

function PlatformLogo({name, href, logo, wordmark = false}: Platform) {
  const src = useBaseUrl(logo);
  return (
    <div className={integrations.platformItem}>
      <Link href={href} className={integrations.platform} title={name}>
        <img src={src} alt={name} className={clsx(styles.logo, wordmark && styles.wordmark)} />
      </Link>
      {/* Keeps the logos level with the production tracking row's tag line. */}
      <span className={integrations.tag} aria-hidden="true">
        {' '}
      </span>
    </div>
  );
}

/**
 * The transcript panel streaming live on the right, fading leftward into
 * the copy, then the supported video conferencing platforms' logos. Same
 * feed as docs/guides/4-in-review.mdx, as a picture.
 */
export default function HomepageTranscription(): ReactNode {
  return (
    <section className={showcase.showcase}>
      <div className="container">
        <SectionLabel>Live transcription</SectionLabel>
        <div className={clsx(showcase.row, showcase.rowReverse)}>
          <div className={showcase.stage} aria-hidden="true">
            <div className={showcase.frame}>
              <BrowserOnly>
                {() => (
                  <Suspense fallback={null}>
                    <TranscriptionPicture />
                  </Suspense>
                )}
              </BrowserOnly>
            </div>
            {/* The fades live inside the picture (TranscriptionPicture). */}
          </div>
          <div className={showcase.copy}>
            <Heading as="h2" className={showcase.heading}>
              Transcribe meetings and match segments to versions
            </Heading>
            <p>
              DNA can join Google, Teams, and Zoom meetings.
              Transcript segments stream into the app as people speak and land on whichever version
              is in review, so the context behind any note is
              easy to access and archive.
            </p>
            <p>
              Pause during natural breaks and resume when the room is back. When the session wraps, the
              full transcript can be stored alongside notes in production tracking, where viewing can be managed with permissions settings.
            </p>
            <p>
              Transcription is built on Vexa.ai, the open-source
              transcription platform. It runs inside your DNA stack, and speech-to-text can point
              at Vexa's hosted service or at a Whisper-compatible server you run yourself, so audio
              can stay inside your own infrastructure.{' '}
            </p>
          </div>
        </div>

        <div className={styles.platforms}>
          <SectionLabel>Supported Video Conferencing</SectionLabel>
          <Carousel label="Supported video conferencing platforms">
            {Platforms.map((platform) => (
              <PlatformLogo key={platform.name} {...platform} />
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}
