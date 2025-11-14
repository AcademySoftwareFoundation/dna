const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export const getLLMSummary = async (text, llmProvider = null, promptType = 'short') => {
  try {
    const res = await fetch(`${BACKEND_URL}/llm-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, llm_provider: llmProvider, prompt_type: promptType }),
    });
    const data = await res.json();
    if (res.ok && data.summary) {
      return data.summary;
    } else {
      return '';
    }
  } catch (err) {
    console.error('Error fetching LLM summary:', err);
    return '';
  }
};