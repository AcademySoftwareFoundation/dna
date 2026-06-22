import { appendLog } from '../debug/logger';

const OFFSCREEN_URL = 'offscreen/offscreen.html';

const log = (message: string, detail?: unknown) => appendLog('capture', message, detail);

export async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) {
    log('Offscreen document already open');
    return;
  }

  log('Creating offscreen document');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Capture Google Meet tab audio for DNA transcription',
  });
}

export async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length === 0) {
    return;
  }
  log('Closing offscreen document');
  await chrome.offscreen.closeDocument();
}

export async function startOffscreenCapture(
  streamId: string,
  chunkDurationMs: number,
): Promise<void> {
  await ensureOffscreenDocument();
  log('Sending offscreen.start', { chunkDurationMs });
  const response = await chrome.runtime.sendMessage({
    type: 'offscreen.start',
    streamId,
    chunkDurationMs,
  });
  log('offscreen.start response', response);
  if (!response?.ok) {
    throw new Error(response?.detail ?? 'Offscreen capture failed to start');
  }
}

export async function stopOffscreenCapture(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'offscreen.stop' });
  } catch {
    /* offscreen may already be closed */
  }
  await closeOffscreenDocument();
}
