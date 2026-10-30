import type {ReactNode} from 'react';
import styles from './styles.module.css';

/**
 * Small-caps eyebrow naming a homepage section ("Features", "Backed by").
 * A paragraph, not a heading: the logo is the page's h1 and the cards'
 * titles its h3s, so this adds nothing to the document outline.
 */
export default function SectionLabel({children}: {children: ReactNode}) {
  return <p className={styles.label}>{children}</p>;
}
