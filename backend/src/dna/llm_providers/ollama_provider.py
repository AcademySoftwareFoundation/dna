import httpx
from typing import Optional, Dict, Any

from .llm_provider_base import LLMProviderBase

class OllamaProvider(LLMProviderBase):
    def __init__(self, model: str = "llama3", base_url: str = "http://localhost:11434"):
        self.model = model
        self.base_url = f"{base_url}/api/generate"

    async def generate(self, prompt: str, options: Optional[Dict[str, Any]] = None)-> str:
        payload = {
            "model":self.model,
            "prompt": prompt,
            "stream": False
        }
        if options:
            payload.update(options)


        async with httpx.AsyncClient() as client:

            response = await client.post(self.base_url, json=payload, timeout=90.0)
            response.raise_for_status()
            return response.json().get("response", "")       