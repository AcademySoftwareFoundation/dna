/**
 * Example usage of DNAFrontendFramework
 * 
 * This example demonstrates how to use the DNAFrontendFramework
 * to join a meeting, receive WebSocket events, and leave the meeting.
 */

import { DNAFrontendFramework, ConnectionStatus } from '../index';

async function exampleUsage() {
    // Set up environment variables (normally done via .env file or system environment)
    process.env.VEXA_URL = 'http://pe-vexa-sf-01v/';
    process.env.VEXA_API_KEY = 'KEY';
    
    // Initialize the DNA Frontend Framework
    const framework = new DNAFrontendFramework();
    
    try {
        console.log('Starting DNA Frontend Framework example...');
        
        // Join a meeting
        const meetingId = 'meeting-123';
        console.log(`Joining meeting: ${meetingId}`);
        await framework.joinMeeting(meetingId);
        
        // Check connection status
        const connectionStatus = await framework.getConnectionStatus();
        console.log(`Connection status: ${connectionStatus}`);
        
        // Get the state manager to check current state
        const stateManager = framework.getStateManager();
        console.log(`Current active version: ${stateManager.getActiveVersionId()}`);
        console.log(`Number of versions: ${stateManager.getVersions().length}`);
        
        // Simulate some time for receiving WebSocket events
        console.log('Listening for WebSocket events for 10 seconds...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Leave the meeting
        console.log('Leaving meeting...');
        await framework.leaveMeeting();
        
        // Check final connection status
        const finalStatus = await framework.getConnectionStatus();
        console.log(`Final connection status: ${finalStatus}`);
        
        console.log('Example completed successfully!');
        
    } catch (error) {
        console.error('Error during example:', error);
    }
}

/**
 * Advanced example showing state management features
 */
async function advancedExample() {
    // Set up environment variables
    process.env.VEXA_URL = 'http://pe-vexa-sf-01v/';
    process.env.VEXA_API_KEY = 'KEY';
    
    const framework = new DNAFrontendFramework();
    const stateManager = framework.getStateManager();
    
    try {
        console.log('Starting advanced DNA Frontend Framework example...');
        
        // Set up some initial state
        console.log('Setting up initial state...');
        stateManager.setVersion(1, { 
            name: 'Initial Meeting', 
            description: 'First meeting session',
            participants: ['Alice', 'Bob']
        });
        
        stateManager.setVersion(2, { 
            name: 'Follow-up Meeting', 
            description: 'Second meeting session',
            participants: ['Alice', 'Bob', 'Charlie']
        });
        
        console.log(`Created ${stateManager.getVersions().length} versions`);
        console.log(`Active version: ${stateManager.getActiveVersionId()}`);
        
        // Join a meeting
        const meetingId = 'advanced-meeting-456';
        console.log(`Joining meeting: ${meetingId}`);
        await framework.joinMeeting(meetingId);
        
        // Monitor connection status
        const status = await framework.getConnectionStatus();
        console.log(`Connection status: ${status}`);
        
        if (status === ConnectionStatus.CONNECTED) {
            console.log('Successfully connected! WebSocket events will be printed below:');
            console.log('(In a real scenario, you would see transcription data here)');
        }
        
        // Simulate receiving some events
        console.log('Simulating 5 seconds of meeting activity...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Update state with meeting context
        stateManager.setVersion(3, {
            name: 'Current Meeting',
            description: `Active meeting: ${meetingId}`,
            meetingId: meetingId,
            startTime: new Date().toISOString()
        });
        
        console.log(`Updated state with meeting context. Active version: ${stateManager.getActiveVersionId()}`);
        
        // Leave the meeting
        console.log('Leaving meeting...');
        await framework.leaveMeeting();
        
        const finalStatus = await framework.getConnectionStatus();
        console.log(`Final connection status: ${finalStatus}`);
        
        // Show final state
        const finalState = stateManager.getState();
        console.log('Final state summary:');
        console.log(`- Active version: ${finalState.activeVersion}`);
        console.log(`- Total versions: ${finalState.versions.length}`);
        console.log(`- Version details:`, finalState.versions.map(v => ({
            id: v.id,
            context: v.context,
            transcriptionCount: v.transcriptions.length
        })));
        
        console.log('Advanced example completed successfully!');
        
    } catch (error) {
        console.error('Error during advanced example:', error);
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--advanced')) {
        advancedExample().catch(console.error);
    } else {
        exampleUsage().catch(console.error);
    }
}

export { exampleUsage, advancedExample };
