# Frontend Framework

The frontend framework is a collection of tools and libraries that are used to connect to transcription agents and LLMs to 
to provide a unified interface for the user to interact with the transcription and LLM with the goal of creating note suggestions for dailies.


## Components

### Transcription Agent

The interface for the transcription agents provides methods to have an agent join a meeting and get the transcriptions of the meeting.

### LLM Agent

The interface for the LLM agents provides methods to have an agent call an LLM and get the response.

### State manager

The state manager allows you to store the currently in review shot, its transcriptions, context about the version, and the notes the LLM generated.


## Usage

### env setup

The following environment variables are required:

| Variable | Description | Required |
|----------|-------------|----------|
| `VEXA_API_KEY` | The API key for the Vexa API | Yes |
| `VEXA_URL` | The URL for the Vexa API | Yes |
| `GOOGLE_API_KEY` | The API key for the Google API | No, unless using Gemini |
| `GOOGLE_MODEL` | The model to use for the Google API | No, unless using Gemini |
| `GOOGLE_PROXY` | The proxy to use for the Google API | No, unless using Gemini |


### Usage

## Stack

- TypeScript
- Jest (for unit testing)
- ts-jest (TypeScript support for Jest)


## Testing

The framework includes a complete testing setup using Jest and TypeScript that works across different frontend frameworks.

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
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