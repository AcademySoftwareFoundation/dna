export interface CaptureSession {
  tabId: number;
  streamId: string;
}

export interface CaptureController {
  stop: () => void;
}

export function startTabCapture(
  tabId: number,
  onChunk: (blob: Blob) => void,
  chunkDurationMs: number,
): Promise<CaptureController> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, async (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'tabCapture failed'));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: streamId,
            },
          },
          video: false,
        } as MediaStreamConstraints);

        const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        let stopped = false;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            onChunk(event.data);
          }
        };

        recorder.onstop = () => {
          if (!stopped) {
            recorder.start();
          }
        };

        recorder.start();
        const intervalId = setInterval(() => {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }, chunkDurationMs);

        resolve({
          stop: () => {
            stopped = true;
            clearInterval(intervalId);
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
            stream.getTracks().forEach((track) => track.stop());
          },
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Capture failed'));
      }
    });
  });
}

export async function listMeetTabs(): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ url: 'https://meet.google.com/*' });
  return tabs.filter((tab) => tab.id !== undefined);
}
