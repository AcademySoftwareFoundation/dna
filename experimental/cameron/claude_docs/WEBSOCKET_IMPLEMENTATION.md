# WebSocket Implementation for Vexa Transcription

## Overview

The Qt/Python frontend now uses **WebSocket streaming** for real-time Vexa transcription instead of HTTP polling. This provides significantly better performance and lower latency for live transcript updates.

## What Changed

### Before (HTTP Polling)
- Used `requests` library to poll Vexa API every 1 second
- High network overhead (HTTP request/response for each poll)
- Up to 1 second latency between transcript updates
- Duplicate detection required via `_seen_segment_ids`
- Could not distinguish mutable vs finalized segments in real-time

### After (WebSocket Streaming)
- Uses `QWebSocket` (PySide6) for persistent connection
- Real-time push updates from server
- Near-zero latency for transcript segments
- Event-driven architecture with distinct handlers for:
  - `transcript.initial` - Initial transcript dump
  - `transcript.mutable` - In-progress segments (may change)
  - `transcript.finalized` - Completed segments (final)
  - `meeting.status` - Meeting state changes
- Sophisticated segment merging based on absolute UTC timestamps
- Automatic reconnection with exponential backoff

## New Files

### 1. `services/vexa_websocket_service.py`
WebSocket service class that handles:
- Connection management (connect, disconnect, reconnect)
- Subscription to meeting transcripts
- Message parsing and event routing
- Segment conversion from Vexa format to internal format
- Keep-alive ping mechanism

**Key Features:**
- Automatic reconnection (up to 5 attempts with exponential backoff)
- Qt Signal/Slot integration for event handling
- Supports multiple meeting subscriptions
- Proper cleanup on disconnection

### 2. `services/transcript_utils.py`
Utility functions for transcript processing (ported from TypeScript version):
- `merge_segments_by_absolute_utc()` - Merge and deduplicate segments by timestamp
- `group_segments_by_speaker()` - Group consecutive segments from same speaker
- `split_text_into_sentence_chunks()` - Split long text without breaking sentences
- `format_transcript_for_display()` - Format speaker groups for readable display
- `SpeakerGroup` class - Represents grouped segments with metadata

**Key Features:**
- UTC timestamp-based deduplication
- Speaker grouping for readability
- Sentence-aware text chunking (max 512 chars)
- Timestamp formatting (HH:MM:SS)

## Modified Files

### `services/backend_service.py`

**Added:**
- `_vexa_websocket` - WebSocket service instance
- `_all_segments` - Complete segment list from WebSocket
- `_mutable_segment_ids` - Track which segments are still being transcribed
- `_seen_segment_ids` - Track processed segments per version

**Replaced:**
- `_start_transcription_polling()` → `_start_transcription_websocket()`
- `_stop_transcription_polling()` → `_stop_transcription_websocket()`
- `_poll_transcription()` → Multiple event handlers:
  - `_on_websocket_connected()`
  - `_on_websocket_disconnected()`
  - `_on_websocket_error()`
  - `_on_transcript_initial()`
  - `_on_transcript_mutable()`
  - `_on_transcript_finalized()`
  - `_on_meeting_status_changed()`
  - `_update_transcript_display()`

**Improved:**
- Better transcript formatting with speaker grouping
- Proper segment merging to avoid duplicates
- Version-specific transcript routing (segments only go to active version)
- Automatic cleanup when switching versions

## How It Works

### Connection Flow

1. **Join Meeting** (`joinMeeting()`):
   - Creates Vexa bot via HTTP API (`VexaService.start_transcription()`)
   - Gets meeting ID (format: `platform/native_meeting_id/internal_id`)
   - Initializes WebSocket service with API key and URL
   - Connects to `wss://api.cloud.vexa.ai/ws?api_key=xxx`

2. **Subscribe to Meeting**:
   - Sends subscription message:
     ```json
     {
       "action": "subscribe",
       "meetings": [{
         "platform": "google_meet",
         "native_id": "abc-defg-hij",
         "native_meeting_id": "abc-defg-hij"
       }]
     }
     ```

3. **Receive Transcript Events**:
   - Server pushes events in real-time
   - Events are parsed and routed to appropriate handlers
   - Segments are merged and deduplicated
   - UI is updated via Qt signals

4. **Leave Meeting** (`leaveMeeting()`):
   - Unsubscribes from meeting
   - Stops Vexa bot via HTTP API
   - Closes WebSocket connection
   - Clears segment tracking

### Segment Processing Pipeline

