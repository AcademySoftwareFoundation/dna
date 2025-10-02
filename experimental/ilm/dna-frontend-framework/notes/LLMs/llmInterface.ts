import { Configuration } from "../../types";

export abstract class LLMInterface {

    protected _key: string;
    protected _model: string;
    protected _baseURL: string;

    constructor(configuration: Configuration) {
        this._key = configuration.llmApiKey;
        this._model = configuration.llmModel;
        this._baseURL = configuration.llmBaseURL;
    }

    public get key(): string {
        return this._key;
    }

    public get model(): string {
        return this._model;
    }

    public abstract generateNotes(prompt: string): Promise<string>;
}
