# WebSocket Transcription - Quick Start Guide

## For Developers

### Quick Overview
The Qt frontend now uses **WebSocket streaming** for real-time Vexa transcriptions instead of HTTP polling. This provides instant updates with lower latency.

## How to Use

### 1. Basic Setup (No Code Changes Required!)
The WebSocket implementation is a drop-in replacement. Your existing code works without changes:

```python
# Existing code still works exactly the same
backend = BackendService()
backend.vexaApiKey = "your-api-key"
backend.meetingId = "https://meet.google.com/abc-defg-hij"
backend.joinMeeting()  # Now uses WebSocket instead of polling!
```

### 2. What Changed Under the Hood
```python
# BEFORE: HTTP Polling
_poll_transcription()  # Called every 1 second
→ HTTP GET /transcripts/...
→ Parse response
→ Filter new segments
→ Update UI

# AFTER: WebSocket Streaming  
_on_transcript_mutable(segments)  # Called when new speech detected
→ Merge segments
→ Group by speaker
→ Update UI
```

### 3. New Features Available

#### Speaker-Grouped Transcripts
```python
# Transcripts now automatically group consecutive segments by speaker
# and format with timestamps:

[14:32:15] Alice: Hello everyone. Thanks for joining today's review.

[14:32:28] Bob: Great! Let's start with shot 010.
```

#### Mutable vs Finalized Segments
```python
# You can now distinguish between in-progress and completed segments
def _on_transcript_mutable(self, segments):
    # Segments that may still change (speech in progress)
    print("In progress:", segments)

def _on_transcript_finalized(self, segments):
    # Segments that are final (speech completed)
    print("Final:", segments)
```

## API Reference

### VexaWebSocketService

```python
from services.vexa_websocket_service import VexaWebSocketService

# Create service
ws = VexaWebSocketService(api_key="xxx", api_url="https://api.vexa.ai")

# Connect signals
ws.connected.connect(on_connected)
ws.transcriptMutableReceived.connect(on_transcript_mutable)
ws.transcriptFinalizedReceived.connect(on_transcript_finalized)

# Connect to server
ws.connect_to_server()

# Subscribe to meeting
ws.subscribe_to_meeting("google_meet", "abc-defg-hij")

# Later: unsubscribe and disconnect
ws.unsubscribe_from_meeting("google_meet", "abc-defg-hij")
ws.disconnect_from_server()
```

### Transcript Utilities

```python
from services.transcript_utils import (
    merge_segments_by_absolute_utc,
    group_segments_by_speaker,
    format_transcript_for_display
)

# Merge and deduplicate segments
all_segments = merge_segments_by_absolute_utc(prev_segments, new_segments)

# Group consecutive segments by speaker
speaker_groups = group_segments_by_speaker(all_segments)

# Format for display
transcript_text = format_transcript_for_display(speaker_groups)
```

## Common Tasks

### Task 1: Access Real-Time Transcripts
```python
# In your QObject/QWidget:
backend = BackendService()

# Connect to transcript updates
backend.currentTranscriptChanged.connect(self.on_transcript_updated)

def on_transcript_updated(self):
    transcript = backend.currentTranscript
    print(f"Transcript updated: {len(transcript)} chars")
```

### Task 2: Handle Connection Events
```python
# Monitor connection status
backend.meetingStatusChanged.connect(self.on_status_changed)

def on_status_changed(self):
    status = backend.meetingStatus
    if status == "connected":
        print("WebSocket connected and streaming")
    elif status == "error":
        print("Connection error")
```

### Task 3: Process Segments Manually
```python
from services.vexa_websocket_service import VexaWebSocketService

ws = VexaWebSocketService(api_key, api_url)

# Handle segments as they arrive
def on_segments(segments):
    for seg in segments:
        print(f"{seg['speaker']}: {seg['text']}")
        print(f"  Time: {seg['timestamp']}")
        print(f"  Mutable: {seg.get('id') in mutable_ids}")

ws.transcriptMutableReceived.connect(on_segments)
```

### Task 4: Custom Segment Processing
```python
from services.transcript_utils import group_segments_by_speaker

# Get segments from WebSocket
def on_segments(segments):
    # Group by speaker
    groups = group_segments_by_speaker(segments, max_chars=256)
    
    # Process each group
    for group in groups:
        print(f"Speaker: {group.speaker}")
        print(f"Time: {group.timestamp}")
        print(f"Text: {group.combined_text}")
        print(f"Mutable: {group.is_mutable}")
        print()
```

## Debugging

### Enable Debug Output
All WebSocket events are logged to console with emojis:
- 🟣 = Initial transcript
- 🟢 = Mutable segments (in-progress)
- 🔵 = Finalized segments (complete)
- 🟡 = Meeting status change
- ✅ = Connection success
- ❌ = Disconnection
- 🔴 = Error

### Check WebSocket Status
```python
# Check if WebSocket is connected
if backend._vexa_websocket and backend._vexa_websocket.is_connected():
    print("WebSocket connected")
    
    # Get subscribed meetings
    meetings = backend._vexa_websocket.get_subscribed_meetings()
    print(f"Subscribed to: {meetings}")
```

### Debug Segment Processing
```python
# Check segment tracking
print(f"Total segments: {len(backend._all_segments)}")
print(f"Mutable segments: {len(backend._mutable_segment_ids)}")
print(f"Seen segments: {len(backend._seen_segment_ids)}")

# Print last 5 segments
for seg in backend._all_segments[-5:]:
    print(f"{seg.get('speaker')}: {seg.get('text')[:50]}...")
```

