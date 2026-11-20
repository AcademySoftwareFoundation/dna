import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Head from '@docusaurus/Head';
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
        {/* The logo is the page heading. The hidden text gives it words, for
            screen readers and so search engines see a heading that matches
            the page title; the SVG is hidden so it isn't read out as well. */}
        <Heading as="h1" className={styles.title}>
          <span aria-hidden="true">
            <AnimatedLogo className={styles.logo} />
          </span>
          <span className={styles.srOnly}>{siteConfig.title}</span>
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
  // Names the site for search engines, which otherwise show the parent
  // domain's name beside results. Only belongs on the homepage.
  const webSite = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.title,
    alternateName: ['DNA', 'DNA Docs'],
    url: `${siteConfig.url}${siteConfig.baseUrl}`,
  };
  return (
    <Layout
      title={siteConfig.title}
      description="User guides, deployment docs and backend API reference for DNA, an Academy Software Foundation project.">
      <Head>
        <script type="application/ld+json">{JSON.stringify(webSite)}</script>
      </Head>
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
