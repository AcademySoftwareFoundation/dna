import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './developers.module.css';

type Section = {
  title: string;
  to: string;
  description: string;
};

const sections: Section[] = [
  {
    title: 'Deployment',
    to: '/deployment',
    description:
      'Deploy DNA and configure it for your studio: architecture, Docker images, CI/CD, secrets and authentication.',
  },
  {
    title: 'Backend API',
    to: '/api',
    description:
      'HTTP reference for the DNA backend, for building your own tools and integrations on top of DNA.',
  },
];

/** Landing page for the Developer Docs navbar dropdown and homepage button. */
export default function Developers(): ReactNode {
  return (
    <Layout
      title="Developer Docs"
      description="Deployment guides and backend API reference for hosting or building on DNA.">
      <main className={clsx('container', styles.page)}>
        <Heading as="h1">Developer Docs</Heading>
        <p className={styles.intro}>
          For anyone hosting DNA or building on top of it. Looking for how to
          use the app? See the <Link to="/docs">User Guides</Link>.
        </p>
        <div className={styles.grid}>
          {sections.map(({title, to, description}) => (
            <Link key={to} to={to} className={clsx('card', styles.card)}>
              <Heading as="h2" className={styles.cardTitle}>
                {title}
              </Heading>
              <p className={styles.cardBody}>{description}</p>
            </Link>
          ))}
        </div>
      </main>
    </Layout>
  );
}
