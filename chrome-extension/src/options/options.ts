import { loadConfig, saveConfig } from '../config/storage';

const form = document.getElementById('configForm') as HTMLFormElement;
const messageEl = document.getElementById('message') as HTMLParagraphElement;

async function populateForm(): Promise<void> {
  const config = await loadConfig();
  for (const [key, value] of Object.entries(config)) {
    const input = form.elements.namedItem(key) as HTMLInputElement | null;
    if (input) {
      input.value = String(value ?? '');
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  try {
    await saveConfig({
      dnaBackendUrl: String(formData.get('dnaBackendUrl') ?? ''),
      dnaAuthToken: String(formData.get('dnaAuthToken') ?? ''),
      sttUrl: String(formData.get('sttUrl') ?? ''),
      sttApiKey: String(formData.get('sttApiKey') ?? ''),
      sttModel: String(formData.get('sttModel') ?? ''),
      chunkDurationMs: Number(formData.get('chunkDurationMs') ?? 5000),
      language: String(formData.get('language') ?? ''),
    });
    messageEl.textContent = 'Settings saved.';
  } catch (error) {
    messageEl.textContent =
      error instanceof Error ? error.message : 'Failed to save settings';
  }
});

void populateForm();
