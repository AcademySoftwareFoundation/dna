/**
 * Request a tab-capture stream ID. Must run during a user gesture (e.g. popup
 * button click after opening the extension on the Meet tab).
 */
export function requestTabCaptureStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ??
              'Could not authorize tab audio capture',
          ),
        );
        return;
      }
      resolve(streamId);
    });
  });
}
