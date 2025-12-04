# Vexa Version-Specific Transcription - Implementation Examples

## Complete Flow Examples

### Example 1: Basic Version Setup with Meeting Join

```typescript
// Initialize framework
const configuration: Configuration = {
  vexaUrl: 'https://api.vexa.com',
  vexaApiKey: 'your-api-key',
  platform: 'google_meet',
  llmInterface: 'openai',
  llmModel: 'gpt-4',
  llmApiKey: 'your-llm-key',
  llmBaseURL: 'https://api.openai.com/v1',
};

const framework = new DNAFrontendFramework(configuration);
const stateManager = framework.getStateManager();

// Step 1: Create versions for different meeting recordings
framework.setVersion(1, { 
  name: "Version 1: Raw", 
  description: "Initial transcription" 
});

framework.setVersion(2, { 
  name: "Version 2: Edited", 
  description: "After manual review" 
});

// Step 2: Subscribe to state changes
framework.subscribeToStateChanges((state: State) => {
  console.log('Current version:', state.activeVersion);
  console.log('Total versions:', state.versions.length);
  state.versions.forEach(v => {
    console.log(`Version ${v.id}: ${Object.keys(v.transcriptions).length} transcripts`);
  });
});

// Step 3: Switch to Version 1 and join meeting
framework.setVersion(1);
await framework.joinMeeting('meeting-id-123');

// From this point on, all Vexa transcripts go to Version 1

// Step 4: Later, switch to Version 2 for different content
framework.setVersion(2);
// New transcripts now go to Version 2
// Version 1's transcripts are preserved
```

**Output:**
```
Current version: 1
Total versions: 2
Version 1: 0 transcripts

[Transcripts arrive...]

Current version: 1
Total versions: 2
Version 1: 5 transcripts

[Switch to version 2]

Current version: 2
Total versions: 2
Version 1: 5 transcripts (unchanged)
Version 2: 0 transcripts

[More transcripts arrive, go to Version 2]

Current version: 2
Total versions: 2
Version 1: 5 transcripts (unchanged)
Version 2: 3 transcripts
```

---

### Example 2: React Component with Version Switching

