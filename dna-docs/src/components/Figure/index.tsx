import {useCallback, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import clsx from 'clsx';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import styles from './styles.module.css';

type FigureProps = {
  /**
   * Either a path relative to the site root ("img/2-login/email.png") or the
   * result of `require('@site/static/img/...').default`. Plain strings are run
   * through useBaseUrl so they survive the "/dna-docs/" baseUrl; required
   * modules already carry it and are passed through untouched.
   */
  src: string;
  /** Optional dark-mode variant, same accepted forms as `src`. */
  srcDark?: string;
  alt?: string;
  /** Caption text. Anything richer can be passed as children instead. */
  caption?: ReactNode;
  children?: ReactNode;
  /** Any CSS width - "75%", "480px", "100%". Defaults to full column width. */
  width?: string;
  /** Draw a rounded border around the image so screenshots read as UI. */
  border?: boolean;
  /** Click to open the image full-size. */
  zoom?: boolean;
  className?: string;
};

export default function Figure({
  src,
  srcDark,
  alt,
  caption,
  children,
  width = '100%',
  border = true,
  zoom = true,
  className,
}: FigureProps): ReactNode {
  const [zoomed, setZoomed] = useState(false);
  const lightSrc = useBaseUrl(src);
  const darkSrc = useBaseUrl(srcDark ?? src);
  const captionContent = caption ?? children;

  // Captions are the best alt text we have; fall back to it when the author
  // did not write a separate one.
  const altText = alt ?? (typeof captionContent === 'string' ? captionContent : '');

  const close = useCallback(() => setZoomed(false), []);

  useEffect(() => {
    if (!zoomed) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [zoomed, close]);

  const image = srcDark ? (
    <ThemedImage
      sources={{light: lightSrc, dark: darkSrc}}
      alt={altText}
      className={styles.image}
    />
  ) : (
    <img src={lightSrc} alt={altText} className={styles.image} loading="lazy" />
  );

  return (
    <figure className={clsx(styles.figure, className)}>
      <div
        className={clsx(styles.frame, border && styles.bordered)}
        style={{width}}>
        {zoom ? (
          <button
            type="button"
            className={styles.zoomTrigger}
            onClick={() => setZoomed(true)}
            aria-label={altText ? `Expand image: ${altText}` : 'Expand image'}>
            {image}
          </button>
        ) : (
          image
        )}
      </div>

      {captionContent ? (
        <figcaption className={styles.caption}>{captionContent}</figcaption>
      ) : null}

      {zoomed ? (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={altText || 'Expanded image'}
          onClick={close}>
          <img src={lightSrc} alt={altText} className={styles.overlayImage} />
        </div>
      ) : null}
    </figure>
  );
}
