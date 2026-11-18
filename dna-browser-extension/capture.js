/**
 * DNA capture orchestration (service-worker side).
 *
 * Obtains a tabCapture stream id for the chosen Google Meet tab and hands it to
 * the offscreen document, which owns the Web Audio + WebSocket pipeline (MV3
 * service workers can't use Web Audio). Exposed as self.DNACapture for
 * transcription.js.
 */
(function () {
  'use strict';

  const OFFSCREEN_PATH = 'offscreen/offscreen.html';
  let creating = null;

  async function hasOffscreen() {
    if (!chrome.runtime.getContexts) return false;
    try {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
      });
      return contexts.length > 0;
    } catch {
      return false;
    }
  }

  async function ensureOffscreen() {
    if (await hasOffscreen()) return;
    if (creating) {
      await creating;
      return;
    }
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA'],
      justification: 'Capture Google Meet tab audio for DNA transcription.',
    });
    try {
      await creating;
    } finally {
      creating = null;
    }
  }

  function getMediaStreamId(targetTabId) {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(streamId);
      });
    });
  }

  async function start({ meetTabId, serverInfo, log }) {
    if (!chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
      throw new Error('tabCapture API unavailable');
    }
    // Chrome allows only one active tabCapture stream per tab. Tear down any
    // prior offscreen pipeline (including failed attempts) before requesting a
    // new stream id.
    await stop();
    log('info', 'Handshake 2: requesting tab capture stream id', { meetTabId });
    let streamId;
    try {
      streamId = await getMediaStreamId(meetTabId);
    } catch (e) {
      await stop();
      throw e;
    }
    await ensureOffscreen();
    const resp = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_START',
      streamId,
      serverInfo,
    });
    if (!resp || !resp.ok) {
      await stop();
      throw new Error(resp?.error || 'offscreen_start_failed');
    }
    return resp;
  }

  async function stop() {
    try {
      await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
    } catch {
      /* offscreen may already be gone */
    }
    try {
      if (await hasOffscreen()) await chrome.offscreen.closeDocument();
    } catch {
      /* ignore */
    }
    // Brief pause so Chrome releases the per-tab tabCapture lock before retry.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  self.DNACapture = { start, stop };
})();
