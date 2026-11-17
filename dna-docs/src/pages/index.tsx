import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import AnimatedLogo from '@site/src/components/AnimatedLogo';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageBackers from '@site/src/components/HomepageBackers';
import HomepageShowcase from '@site/src/components/HomepageShowcase';
import HomepageDeveloperShowcase from '@site/src/components/HomepageDeveloperShowcase';
import HomepageIntegrations from '@site/src/components/HomepageIntegrations';
import HomepageTranscription from '@site/src/components/HomepageTranscription';
import HomepagePlayerSync from '@site/src/components/HomepagePlayerSync';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={styles.heroBanner}>
      <div className="container">
        {/* The logo is the page heading; the SVG's aria-label names it. */}
        <Heading as="h1" className={styles.title}>
          <AnimatedLogo className={styles.logo} />
        </Heading>
        <p className={styles.subtitle}>{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs">
            User Guides
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/developers">
            Developer Docs
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
      description="User guides, deployment docs and backend API reference for DNA, an Academy Software Foundation project.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <HomepageBackers />
        <HomepageShowcase />
        <HomepageDeveloperShowcase />
        <HomepageIntegrations />
        <HomepageTranscription />
        <HomepagePlayerSync />
      </main>
    </Layout>
  );
}
