import asyncio
import ollama  # Check if the base library is working
from src.dna.llm_providers.ollama_provider import OllamaProvider

async def test():
    # Sanity Check: Is the Ollama service running on your Arch Linux?
    try:
        ollama.list()
    except Exception:
        print("❌ Error: Ollama service is not running. Run 'ollama serve' in a terminal.")
        return

    provider = OllamaProvider()
    print("Sending request to local Llama3... (CPU mode may be slow)")
    
    try:
        # We use await because OllamaProvider is likely an 'async' class
        response = await provider.generate("Say 'Hello from Arch Linux'")
        print(f"✅ Success! AI says: {response}")
    except Exception as e:
        print(f"❌ Test Failed: {e}")
        print("Tip: Check if 'llama3' is installed by running 'ollama list'")

if __name__ == "__main__":
    asyncio.run(test())