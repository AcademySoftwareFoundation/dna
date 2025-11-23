# DNA Frontend Framework Interactive Shell

This document describes how to use the interactive shell for testing and experimenting with the DNA Frontend Framework.

## Quick Start

```bash
npx ts-node shell.ts
```

This provides a full interactive TypeScript environment where you can:
- Test framework methods in real-time
- Experiment with state management
- Try different meeting scenarios
- Get immediate feedback

## Available Objects

- `framework`: DNAFrontendFramework instance
- `stateManager`: StateManager instance
- `noteGenerator`: NoteGenerator instance
- `ConnectionStatus`: Connection status enum

## Example Commands

### State Management
```javascript
// Create and manage versions
stateManager.setVersion(1, {name: "My Meeting"})
stateManager.setVersion(2, {name: "Another Meeting"})
stateManager.getState()
stateManager.getActiveVersion()
stateManager.getVersions()
```

### Meeting Operations
```javascript
// Join and leave meetings
await framework.joinMeeting("test-meeting")
await framework.getConnectionStatus()
await framework.leaveMeeting()
```

### Connection Status
```javascript
// Check connection status
ConnectionStatus.CONNECTED
ConnectionStatus.DISCONNECTED
ConnectionStatus.CONNECTING
```

### Note Generation
```javascript
// Generate notes for a specific version
await noteGenerator.generateNotes(1)
await framework.generateNotes(1)

// First create a version with some transcriptions
stateManager.setVersion(1, {name: "My Meeting"})
// Add some transcriptions (this would normally come from the transcription agent)
// Then generate notes
await noteGenerator.generateNotes(1)
```

## Environment Setup

The shell is pre-configured with:
- `VEXA_URL`: `http://pe-vexa-sf-01v`
- `VEXA_API_KEY`: `KEY`
- `PLATFORM`: Set via environment variable
- `LLM_MODEL`: `gpt-4` (default)
- `LLM_API_KEY`: Set via environment variable
- `LLM_BASE_URL`: `https://api.openai.com/v1` (default)

To use a real Vexa server and LLM service, update these environment variables before running the shell.

## Built-in Help

Type `help` in the shell to see available commands and examples.

## Tips

1. **Use async/await** for meeting operations
2. **Check connection status** before trying to join meetings
3. **State management** works independently of meeting connections
4. **Note generation** requires a version with transcriptions to work properly
5. **Connection errors are expected** when using placeholder server URLs
6. **LLM API key** is required for note generation to work
7. **Type `exit`** to quit the shell

## Troubleshooting

- **TypeScript errors**: Make sure you're using `npx ts-node`
- **Connection errors**: Expected when using placeholder server URLs
- **Module not found**: Run `npm install` to ensure dependencies are installed
- **Note generation errors**: Ensure you have a valid LLM API key and the version has transcriptions
- **LLM errors**: Check that your LLM_API_KEY and LLM_BASE_URL are correctly set
