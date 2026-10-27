import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

interface GuideStep {
  target: Element;
  title: string;
}

function findButton(root: Element, label: string): Element | null {
  return (
    [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === label && !button.disabled,
    ) ?? null
  );
}

/**
 * Works out the next thing to do from what the login screen is showing.
 * Tied to the app's markup and wording (frontend ProjectSelector): the
 * email input, the Radix Select triggers and their placeholders, and the
 * Continue buttons.
 */
function findStep(root: Element): GuideStep | null {
  const email = root.querySelector<HTMLInputElement>('input[type="email"]');
  if (email) {
    if (!email.value) return {target: email, title: 'Click the email field'};
    const submit = email.form?.querySelector('button[type="submit"]');
    return submit ? {target: submit, title: 'Click Continue'} : null;
  }

  const select = root.querySelector('[role="combobox"]');
  // Out of the way while a dropdown is open.
  if (!select || select.getAttribute('data-state') === 'open') return null;

  if (select.hasAttribute('data-placeholder')) {
    return select.textContent?.includes('project')
      ? {target: select, title: 'Choose a project'}
      : {target: select, title: 'Choose a playlist'};
  }

  const next = findButton(root, 'Continue');
  return next ? {target: next, title: 'Click Continue'} : null;
}

/** The login card: the app's page wrapper's only child. */
function findCard(root: Element): Element | null {
  return root.querySelector('.radix-themes > div > div');
}

type Side = 'right' | 'left' | 'above' | 'below';

interface Layout {
  step: GuideStep;
  ring: CSSProperties;
  /** Position, plus --arrow-at for the arrow's offset along its side. */
  callout: CSSProperties;
  side: Side;
}

const GAP = 14;
const EDGE = 8;
/** On narrow screens the bubble ends this far in from the target's right. */
const INSET = 8;
/** ...and its arrow sits this far in from the bubble's right. */
const ARROW_INSET = 24;

/**
 * Step-by-step callouts over the live login screen: a bubble with an arrow
 * pointing at the next control, and a pulsing ring around it. Watches
 * `appRef` for changes; renders as a sibling of it inside `rootRef` (which
 * must be positioned), so its own updates never retrigger the watch.
 */
export function Guide({
  rootRef,
  appRef,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  appRef: RefObject<HTMLDivElement | null>;
}) {
  const [step, setStep] = useState<GuideStep | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [tick, setTick] = useState(0);
  const calloutRef = useRef<HTMLDivElement>(null);

  // Re-read the step whenever the login screen changes.
  useEffect(() => {
    const app = appRef.current;
    const root = rootRef.current;
    if (!app || !root) return;

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = findStep(app);
        // Keep the same object while nothing changed, so the bubble
        // doesn't blink while it's re-placed.
        setStep((prev) =>
          prev && next && prev.target === next.target && prev.title === next.title
            ? prev
            : next,
        );
        setTick((n) => n + 1);
      });
    };

    const mutations = new MutationObserver(update);
    mutations.observe(app, {subtree: true, childList: true, attributes: true, characterData: true});
    const resizes = new ResizeObserver(update);
    resizes.observe(root);
    app.addEventListener('input', update);
    update();

    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes.disconnect();
      app.removeEventListener('input', update);
    };
  }, [appRef, rootRef]);

  // Place the bubble beside the login card, level with the target, so it
  // covers none of the form. On narrow screens there's no room beside the
  // card: put it above the target's right end, over the empty side of the
  // label row and controls already used.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const app = appRef.current;
    const callout = calloutRef.current;
    if (!step || !root || !app || !callout) {
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
    const cardRect = findCard(app)?.getBoundingClientRect();
    const card = cardRect
      ? {left: cardRect.left - box.left, right: cardRect.right - box.left}
      : {left: t.left, right: t.right};
    const w = callout.offsetWidth;
    const h = callout.offsetHeight;
    const clamp = (value: number, max: number) => Math.min(Math.max(value, EDGE), max - EDGE);

    const centerY = t.top + t.height / 2;
    const besideTop = clamp(centerY - h / 2, box.height - h);

    // `arrowAt` is the arrow's offset along the bubble's facing side.
    let side: Side;
    let pos: {top: number; left: number};
    let arrowAt: number;
    if (card.right + GAP + w <= box.width - EDGE) {
      side = 'right';
      pos = {left: card.right + GAP, top: besideTop};
      arrowAt = centerY - pos.top;
    } else if (card.left - GAP - w >= EDGE) {
      side = 'left';
      pos = {left: card.left - GAP - w, top: besideTop};
      arrowAt = centerY - pos.top;
    } else {
      const left = clamp(t.right - INSET - w, box.width - w);
      side = t.top - GAP - h >= EDGE ? 'above' : 'below';
      pos = {top: side === 'above' ? t.top - GAP - h : t.bottom + GAP, left};
      arrowAt = w - ARROW_INSET;
    }

    setLayout({
      step,
      side,
      callout: {...pos, ['--arrow-at' as string]: `${arrowAt}px`},
      ring: {top: t.top - 4, left: t.left - 4, width: t.width + 8, height: t.height + 8},
    });
  }, [step, tick, rootRef, appRef]);

  if (!step) return null;
  const placed = layout?.step === step ? layout : null;

  return (
    <div className={styles.guide} aria-live="polite">
      {placed && <div className={styles.guideRing} style={placed.ring} />}
      <div
        ref={calloutRef}
        className={clsx(styles.callout, placed && styles[`callout_${placed.side}`])}
        style={placed ? placed.callout : {visibility: 'hidden'}}>
        {step.title}
      </div>
    </div>
  );
}
