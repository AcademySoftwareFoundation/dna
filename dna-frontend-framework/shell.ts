#!/usr/bin/env ts-node

/**
 * Interactive shell for testing DNA Frontend Framework
 * 
 * Usage: npx ts-node shell.ts
 * 
 * This provides an interactive environment where you can test
 * the framework functions in real-time.
 */

import { DNAFrontendFramework, ConnectionStatus } from './index';

// Set up environment variables
process.env.VEXA_URL = 'http://pe-vexa-sf-01v/';
process.env.VEXA_API_KEY = 'KEY';

// Initialize the framework
const framework = new DNAFrontendFramework();
const stateManager = framework.getStateManager();

console.log('🧬 DNA Frontend Framework Interactive Shell');
console.log('==========================================');
console.log('');
console.log('Available objects:');
console.log('- framework: DNAFrontendFramework instance');
console.log('- stateManager: StateManager instance');
console.log('- ConnectionStatus: Connection status enum');
console.log('');
console.log('Example commands:');
console.log('- await framework.joinMeeting("test-meeting")');
console.log('- await framework.getConnectionStatus()');
console.log('- stateManager.setVersion(1, {name: "Test"})');
console.log('- stateManager.getState()');
console.log('');
console.log('Type "exit" or press Ctrl+C to quit');
console.log('');

// Make objects available in the global scope
(global as any).framework = framework;
(global as any).stateManager = stateManager;
(global as any).ConnectionStatus = ConnectionStatus;

// Start the REPL
import { createInterface } from 'readline';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'DNA> '
});

rl.prompt();

rl.on('line', async (line) => {
    const input = line.trim();
    
    if (input === 'exit' || input === 'quit') {
        console.log('Goodbye!');
        rl.close();
        return;
    }
    
    if (input === 'help') {
        console.log('Available commands:');
        console.log('- framework.joinMeeting(meetingId)');
        console.log('- framework.leaveMeeting()');
        console.log('- framework.getConnectionStatus()');
        console.log('- stateManager.setVersion(id, context)');
        console.log('- stateManager.getState()');
        console.log('- stateManager.getActiveVersion()');
        console.log('- stateManager.getVersions()');
        console.log('- ConnectionStatus.CONNECTED');
        console.log('- help: Show this help');
        console.log('- exit: Quit the shell');
        rl.prompt();
        return;
    }
    
    if (input === '') {
        rl.prompt();
        return;
    }
    
    try {
        // Evaluate the input as JavaScript
        const result = await eval(input);
        if (result !== undefined) {
            console.log(JSON.stringify(result, null, 2));
        }
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : String(error));
    }
    
    rl.prompt();
});

rl.on('close', () => {
    console.log('\nShell closed.');
    process.exit(0);
});
