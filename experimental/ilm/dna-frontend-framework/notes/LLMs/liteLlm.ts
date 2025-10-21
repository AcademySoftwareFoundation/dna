import { LLMInterface } from "./llmInterface";

/**
 * LiteLLM interface for generating notes
 * 
 * LiteLLM is a gateway to different LLMs. More 
 * info on litellm can be found here: https://docs.litellm.ai/docs/
 */
export class LiteLlmInterface extends LLMInterface {

    /**
     * Generate notes using LiteLLM
     * 
     * @param prompt - The prompt to generate notes for
     * @returns The generated notes as a single string.
     */
    public async generateNotes(prompt: string): Promise<string> {
        const response = await fetch(`${this._baseURL}/v1/chat/completions`, {
            method: "POST",
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
            }),
            headers: {
                "x-litellm-api-key": this._key,
            },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('LiteLLM response:', data);
        
        return data.choices?.[0]?.message?.content || "";
    }
}