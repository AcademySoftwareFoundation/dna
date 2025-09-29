/**
 * Example test file to verify the testing framework is working
 */

import { StateManager } from '../state';
import { VexaTranscriptionAgent } from '../transcription/vexa';
import { ConnectionStatus } from '../types';

describe('Testing Framework Setup', () => {
  it('should run basic tests', () => {
    expect(true).toBe(true);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should work with TypeScript', () => {
    const message: string = 'Hello, TypeScript!';
    expect(typeof message).toBe('string');
    expect(message).toBe('Hello, TypeScript!');
  });
});

describe('State Management', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  it('should create a new version when setting a non-existent version', () => {
    stateManager.setVersion(1, { name: 'Test Version' });
    
    const state = stateManager.getState();
    expect(state.activeVersion).toBe(1);
    expect(state.versions).toHaveLength(1);
    expect(state.versions[0].id).toBe('1');
    expect(state.versions[0].context).toEqual({ name: 'Test Version' });
    expect(state.versions[0].transcriptions).toEqual([]);
  });

  it('should update existing version context when setting an existing version', () => {
    stateManager.setVersion(1, { name: 'Initial Version' });
    stateManager.setVersion(1, { description: 'Updated description' });
    
    const version = stateManager.getVersion(1);
    expect(version?.context).toEqual({ 
      name: 'Initial Version', 
      description: 'Updated description' 
    });
  });

  it('should set active version correctly', () => {
    stateManager.setVersion(1);
    stateManager.setVersion(2);
    
    expect(stateManager.getActiveVersionId()).toBe(2);
    expect(stateManager.getActiveVersion()?.id).toBe('2');
  });

  it('should handle multiple versions', () => {
    stateManager.setVersion(1, { name: 'Version 1' });
    stateManager.setVersion(2, { name: 'Version 2' });
    stateManager.setVersion(3, { name: 'Version 3' });
    
    const versions = stateManager.getVersions();
    expect(versions).toHaveLength(3);
    expect(versions.map(v => v.id)).toEqual(['1', '2', '3']);
  });
});

describe('VexaTranscriptionAgent', () => {
  let stateManager: StateManager;
  let vexaAgent: VexaTranscriptionAgent;

  beforeEach(() => {
    stateManager = new StateManager();
    vexaAgent = new VexaTranscriptionAgent(stateManager);
  });

  it('should initialize with no active meeting', async () => {
    expect(vexaAgent.getCurrentMeetingId()).toBeNull();
    expect(vexaAgent.isConnected()).toBe(false);
    expect(await vexaAgent.getConnectionStatus()).toBe(ConnectionStatus.DISCONNECTED);
  });

  it('should throw error when joining meeting without environment variables', async () => {
    // Clear environment variables
    const originalVexaUrl = process.env.VEXA_URL;
    const originalVexaApiKey = process.env.VEXA_API_KEY;
    
    delete process.env.VEXA_URL;
    delete process.env.VEXA_API_KEY;

    await expect(vexaAgent.joinMeeting('test-meeting')).rejects.toThrow('VEXA_URL environment variable is not set');

    // Restore environment variables
    if (originalVexaUrl) process.env.VEXA_URL = originalVexaUrl;
    if (originalVexaApiKey) process.env.VEXA_API_KEY = originalVexaApiKey;
  });

  it('should handle leaving meeting when not connected', async () => {
    // Should not throw an error
    await expect(vexaAgent.leaveMeeting()).resolves.not.toThrow();
  });

  it('should track meeting ID correctly', () => {
    // Simulate setting meeting ID (normally done in joinMeeting)
    (vexaAgent as any)._meetingId = 'test-meeting-123';
    expect(vexaAgent.getCurrentMeetingId()).toBe('test-meeting-123');
  });
});