## Troubleshooting

### Problem: "WebSocket not connected"
**Solution**: Check API key and URL are set correctly
```python
backend.vexaApiKey = "your-api-key"
backend.vexaApiUrl = "https://api.cloud.vexa.ai"
```

### Problem: "No transcript updates"
**Solution**: Ensure meeting is active and version is selected
```python
# Check meeting status
print(f"Meeting active: {backend.meetingActive}")
print(f"Meeting status: {backend.meetingStatus}")

# Check version selected
print(f"Selected version: {backend.selectedVersionId}")
```

### Problem: "Duplicate segments"
**Solution**: Should not happen with new merge logic. If it does:
```python
# Clear segment tracking
backend._seen_segment_ids.clear()
backend._all_segments.clear()
```

### Problem: "Connection keeps dropping"
**Solution**: Check network/firewall settings for WebSocket
```python
# WebSocket uses WSS (WebSocket Secure) on port 443
# Ensure firewall allows WebSocket connections
# Check if proxy requires WebSocket support
```

## Performance Tips

### 1. Batch Segment Updates
WebSocket events may arrive in rapid succession. The implementation already batches updates, but you can add additional throttling if needed:

```python
from PySide6.QtCore import QTimer

class MyWidget(QWidget):
    def __init__(self):
        super().__init__()
        self._update_timer = QTimer()
        self._update_timer.setSingleShot(True)
        self._update_timer.timeout.connect(self._do_update)
        
        backend.currentTranscriptChanged.connect(self._schedule_update)
    
    def _schedule_update(self):
        # Debounce updates (max once per 100ms)
        self._update_timer.start(100)
    
    def _do_update(self):
        # Actually update UI
        self.transcript_widget.setText(backend.currentTranscript)
```

### 2. Limit Displayed Text
For very long transcripts, consider showing only recent segments:

```python
# Show only last 100 lines
lines = transcript.split('\n')
recent = '\n'.join(lines[-100:])
```

### 3. Use QTextEdit for Large Transcripts
For better performance with large transcripts:

```python
from PySide6.QtWidgets import QTextEdit

transcript_view = QTextEdit()
transcript_view.setReadOnly(True)
transcript_view.setPlainText(backend.currentTranscript)
```

## Migration Guide (From Polling)

If you have custom code that uses the old polling system:

### Before
```python
# Old polling timer
self._transcription_timer = QTimer()
self._transcription_timer.timeout.connect(self._poll_transcription)
self._transcription_timer.start(1000)
```

### After
```python
# WebSocket is automatic - no timer needed!
# Just connect to signals:
backend.currentTranscriptChanged.connect(self.on_transcript_updated)
```

## Examples

### Example 1: Simple Transcript Display
```python
from PySide6.QtWidgets import QWidget, QTextEdit, QVBoxLayout

class TranscriptWidget(QWidget):
    def __init__(self, backend):
        super().__init__()
        self.backend = backend
        
        # Create UI
        self.text_edit = QTextEdit()
        self.text_edit.setReadOnly(True)
        
        layout = QVBoxLayout()
        layout.addWidget(self.text_edit)
        self.setLayout(layout)
        
        # Connect signals
        backend.currentTranscriptChanged.connect(self.update_transcript)
    
    def update_transcript(self):
        self.text_edit.setPlainText(self.backend.currentTranscript)
```

### Example 2: Speaker Highlighting
```python
from PySide6.QtGui import QTextCharFormat, QColor

def highlight_speakers(text_edit, transcript):
    cursor = text_edit.textCursor()
    cursor.movePosition(cursor.Start)
    
    # Define colors for speakers
    speaker_colors = {
        'Alice': QColor(255, 200, 200),
        'Bob': QColor(200, 255, 200),
        'Charlie': QColor(200, 200, 255),
    }
    
    for line in transcript.split('\n'):
        # Extract speaker name
        if ':' in line:
            speaker = line.split(':')[0].split(']')[-1].strip()
            
            # Apply color
            if speaker in speaker_colors:
                fmt = QTextCharFormat()
                fmt.setBackground(speaker_colors[speaker])
                cursor.setCharFormat(fmt)
        
        cursor.insertText(line + '\n')
```

### Example 3: Export with Metadata
```python
import json
from datetime import datetime

def export_transcript_json(backend, filename):
    data = {
        'meeting_id': backend.meetingId,
        'exported_at': datetime.now().isoformat(),
        'total_segments': len(backend._all_segments),
        'segments': [
            {
                'speaker': seg.get('speaker'),
                'text': seg.get('text'),
                'timestamp': seg.get('absolute_start_time'),
                'is_finalized': seg.get('id') not in backend._mutable_segment_ids
            }
            for seg in backend._all_segments
        ]
    }
    
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)
```

## Next Steps

1. **Run the app** and join a meeting to see WebSocket in action
2. **Check console output** to see real-time events
3. **Review documentation**:
   - `WEBSOCKET_IMPLEMENTATION.md` - Detailed technical docs
   - `ARCHITECTURE_COMPARISON.md` - Before/after comparison
   - `WEBSOCKET_MIGRATION_SUMMARY.md` - Implementation summary

## Support

Questions? Check:
1. Console output for WebSocket event logs
2. `WEBSOCKET_IMPLEMENTATION.md` for detailed docs
3. `vexa_websocket_service.py` source code
4. Vexa API docs at https://docs.vexa.ai
