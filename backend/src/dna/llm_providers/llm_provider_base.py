class LLMProviderBase:
    def __init__(self, model: str, api_key: str):
        self.model = model
        self.api_key = api_key

    def connect(self):
        pass

    def generate_notes(self, prompt: str) -> str:
        return ""
