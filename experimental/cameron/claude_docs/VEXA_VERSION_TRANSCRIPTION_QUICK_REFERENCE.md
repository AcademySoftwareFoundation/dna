# Vexa Version-Specific Transcription - Quick Reference Guide

## At a Glance

### How Vexa Transcription Becomes Version-Specific

```
Step 1: Framework Setup
        DNAFrontendFramework creates StateManager and VexaTranscriptionAgent
                 ↓
Step 2: Version Selection
        framework.setVersion(versionId, context)
        → StateManager sets activeVersion
        → Creates new Version if needed with empty transcriptions{}
                 ↓
Step 3: Meeting Join
        framework.joinMeeting(meetingId)
        → VexaTranscriptionAgent connects WebSocket
        → Subscribes to meeting
                 ↓
Step 4: Transcription Arrival
        Vexa WebSocket sends transcript.mutable or transcript.finalized
                 ↓
Step 5: Version Routing
        VexaTranscriptionAgent._handleWebSocketMessage()
        → Extracts transcript segment
        → Calls onTranscriptCallback(transcript)
        → StateManager.addTranscription(transcript)
        → Gets active version and stores transcript in version.transcriptions[key]
                 ↓
Step 6: State Notification
        notifyListeners() triggers all subscribed React components
        → UI re-renders with updated transcripts
```

---

## Critical Code Sections

### 1. Version Activation (Where Routing Happens)
**File**: `state/stateManager.ts`

```typescript
setVersion(id: number, context?: Record<string, any>): void {
    // Find or create version
    let version = this.getVersion(id);
    if (!version) {
        version = this.createNewVersion(id, context);
    }
    
    // THIS IS KEY: Set active version
    this.state.activeVersion = id;
    
    // Notify UI
    this.notifyListeners();
}
```

**Effect**: All future transcriptions go to version `id`

---

### 2. Transcript Routing (Where Transcriptions Get Assigned)
**File**: `state/stateManager.ts`

```typescript
addTranscription(transcription: Transcription): void {
    const key = `${transcription.timestampStart}-${transcription.speaker}`;
    
    // CRITICAL: Only add to ACTIVE version
    const version = this.getActiveVersion();
    
    if (version) {
        version.transcriptions[key] = transcription;
        this.notifyListeners();
    }
}
```

**Effect**: Transcripts only store if version is active; otherwise silently dropped

---

### 3. WebSocket Message Handling (Where Vexa Transcripts Enter)
**File**: `transcription/vexa/vexaTranscriptionAgent.ts`

```typescript
private _handleWebSocketMessage(data: WebSocketEvent): void {
    switch (data.type) {
      case 'transcript.mutable':
      case 'transcript.finalized':
        const segments = data.payload.segments || 
                        (data.payload.segment ? [data.payload.segment] : []);
        
        for (const segment of segments) {
          const transcript: Transcription = {
            text: segment.text || '',
            timestampStart: segment.absolute_start_time || new Date().toISOString(),
            timestampEnd: segment.absolute_end_time || new Date().toISOString(),
            speaker: segment.speaker || 'Unknown',
          };
          
          // Calls the router
          this.onTranscriptCallback(transcript);
        }
        break;
    }
}

private async onTranscriptCallback(transcript: Transcription): Promise<void> {
    if (this._callback) {
        this._callback(transcript);
    }
    
    // SENDS TO STATE MANAGER
    this._stateManager.addTranscription(transcript);
}
```

**Effect**: Vexa transcripts flow → StateManager → Active Version's transcriptions

---

## Version Switching Behavior

### Scenario: Switching Between Versions While Meeting is Active

```
Time T0: setVersion(1)
         → Version 1 becomes active
         → Version 1.transcriptions = {}

Time T1: Vexa sends 5 transcripts
         → All 5 go to Version 1
         → Version 1.transcriptions = {5 items}

Time T2: setVersion(2)
         → Version 2 becomes active
         → Version 2.transcriptions = {}
         → Version 1.transcriptions = {5 items} ← PRESERVED!

Time T3: Vexa sends 3 more transcripts
         → All 3 go to Version 2
         → Version 2.transcriptions = {3 items}
         → Version 1.transcriptions = {5 items} ← Still there

Time T4: User edits Version 1's user notes
         → framework.setUserNotes(1, "My notes")
         → Version 1.userNotes = "My notes"
         → Version 2 unaffected
```

**Key Point**: Switching versions does NOT save/upload anything; it just changes where future transcripts go.

---

## Data Structures

### State Tree
```typescript
{
  activeVersion: 1,
  versions: [
    {
      id: "1",
      context: { name: "Version 1", description: "..." },
      transcriptions: {
        "2025-01-01T10:00:00.000Z-John": {
          text: "Hello",
          timestampStart: "2025-01-01T10:00:00.000Z",
          timestampEnd: "2025-01-01T10:00:02.000Z",
          speaker: "John"
        }
      },
      userNotes: "User notes here",
      aiNotes: "AI notes here"
    },
    {
      id: "2",
      context: { name: "Version 2", description: "..." },
      transcriptions: {},
      userNotes: "",
      aiNotes: ""
    }
  ]
}
```

### Transcript Key Format
```
"{timestampStart}-{speaker}"

Example:
"2025-01-01T10:00:00.000Z-John Doe"
```

**Why this format?**
- Unique per speaker per timestamp
- Same speaker + same timestamp = overwrites (handles mutable → finalized)
- Enables sorting and searching

