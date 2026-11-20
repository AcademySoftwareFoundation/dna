import type {ReactNode} from 'react';
import clsx from 'clsx';
import useBaseUrl from '@docusaurus/useBaseUrl';
// The same margins, border and caption as a screenshot.
import figure from '@site/src/components/Figure/styles.module.css';

type VideoFigureProps = {
  /** Path relative to the site root, e.g. "video/hiero-sync.mp4". */
  src: string;
  /** Describes the recording for screen readers. */
  label: string;
  caption?: ReactNode;
};

/**
 * A silent screen recording, framed and captioned like Figure. It loops on
 * its own and keeps the browser's controls so a reader can pause or scrub.
 */
export default function VideoFigure({src, label, caption}: VideoFigureProps): ReactNode {
  return (
    <figure className={figure.figure}>
      <video
        src={useBaseUrl(src)}
        className={clsx(figure.image, figure.bordered)}
        style={{borderRadius: 8}}
        aria-label={label}
        autoPlay
        loop
        muted
        playsInline
        controls
      />
      {caption && <figcaption className={figure.caption}>{caption}</figcaption>}
    </figure>
  );
}
