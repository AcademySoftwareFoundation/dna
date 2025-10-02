import { StateManager } from "../state/stateManager";
import { Configuration, Transcription } from "../types";
import { LiteLlmInterface } from "./LLMs/liteLlm";
import { LLMInterface } from "./LLMs/llmInterface";
import { OpenAILLMInterface } from "./LLMs/openAiInterface";
import { prompt } from "./prompt";

export class NoteGenerator {
    private llmInterface: LLMInterface;

    constructor(private stateManager: StateManager, configuration: Configuration) {

        this.stateManager = stateManager;
        switch (configuration.llmInterface) {
            case "openai":
                this.llmInterface = new OpenAILLMInterface(configuration);
                break;
            case "litellm":
                this.llmInterface = new LiteLlmInterface(configuration);
                break;
            default:
                throw new Error(`LLM interface ${configuration.llmInterface} not supported`);
        }
    }

    public async generateNotes(versionId: number): Promise<string> {
        const version = this.stateManager.getVersion(versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found`);
        }

        // version.transcriptions is a Record<string, Transcription>, not an array, so we need to use Object.values to get an array of Transcription objects.
        const conversation = Object.values(version.transcriptions)
            .map((transcription: Transcription) => `${transcription.speaker}: ${transcription.text}`)
            .join("\n");


        const finalPrompt = `${prompt}\n\nTranscript:${conversation}\n\nVersion Context:${JSON.stringify(version.context)}`;

        return this.llmInterface.generateNotes(finalPrompt);
    }
}