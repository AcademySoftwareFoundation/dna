# Vexa Transcription Version-Specific Implementation - Complete Guide

## Quick Summary

The ILM (Integrated Language Model) framework implements version-specific Vexa transcription through a **state-based routing system** where:

1. **Versions are containers** - Each version stores its own isolated transcript collection
2. **One version is active** - Only the active version receives new transcripts
3. **Switching is non-destructive** - Previous version's transcripts are preserved
4. **Listeners enable reactivity** - Frontend subscribes to state changes for real-time updates

---

## Documentation Files

This analysis includes three comprehensive documents:

### 1. **VEXA_VERSION_SPECIFIC_TRANSCRIPTION_ANALYSIS.md**
   - Complete architectural overview
   - Detailed state management explanation
   - Data structures and types
   - WebSocket integration details
   - State notification system
   - Full data flow diagrams
   - Test case examples
   - File path reference
   
   **Read this for:** Understanding the complete system architecture

### 2. **VEXA_VERSION_TRANSCRIPTION_QUICK_REFERENCE.md**
   - At-a-glance flow diagrams
   - Critical code sections highlighted
   - Version switching behavior scenarios
   - Data structure examples
   - Common operations checklist
   - Debugging guide
   - Quick lookup tables
   
   **Read this for:** Quick answers and troubleshooting

### 3. **VEXA_VERSION_IMPLEMENTATION_EXAMPLES.md**
   - Complete working code examples
   - Real-world usage scenarios
   - React component integration
   - Multi-meeting comparison
   - Edge cases and error handling
   - Performance considerations
   - Common gotchas and fixes
   
   **Read this for:** Implementation patterns and code examples

---

## Quick Start

### Understanding the Flow (60 seconds)

```
User Interface
    ↓
framework.setVersion(1)          ← Activate version 1
    ↓
StateManager.activeVersion = 1   ← Mark version 1 as active
    ↓
framework.joinMeeting(id)        ← Start receiving transcripts
    ↓
Vexa WebSocket → Transcript      ← Transcript arrives
    ↓
VexaTranscriptionAgent           ← Extracts segment
    ↓
StateManager.addTranscription()  ← Routes to active version
    ↓
version.transcriptions[key] = transcript  ← Stored in version 1
    ↓
notifyListeners()                ← Notify UI
    ↓
React Component Updates          ← Display new transcript
```

### Core Concept: Version Isolation

```typescript
// Setup
framework.setVersion(1);  // Version 1 active, Version 2 inactive

// Transcription arrives → Goes to Version 1
StateManager.addTranscription(transcript);

// Switch versions
framework.setVersion(2);  // Version 2 active, Version 1 inactive

// More transcriptions arrive → Go to Version 2
StateManager.addTranscription(transcript);

// Version 1 still has original transcripts!
```

---

## Key Files by Purpose

### Routing (How transcripts find the right version)
- `state/stateManager.ts` - `addTranscription()` and `getActiveVersion()`

### Version Management (How versions are created and switched)
- `state/stateManager.ts` - `setVersion()` method
- `index.ts` - `setVersion()` wrapper

### WebSocket Integration (How Vexa transcripts enter the system)
- `transcription/vexa/vexaTranscriptionAgent.ts` - `_handleWebSocketMessage()`
- `transcription/vexa/types.ts` - WebSocket event definitions

### Frontend Integration (How React subscribes to changes)
- `frontend-example/src/hooks/useDNAFramework.ts` - `subscribeToStateChanges()`
- `frontend-example/src/App.tsx` - Component usage

### Types (Data structures)
- `types.ts` - `State`, `Version`, `Transcription`

### Tests (Validation of behavior)
- `__tests__/stateManager.test.ts` - Version and transcript tests
- `__tests__/transcriptionAgent.test.ts` - Agent abstraction tests
- `__tests__/dnaFrontendFramework.simple.test.ts` - Integration tests

---

## Architecture Overview

### State Tree Structure
```
State {
  activeVersion: 1,
  versions: [
    {
      id: "1",
      context: { name: "Version 1", ... },
      transcriptions: {
        "2025-01-01T10:00:00.000Z-Alice": { text: "...", ... },
        "2025-01-01T10:00:03.000Z-Bob": { text: "...", ... }
      },
      userNotes: "...",
      aiNotes: "..."
    },
    {
      id: "2",
      context: { name: "Version 2", ... },
      transcriptions: {},
      userNotes: "",
      aiNotes: ""
    }
  ]
}
```

