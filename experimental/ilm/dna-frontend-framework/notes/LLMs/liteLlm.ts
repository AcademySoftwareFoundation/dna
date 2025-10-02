import { Configuration } from "../../types";
import { LLMInterface } from "./llmInterface";
import OpenAI from 'openai';

export class LiteLlmInterface extends LLMInterface {

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
        
        // Extract only the content from the first choice's message
        return data.choices?.[0]?.message?.content || "";
    }
}