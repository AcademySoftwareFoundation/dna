import { StateManager } from "../state/stateManager";
import { Configuration, Transcription } from "../types";
import { LiteLlmInterface } from "./LLMs/liteLlm";
import { LLMInterface } from "./LLMs/llmInterface";
import { OpenAILLMInterface } from "./LLMs/openAiInterface";
import { prompt } from "./prompt";

/**
 * NoteGenerator class for generating notes using LLM interfaces.
 */
export class NoteGenerator {
    private llmInterface: LLMInterface;

    constructor(private stateManager: StateManager, configuration: Configuration) {

        this.stateManager = stateManager;

        // When adding a new LLM interface, add it here.
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

    /**
     * Generate notes using the LLM interface.
     * 
     * In addition to using the LLM interface, a prompt is generated that 
     * includes the transcript and version context.
     * 
     * @param versionId - The ID of the version to generate notes for
     * @returns The generated notes as a single string.
     */
    public async generateNotes(versionId: number): Promise<string> {
        const version = this.stateManager.getVersion(versionId);
        if (!version) {
            throw new Error(`Version ${versionId} not found`);
        }

        const conversation = Object.values(version.transcriptions)
            .map((transcription: Transcription) => `${transcription.speaker}: ${transcription.text}`)
            .join("\n");


        const finalPrompt = `${prompt}\n\nTranscript:${conversation}\n\nVersion Context:${JSON.stringify(version.context)}`;

        return this.llmInterface.generateNotes(finalPrompt);
    }
}