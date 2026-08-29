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
    title: 'Frontend Guides',
    to: '/docs',
    description: (
      <>
        Hand-written documentation authored in MDX, covering how to work with
        the DNA frontend.
      </>
    ),
  },
  {
    title: 'Backend API',
    to: '/api',
    description: (
      <>
        A complete HTTP reference generated from the backend&apos;s OpenAPI
        schema, so it tracks the server&apos;s real routes and models.
      </>
    ),
  },
  {
    title: 'Open Source',
    to: '/about',
    description: (
      <>
        DNA is an Academy Software Foundation project. This site is
        Apache-2.0 licensed and built from the upstream repository.
      </>
    ),
  },
];

function Feature({title, to, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="padding-horiz--md">
        <Heading as="h3">
          <Link to={to}>{title}</Link>
        </Heading>
        <p>{description}</p>
      </div>
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
