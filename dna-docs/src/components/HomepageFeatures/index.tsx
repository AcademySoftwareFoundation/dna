import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import Carousel from '@site/src/components/Carousel';
import SectionLabel from '@site/src/components/SectionLabel';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  to: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Realtime Transcription',
    to: '/docs/5-transcription',
    description: (
      <>
        DNA combines realtime transcription with shot context to assist production with per-version transcriptions publishable to your favorite production tracking platform.
      </>
    ),
  },
  {
    title: 'Set Rules for Note QC',
    to: '/docs/9-note-qc',
    description: (
      <>
        Build simple yet powerful checks — Production teams can write rules in natural language that the LLM can use to perform actions or suggest changes.
      </>
    ),
  },
  {
    title: 'Open Source',
    to: '/about',
    description: (
      <>
        Open source and always evolving — Backed by big names such as Sony Pictures Imageworks, Industrial light & Magic, and Autodesk, DNA keeps growing with new features and flexibility.
      </>
    ),
  },
];

function Feature({title, to, description}: FeatureItem) {
  return (
    <Link to={to} className={clsx('card', styles.card)}>
      <Heading as="h3" className={styles.cardTitle}>
        {title}
      </Heading>
      <p className={styles.cardBody}>{description}</p>
    </Link>
  );
}

/** Three cards in a row; swipeable one at a time on phones. */
export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <SectionLabel>Features</SectionLabel>
        <Carousel label="Features">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </Carousel>
      </div>
    </section>
  );
}
