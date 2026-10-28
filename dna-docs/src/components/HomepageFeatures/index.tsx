import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
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
        DNA combines realtime transcription with context about what is being reviewed to assist production with per-version transcriptions publishable to ShotGrid.
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
        Open source and always evolving — Backed by big names such as Sony Imageworks, Industrial light & Magic, and Autodesk, DNA keeps growing with new features and flexibility.
      </>
    ),
  },
];

function Feature({title, to, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <Link to={to} className={clsx('card', styles.card)}>
        <Heading as="h3" className={styles.cardTitle}>
          {title}
        </Heading>
        <p className={styles.cardBody}>{description}</p>
      </Link>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