### Component Interaction
```
┌─────────────────────────────────────────┐
│       DNAFrontendFramework              │
│    (Main framework entry point)         │
└──────────┬──────────────────────────────┘
           │
           ├─ StateManager (Version routing)
           │  ├─ setVersion() → activeVersion
           │  ├─ addTranscription() → active version's transcriptions
           │  └─ notifyListeners() → React hooks
           │
           ├─ VexaTranscriptionAgent (WebSocket)
           │  ├─ joinMeeting() → Connect to Vexa
           │  └─ onTranscriptCallback() → StateManager
           │
           ├─ NoteGenerator (AI processing)
           │
           └─ Frontend (React)
              ├─ useDNAFramework hook
              ├─ subscribeToStateChanges()
              └─ Display components
```

---

## How It Works: Step by Step

### Step 1: Initialization
```typescript
const framework = new DNAFrontendFramework(config);
// Creates: StateManager, VexaTranscriptionAgent, NoteGenerator
```

### Step 2: Version Setup
```typescript
framework.setVersion(1, { name: "Version 1" });
// StateManager: Creates Version 1, sets activeVersion = 1
```

### Step 3: Meeting Join
```typescript
await framework.joinMeeting("meeting-id");
// VexaTranscriptionAgent: Connects WebSocket, subscribes to meeting
```

### Step 4: Transcript Arrival
```
Vexa sends: { type: 'transcript.finalized', payload: { ... } }
    ↓
VexaTranscriptionAgent._handleWebSocketMessage()
    ↓
Extracts: { text: "...", speaker: "Alice", ... }
    ↓
Calls: onTranscriptCallback(transcript)
    ↓
Calls: StateManager.addTranscription(transcript)
```

### Step 5: Routing to Active Version
```typescript
addTranscription(transcript) {
  const key = `${transcript.timestampStart}-${transcript.speaker}`;
  const activeVersion = this.getActiveVersion(); // Get Version 1
  
  if (activeVersion) {
    activeVersion.transcriptions[key] = transcript;
    this.notifyListeners();
  }
}
```

### Step 6: UI Update
```typescript
framework.subscribeToStateChanges((state) => {
  setState(state); // React re-render
});
```

---

## Version Switching Behavior

### Scenario: Recording Multiple Meetings

```
Timeline:
─────────────────────────────────────────────────

T0: setVersion(1)
    Version 1 becomes active
    Version 1.transcriptions = {}

T1-T5: Vexa sends 5 transcripts
    All go to Version 1
    Version 1.transcriptions = {5 items}

T6: setVersion(2)
    Version 1 becomes INACTIVE (but data preserved)
    Version 2 becomes ACTIVE
    Version 2.transcriptions = {}

T7-T8: Vexa sends 2 more transcripts
    All go to Version 2
    Version 2.transcriptions = {2 items}
    Version 1.transcriptions = {5 items} ← UNCHANGED!

T9: User edits Version 1's user notes
    Version 1.userNotes = "My edits"
    Version 2.userNotes = "" ← UNCHANGED!
    Transcripts still separate

T10: setVersion(1) again
    Version 1 becomes ACTIVE again
    Can continue receiving transcripts
```

### Key Insight: No Saving Required
- Switching versions does NOT upload or save
- Just changes where **future** transcripts go
- Previous version's transcripts remain accessible

---

## Transcript Key Strategy

### Key Format: `{timestampStart}-{speaker}`

**Why this format?**

1. **Uniqueness**: Different timestamp or speaker = different key
2. **De-duplication**: Same speaker, same time = same key (overwrites)
3. **Sorting**: Timestamps allow natural chronological ordering
4. **Simple**: No complex hashing needed

### Examples:
```
"2025-01-01T10:00:00.000Z-Alice"
"2025-01-01T10:00:03.000Z-Bob"
"2025-01-01T10:00:05.000Z-Alice"  ← Different timestamp, overwrites if same start time
```

