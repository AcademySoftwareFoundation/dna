import { logRemote } from '../debug/logger';
import { mixTabAudioWithMicrophone } from '../audio/mix-streams';

const log = (message: string, detail?: unknown) => logRemote('offscreen', message, detail);

let captureController: { stop: () => void } | null = null;
let chunksSent = 0;

async function startCapture(
  streamId: string,
  chunkDurationMs: number,
): Promise<void> {
  log('Starting offscreen capture', { chunkDurationMs, streamIdPrefix: streamId.slice(0, 12) });
  captureController?.stop();
  chunksSent = 0;

  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  } as MediaStreamConstraints);

  log('Tab audio capture started', {
    trackCount: tabStream.getAudioTracks().length,
    trackLabel: tabStream.getAudioTracks()[0]?.label,
  });

  const mixed = await mixTabAudioWithMicrophone(tabStream, log);
  const stream = mixed.stream;

  log('Recording stream ready', { includesMic: mixed.includesMic });

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  let stopped = false;

  recorder.ondataavailable = (event) => {
    if (event.data.size <= 0) {
      log('Recorder chunk empty (0 bytes)');
      return;
    }

    chunksSent += 1;
    const chunkMeta = {
      chunksSent,
      bytes: event.data.size,
      includesMic: mixed.includesMic,
    };

    void event.data.arrayBuffer().then((buffer) => {
      log('Recorder chunk', chunkMeta);
      void chrome.runtime.sendMessage({
        type: 'offscreen.chunk',
        chunkBuffer: buffer,
        mimeType: event.data.type || 'audio/webm',
        byteLength: buffer.byteLength,
      });
    });
  };

  recorder.onerror = (event) => {
    log('MediaRecorder error', event);
  };

  recorder.onstop = () => {
    if (!stopped) {
      recorder.start();
    }
  };

  recorder.start();
  log('MediaRecorder started', { chunkDurationMs });

  const intervalId = setInterval(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, chunkDurationMs);

  captureController = {
    stop: () => {
      log('Stopping offscreen capture', { chunksSent });
      stopped = true;
      clearInterval(intervalId);
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      mixed.stop();
      captureController = null;
    },
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'offscreen.start') {
    void startCapture(String(message.streamId), Number(message.chunkDurationMs))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        log('Offscreen capture failed', error);
        sendResponse({
          ok: false,
          detail: error instanceof Error ? error.message : 'Capture failed',
        });
      });
    return true;
  }

  if (message.type === 'offscreen.stop') {
    captureController?.stop();
    sendResponse({ ok: true });
    return true;
  }

  return undefined;
});

log('Offscreen document loaded');