---

## Common Operations

### Create a Version
```typescript
framework.setVersion(3, { name: "Version 3", description: "Q1 Review" });
// Creates Version 3 if it doesn't exist, makes it active
```

### Switch to Version (Without Creating)
```typescript
framework.setVersion(2);
// Switches to existing Version 2
// All incoming transcripts now go to Version 2
```

### Get Transcript Text for Display
```typescript
const transcriptText = getTranscriptText(versionId);
// Returns sorted, formatted string:
// "John: Hello\nJane: Hi there\n..."
```

### Save Notes
```typescript
framework.setUserNotes(versionId, "My notes");
framework.setAiNotes(versionId, "Generated notes");
// Notes are stored in version.userNotes and version.aiNotes
```

### Subscribe to Changes
```typescript
const unsubscribe = framework.subscribeToStateChanges((newState) => {
    console.log("State updated:", newState);
});
// Called whenever any transcript/version/note changes
```

---

## What Happens When...

### User Switches to a Different Version Tab
1. UI calls `setVersion(newVersionId, context)`
2. StateManager sets `activeVersion = newVersionId`
3. `notifyListeners()` triggers
4. React hook updates state
5. UI re-renders showing new version's transcripts

### A New Transcript Arrives from Vexa
1. WebSocket receives `transcript.finalized`
2. `_handleWebSocketMessage()` extracts segment
3. Creates `Transcription` object
4. Calls `onTranscriptCallback(transcript)`
5. Calls `stateManager.addTranscription(transcript)`
6. StateManager checks `getActiveVersion()`
7. If active version exists, stores in `version.transcriptions[key]`
8. Calls `notifyListeners()`
9. UI updates with new transcript

### User Adds Notes to a Version
1. UI calls `framework.setUserNotes(versionId, notes)`
2. StateManager finds version by ID
3. Sets `version.userNotes = notes`
4. Calls `notifyListeners()`
5. UI re-renders (notes now visible)

### User Joins a Meeting While Version 1 is Active
1. UI calls `framework.joinMeeting(meetingId)`
2. VexaTranscriptionAgent joins meeting via Vexa API
3. Connects WebSocket
4. All transcriptions now route to Version 1
5. Switching to Version 2 stops sending to Version 1, starts sending to Version 2

---

## Important Constraints

### Transcription Handling
- If no active version is set, transcripts are **silently dropped**
- Set a version BEFORE joining a meeting to ensure transcripts are captured
- Switching versions does NOT pause or save transcription stream

### Version Limits
- No built-in limit on number of versions
- No built-in limit on transcripts per version
- Each transcript key stores one Transcription object

### Transcript Keys
- Key generation: `${timestampStart}-${speaker}`
- Duplicate keys: Overwrites previous (good for mutable→finalized transitions)
- No sorting by default: Must sort in UI using timestamp

### WebSocket Events
- Both `transcript.mutable` and `transcript.finalized` are processed identically
- System handles both single `segment` and array of `segments`
- Error events are logged but don't affect active version routing

---

## Testing Checklist for Version-Specific Features

```typescript
✓ Create new version → version appears in state.versions
✓ Switch versions → activeVersion updates
✓ Switch versions → previous version's transcripts preserved
✓ Add transcript while Version 1 active → appears in Version 1
✓ Add transcript while Version 2 active → appears in Version 2, not Version 1
✓ No active version → transcripts silently dropped
✓ Switch versions → subsequent transcripts go to new version
✓ Switch versions → UI shows correct transcripts
✓ Mutable then finalized with same timestamp → key overwrites
✓ State listeners called on version switch
✓ State listeners called on new transcript
✓ User notes isolated per version
✓ AI notes isolated per version
✓ Context isolated per version
```

---

## Files You Need to Know

| File | Purpose | Key Functions |
|------|---------|----------------|
| `state/stateManager.ts` | Version routing logic | `setVersion()`, `addTranscription()`, `getActiveVersion()` |
| `transcription/vexa/vexaTranscriptionAgent.ts` | Vexa integration | `_handleWebSocketMessage()`, `onTranscriptCallback()` |
| `types.ts` | Data structures | `State`, `Version`, `Transcription` |
| `index.ts` | Framework entry | `setVersion()`, `joinMeeting()`, `subscribeToStateChanges()` |
| `frontend-example/src/hooks/useDNAFramework.ts` | React integration | `setVersion()`, `getTranscriptText()` |
| `__tests__/stateManager.test.ts` | Version behavior tests | Multiple version scenarios |

---

## Quick Debugging

### Problem: Transcripts not appearing
**Check:**
1. Is a version active? `getActiveVersionId()` should not be 0
2. Is meeting joined? `isConnected()` should return true
3. Is Vexa sending transcripts? Check WebSocket messages in browser DevTools

### Problem: Wrong version getting transcripts
**Check:**
1. Call `setVersion(expectedId)` explicitly
2. Verify `getActiveVersionId()` returns correct ID
3. Check if WebSocket is still connected to same meeting

### Problem: Lost transcripts when switching versions
**Expected:** This should not happen. Transcripts should be preserved.
**Check:**
1. Verify old version's transcripts in state tree
2. Check if version ID is converted to string correctly (e.g., "1" not 1)

### Problem: React component not updating on version switch
**Check:**
1. Is `subscribeToStateChanges()` called? (Check useDNAFramework hook)
2. Is listener function calling `setState()`?
3. Check browser React DevTools for state updates
