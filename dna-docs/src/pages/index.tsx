import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import ThemedImage from '@theme/ThemedImage';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        {/* The logo is the page heading; its alt text gives it a name. */}
        <Heading as="h1" className={styles.title}>
          <ThemedImage
            className={styles.logo}
            alt={siteConfig.title}
            sources={{
              light: useBaseUrl('/img/logo-full-light.svg'),
              dark: useBaseUrl('/img/logo-full-dark.svg'),
            }}
          />
        </Heading>
        <p className={styles.subtitle}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs">
            Frontend Docs
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/api">
            Backend API
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Frontend guides and backend API reference for DNA, an Academy Software Foundation project.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
