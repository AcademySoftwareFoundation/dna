# Vexa Transcription Version-Specific Implementation Analysis

## Overview
This document details how the ILM (Integrated Language Model) implementation in the experimental directory handles version-specific Vexa transcription, including how versions are managed, how transcripts are routed to specific versions, and the state management architecture.

---

## 1. Version-Specific Transcription Integration

### Architecture Overview
The system uses a **state-based versioning model** where:
- Each version is independently tracked with its own transcript collection
- The "active version" determines which version receives incoming transcriptions
- Switching versions automatically routes future transcriptions to the new version

### Key Components

#### State Manager (`dna/experimental/ilm/dna-frontend-framework/state/stateManager.ts`)
```typescript
export class StateManager {
    private state: State;
    private listeners: Set<StateChangeListener> = new Set();

    constructor(initialState?: Partial<State>) {
        this.state = {
            activeVersion: 0,
            versions: [],
            ...initialState
        };
    }
```

**State Structure** (`types.ts`):
```typescript
export interface State {
    activeVersion: number;
    versions: Version[];
}

export interface Version {
    id: string;
    context: Record<string, any>;
    transcriptions: Record<string, Transcription>;
    userNotes: string;
    aiNotes: string;
}

export interface Transcription {
    text: string;
    timestampStart: string;
    timestampEnd: string;
    speaker: string;
}
```

---

## 2. Version Selection and Switching

### Setting Active Version

**Location**: `dna/experimental/ilm/dna-frontend-framework/state/stateManager.ts`

```typescript
/**
 * Sets the current version to the provided version ID.
 * 
 * When set, transcriptions will automatically be added to the active version.
 * 
 * If the version doesn't exist, a new version object is created.
 * @param id - The version ID (will be converted to string for internal storage)
 * @param context - Optional context object to store with the version
 */
setVersion(id: number, context?: Record<string, any>): void {
    const versionId = id.toString();
    
    // Find existing version
    let version = this.getVersion(id);
    
    if (!version) {
        version = this.createNewVersion(id, context);
    } else if (context) {
        // Update context if provided
        version.context = { ...version.context, ...context };
    }
    
    // Set as active version
    this.state.activeVersion = id;
    
    // Notify listeners of state change
    this.notifyListeners();
}
```

### Version Switching Behavior

**Key Characteristics:**
1. **No transcript deletion on switch**: When switching versions, existing transcripts in the previous version are preserved
2. **Fresh transcript stream**: The new active version starts receiving new transcriptions immediately
3. **Non-destructive**: Switching away from a version saves its current transcript state

**Example Flow:**
```
1. setVersion(1, {name: "Version 1"}) → Version 1 becomes active, creates new version with empty transcriptions
2. Vexa sends transcriptions → All transcriptions route to Version 1
3. setVersion(2, {name: "Version 2"}) → Version 2 becomes active, Version 1 transcripts are preserved
4. Vexa sends more transcriptions → New transcriptions go to Version 2
5. getActiveVersion() returns Version 2, but Version 1 still has its original transcriptions
```

---

## 3. Streaming Transcripts to Specific Versions

### Transcription Flow Architecture

#### Step 1: WebSocket Reception (`vexaTranscriptionAgent.ts`)
```typescript
private _handleWebSocketMessage(data: WebSocketEvent): void {
    switch (data.type) {
      case 'transcript.mutable':
      case 'transcript.finalized':        
        // Handle both single segment and segments array
        const segments = data.payload.segments || (data.payload.segment ? [data.payload.segment] : []);
        
        for (const segment of segments) {
          try {
            const transcript: Transcription = {
              text: segment.text || '',
              timestampStart: segment.absolute_start_time || new Date().toISOString(),
              timestampEnd: segment.absolute_end_time || new Date().toISOString(),
              speaker: segment.speaker || 'Unknown',
            };
            
            this.onTranscriptCallback(transcript);
          } catch (error) {
            console.error('❌ [WEBSOCKET] Error creating transcript from segment:', error);
          }
        }
        break;
      // ... other cases
    }
}
```