```typescript
// Hook implementation
import { useMemo, useState, useEffect } from "react";
import { DNAFrontendFramework, State, ConnectionStatus } from "dna-framework";

export const useDNAFramework = () => {
  const [state, setState] = useState<State>({ activeVersion: 0, versions: [] });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );

  // Create framework instance once
  const framework = useMemo(
    () =>
      new DNAFrontendFramework({
        vexaApiKey: import.meta.env.VITE_VEXA_API_KEY,
        vexaUrl: import.meta.env.VITE_VEXA_URL,
        platform: import.meta.env.VITE_PLATFORM,
        llmInterface: "openai",
        llmModel: "gpt-4",
        llmApiKey: import.meta.env.VITE_LLM_API_KEY,
        llmBaseURL: import.meta.env.VITE_LLM_BASEURL,
      }),
    []
  );

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = framework.subscribeToStateChanges((newState: State) => {
      setState(newState);
    });
    return unsubscribe;
  }, [framework]);

  // Monitor connection status
  useEffect(() => {
    const checkStatus = async () => {
      const status = await framework.getConnectionStatus();
      setConnectionStatus(status);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, [framework]);

  // Version switching function
  const switchToVersion = (versionId: number, context?: Record<string, any>) => {
    framework.setVersion(versionId, context);
  };

  // Get transcript text for a version
  const getTranscriptText = (versionId: string): string => {
    const version = state.versions.find((v) => v.id === versionId);
    if (!version) return "";

    return Object.values(version.transcriptions)
      .sort(
        (a, b) =>
          new Date(a.timestampStart).getTime() -
          new Date(b.timestampStart).getTime()
      )
      .map((t) => `${t.speaker}: ${t.text}`)
      .join("\n");
  };

  // Generate AI notes
  const generateNotes = async (versionId: number): Promise<string> => {
    return await framework.generateNotes(versionId);
  };

  return {
    framework,
    state,
    connectionStatus,
    switchToVersion,
    getTranscriptText,
    generateNotes,
  };
};

// Component usage
import { Box, Button, TextArea, Flex, Card, Badge } from "@radix-ui/themes";

export function MeetingTranscriber() {
  const { framework, state, switchToVersion, getTranscriptText } =
    useDNAFramework();
  const [meetingId, setMeetingId] = useState("");

  const handleJoinMeeting = async () => {
    await framework.joinMeeting(meetingId);
  };

  return (
    <Flex direction="column" gap="4" p="4">
      {/* Meeting Control */}
      <Card size="2">
        <Flex direction="column" gap="2" p="4">
          <h2>Join Meeting</h2>
          <input
            type="text"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            placeholder="Enter meeting ID"
          />
          <Button onClick={handleJoinMeeting}>Join Meeting</Button>
        </Flex>
      </Card>

      {/* Version Tabs */}
      <Flex direction="row" gap="2">
        {state.versions.map((version) => (
          <Button
            key={version.id}
            onClick={() => switchToVersion(Number(version.id))}
            variant={
              state.activeVersion === Number(version.id)
                ? "solid"
                : "outline"
            }
          >
            {version.context.name || `Version ${version.id}`}
          </Button>
        ))}
      </Flex>

      {/* Transcripts Display */}
      {state.versions.map((version) => (
        <Card
          key={version.id}
          style={{
            display:
              state.activeVersion === Number(version.id) ? "block" : "none",
          }}
        >
          <Flex direction="column" gap="3" p="4">
            <h3>{version.context.name}</h3>
            <TextArea
              readOnly
              value={getTranscriptText(version.id)}
              placeholder="Transcripts will appear here..."
              style={{ minHeight: 300 }}
            />
            <Badge>
              {Object.keys(version.transcriptions).length} transcripts
            </Badge>
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
```

---

### Example 3: Handling Version-Specific Transcription Flow

```typescript
// StateManager perspective
class TranscriptionFlowDemo {
  private stateManager: StateManager;
  private vexaAgent: VexaTranscriptionAgent;

  constructor() {
    this.stateManager = new StateManager();
    this.vexaAgent = new VexaTranscriptionAgent(
      this.stateManager,
      configuration
    );

    this.setupStateListener();
  }

  private setupStateListener() {
    this.stateManager.subscribe((state: State) => {
      console.log("=== State Update ===");
      console.log("Active Version:", state.activeVersion);
      console.log("Versions:");
      state.versions.forEach((v) => {
        const transcriptCount = Object.keys(v.transcriptions).length;
        const isActive = state.activeVersion === Number(v.id) ? "[ACTIVE]" : "";
        console.log(`  Version ${v.id} ${isActive}: ${transcriptCount} transcripts`);
      });
    });
  }

  async runDemoFlow() {
    console.log("\n1. Create Version 1");
    this.stateManager.setVersion(1, { name: "Version 1" });

    console.log("\n2. Simulate receiving transcript for Version 1");
    const transcript1: Transcription = {
      text: "Hello everyone",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    };
    this.stateManager.addTranscription(transcript1);

    console.log("\n3. Create Version 2 (but don't activate yet)");
    this.stateManager.setVersion(2, { name: "Version 2" });

    console.log("\n4. Simulate receiving another transcript (goes to Version 2)");
    const transcript2: Transcription = {
      text: "How are you?",
      timestampStart: "2025-01-01T10:00:03.000Z",
      timestampEnd: "2025-01-01T10:00:05.000Z",
      speaker: "Bob",
    };
    this.stateManager.addTranscription(transcript2);

    console.log("\n5. Switch back to Version 1");
    this.stateManager.setVersion(1);

    console.log("\n6. Simulate receiving transcript (goes back to Version 1)");
    const transcript3: Transcription = {
      text: "Thanks for joining",
      timestampStart: "2025-01-01T10:00:06.000Z",
      timestampEnd: "2025-01-01T10:00:08.000Z",
      speaker: "Alice",
    };
    this.stateManager.addTranscription(transcript3);

    console.log("\n7. Final state check");
    const finalState = this.stateManager.getState();
    console.log("Final State:", finalState);
  }
}

// Output:
// === State Update ===
// Active Version: 1
// Versions:
//   Version 1 [ACTIVE]: 0 transcripts
//
// === State Update ===
// Active Version: 1
// Versions:
//   Version 1 [ACTIVE]: 1 transcripts
//
// === State Update ===
// Active Version: 2
// Versions:
//   Version 1: 1 transcripts
//   Version 2 [ACTIVE]: 0 transcripts
//
// === State Update ===
// Active Version: 2
// Versions:
//   Version 1: 1 transcripts
//   Version 2 [ACTIVE]: 1 transcripts
//
// === State Update ===
// Active Version: 1
// Versions:
//   Version 1 [ACTIVE]: 1 transcripts
//   Version 2: 1 transcripts
//
// === State Update ===
// Active Version: 1
// Versions:
//   Version 1 [ACTIVE]: 2 transcripts
//   Version 2: 1 transcripts
```

