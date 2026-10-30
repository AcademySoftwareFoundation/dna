import {Children, useEffect, useRef, useState, type ReactNode} from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

/**
 * Lays its children out as equal columns on wide screens. On narrow ones
 * they become a swipeable strip, one child per snapping slide with the next
 * peeking in, and dots underneath show where you are.
 */
export default function Carousel({
  label,
  className,
  children,
}: {
  /** Names the strip for assistive tech. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const slides = Children.toArray(children);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // The slide mostly in view is the active dot.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const elements = [...track.children];
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries.find((entry) => entry.isIntersecting);
        if (shown) setActive(elements.indexOf(shown.target));
      },
      {root: track, threshold: 0.6},
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [slides.length]);

  // Honours the track's scroll-behavior (smooth, or not under reduced motion).
  const goTo = (index: number) => {
    trackRef.current?.children[index]?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
    });
  };

  return (
    <div className={clsx(styles.carousel, className)}>
      <div ref={trackRef} className={styles.track} aria-roledescription="carousel" aria-label={label}>
        {slides.map((slide, index) => (
          <div key={index} className={styles.slide}>
            {slide}
          </div>
        ))}
      </div>
      <div className={styles.dots}>
        {slides.map((_, index) => (
          <button
            key={index}
            type="button"
            className={styles.dot}
            aria-label={`Go to slide ${index + 1} of ${slides.length}`}
            aria-current={index === active}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </div>
  );
}