#### Step 2: Callback Processing
```typescript
/**
 * Callback for when a transcription is received.
 * 
 * Update the state manager with the new transcription segment and
 * call the callback function if it is set.
 */
private async onTranscriptCallback(transcript: Transcription): Promise<void> {
    if (this._callback) {
        this._callback(transcript);
    }
    this._stateManager.addTranscription(transcript);
    const state = this._stateManager.getState();
}
```

#### Step 3: Version-Specific Addition
```typescript
/**
 * Adds a transcription to the active version.
 * 
 * @param transcription - The transcription to add
 */
addTranscription(transcription: Transcription): void {
    const key = `${transcription.timestampStart}-${transcription.speaker}`;
    const version = this.getActiveVersion();
    if (version) {
        version.transcriptions[key] = transcription;
        this.notifyListeners();
    }
}
```

### WebSocket Event Types
**Location**: `dna/experimental/ilm/dna-frontend-framework/transcription/vexa/types.ts`

```typescript
export interface TranscriptMutableEvent {
    type: 'transcript.mutable';
    meeting: { id: number };
    payload: {
      segment?: any;
      segments?: any[];
      [key: string]: any;
    };
    ts: string;
}

export interface TranscriptFinalizedEvent {
    type: 'transcript.finalized';
    meeting: { id: number };
    payload: {
      segment?: any;
      segments?: any[];
      [key: string]: any;
    };
    ts: string;
}
```

---

## 4. Transcript State Management During Version Switching

### State Isolation Mechanism

**Key principle**: Each version maintains its own isolated `transcriptions` map with no cross-contamination.

```typescript
private createNewVersion(id: number, context?: Record<string, any>): Version {
    const newVersion = {
        id: id.toString(),
        context: context || {},
        transcriptions: {},  // Fresh, empty transcription collection
        userNotes: "",
        aiNotes: ""
    };
    this.state.versions.push(newVersion);
    return newVersion;
}
```

### Transcription Storage Key Generation

**Location**: `stateManager.ts` - `addTranscription()` method

```typescript
const key = `${transcription.timestampStart}-${transcription.speaker}`;
version.transcriptions[key] = transcription;
```

**Key Format**: `{timestampStart}-{speaker}`

**Characteristics:**
- Unique per version (stored in version-specific map)
- Allows multiple transcriptions from same speaker (keyed by timestamp)
- Enables transcript update capability (same key overwrites)

### State Notification System

All state changes trigger listener notifications:

```typescript
private notifyListeners(): void {
    const currentState = this.getState();
    this.listeners.forEach(listener => listener(currentState));
}
```

**Listeners are triggered by:**
1. `setVersion()` - When switching active version
2. `addTranscription()` - When new transcript arrives
3. `setUserNotes()` - When user notes are updated
4. `setAiNotes()` - When AI notes are updated
5. `addVersions()` - When bulk versions are added

---

## 5. Version Management in the Framework

### DNAFrontendFramework Integration
**Location**: `dna/experimental/ilm/dna-frontend-framework/index.ts`

```typescript
export class DNAFrontendFramework {
  private stateManager: StateManager;
  private transcriptionAgent: TranscriptionAgent;
  private noteGenerator: NoteGenerator;

  constructor(configuration: Configuration) {
    this.stateManager = new StateManager();
    this.configuration = configuration;
    this.transcriptionAgent = new VexaTranscriptionAgent(this.stateManager, this.configuration);
    this.noteGenerator = new NoteGenerator(this.stateManager, this.configuration);
  }

  /**
   * Set an active version.
   * 
   * When set, transcriptions will automatically be added to the active version.
   */
  public async setVersion(version: number, context?: Record<string, any>): Promise<void> {
    this.stateManager.setVersion(version, context);
  }
}
```

### VexaTranscriptionAgent Connection
**Location**: `dna/experimental/ilm/dna-frontend-framework/transcription/vexa/vexaTranscriptionAgent.ts`

