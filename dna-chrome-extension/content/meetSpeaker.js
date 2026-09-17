/**
 * Google Meet active-speaker content script.
 *
 * Scrapes the currently-speaking participant from the Meet DOM (mirroring the
 * approach of the Vexa googlemeet platform) and forwards speaker changes to the
 * service worker so transcript segments can be attributed.
 *
 * Meet's DOM classes are obfuscated and change over time, so detection is
 * intentionally defensive with multiple fallbacks; when nothing matches we
 * simply report no speaker rather than throwing.
 */
(function () {
  'use strict';

  // Candidate selectors for the per-tile "is speaking" animation indicator.
  // Meet renders animated audio bars on the active speaker's tile.
  const SPEAKING_INDICATOR_SELECTORS = [
    '.IisKdb', // animated bars (historically)
    '[class*="speaking"]',
    '[data-is-speaking="true"]',
  ];

  // Candidate selectors for a participant's display name within a tile.
  const NAME_SELECTORS = ['[data-self-name]', '.zWGUib', '.dwSJ2e', '.notranslate'];

  const TILE_SELECTORS = ['[data-participant-id]', '[data-requested-participant-id]'];

  let lastSpeaker = null;

  function textFromNameNode(node) {
    if (!node) return null;
    const attr = node.getAttribute && node.getAttribute('data-self-name');
    const text = (attr || node.textContent || '').trim();
    return text || null;
  }

  function findTile(el) {
    for (const sel of TILE_SELECTORS) {
      const tile = el.closest(sel);
      if (tile) return tile;
    }
    return el.parentElement;
  }

  function nameForTile(tile) {
    if (!tile) return null;
    for (const sel of NAME_SELECTORS) {
      const node = tile.querySelector(sel);
      const name = textFromNameNode(node);
      if (name) return name;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function detectActiveSpeaker() {
    for (const sel of SPEAKING_INDICATOR_SELECTORS) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const node of nodes) {
        if (!isVisible(node)) continue;
        const tile = findTile(node);
        const name = nameForTile(tile);
        if (name) return name;
      }
    }
    return null;
  }

  function report(speaker) {
    if (speaker === lastSpeaker) return;
    lastSpeaker = speaker;
    try {
      chrome.runtime.sendMessage({ type: 'MEET_SPEAKER', speaker });
    } catch {
      /* service worker asleep; next tick will retry */
    }
  }

  function tick() {
    const speaker = detectActiveSpeaker();
    if (speaker) report(speaker);
  }

  // Announce readiness, then poll + observe for speaker changes.
  try {
    chrome.runtime.sendMessage({ type: 'MEET_CONTENT_READY', url: location.href });
  } catch {
    /* ignore */
  }

  const interval = setInterval(tick, 500);

  const observer = new MutationObserver(() => tick());
  try {
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-is-speaking'],
    });
  } catch {
    /* body not ready */
  }

  window.addEventListener('unload', () => {
    clearInterval(interval);
    observer.disconnect();
  });
})();
