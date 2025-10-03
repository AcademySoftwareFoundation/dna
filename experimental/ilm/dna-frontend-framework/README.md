# 🧬 DNA Frontend Framework

**This framework is currently in development and is not yet ready for production use.**

#### Add AI Assisted note taking to facilitate collaboration between artists and supervisors easily!

The frontend framework is a collection of tools and libraries that are used to connect to transcription agents and LLMs to 
to provide a unified interface for the user to interact with the transcription and LLM with the goal of creating note suggestions for dailies.



## Dependencies

For call transcription, the current framework depends on the Vexa transcription agent. This can be replaced with any transcription agent that implements the TranscriptionAgent interface. More information about vexa can be found here: https://github.com/Vexa-ai/vexa/tree/main

For note generation, the current framework implements OpenAI and LiteLLM. This can be replaced with any LLM that implements the LLMInterface interface. More information about OpenAI and LiteLLM can be found here: https://openai.com/api/ https://docs.litellm.ai/docs/
To replace the LLM interface, you can pass the llmInterface parameter to the framework constructor. and update the `NoteGenerator` class to use the new LLM interface.

## Usage

### Environment Setup

The following configuration variables are required:

| Variable | Description | Required |
|----------|-------------|----------|
| `vexaUrl` | The API key for the Vexa API | Yes |
| `vexaApiKey` | The URL for the Vexa API | Yes |
| `platform` | The platform to use for the Vexa API | Yes |
| `llmInterface` | The interface to use for note generation | Yes |
| `llmModel` | The model to use for note generation | Yes |
| `llmApiKey` | The API key to use for note generation | Yes |
| `llmBaseURL` | The base URL to use for note generation | Yes |


When working with a frontend application, you can pass the configuration to the framework constructor.

Example:

```typescript
const framework = new DNAFrontendFramework({
    vexaUrl: process.env.VEXA_URL!,
    vexaApiKey: process.env.VEXA_API_KEY!,
    platform: process.env.PLATFORM!,
    llmInterface: process.env.LLM_INTERFACE || "openai",
    llmModel: process.env.LLM_MODEL || "gpt-4",
    llmApiKey: process.env.LLM_API_KEY || "",
    llmBaseURL: process.env.LLM_BASEURL || "https://api.openai.com/v1",
});
```

Since each frontend framework has different ways of setting environment variables, you will need to set and pass in the environment variables in the way that your frontend framework expects.

### Example usage

```typescript
const framework = new DNAFrontendFramework({
    vexaUrl: process.env.VEXA_URL!,
    vexaApiKey: process.env.VEXA_API_KEY!,
    platform: process.env.PLATFORM!,
    llmInterface: process.env.LLM_INTERFACE || "openai",
    llmModel: process.env.LLM_MODEL || "gpt-4",
    llmApiKey: process.env.LLM_API_KEY || "",
    llmBaseURL: process.env.LLM_BASEURL || "https://api.openai.com/v1",
});

// Pass in versions to the framework
const versions = [
    { id: 1, context: { name: 'Version 1' } },
    { id: 2, context: { name: 'Version 2' } },
];
framework.addVersions(versions);

// Join a meeting
framework.joinMeeting(meetingId);


// Leave a meeting
framework.leaveMeeting();

// Generate notes from the LLM
framework.generateNotes(versionId);
```

When working with react, you can use the useDNAFramework example hook to get the framework, state, and methods. This example can be found in the experimental/ilm/frontend-example directory.

## Components

### Transcription Agent

The interface for the transcription agents provides methods to have an agent join a meeting and get the transcriptions of the meeting.

### Note Generator

The interface for the Note Generator provides methods to have an agent call an LLM and get the response.

### State manager

  The state manager allows you to store the currently in review shot, its transcriptions, context about the version, the notes the LLM generated, and the notes the user has added.

## Stack

- TypeScript
- Jest (for unit testing)
- ts-jest (TypeScript support for Jest)
- tsup (TypeScript compiler)

## Building

```bash
# Build the framework
npm run build
```

The built framework will be in the dist directory.


## Testing

The framework includes a complete testing setup using Jest and TypeScript that works across different frontend frameworks.

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test -- --watch

# Run tests with coverage report
npm run test -- --coverage
```

### Test Structure

- `__tests__/` - Contains all test files
- Tests are automatically discovered by Jest
- Supports both `.test.ts` and `.spec.ts` file naming conventions

### Writing Tests

Create test files in the `__tests__/` directory:

```typescript
// __tests__/my-module.test.ts
describe('My Module', () => {
  it('should work correctly', () => {
    expect(true).toBe(true);
  });
});
```

The testing framework is designed to work with any frontend framework (React, Vue, Angular, etc.) since it uses standard Jest + TypeScript configuration.

## Shell 

For interactive testing and experimentation, use the shell:

```bash
npx ts-node shell.ts
```

This provides an interactive environment where you can test the framework in real-time.
Note the the provided .env.example file is a template for the environment variables you need to set. You will also need to build the framework before running the shell.

```bash
npm run build
```

## Structure 

The framework is structured as follows:

- `index.ts`: The main entry point for the framework.
- `types.ts`: The types for the framework.
- `state/stateManager.ts`: The state manager for the framework.
- `notes/noteGenerator.ts`: The note generator for the framework.
- `notes/LLMs/llmInterface.ts`: The LLM interface for the framework.
- `notes/LLMs/*.ts`: The LLM interfaces for the framework.
- `transcription/vexa`: The Vexa transcription agent for the framework.
- `transcription/transcriptionAgent.ts`: The transcription agent for the framework.