---

### Example 4: Multi-Meeting Scenario with Version Branching

```typescript
// Scenario: Recording two different meetings, comparing versions

class MeetingComparison {
  private framework: DNAFrontendFramework;

  constructor() {
    this.framework = new DNAFrontendFramework(configuration);
  }

  async compareMeetings() {
    // Setup: Create versions for different meetings
    console.log("Setup: Creating versions for different meetings");

    // Meeting 1 - Original
    this.framework.setVersion(1, {
      name: "Meeting 1 - Original",
      meetingType: "Q1 Planning",
      date: "2025-01-15",
    });

    // Meeting 1 - Edited (for comparison)
    this.framework.setVersion(2, {
      name: "Meeting 1 - Edited",
      meetingType: "Q1 Planning",
      date: "2025-01-15",
      edited: true,
    });

    // Meeting 2 - Original
    this.framework.setVersion(3, {
      name: "Meeting 2 - Original",
      meetingType: "Q1 Review",
      date: "2025-01-22",
    });

    // Record Meeting 1
    console.log("\n--- Recording Meeting 1 ---");
    this.framework.setVersion(1);
    await this.framework.joinMeeting("meeting-1-id");

    // Simulate meeting duration
    await this.delay(5000);

    // Leave Meeting 1
    await this.framework.leaveMeeting();

    // Get transcript from Meeting 1
    const stateManager = this.framework.getStateManager();
    const version1 = stateManager.getVersion(1);
    const meeting1Transcripts = Object.values(version1?.transcriptions || {});
    console.log(`Meeting 1 captured ${meeting1Transcripts.length} transcripts`);

    // User edits Meeting 1 transcripts (stored in Version 2)
    console.log("\n--- User edits Meeting 1 (into Version 2) ---");
    this.framework.setVersion(2);
    // Manually add edited transcripts (simulated)
    meeting1Transcripts.forEach((t) => {
      const editedTranscript: Transcription = {
        ...t,
        text: t.text + " [edited]", // User's edits
      };
      stateManager.addTranscription(editedTranscript);
    });

    // Record Meeting 2
    console.log("\n--- Recording Meeting 2 ---");
    this.framework.setVersion(3);
    await this.framework.joinMeeting("meeting-2-id");

    // Simulate meeting duration
    await this.delay(5000);

    // Leave Meeting 2
    await this.framework.leaveMeeting();

    // Compare versions
    console.log("\n--- Final Comparison ---");
    const finalState = stateManager.getState();
    finalState.versions.forEach((v) => {
      const transcriptCount = Object.keys(v.transcriptions).length;
      console.log(`${v.context.name}: ${transcriptCount} transcripts`);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
const comparison = new MeetingComparison();
await comparison.compareMeetings();

// Output:
// Setup: Creating versions for different meetings
// --- Recording Meeting 1 ---
// Meeting 1 captured 12 transcripts
// --- User edits Meeting 1 (into Version 2) ---
// --- Recording Meeting 2 ---
// --- Final Comparison ---
// Meeting 1 - Original: 12 transcripts
// Meeting 1 - Edited: 12 transcripts
// Meeting 2 - Original: 8 transcripts
```