```typescript
export class VexaTranscriptionAgent extends TranscriptionAgent {
  private _stateManager: StateManager;

  constructor(stateManager: StateManager, configuration: Configuration) {
    super(stateManager);
    this._baseUrl = configuration.vexaUrl;
    this._apiKey = configuration.vexaApiKey;
    this._platform = configuration.platform;
    this._callback = undefined;
    this._setupWebSocketUrl();
    this._stateManager = stateManager;
  }

  /**
   * Given the provided meeting ID, join the meeting and subscribe to the transcription service.
   */
  public async joinMeeting(meetingId: string, callback?: (transcript: Transcription) => void): Promise<void> {
    this._meetingId = meetingId;
    this._callback = callback;
    // ... bot request and WebSocket connection
  }
}
```

---

## 6. Frontend Integration

### React Hook Pattern (`useDNAFramework.ts`)
**Location**: `dna/experimental/ilm/frontend-example/src/hooks/useDNAFramework.ts`

```typescript
export const useDNAFramework = () => {
  const [state, setState] = useState<State>({ activeVersion: 0, versions: [] });
  
  const framework = useMemo(() => new DNAFrontendFramework({
    vexaApiKey: import.meta.env.VITE_VEXA_API_KEY,
    vexaUrl: import.meta.env.VITE_VEXA_URL,
    platform: import.meta.env.VITE_PLATFORM,
    // ... other config
  }), []);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = framework.subscribeToStateChanges((newState: State) => {
      setState(newState);
    });
    return unsubscribe;
  }, [framework]);

  const setVersion = (version: number, context: Record<string, any>) => {
    framework.setVersion(version, context);
  };

  // Helper to get transcript text for a version
  const getTranscriptText = (versionId: string): string => {
    const version = state.versions.find(v => v.id === versionId);
    if (!version) return '';
    
    const transcriptions = Object.values(version.transcriptions);
    return transcriptions
      .sort((a, b) => new Date(a.timestampStart).getTime() - new Date(b.timestampStart).getTime())
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');
  };

  return { 
    framework, 
    setVersion,
    state, 
    getTranscriptText, 
    // ... other exports
  };
};
```

### Application Usage (`App.tsx`)
**Location**: `dna/experimental/ilm/frontend-example/src/App.tsx`

```typescript
export default function App() {
  const { 
    framework, 
    setVersion, 
    state 
  } = useDNAFramework();

  // Version switching on focus
  {versions.map((version) => (
    <TextArea
      onFocus={() => setVersion(Number(version.id), { ...version.context })}
      // ... display transcripts
    />
  ))}

  // Joining a meeting initiates transcription stream
  const handleJoinMeeting = () => {
    if (meetingId.trim()) {
      framework.joinMeeting(meetingId);
    }
  };
}
```

---

## 7. State Management Test Cases

### Version Switching Test
**Location**: `dna/experimental/ilm/dna-frontend-framework/__tests__/stateManager.test.ts`

```typescript
it('should set active version correctly', () => {
  stateManager.setVersion(1);
  stateManager.setVersion(2);
  
  expect(stateManager.getActiveVersionId()).toBe(2);
  expect(stateManager.getActiveVersion()?.id).toBe('2');
});
```

### Transcription Isolation Test
```typescript
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
});
```

### Multi-Version Test
```typescript
it('should handle multiple versions', () => {
  stateManager.setVersion(1, { name: 'Version 1' });
  stateManager.setVersion(2, { name: 'Version 2' });
  stateManager.setVersion(3, { name: 'Version 3' });
  
  const versions = stateManager.getVersions();
  expect(versions).toHaveLength(3);
  expect(versions.map(v => v.id)).toEqual(['1', '2', '3']);
});
```

---

## 8. Data Flow Diagram

