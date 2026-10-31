import {useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import clsx from 'clsx';
import {ThemeProvider} from 'styled-components';
import {Avatar, Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useColorMode} from '@docusaurus/theme-common';
import {ACCENTS, getTheme} from '@dna-app/styles/theme';
import {SplitButton} from '@dna-app/components/SplitButton';
import {AddVersionInput} from '@dna-app/components/AddVersionInput';
import {ChangePlaylistInput} from '@dna-app/components/ChangePlaylistInput';
import {VersionCard} from '@dna-app/components/VersionCard';
import {DEMO_PROJECT_ID, demoVersion} from '../LiveLoginDemo/appMocks/entities';
import {DEMO_PLAYLISTS, DEMO_PLAYLIST_ID, thumbnailFor} from '../LiveLoginDemo/appMocks/playlists';
import {Guide, type GuideStep} from '../LiveUiDemo/Guide';
import * as I from '../LiveUiDemo/icons';
import {themeVars} from '../LiveUiDemo/themeVars';
// The success checkmark, shared with the other demos.
import loginStyles from '../LiveLoginDemo/styles.module.css';
// The sidebar chrome around the app's real menu, from the UI demo.
import uiStyles from '../LiveUiDemo/styles.module.css';
import styles from './styles.module.css';

type Version = ReturnType<typeof demoVersion>;
type ToolbarInput = 'none' | 'add-version' | 'change-playlist';
/** none -> (last step) success -> fading -> none, with the demo reset. */
type Overlay = 'none' | 'success' | 'fading';

/** A beat to see the result before the checkmark. */
const SETTLE_MS = 1200;
/** How long the checkmark shows before the demo resets underneath it. */
const SUCCESS_MS = 1600;
/** Fade from the checkmark back to a fresh demo; matches the login demo's styles.successOut. */
const FADE_MS = 400;

/** Who submitted everything in this demo, and whose avatar is in the header. */
const ARTIST = 'Joe Letteri';
const INITIALS = ARTIST.split(' ')
  .map((n) => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2);

const freshVersions = (): Record<string, Version[]> =>
  Object.fromEntries(DEMO_PLAYLISTS.map((p) => [p.id, p.versions.map(demoVersion)]));

// The top of the app's sidebar over sample playlists: the real playlist
// menu, Add Version and Change Playlist inputs and version cards, inside
// the UI demo's header and toolbar chrome. Browser-only: loaded by
// ./index.tsx inside <BrowserOnly>.
export default function MenusDemo() {
  const {colorMode} = useColorMode();
  const theme = useMemo(() => getTheme(colorMode, 'blue'), [colorMode]);
  const vars = useMemo(() => themeVars(colorMode), [colorMode]);
  const logo = useBaseUrl(
    colorMode === 'light' ? 'img/logo-full-light.svg' : 'img/logo-full-dark.svg',
  );
  const siteBase = useBaseUrl('/');
  // The app's inputs expect React Query; nothing here is fetched, but the
  // client must exist.
  const [queryClient] = useState(() => new QueryClient());

  const [playlistId, setPlaylistId] = useState(DEMO_PLAYLIST_ID);
  const [versions, setVersions] = useState<Record<string, Version[]>>(freshVersions);
  const [toolbarInput, setToolbarInput] = useState<ToolbarInput>('none');
  const [added, setAdded] = useState(false);
  const [changed, setChanged] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  // Bumped to remount the sidebar on reset.
  const [run, setRun] = useState(0);
  const current = versions[playlistId] ?? [];

  // The app's playlist menu, minus Add Scratch Pad. The guide goes Add
  // Version first, then Change Playlist; picking the other one just closes
  // the menu and the guide points the way again.
  const menuItems = useMemo(
    () => [
      {
        label: 'Change Playlist',
        onSelect: () => {
          if (added) setToolbarInput('change-playlist');
        },
      },
      {
        label: 'Add Version',
        onSelect: () => {
          if (!added) setToolbarInput('add-version');
        },
      },
    ],
    [added],
  );

  // Show the newly added version (the list is capped at a few cards).
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (added) listRef.current?.lastElementChild?.scrollIntoView({block: 'nearest'});
  }, [added, current.length]);

  // Guide steps: open the menu, add a version, open it again, change the
  // playlist. The targets come and go (the inputs replace the split button),
  // so keep watching the markup for them; the menu trigger's data-state says
  // whether the menu is open.
  const rootRef = useRef<HTMLDivElement>(null);
  interface Targets {
    trigger: Element | null;
    menuOpen: boolean;
    /** The open menu's items by label; the menu renders in a portal outside the root. */
    menuItems: Record<string, HTMLElement>;
    addInput: Element | null;
    changeInput: Element | null;
  }
  const [targets, setTargets] = useState<Targets>({
    trigger: null,
    menuOpen: false,
    menuItems: {},
    addInput: null,
    changeInput: null,
  });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const find = () => {
      const trigger = root.querySelector('button[aria-haspopup="menu"]');
      const menuOpen = trigger?.getAttribute('data-state') === 'open';
      const menuItems: Record<string, HTMLElement> = {};
      if (menuOpen) {
        for (const item of document.querySelectorAll<HTMLElement>('[role="menuitem"]')) {
          menuItems[item.textContent?.trim() ?? ''] = item;
        }
      }
      const next: Targets = {
        trigger,
        menuOpen,
        menuItems,
        addInput: root.querySelector('input[placeholder="Add version..."]'),
        changeInput: root.querySelector('input[placeholder="Change playlist..."]'),
      };
      setTargets((prev) =>
        prev.trigger === next.trigger &&
        prev.menuOpen === next.menuOpen &&
        prev.addInput === next.addInput &&
        prev.changeInput === next.changeInput &&
        Object.keys(next.menuItems).every((label) => prev.menuItems[label] === next.menuItems[label])
          ? prev
          : next,
      );
    };
    const observer = new MutationObserver(find);
    observer.observe(root, {subtree: true, childList: true, attributes: true});
    find();
    return () => observer.disconnect();
  }, [run]);

  // With the menu open, highlight the item to choose: Radix highlights the
  // focused item, so focus it. Its popper settles into place over a few
  // frames, so re-place the bubble a couple of times.
  const wantedItem = added ? 'Change Playlist' : 'Add Version';
  const menuItem = targets.menuOpen ? (targets.menuItems[wantedItem] ?? null) : null;
  const [settle, setSettle] = useState(0);
  useEffect(() => {
    if (!menuItem) return;
    menuItem.focus();
    const timers = [60, 220].map((ms) => setTimeout(() => setSettle((n) => n + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [menuItem]);

  const finished = added && changed && toolbarInput === 'none';
  const step = useMemo((): GuideStep | null => {
    const press = window.matchMedia('(pointer: coarse)').matches ? 'Tap' : 'Click';
    if (targets.addInput) {
      return {
        target: targets.addInput,
        title: 'Type a version name, e.g. "spaceship"',
        sides: ['above'],
        align: 'start',
      };
    }
    if (targets.changeInput) {
      return {target: targets.changeInput, title: 'Pick another playlist', sides: ['above'], align: 'start'};
    }
    if (finished || !targets.trigger) return null;
    if (targets.menuOpen) {
      // The item is highlighted by focus; `settle` re-places the bubble.
      // Beside the menu where there's room; on phones, off the menu's
      // nearer edge (below the last item, above the first).
      return menuItem && settle >= 0
        ? {
            target: menuItem,
            title: `Choose ${wantedItem}`,
            sides: added ? ['right', 'left', 'above', 'below'] : ['right', 'left', 'below', 'above'],
            noRing: true,
          }
        : null;
    }
    return {
      target: targets.trigger,
      title: `${press} the arrow, then ${wantedItem}`,
      sides: ['right', 'below'],
    };
  }, [targets, menuItem, wantedItem, settle, finished]);

  // All steps done: a beat to see the result, then the checkmark; reset the
  // demo behind it, then fade it away.
  useEffect(() => {
    if (!finished || overlay !== 'none') return;
    const timer = setTimeout(() => setOverlay('success'), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [finished, overlay]);
  useEffect(() => {
    if (overlay === 'none') return;
    const timer =
      overlay === 'success'
        ? setTimeout(() => {
            setPlaylistId(DEMO_PLAYLIST_ID);
            setVersions(freshVersions());
            setToolbarInput('none');
            setAdded(false);
            setChanged(false);
            setRun((n) => n + 1);
            setOverlay('fading');
          }, SUCCESS_MS)
        : setTimeout(() => setOverlay('none'), FADE_MS);
    return () => clearTimeout(timer);
  }, [overlay]);

  return (
    <div ref={rootRef} className={styles.root} style={vars as CSSProperties}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <Theme appearance={colorMode} accentColor={ACCENTS.blue.radix} hasBackground={false}>
            <aside key={run} className={styles.panel}>
              <div className={uiStyles.sidebarHeader}>
                <img className={uiStyles.logo} src={logo} alt="DNA - Dailies Notes Assistant" />
                <div className={uiStyles.headerActions}>
                  <button type="button" className={clsx(uiStyles.button, uiStyles.buttonPrimary)}>
                    Publish
                  </button>
                  <Avatar fallback={INITIALS} size="2" radius="full" variant="solid" color="indigo" />
                  <button type="button" className={uiStyles.iconButton} aria-label="Collapse sidebar">
                    <I.PanelLeftClose size={20} />
                  </button>
                </div>
              </div>

              <div className={uiStyles.toolbar}>
                {toolbarInput === 'add-version' ? (
                  <AddVersionInput
                    playlistId={playlistId}
                    projectId={DEMO_PROJECT_ID}
                    existingVersionIds={current.map((v) => v.id)}
                    onClose={() => setToolbarInput('none')}
                    onVersionAdded={(version) => {
                      setVersions((prev) => ({
                        ...prev,
                        [playlistId]: [...(prev[playlistId] ?? []), demoVersion(version.name ?? version.id)],
                      }));
                      setAdded(true);
                    }}
                  />
                ) : toolbarInput === 'change-playlist' ? (
                  <ChangePlaylistInput
                    projectId={DEMO_PROJECT_ID}
                    currentPlaylistId={playlistId}
                    onSelect={(playlist) => {
                      setVersions((prev) => (prev[playlist.id] ? prev : {...prev, [playlist.id]: []}));
                      setPlaylistId(playlist.id);
                      setChanged(true);
                      setToolbarInput('none');
                    }}
                    onClose={() => setToolbarInput('none')}
                  />
                ) : (
                  <>
                    <SplitButton menuItems={menuItems}>Reload Playlist</SplitButton>
                    <button type="button" className={uiStyles.iconButton} aria-label="Search versions">
                      <I.Search size={18} />
                    </button>
                  </>
                )}
              </div>

              <div ref={listRef} className={styles.list}>
                {current.map((version, i) => (
                  <div key={version.id}>
                    <VersionCard
                      version={version}
                      artistName={ARTIST}
                      thumbnailUrl={
                        thumbnailFor(version.name) && `${siteBase}${thumbnailFor(version.name)}`
                      }
                      selected={i === 0}
                    />
                  </div>
                ))}
                {current.length === 0 && (
                  <p className={styles.empty}>No versions in this playlist yet.</p>
                )}
              </div>
            </aside>
          </Theme>
        </ThemeProvider>
      </QueryClientProvider>

      {overlay === 'none' && <Guide step={step} rootRef={rootRef} />}

      {overlay !== 'none' && (
        <div
          role="status"
          className={clsx(loginStyles.success, overlay === 'fading' && loginStyles.successOut)}>
          <svg className={loginStyles.check} viewBox="0 0 52 52" aria-hidden="true">
            <circle className={loginStyles.checkCircle} cx="26" cy="26" r="24" />
            <path className={loginStyles.checkMark} d="M15 27l7 7 15-16" />
          </svg>
          <span className={loginStyles.srOnly}>All done. The demo starts over.</span>
        </div>
      )}
    </div>
  );
}