### Mutable vs Finalized Behavior:
```
1. Vexa sends: "Hel..." (mutable)
   Key: "2025-01-01T10:00:00.000Z-Alice"
   Stored: { text: "Hel..." }

2. Vexa sends: "Hello..." (mutable, refined)
   Key: "2025-01-01T10:00:00.000Z-Alice" ← Same key!
   Result: OVERWRITES with { text: "Hello..." }

3. Vexa sends: "Hello there" (finalized)
   Key: "2025-01-01T10:00:00.000Z-Alice" ← Same key!
   Result: OVERWRITES with { text: "Hello there" } (final)
```

---

## State Management Patterns

### Pattern 1: Adding a Transcription
```typescript
// Only works if active version exists
version = stateManager.getActiveVersion();
if (version) {
  version.transcriptions[key] = transcript;
  notifyListeners();
}
```

### Pattern 2: Switching Versions
```typescript
// Find or create version
let version = getVersion(id);
if (!version) {
  version = createNewVersion(id, context);
}
// Set active
activeVersion = id;
notifyListeners();
```

### Pattern 3: Listener Notification
```typescript
// Called after any state change
listeners.forEach(listener => listener(getState()));
```

### Pattern 4: Context Storage
```typescript
// Each version can store metadata
version.context = { name, description, date, ... };
// Used for UI display and tracking
```

---

## Common Use Cases

### Use Case 1: Single Meeting, Single Version
```typescript
framework.setVersion(1);
await framework.joinMeeting("meeting-id");
// All transcripts → Version 1
```

### Use Case 2: Single Meeting, Multiple Takes
```typescript
framework.setVersion(1, { name: "Take 1" });
await framework.joinMeeting("meeting-id");
// ... record take 1 ...
await framework.leaveMeeting();

framework.setVersion(2, { name: "Take 2" });
await framework.joinMeeting("meeting-id");
// ... record take 2 ...
await framework.leaveMeeting();
```

### Use Case 3: Multiple Meetings, Multiple Versions
```typescript
framework.setVersion(1, { meeting: "Q1 Planning" });
await framework.joinMeeting("meeting-1");
// ... record meeting 1 ...
await framework.leaveMeeting();

framework.setVersion(2, { meeting: "Q1 Review" });
await framework.joinMeeting("meeting-2");
// ... record meeting 2 ...
await framework.leaveMeeting();
```

### Use Case 4: Original + Edited Versions
```typescript
framework.setVersion(1, { name: "Original" });
await framework.joinMeeting("meeting-id");
// ... record meeting ...
await framework.leaveMeeting();

// User edits Version 1's transcripts into Version 2
framework.setVersion(2, { name: "Edited" });
// ... programmatically add edited transcripts ...
```

---

## Error Handling & Edge Cases

### Edge Case 1: No Active Version
```typescript
// If activeVersion is 0 or undefined
stateManager.addTranscription(transcript);
// Result: Transcript silently dropped (no error)
```

**Fix**: Always `setVersion()` before joining a meeting

### Edge Case 2: Non-existent Version ID
```typescript
framework.setVersion(999);
// Result: Auto-creates Version 999 (no error)
```

**Expected behavior**: Versions are created on demand

### Edge Case 3: Duplicate Transcript Keys
```typescript
// Same speaker, same timestamp
stateManager.addTranscription(transcript1);
stateManager.addTranscription(transcript2);
// Result: transcript2 overwrites transcript1
```

**Expected behavior**: Handles mutable→finalized transitions

### Edge Case 4: Version ID Type Confusion
```typescript
// IDs are stored as strings internally
const v = stateManager.getVersion(1);
v.id === "1"; // true, not 1
```

**Note**: Comparisons should use string IDs

---

## Testing Checklist

```
Version Management:
  ✓ Create new version
  ✓ Switch to different version
  ✓ Switch to non-existent version (auto-creates)
  ✓ Get active version
  ✓ Get all versions
  ✓ Update version context

Transcription Routing:
  ✓ Add transcript to active version
  ✓ Transcript appears only in active version
  ✓ Switch versions, previous transcripts preserved
  ✓ Transcripts route to new active version
  ✓ Multiple speakers in same version
  ✓ Multiple timestamped segments
  ✓ No active version = silently drop

Mutable/Finalized:
  ✓ Mutable transcript stored
  ✓ Finalized overwrites mutable (same key)
  ✓ Different timestamps = different keys
  ✓ Different speakers = different keys

State Notifications:
  ✓ Listener called on version switch
  ✓ Listener called on new transcript
  ✓ Listener called on notes update
  ✓ Unsubscribe prevents notifications
  ✓ Multiple listeners all notified

React Integration:
  ✓ useDNAFramework hook initializes
  ✓ subscribeToStateChanges triggers re-render
  ✓ setVersion updates UI
  ✓ getTranscriptText sorts by timestamp
  ✓ Version switching shows correct transcripts
```

