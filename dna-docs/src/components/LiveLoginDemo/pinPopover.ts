import {useEffect} from 'react';

/** Marks a popover once it's pinned to the page (see ./styles.module.css). */
const PINNED = 'data-dna-demo-pinned';

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * On touch screens, pins one of the app's Radix popovers to the page once
 * it has opened, and keeps the on-screen keyboard down for its search field.
 *
 * These popovers float in a portal and by default re-place themselves on
 * every scroll event to stay beside their button; on a phone that lags the
 * finger and has them jumping about. Pinned, the popover is simply part of
 * the page: it stays where it opened and scrolls along with everything
 * else. Its search field autofocuses, which would bring up the keyboard and
 * resize the page under the demo; the demos' lists are short enough to pick
 * from without searching.
 *
 * The popover is found by its search field's placeholder, the one thing in
 * it the app names.
 */
export function usePinPopoverOnTouch(enabled: boolean, searchPlaceholder: string): void {
  useEffect(() => {
    if (!enabled || !isTouch()) return;
    const pin = (wrapper: HTMLElement) => {
      if (wrapper.hasAttribute(PINNED)) return;
      // Where the popper put it, in page coordinates.
      const placed = wrapper.getBoundingClientRect();
      const set = (top: number, left: number) => {
        wrapper.style.setProperty('--dna-pin-top', `${top}px`);
        wrapper.style.setProperty('--dna-pin-left', `${left}px`);
      };
      const top = placed.top + window.scrollY;
      const left = placed.left + window.scrollX;
      set(top, left);
      wrapper.setAttribute(PINNED, '');
      // Its offset parent may not be the page: correct by what's left over.
      const now = wrapper.getBoundingClientRect();
      set(top + (placed.top - now.top), left + (placed.left - now.left));
    };
    let frame = 0;
    const find = () => {
      const search = document.querySelector<HTMLInputElement>(
        `input[placeholder="${searchPlaceholder}"]`,
      );
      if (!search) return;
      if (search.inputMode !== 'none') search.inputMode = 'none';
      const wrapper = search.closest<HTMLElement>('[data-radix-popper-content-wrapper]');
      if (!wrapper || wrapper.hasAttribute(PINNED)) return;
      // Two frames: the popper measures, then places.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => pin(wrapper));
      });
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, {subtree: true, childList: true});
    find();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [enabled, searchPlaceholder]);
}
