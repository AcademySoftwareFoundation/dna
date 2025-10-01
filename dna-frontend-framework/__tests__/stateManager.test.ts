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