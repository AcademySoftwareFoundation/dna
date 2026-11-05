import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import clsx from 'clsx';
// Same bubble, arrow and ring as the login demo's guide.
import styles from '../LiveLoginDemo/styles.module.css';

export type Side = 'right' | 'left' | 'above' | 'below';

export interface GuideStep {
  target: Element;
  title: string;
  /** Sides to try, in order; the first with room wins. */
  sides?: Side[];
  /** Skip the pulsing ring, where the UI already outlines the target. */
  noRing?: boolean;
  /** Above/below only: centre on the target, or sit in from its left or right end. */
  align?: 'start' | 'center' | 'end';
}

interface Layout {
  step: GuideStep;
  ring: CSSProperties;
  /** Position, plus --arrow-at for the arrow's offset along its side. */
  callout: CSSProperties;
  side: Side;
}

const GAP = 14;
const EDGE = 8;
/** With align 'start'/'end' the bubble's end sits this far in from the target's... */
const INSET = 8;
/** ...and its arrow this far in from the bubble's end. */
const ARROW_INSET = 24;
const DEFAULT_SIDES: Side[] = ['right', 'left', 'above', 'below'];

/**
 * A callout over the UI demo: a bubble with an arrow pointing at `step`'s
 * target, and a pulsing ring around it. Unlike the login demo's guide, the
 * step is handed in rather than read from the app's markup: the demo knows
 * what it's showing. Renders inside `rootRef` (which must be positioned) and
 * re-places itself when the root resizes or scrolls. Measures with
 * getBoundingClientRect, so it follows the demo's scale transform.
 */
export function Guide({
  step,
  rootRef,
}: {
  step: GuideStep | null;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [tick, setTick] = useState(0);
  const calloutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => setTick((n) => n + 1);
    const resizes = new ResizeObserver(update);
    resizes.observe(root);
    // The demo's content column scrolls; scroll events don't bubble.
    root.addEventListener('scroll', update, {capture: true, passive: true});
    return () => {
      resizes.disconnect();
      root.removeEventListener('scroll', update, {capture: true});
    };
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const callout = calloutRef.current;
    if (!step || !root || !callout) {
      setLayout(null);
      return;
    }

    const box = root.getBoundingClientRect();
    const rect = step.target.getBoundingClientRect();
    const t = {
      top: rect.top - box.top,
      left: rect.left - box.left,
      right: rect.right - box.left,
      bottom: rect.bottom - box.top,
      width: rect.width,
      height: rect.height,
    };
    const w = callout.offsetWidth;
    const h = callout.offsetHeight;
    const clamp = (value: number, max: number) => Math.min(Math.max(value, EDGE), max - EDGE);
    const centerX = t.left + t.width / 2;
    const centerY = t.top + t.height / 2;

    const fits = (side: Side) => {
      switch (side) {
        case 'right':
          return t.right + GAP + w <= box.width - EDGE;
        case 'left':
          return t.left - GAP - w >= EDGE;
        case 'above':
          return t.top - GAP - h >= EDGE;
        case 'below':
          return t.bottom + GAP + h <= box.height - EDGE;
      }
    };
    const sides = step.sides ?? DEFAULT_SIDES;
    const side = sides.find(fits) ?? sides[sides.length - 1];

    // `arrowAt` is the arrow's offset along the bubble's facing side.
    let pos: {top: number; left: number};
    let arrowAt: number;
    if (side === 'right' || side === 'left') {
      pos = {
        left: side === 'right' ? t.right + GAP : t.left - GAP - w,
        top: clamp(centerY - h / 2, box.height - h),
      };
      arrowAt = centerY - pos.top;
    } else {
      const top = side === 'above' ? t.top - GAP - h : t.bottom + GAP;
      if (step.align === 'start') {
        pos = {left: clamp(t.left + INSET, box.width - w), top};
        arrowAt = ARROW_INSET;
      } else if (step.align === 'end') {
        pos = {left: clamp(t.right - INSET - w, box.width - w), top};
        arrowAt = w - ARROW_INSET;
      } else {
        pos = {left: clamp(centerX - w / 2, box.width - w), top};
        arrowAt = centerX - pos.left;
      }
    }

    setLayout({
      step,
      side,
      callout: {...pos, ['--arrow-at' as string]: `${arrowAt}px`},
      ring: {top: t.top - 4, left: t.left - 4, width: t.width + 8, height: t.height + 8},
    });
  }, [step, tick, rootRef]);

  if (!step) return null;
  const placed = layout?.step === step ? layout : null;

  return (
    <div className={styles.guide} aria-live="polite">
      {placed && !step.noRing && <div className={styles.guideRing} style={placed.ring} />}
      <div
        ref={calloutRef}
        className={clsx(styles.callout, placed && styles[`callout_${placed.side}`])}
        style={placed ? placed.callout : {visibility: 'hidden'}}>
        {step.title}
      </div>
    </div>
  );
}