---

### Example 5: Transcript Mutation and Finalization

```typescript
// Demonstrating mutable vs finalized transcripts

class TranscriptMutationDemo {
  private framework: DNAFrontendFramework;
  private stateManager: StateManager;

  constructor() {
    this.framework = new DNAFrontendFramework(configuration);
    this.stateManager = this.framework.getStateManager();
  }

  demonstrateMutableFinalization() {
    this.stateManager.setVersion(1, { name: "Demo" });

    // Simulate Vexa sending mutable transcript
    console.log("1. User starts speaking: 'Hello wor...'");
    const mutableTranscript1: Transcription = {
      text: "Hello wor",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:01.000Z",
      speaker: "Alice",
    };
    this.stateManager.addTranscription(mutableTranscript1);
    console.log("   Stored as key: 2025-01-01T10:00:00.000Z-Alice");
    console.log("   State:", this.stateManager.getActiveVersion()?.transcriptions);

    // Simulate Vexa refining mutable transcript
    console.log("\n2. User continues: 'Hello world'");
    const mutableTranscript2: Transcription = {
      text: "Hello world",
      timestampStart: "2025-01-01T10:00:00.000Z", // Same timestamp!
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    };
    this.stateManager.addTranscription(mutableTranscript2);
    console.log("   Stored as key: 2025-01-01T10:00:00.000Z-Alice");
    console.log("   Key matches previous? YES → OVERWRITES!");
    console.log("   State:", this.stateManager.getActiveVersion()?.transcriptions);

    // Simulate Vexa finalizing transcript
    console.log("\n3. Vexa finalizes: 'Hello world' (final)");
    const finalTranscript: Transcription = {
      text: "Hello world",
      timestampStart: "2025-01-01T10:00:00.000Z", // Same timestamp
      timestampEnd: "2025-01-01T10:00:02.200Z", // More precise end
      speaker: "Alice",
    };
    this.stateManager.addTranscription(finalTranscript);
    console.log("   Stored as key: 2025-01-01T10:00:00.000Z-Alice");
    console.log("   Same key → OVERWRITES mutable with final version");
    console.log("   Final State:", this.stateManager.getActiveVersion()?.transcriptions);
  }
}

// Output:
// 1. User starts speaking: 'Hello wor...'
//    Stored as key: 2025-01-01T10:00:00.000Z-Alice
//    State: {
//      '2025-01-01T10:00:00.000Z-Alice': {
//        text: 'Hello wor',
//        timestampStart: '2025-01-01T10:00:00.000Z',
//        timestampEnd: '2025-01-01T10:00:01.000Z',
//        speaker: 'Alice'
//      }
//    }
//
// 2. User continues: 'Hello world'
//    Stored as key: 2025-01-01T10:00:00.000Z-Alice
//    Key matches previous? YES → OVERWRITES!
//    State: {
//      '2025-01-01T10:00:00.000Z-Alice': {
//        text: 'Hello world',
//        timestampStart: '2025-01-01T10:00:00.000Z',
//        timestampEnd: '2025-01-01T10:00:02.000Z',
//        speaker: 'Alice'
//      }
//    }
//
// 3. Vexa finalizes: 'Hello world' (final)
//    Stored as key: 2025-01-01T10:00:00.000Z-Alice
//    Same key → OVERWRITES mutable with final version
//    Final State: {
//      '2025-01-01T10:00:00.000Z-Alice': {
//        text: 'Hello world',
//        timestampStart: '2025-01-01T10:00:00.000Z',
//        timestampEnd: '2025-01-01T10:00:02.200Z',
//        speaker: 'Alice'
//      }
//    }
```

