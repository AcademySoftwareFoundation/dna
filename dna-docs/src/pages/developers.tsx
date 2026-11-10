import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import styles from './developers.module.css';

const QUICKSTART_URL = 'https://github.com/AcademySoftwareFoundation/dna/blob/main/QUICKSTART.md';

type Section = {
  title: string;
  to: string;
  description: string;
};

const sections: Section[] = [
  {
    title: 'Frontend',
    to: '/frontend',
    description:
      'How the web app is built, how to run and test it, and how to configure it.',
  },
  {
    title: 'Backend API',
    to: '/api',
    description:
      'HTTP reference for the DNA backend, for building your own tools and integrations on top of DNA.',
  },
  {
    title: 'Deployment',
    to: '/deployment',
    description: 'How to deploy DNA and configure it for your studio. Still an outline.',
  },
  {
    title: 'Contributing',
    to: '/contributing',
    description:
      'What you need before your first pull request, and how this documentation site works.',
  },
];

/**
 * Landing page for the Developer Docs navbar dropdown and homepage button:
 * a quick start for running the whole stack locally (the short version of
 * the repo's QUICKSTART.md), then the sections.
 */
export default function Developers(): ReactNode {
  return (
    <Layout
      title="Developer Docs"
      description="Run DNA locally, then dig into the frontend, backend API, deployment and contributing docs.">
      <main className={clsx('container', styles.page)}>
        <Heading as="h1">Developer Docs</Heading>
        <p className={styles.intro}>
          For people who want to host DNA, work on its code or build tools on its API.
          To learn how to use the app, see the{' '}
          <Link to="/docs">User Guides</Link>.
        </p>

        <Heading as="h2" className={styles.heading}>
          Quick start
        </Heading>
        <p>
          These steps run all of DNA on your machine. The backend, its
          database and the transcription service run in Docker, and the
          frontend runs on its own dev server. You need Docker running and
          Node.js 18 or newer.
        </p>
        <ol className={styles.steps}>
          <li>
            Clone the repository and run the bootstrap script. The script asks
            which LLM provider to use and for its API key, then how you want
            transcription set up, which you can skip. It then installs the
            frontend's dependencies and starts the backend in Docker.
            <CodeBlock language="bash">
              {`git clone https://github.com/AcademySoftwareFoundation/dna.git
cd dna
./bootstrap.sh`}
            </CodeBlock>
          </li>
          <li>
            Start the frontend in a new terminal.
            <CodeBlock language="bash">{`cd frontend && npm run dev`}</CodeBlock>
          </li>
          <li>
            Open <code>http://localhost:5173</code>. The backend API is at{' '}
            <code>http://localhost:8000</code>, with interactive docs at{' '}
            <code>/docs</code>.
          </li>
        </ol>
        <p>
          Next time, <code>./bootstrap.sh --start</code> brings the backend up
          without asking the questions again. The{' '}
          <Link to={QUICKSTART_URL}>Quickstart guide</Link> in the repository
          has the manual setup steps, how to run without ShotGrid using the
          mock provider, the backend's environment variables and
          troubleshooting.
        </p>

        <Heading as="h2" className={styles.heading}>
          Sections
        </Heading>
        <div className={styles.grid}>
          {sections.map(({title, to, description}) => (
            <Link key={to} to={to} className={clsx('card', styles.card)}>
              <Heading as="h3" className={styles.cardTitle}>
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
