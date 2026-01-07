import { Configuration } from "../../types";
import { LLMInterface } from "./llmInterface";
import OpenAI from 'openai';

export class OpenAILLMInterface extends LLMInterface {
    protected openai: OpenAI;

    constructor(configuration: Configuration) {
        super(configuration);

        this.openai = new OpenAI({ 
            apiKey: configuration.llmApiKey, 
            baseURL: configuration.llmBaseURL 
        });
    }

    public async generateNotes(prompt: string): Promise<string> {
        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
        });
        return response.choices?.[0]?.message?.content || "";
    }
}