---

### Example 6: Error Scenarios and Edge Cases

```typescript
// Edge cases and error handling

class EdgeCaseDemo {
  private framework: DNAFrontendFramework;
  private stateManager: StateManager;

  constructor() {
    this.framework = new DNAFrontendFramework(configuration);
    this.stateManager = this.framework.getStateManager();
  }

  demonstrateEdgeCases() {
    console.log("=== Edge Case 1: No Active Version ===");
    const transcript: Transcription = {
      text: "This will be lost",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    };

    console.log("Attempting to add transcript without active version");
    this.stateManager.addTranscription(transcript);
    console.log("Result: Transcript silently dropped (no error)");
    console.log("Active version:", this.stateManager.getActiveVersionId());
    console.log("Versions:", this.stateManager.getVersions().length);

    console.log("\n=== Edge Case 2: Switching to Deleted Version ===");
    this.stateManager.setVersion(1, { name: "Version 1" });
    const state1 = this.stateManager.getState();
    console.log("Created Version 1");
    console.log("Active version ID:", state1.activeVersion);

    // Add transcript
    this.stateManager.addTranscription(transcript);
    console.log("Added transcript to Version 1");

    // Try to switch to non-existent Version 99
    console.log("Switching to Version 99 (doesn't exist yet)");
    this.stateManager.setVersion(99);
    const state99 = this.stateManager.getState();
    console.log("Result: Auto-created new Version 99");
    console.log("Active version ID:", state99.activeVersion);
    console.log("Total versions:", state99.versions.length);

    console.log("\n=== Edge Case 3: Duplicate Transcript Keys ===");
    this.stateManager.setVersion(1);

    const transcript1: Transcription = {
      text: "First attempt",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    };
    this.stateManager.addTranscription(transcript1);

    const transcript2: Transcription = {
      text: "Second attempt (overwrites)",
      timestampStart: "2025-01-01T10:00:00.000Z", // Same timestamp
      timestampEnd: "2025-01-01T10:00:02.500Z",
      speaker: "Alice", // Same speaker
    };
    this.stateManager.addTranscription(transcript2);

    const version1 = this.stateManager.getActiveVersion();
    console.log("Transcripts in Version 1:", Object.keys(version1?.transcriptions || {}).length);
    console.log(
      "Final text:",
      Object.values(version1?.transcriptions || {})[0]?.text
    );
    console.log("Result: Second transcript overwrote first (expected behavior)");

    console.log("\n=== Edge Case 4: Version IDs as Numbers vs Strings ===");
    const version = this.stateManager.getVersion(1);
    console.log("Stored version ID type:", typeof version?.id);
    console.log("Stored version ID value:", version?.id);
    console.log("Active version (number):", typeof this.stateManager.getActiveVersionId());
    console.log("Active version value:", this.stateManager.getActiveVersionId());
    console.log(
      "Result: IDs stored as strings internally, but operations accept numbers"
    );
  }
}

// Usage
const edgeCases = new EdgeCaseDemo();
edgeCases.demonstrateEdgeCases();
```

---

## Key Patterns to Remember

### Pattern 1: Setup → Version → Join → Transcribe
```typescript
const framework = new DNAFrontendFramework(config);
framework.setVersion(1);        // Must happen BEFORE joining
await framework.joinMeeting(id); // Now transcripts go to version 1
```

### Pattern 2: Version Isolation
```typescript
// Each version is completely isolated
framework.setVersion(1);
// ... receives transcripts ...

framework.setVersion(2);
// ... receives DIFFERENT transcripts ...
// Version 1 transcripts are untouched
```

