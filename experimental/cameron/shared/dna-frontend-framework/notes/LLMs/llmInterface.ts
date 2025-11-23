import { Configuration } from "../../types";

/**
 * Abstract class for LLM interfaces
 * 
 * This class is used to abstract the LLM interface
 * and provide a common interface for all LLMs.
 */
export abstract class LLMInterface {
    // The API key for the LLM
    protected _key: string;
    //The model for the LLM
    protected _model: string;
    // The base URL for the LLM
    protected _baseURL: string;


    /**
     * Constructor for the LLMInterface
     * 
     * @param configuration - The configuration for the LLM
     */
    constructor(configuration: Configuration) {
        this._key = configuration.llmApiKey;
        this._model = configuration.llmModel;
        this._baseURL = configuration.llmBaseURL;
    }

    /**
     * Generate notes using the LLM
     * 
     * @param prompt - The prompt to generate notes for
     * @returns The generated notes as a single string.
     */
    public abstract generateNotes(prompt: string): Promise<string>;
}