```
Vexa Meeting (WebSocket)
       |
       v
VexaTranscriptionAgent._connectWebSocket()
       |
       v
_handleWebSocketMessage()
  (transcript.mutable | transcript.finalized)
       |
       v
onTranscriptCallback(transcript)
       |
       +---> _callback(transcript) [optional user callback]
       |
       v
StateManager.addTranscription(transcript)
       |
       v
Get Active Version
       |
       v
Store in version.transcriptions[key]
       |
       v
notifyListeners()
       |
       v
React Hook useDNAFramework()
       |
       v
setState(newState)
       |
       v
UI Re-render with updated transcripts
```

---

## 9. Key Implementation Details

### Transcript Keying Strategy
- **Key Format**: `{timestampStart}-{speaker}`
- **Advantage**: Natural de-duplication of identical segments
- **Behavior**: Same speaker + same timestamp = overwrites previous (handles mutable transcripts)

### WebSocket Message Handling
- **Mutable events**: Temporary transcripts (user still speaking)
- **Finalized events**: Final transcripts (speech complete)
- **Handling**: Both are processed identically; finalized overwrites mutable

### Version Context Storage
- **Purpose**: Store metadata about each version (name, description, original URL, etc.)
- **Flexible**: Can store any key-value pairs
- **Used for**: UI display, version identification, tracking version context

### Active Version Routing
- **Mechanism**: StateManager checks for active version before adding transcripts
- **Fallback**: If no active version, transcripts are silently dropped
- **Test Coverage**: Validates this behavior

---

## 10. Summary of Version-Specific Features

| Feature | Mechanism | Location |
|---------|-----------|----------|
| **Version Creation** | Automatic on `setVersion()` call | `StateManager.setVersion()` |
| **Active Version Switching** | Update `state.activeVersion` and notify listeners | `StateManager.setVersion()` |
| **Transcript Routing** | `addTranscription()` checks `getActiveVersion()` | `StateManager.addTranscription()` |
| **Transcript Storage** | Per-version isolated `transcriptions` map | `Version.transcriptions` |
| **Transcript Keys** | `{timestampStart}-{speaker}` | `StateManager.addTranscription()` |
| **Version Context** | Flexible metadata storage | `Version.context` |
| **State Change Notifications** | Listener pattern with state copy | `StateManager.notifyListeners()` |
| **WebSocket Integration** | Vexa agent calls `onTranscriptCallback()` | `VexaTranscriptionAgent._handleWebSocketMessage()` |
| **No Transcript Loss** | Switching versions preserves previous transcripts | Architecture design |

---

## 11. Relevant File Paths

```
dna/experimental/ilm/dna-frontend-framework/
├── index.ts                                    # Main framework entry point
├── types.ts                                    # Type definitions (State, Version, Transcription)
├── state/
│   └── stateManager.ts                        # Version and transcript state management
├── transcription/
│   ├── transcriptionAgent.ts                  # Abstract base class
│   └── vexa/
│       ├── vexaTranscriptionAgent.ts          # Vexa WebSocket integration
│       └── types.ts                           # WebSocket event types
├── __tests__/
│   ├── stateManager.test.ts                   # Version and transcript tests
│   ├── transcriptionAgent.test.ts             # Agent abstraction tests
│   └── dnaFrontendFramework.simple.test.ts    # Framework integration tests
└── frontend-example/
    └── src/
        ├── hooks/useDNAFramework.ts           # React integration hook
        └── App.tsx                            # Example application
```

---

## Conclusion

The ILM implementation achieves version-specific transcription through:

1. **Isolated State Storage**: Each version has its own transcription map
2. **Active Version Router**: Only the active version receives incoming transcriptions
3. **Non-Destructive Switching**: Switching versions preserves all previous transcripts
4. **Listener Pattern**: Frontend subscribes to state changes for real-time updates
5. **Flexible Context**: Each version can store arbitrary metadata
6. **WebSocket Integration**: Vexa transcriptions flow through callbacks to state manager

This design enables seamless handling of multiple concurrent meetings or meeting versions while maintaining clean separation of concerns and reactive UI updates.