### Pattern 3: Listener Pattern
```typescript
framework.subscribeToStateChanges((state) => {
  // Called whenever ANYTHING changes
  // - New transcript received
  // - Version switched
  // - Notes updated
});
```

### Pattern 4: Transcript Key Format
```typescript
// Key = "{timestampStart}-{speaker}"
// Examples:
// "2025-01-01T10:00:00.000Z-Alice"
// "2025-01-01T10:00:05.000Z-Bob"

// Same key = overwrites (handles mutable→finalized)
// Different key = different slot
```

### Pattern 5: State Tree Navigation
```typescript
const state = stateManager.getState();
state.versions
  .find((v) => v.id === versionId)?.transcriptions[key]; // Access specific transcript
```

---

## Testing Integration

```typescript
// Test fixture
describe("Version-Specific Transcription", () => {
  let framework: DNAFrontendFramework;
  let stateManager: StateManager;

  beforeEach(() => {
    framework = new DNAFrontendFramework(configuration);
    stateManager = framework.getStateManager();
  });

  test("Transcripts route to active version", () => {
    stateManager.setVersion(1);

    const transcript: Transcription = {
      text: "Hello",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    };

    stateManager.addTranscription(transcript);

    const version1 = stateManager.getVersion(1);
    expect(Object.keys(version1?.transcriptions || {}).length).toBe(1);
  });

  test("Version switching preserves previous transcripts", () => {
    stateManager.setVersion(1);
    stateManager.addTranscription({
      text: "Transcript 1",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    });

    stateManager.setVersion(2);

    const version1 = stateManager.getVersion(1);
    expect(Object.keys(version1?.transcriptions || {}).length).toBe(1);
  });

  test("Transcripts route to new active version", () => {
    stateManager.setVersion(1);
    stateManager.setVersion(2);

    stateManager.addTranscription({
      text: "Transcript 2",
      timestampStart: "2025-01-01T10:00:00.000Z",
      timestampEnd: "2025-01-01T10:00:02.000Z",
      speaker: "Alice",
    });

    const version2 = stateManager.getVersion(2);
    expect(Object.keys(version2?.transcriptions || {}).length).toBe(1);

    const version1 = stateManager.getVersion(1);
    expect(Object.keys(version1?.transcriptions || {}).length).toBe(0);
  });
});
```

---

## Performance Considerations

### Transcript Key Storage
- **Pros**: Fast lookup by key, easy deduplication
- **Cons**: Requires sorting for display
- **Optimization**: Memoize sorted transcripts in React

### State Listener Notifications
- **Current**: Listeners called on every change
- **Optimization**: Debounce listeners if many rapid updates
- **Example**: `debounce(notifyListeners, 100ms)`

### Large Transcript Collections
- **Consider**: Virtualization for 1000+ transcripts
- **Example**: Use `react-window` for transcript list rendering

### Version Count Limit
- **Recommendation**: Soft limit at 100 versions
- **Why**: Each version stores full transcription map in memory
- **Mitigation**: Archive old versions to storage

---

## Common Gotchas

1. **Forgetting to set version before join**
   - Result: Transcripts silently dropped
   - Fix: Always `setVersion()` before `joinMeeting()`

2. **Expecting version IDs as numbers**
   - Result: Comparison failures (`"1" !== 1`)
   - Fix: StateManager normalizes to strings internally

3. **Not unsubscribing from state changes**
   - Result: Memory leaks in React
   - Fix: Always call unsubscribe function on cleanup

4. **Modifying state directly**
   - Result: Changes not notified to listeners
   - Fix: Always use `stateManager.setVersion()`, etc.

5. **Assuming no active version = error**
   - Result: Confusion when transcripts silently drop
   - Fix: Check `getActiveVersionId()` returns non-zero