---

## Performance Considerations

### Memory Usage
- **Per transcript**: ~200 bytes (text, timestamps, speaker)
- **Per version**: ~50 bytes (metadata) + transcripts
- **Example**: 1000 transcripts = ~200KB per version

### Rendering Performance
- **Current**: All transcripts in memory
- **Optimization**: Virtualize long lists (1000+ items)
- **Library**: `react-window`, `react-virtualized`

### Listener Notifications
- **Current**: Called on every change
- **Optimization**: Debounce if 100+ updates/second
- **Library**: `lodash.debounce`

### State Updates
- **Current**: Full state copy on notify
- **Optimization**: Only send delta for large states

---

## Implementation Roadmap

### Phase 1: Basic Setup (Done)
- [x] StateManager with version routing
- [x] VexaTranscriptionAgent integration
- [x] React hook subscription

### Phase 2: Features (Done)
- [x] Transcript isolation per version
- [x] Version switching
- [x] User/AI notes per version
- [x] Version context metadata

### Phase 3: Improvements (Future)
- [ ] Transcript search across versions
- [ ] Version comparison UI
- [ ] Transcript export per version
- [ ] Version history/undo
- [ ] Concurrent meeting support

### Phase 4: Optimization (Future)
- [ ] Virtualized transcript display
- [ ] Lazy-load older transcripts
- [ ] Compress old version transcripts
- [ ] Archive to persistent storage

---

## Troubleshooting Guide

| Problem | Root Cause | Solution |
|---------|-----------|----------|
| Transcripts not appearing | No active version | Call `setVersion()` before `joinMeeting()` |
| Wrong version getting transcripts | Switched too late | Ensure `setVersion()` happens before Vexa starts sending |
| Transcripts disappear on version switch | Expected behavior | They're in the previous version; switch back to see them |
| Lost transcripts after reload | No persistence | Implement storage/database integration |
| UI not updating on version switch | Listener not subscribed | Check `subscribeToStateChanges()` is called |
| Memory leak in React | Unsubscribe not called | Return cleanup function from `useEffect` |
| Duplicate transcripts | Same key stored twice | Keys should prevent this; check timestamp generation |

---

## Next Steps

1. **Read the Analysis**: Start with `VEXA_VERSION_SPECIFIC_TRANSCRIPTION_ANALYSIS.md` for deep understanding
2. **Quick Reference**: Keep `VEXA_VERSION_TRANSCRIPTION_QUICK_REFERENCE.md` handy for lookups
3. **Implement Examples**: Study `VEXA_VERSION_IMPLEMENTATION_EXAMPLES.md` for patterns
4. **Review Code**: Examine actual source files listed in each document
5. **Run Tests**: Execute test suites to verify behavior
6. **Build Features**: Implement version-specific features in your application

---

## Key Takeaways

1. **Versions are containers** - Each version stores isolated transcripts
2. **One active version** - Routes incoming transcripts to that version only
3. **Non-destructive switching** - Previous transcripts preserved when switching
4. **Simple routing** - `StateManager` checks active version before storing
5. **Reactive UI** - Listener pattern enables real-time React updates
6. **Flexible context** - Each version can store arbitrary metadata
7. **Predictable keys** - `{timestamp}-{speaker}` format enables deduplication
8. **Mutable handling** - Same key overwrites (good for speech refinement)

---

## Questions?

Refer to:
- **Architecture questions**: See `VEXA_VERSION_SPECIFIC_TRANSCRIPTION_ANALYSIS.md`
- **Quick answers**: See `VEXA_VERSION_TRANSCRIPTION_QUICK_REFERENCE.md`
- **Code examples**: See `VEXA_VERSION_IMPLEMENTATION_EXAMPLES.md`
- **Source files**: Check file paths in respective documents
- **Tests**: Review `__tests__/` directory for working examples

---

*Last Updated: 2025-01-10*
*Framework Location: `/experimental/ilm/dna-frontend-framework/`*
