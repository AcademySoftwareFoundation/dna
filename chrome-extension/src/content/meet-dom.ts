const ACTIVE_SPEAKER_SELECTORS = [
  '[data-self-name]',
  '[data-participant-id][data-is-speaking="true"]',
  '.KV1wMc',
];

let currentSpeaker = 'Unknown';

function readSpeakerFromDom(): string {
  for (const selector of ACTIVE_SPEAKER_SELECTORS) {
    const element = document.querySelector(selector);
    if (!element) {
      continue;
    }
    const label =
      element.getAttribute('data-self-name') ??
      element.textContent?.trim() ??
      '';
    if (label) {
      return label;
    }
  }
  return 'Unknown';
}

function publishSpeaker(): void {
  const speaker = readSpeakerFromDom();
  if (speaker !== currentSpeaker) {
    currentSpeaker = speaker;
    chrome.runtime.sendMessage({
      type: 'speaker.changed',
      speaker,
      timestamp: new Date().toISOString(),
    });
  }
}

const observer = new MutationObserver(() => publishSpeaker());
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-is-speaking', 'data-self-name', 'class'],
});

publishSpeaker();

export {};
