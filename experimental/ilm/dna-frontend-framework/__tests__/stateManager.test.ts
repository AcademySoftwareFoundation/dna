import { StateManager } from '../state';

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
      expect(state.versions[0].transcriptions).toEqual({});
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

    it('should add transcription to active version', () => {
      stateManager.setVersion(1, { name: 'Test Version' });
      
      const transcription = {
        text: 'Hello world',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      
      stateManager.addTranscription(transcription);
      
      const version = stateManager.getActiveVersion();
      expect(version).toBeDefined();
      const expectedKey = '2025-01-01T10:00:00.000Z-2025-01-01T10:00:05.000Z-John Doe';
      expect(version!.transcriptions[expectedKey]).toBeDefined();
      expect(version!.transcriptions[expectedKey]).toEqual(transcription);
    });

    it('should not add transcription when no active version', () => {
      const transcription = {
        text: 'Hello world',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      
      stateManager.addTranscription(transcription);
      
      const state = stateManager.getState();
      expect(state.versions).toHaveLength(0);
    });

    it('should handle multiple transcriptions with same speaker and overlapping times', () => {
      stateManager.setVersion(1, { name: 'Test Version' });
      
      const transcription1 = {
        text: 'First message',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      
      const transcription2 = {
        text: 'Second message',
        timestampStart: '2025-01-01T10:00:03.000Z',
        timestampEnd: '2025-01-01T10:00:08.000Z',
        speaker: 'John Doe'
      };
      
      stateManager.addTranscription(transcription1);
      stateManager.addTranscription(transcription2);
      
      const version = stateManager.getActiveVersion();
      expect(Object.keys(version!.transcriptions)).toHaveLength(2);
      const key1 = '2025-01-01T10:00:00.000Z-2025-01-01T10:00:05.000Z-John Doe';
      const key2 = '2025-01-01T10:00:03.000Z-2025-01-01T10:00:08.000Z-John Doe';
      expect(version!.transcriptions[key1]).toBeDefined();
      expect(version!.transcriptions[key2]).toBeDefined();
    });

    it('should handle transcriptions from different speakers', () => {
      stateManager.setVersion(1, { name: 'Test Version' });
      
      const transcription1 = {
        text: 'Hello from John',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      
      const transcription2 = {
        text: 'Hello from Jane',
        timestampStart: '2025-01-01T10:00:05.000Z',
        timestampEnd: '2025-01-01T10:00:10.000Z',
        speaker: 'Jane Smith'
      };
      
      stateManager.addTranscription(transcription1);
      stateManager.addTranscription(transcription2);
      
      const version = stateManager.getActiveVersion();
      expect(Object.keys(version!.transcriptions)).toHaveLength(2);
      const key1 = '2025-01-01T10:00:00.000Z-2025-01-01T10:00:05.000Z-John Doe';
      const key2 = '2025-01-01T10:00:05.000Z-2025-01-01T10:00:10.000Z-Jane Smith';
      expect(version!.transcriptions[key1]).toBeDefined();
      expect(version!.transcriptions[key2]).toBeDefined();
    });

    it('should notify listeners when state changes', () => {
      const listener = jest.fn();
      const unsubscribe = stateManager.subscribe(listener);
      
      // Initial state should be called
      expect(listener).toHaveBeenCalledTimes(0);
      
      // Set version should trigger notification
      stateManager.setVersion(1, { name: 'Test Version' });
      expect(listener).toHaveBeenCalledTimes(1);
      
      // Add transcription should trigger notification
      const transcription = {
        text: 'Hello world',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      stateManager.addTranscription(transcription);
      expect(listener).toHaveBeenCalledTimes(2);
      
      // Unsubscribe should stop notifications
      unsubscribe();
      stateManager.setVersion(2, { name: 'Another Version' });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should update an existing transcription segment', () => {
      stateManager.setVersion(1, { name: 'Test Version' });
      const transcription = {
        text: 'Hello world',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:08.000Z',
        speaker: 'John Doe'
      };
      stateManager.addTranscription(transcription);
      const updatedTranscription = {
        text: 'Hello world updated',
        timestampStart: '2025-01-01T10:00:00.000Z',
        timestampEnd: '2025-01-01T10:00:05.000Z',
        speaker: 'John Doe'
      };
      stateManager.addTranscription(updatedTranscription);
      const version = stateManager.getActiveVersion();

      const transcriptions = Object.values(version!.transcriptions);
      expect(transcriptions).toHaveLength(1);

      expect(transcriptions[0]).toBeDefined();
      expect(transcriptions[0]).toEqual(updatedTranscription);
    });
  });