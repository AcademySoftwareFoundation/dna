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
        console.log(response);
        return response.text() || "";
    }
}