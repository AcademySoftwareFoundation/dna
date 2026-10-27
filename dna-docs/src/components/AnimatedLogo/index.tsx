import type {ReactNode} from 'react';
import clsx from 'clsx';
import logoSvg from './logoSvg';
import styles from './styles.module.css';

// The logo builds itself once on load. The animation is pure CSS, so it
// starts from the server-rendered HTML without waiting for React.
export default function AnimatedLogo({className}: {className?: string}): ReactNode {
  return (
    <span
      className={clsx(styles.logo, className)}
      dangerouslySetInnerHTML={{__html: logoSvg}}
    />
  );
}