```
WebSocket Event → _on_transcript_mutable/finalized()
    ↓
merge_segments_by_absolute_utc() - Deduplicate by UTC timestamp
    ↓
Filter new segments (not in _seen_segment_ids)
    ↓
group_segments_by_speaker() - Group consecutive same-speaker segments
    ↓
format_transcript_for_display() - Format with timestamps and speakers
    ↓
Append to _current_transcript
    ↓
Emit currentTranscriptChanged signal
    ↓
Save to backend via _save_transcript_to_active_version()
```

### Segment Deduplication

Segments are uniquely identified by their `absolute_start_time` (UTC timestamp). This prevents duplicates when:
- Mutable segments are updated with new text
- Finalized segments replace mutable ones
- Reconnecting to an active meeting

**Merge Strategy:**
1. Key by `absolute_start_time`
2. If segment exists, check `updated_at` timestamp
3. Only replace if incoming segment is newer
4. Sort by timestamp after merging

### Version-Specific Routing

When switching between versions during an active meeting:
1. Current version's `_seen_segment_ids` is preserved
2. New version marks all existing segments as "seen" via `_mark_current_segments_as_seen()`
3. Only **new** segments arriving after the switch are routed to the new version
4. Previous versions retain their captured transcripts

## Configuration

### WebSocket URL
The WebSocket URL is automatically derived from the API URL:
- `https://api.cloud.vexa.ai` → `wss://api.cloud.vexa.ai/ws`
- `http://localhost:8000` → `ws://localhost:8000/ws`

### Reconnection Settings
In `vexa_websocket_service.py`:
```python
self._max_reconnect_attempts = 5  # Maximum reconnection attempts
self._reconnect_delay = 1000  # Base delay in ms (exponential backoff)
```

### Ping Interval
Keep-alive pings sent every 30 seconds:
```python
self._ping_timer.start(30000)  # 30 seconds
```

## Benefits Over TypeScript Version

The Qt/Python implementation has some advantages:

1. **Native Qt Integration**: `QWebSocket` integrates seamlessly with Qt's event loop
2. **Signal/Slot Pattern**: More natural event handling than TypeScript callbacks
3. **Desktop Performance**: Native application without browser overhead
4. **Type Safety**: Python type hints with Qt's property system
5. **Simpler Async**: No need for async/await complexity - Qt handles it

## Testing

### Manual Testing
1. Start the backend server
2. Launch the Qt application
3. Configure Vexa API key in settings
4. Enter a meeting URL/ID
5. Click "Join Meeting"
6. Observe console output for WebSocket events
7. Check transcript updates in real-time
8. Try switching between versions
9. Click "Leave Meeting" to disconnect

### Debug Output
The implementation includes extensive logging:
- 🟣 `transcript.initial` events
- 🟢 `transcript.mutable` events (in-progress)
- 🔵 `transcript.finalized` events (completed)
- 🟡 `meeting.status` events
- ✅ Connection success
- ❌ Disconnection
- 🔴 Errors

### Verifying Segments
Check console for:
```
🟢 Received mutable transcript: 5 segments
  Processing 5 mutable segments
Transcript updated for version 'shot_010_anim_v003': +5 new segments
  ✓ Saved transcript to version 'shot_010_anim_v003'
```

## Troubleshooting

### WebSocket Won't Connect
- Check API key is set correctly
- Verify API URL is reachable
- Check firewall/proxy settings for WebSocket connections
- Look for error messages in console

### No Transcript Updates
- Verify meeting is active (bot joined successfully)
- Check WebSocket is connected (console shows ✅)
- Ensure a version is selected
- Look for subscription confirmation in console

### Duplicate Segments
- Should not happen with new merge logic
- If seen, check `absolute_start_time` is present on segments
- Verify `_seen_segment_ids` is being populated

### Reconnection Issues
- Check `_max_reconnect_attempts` hasn't been exceeded
- Verify API key hasn't expired
- Look for exponential backoff messages in console

## Future Enhancements

Possible improvements:
1. **Segment highlighting**: Visual indication of mutable vs finalized segments
2. **Offline buffering**: Queue segments when connection drops
3. **Multi-meeting support**: Subscribe to multiple meetings simultaneously
4. **Transcript search**: Search within speaker groups
5. **Export formats**: Export with timestamps and speaker labels
6. **Playback sync**: Sync transcript with video playback (if available)

## References

- TypeScript implementation: `experimental/cameron/frontend_v1/src/lib/websocket-service.ts`
- Vexa API docs: [Vexa WebSocket API](https://docs.vexa.ai/websocket)
- Qt WebSocket docs: [QWebSocket Class](https://doc.qt.io/qt-6/qwebsocket.html)
