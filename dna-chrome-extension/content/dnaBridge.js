/**
 * DNA page bridge (content script on the configured DNA origin).
 *
 * Browsers without `externally_connectable` for web pages (Firefox) can't call
 * `runtime.sendMessage(extensionId, …)` from DNA. This script relays
 * window.postMessage requests from the DNA page to the background and posts
 * the reply back with the same id:
 *
 *   page -> { source: 'dna-page', id, message }
 *   page <- { source: 'dna-extension', id, response } | { …, error }
 *
 * Registered dynamically for the DNA URL saved in the popup (see background.js).
 */
(function () {
  'use strict';

  if (window.__dnaExtensionBridge) return;
  window.__dnaExtensionBridge = true;

  function post(id, payload) {
    window.postMessage(
      { source: 'dna-extension', id, ...payload },
      window.location.origin
    );
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'dna-page' || typeof data.id !== 'string') {
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: 'DNA_PAGE_MESSAGE', message: data.message },
        (response) => {
          if (chrome.runtime.lastError) {
            post(data.id, { error: chrome.runtime.lastError.message });
            return;
          }
          post(data.id, { response });
        }
      );
    } catch (e) {
      post(data.id, { error: e?.message || String(e) });
    }
  });

  // Lets the DNA app detect the bridge without a round trip.
  document.documentElement.dataset.dnaExtensionBridge = '1';
  window.dispatchEvent(new Event('dna-extension-bridge-ready'));
})();
