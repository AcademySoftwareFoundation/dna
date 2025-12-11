"""
Backend API Service
Handles communication with the FastAPI backend server
ONLY uses backend API - no local storage
"""

import requests
from io import StringIO
from config import BACKEND_URL, CONNECTION_RETRY_ATTEMPTS, DEBUG_MODE, REQUEST_TIMEOUT
from PySide6.QtCore import Property, QObject, QThread, QTimer, Signal, Slot

from services.transcript_utils import (
    format_transcript_for_display,
    group_segments_by_speaker,
    merge_segments_by_absolute_utc,
)
from services.vexa_service import VexaService
from services.vexa_websocket_service import VexaWebSocketService


class LLMGenerationWorker(QThread):
    """Worker thread for async LLM note generation"""

    finished = Signal(str)  # Emits AI notes when done
    error = Signal(str)  # Emits error message if failed

    def __init__(self, backend_url, version_id, transcript, prompt, provider, api_key, timeout):
        super().__init__()
        self.backend_url = backend_url
        self.version_id = version_id
        self.transcript = transcript
        self.prompt = prompt
        self.provider = provider
        self.api_key = api_key
        self.timeout = timeout

    def run(self):
        """Execute LLM generation in background thread"""
        try:
            response = requests.post(
                f"{self.backend_url}/versions/{self.version_id}/generate-ai-notes",
                json={
                    "version_id": self.version_id,
                    "transcript": self.transcript,
                    "prompt": self.prompt,
                    "provider": self.provider,
                    "api_key": self.api_key,
                },
                timeout=self.timeout
            )
            response.raise_for_status()

            data = response.json()
            version = data.get("version", {})
            ai_notes = version.get("ai_notes", "")

            self.finished.emit(ai_notes)

        except Exception as e:
            self.error.emit(str(e))


class BackendService(QObject):
    """Service for communicating with the backend API"""

    # Signals for property changes
    userNameChanged = Signal()
    meetingIdChanged = Signal()
    selectedVersionIdChanged = Signal()
    selectedVersionNameChanged = Signal()
    selectedVersionShotGridIdChanged = Signal()
    currentNotesChanged = Signal()
    currentAiNotesChanged = Signal()
    currentTranscriptChanged = Signal()
    stagingNoteChanged = Signal()
    currentVersionNoteChanged = Signal()

    # LLM API Keys and Prompts
    openaiApiKeyChanged = Signal()
    openaiPromptChanged = Signal()
    claudeApiKeyChanged = Signal()
    claudePromptChanged = Signal()
    geminiApiKeyChanged = Signal()
    geminiPromptChanged = Signal()

    # ShotGrid
    shotgridProjectsChanged = Signal()
    shotgridPlaylistsChanged = Signal()
    selectedPlaylistIdChanged = Signal()
    lastLoadedPlaylistIdChanged = Signal()
    shotgridUrlChanged = Signal()
    shotgridApiKeyChanged = Signal()
    shotgridScriptNameChanged = Signal()
    shotgridAuthorEmailChanged = Signal()
    sgSyncTranscriptsChanged = Signal()
    sgDnaTranscriptEntityChanged = Signal()
    sgTranscriptFieldChanged = Signal()
    sgVersionFieldChanged = Signal()
    sgPlaylistFieldChanged = Signal()
    prependSessionHeaderChanged = Signal()
    includeStatusesChanged = Signal()
    versionStatusesChanged = Signal()
    selectedVersionStatusChanged = Signal()

    # Versions
    versionsLoaded = Signal()
    hasShotGridVersionsChanged = Signal()
    pinnedVersionIdChanged = Signal()

    # Sync signals
    syncCompleted = Signal(
        int, int, int, int, bool
    )  # synced, skipped, failed, attachments, statuses_updated

    # Vexa/Meeting signals
    meetingStatusChanged = Signal()
    vexaApiKeyChanged = Signal()
    vexaApiUrlChanged = Signal()

    # Attachments
    attachmentsChanged = Signal()

    def __init__(self, backend_url=None):
        super().__init__()
        # Use provided URL, environment variable, or default
        self._backend_url = backend_url or BACKEND_URL
        self._request_timeout = REQUEST_TIMEOUT
        self._retry_attempts = CONNECTION_RETRY_ATTEMPTS

        if DEBUG_MODE:
            print(f"[DEBUG] Backend URL: {self._backend_url}")
            print(f"[DEBUG] Request timeout: {self._request_timeout}s")
            print(f"[DEBUG] Retry attempts: {self._retry_attempts}")

        self._check_backend_connection()

        # User info
        self._user_name = ""
        self._meeting_id = ""

        # Vexa integration
        self._vexa_api_key = ""
        self._vexa_api_url = "https://api.cloud.vexa.ai"
        self._vexa_service = None
        self._vexa_websocket = None  # WebSocket service for real-time streaming
        self._meeting_active = False
        self._meeting_status = (
            "disconnected"  # disconnected, connecting, connected, error
        )
        self._current_meeting_id = ""
        self._transcription_timer = None

        # WebSocket segment tracking
        self._all_segments = []  # All segments received via WebSocket
        self._mutable_segment_ids = set()  # IDs of segments that are still mutable
        self._seen_segment_ids = {}  # Dict: segment_key -> text_length (to detect updates)
        self._current_version_segments = {}  # Dict: segment_key -> segment (for O(1) lookups)
        self._base_transcript = ""  # Transcript that existed when version was selected

        # Current version
        self._selected_version_id = None
        self._selected_version_name = ""
        self._selected_version_shotgrid_id = None
        self._pinned_version_id = None  # Track which version is pinned for transcript streaming

        # Notes and transcript
        self._current_notes = ""
        self._current_ai_notes = ""
        self._current_transcript = ""
        self._staging_note = ""

        # LLM settings
        self._openai_api_key = ""
        self._claude_api_key = ""
        self._gemini_api_key = ""

        # Default LLM prompt (short mode from llm_prompts.factory.yaml)
        default_prompt = """You are a helpful assistant that reviews transcripts of artist review meetings and generates concise, readable summaries of the discussions.

The meetings are focused on reviewing creative work submissions ("shots") for a movie. Each meeting involves artists and reviewers (supervisors, leads, etc.) discussing feedback, decisions, and next steps for each shot.

Your goal is to recreate short, clear, and accurate abbreviated conversations that capture:
- Key feedback points
- Decisions made (e.g., approved/finalled shots)
- Any actionable tasks for the artist

Write in a concise, natural tone that's easy for artists to quickly scan and understand what was said and what they need to do next."""

        self._openai_prompt = default_prompt
        self._claude_prompt = default_prompt
        self._gemini_prompt = default_prompt

        # ShotGrid
        self._shotgrid_projects = []
        self._shotgrid_playlists = []
        self._shotgrid_projects_data = []
        self._shotgrid_playlists_data = []
        self._selected_project_id = None
        self._selected_playlist_id = None
        self._last_loaded_playlist_id = None  # Track which playlist was last loaded
        self._has_shotgrid_versions = False
        self._shotgrid_url = ""
        self._shotgrid_api_key = ""
        self._shotgrid_script_name = ""
        self._shotgrid_author_email = ""
        self._prepend_session_header = False
        self._include_statuses = False

        # DNA Transcript Settings
        self._sg_sync_transcripts = False
        self._sg_dna_transcript_entity = ""  # e.g., "CustomEntity01"
        self._sg_transcript_field = "sg_body"
        self._sg_version_field = "sg_version"
        self._sg_playlist_field = "sg_playlist"

        self._version_statuses = []  # List of display names for UI
        self._version_status_codes = {}  # Dict mapping display names to codes
        self._selected_version_status = ""

        # Per-version notes storage (version_id -> note_text)
        self._version_notes = {}
        self._current_version_note = ""

        # Transcript segment tracking for version-specific routing
        self._version_activation_time = (
            None  # Timestamp when current version was activated
        )
        self._seen_segment_ids = (
            set()
        )  # Track which segment IDs we've already processed for this version
        self._resume_timestamp = None  # Timestamp when transcript was resumed (to filter out old segments)
        self._pause_cutoff_time = None  # Latest absolute_start_time when pause was initiated

        # Debouncing for transcript updates (improves UI responsiveness)
        self._transcript_update_timer = QTimer()
        self._transcript_update_timer.setSingleShot(True)
        self._transcript_update_timer.timeout.connect(self._emit_transcript_changed)
        self._pending_transcript_update = False

        # LLM generation worker thread (for async processing)
        self._llm_worker = None

        # Load settings from .env file
        self.load_settings()

        # Check if ShotGrid is enabled and load projects
        self._check_shotgrid_enabled()

        # Create a default scratch version for notes
        self._create_scratch_version()

    def _check_backend_connection(self):
        """Check if backend is running"""
        try:
            response = requests.get(f"{self._backend_url}/config", timeout=2)
            if response.status_code == 200:
                print(f"✓ Connected to backend at {self._backend_url}")
                return True
        except requests.exceptions.RequestException as e:
            print(f"✗ ERROR: Cannot connect to backend at {self._backend_url}")
            print(f"  Please start the backend server first!")
            print(f"  Error: {e}")
            return False

    def _create_scratch_version(self):
        """Create a default scratch version that's always available"""
        try:
            scratch_version = {
                "id": "_scratch",
                "name": "Scratch Notes",
                "user_notes": "",
                "ai_notes": "",
                "transcript": "",
                "status": "",
            }
            response = self._make_request("POST", "/versions", json=scratch_version)
            if response.status_code == 200:
                self._selected_version_id = "_scratch"
                self._version_notes["_scratch"] = ""
                self._current_version_note = ""
                self.selectedVersionIdChanged.emit()
                self.selectedVersionNameChanged.emit()
                print("✓ Created default scratch version")
        except Exception as e:
            print(f"Warning: Could not create scratch version: {e}")

    def _check_shotgrid_enabled(self):
        """Check if ShotGrid is enabled and load projects if it is"""
        try:
            response = requests.get(f"{self._backend_url}/config", timeout=2)
            if response.status_code == 200:
                data = response.json()
                shotgrid_enabled = data.get("shotgrid_enabled", False)
                if shotgrid_enabled:
                    print("✓ ShotGrid is enabled, loading projects...")
                    self.loadShotGridProjects()
                else:
                    print("ShotGrid is not enabled")
        except Exception as e:
            print(f"Could not check ShotGrid status: {e}")

    def _make_request(self, method, endpoint, **kwargs):
        """Make a request to the backend API with error handling and retries"""
        url = f"{self._backend_url}{endpoint}"

        # Set timeout if not provided
        if "timeout" not in kwargs:
            kwargs["timeout"] = self._request_timeout

        # Retry logic
        last_exception = None
        for attempt in range(self._retry_attempts):
            try:
                if DEBUG_MODE and attempt > 0:
                    print(f"[DEBUG] Retry attempt {attempt + 1}/{self._retry_attempts}")

                response = requests.request(method, url, **kwargs)
                response.raise_for_status()
                return response

            except requests.exceptions.RequestException as e:
                last_exception = e
                if attempt < self._retry_attempts - 1:
                    # Don't print on last attempt (will be handled below)
                    if DEBUG_MODE:
                        print(f"[DEBUG] Request failed (attempt {attempt + 1}): {e}")
                    continue

        # All retries failed
        print(
            f"ERROR: API request failed after {self._retry_attempts} attempts: {method} {endpoint}"
        )
        print(f"  Error: {last_exception}")
        raise last_exception

    # ===== User Properties =====

    @Property(str, notify=userNameChanged)
    def userName(self):
        return self._user_name

    @userName.setter
    def userName(self, value):
        if self._user_name != value:
            self._user_name = value
            self.userNameChanged.emit()

    @Property(str, notify=meetingIdChanged)
    def meetingId(self):
        return self._meeting_id

    @meetingId.setter
    def meetingId(self, value):
        if self._meeting_id != value:
            self._meeting_id = value
            self.meetingIdChanged.emit()

    # ===== Version Properties =====

    @Property(str, notify=selectedVersionIdChanged)
    def selectedVersionId(self):
        return self._selected_version_id if self._selected_version_id else ""

    @Property(str, notify=selectedVersionNameChanged)
    def selectedVersionName(self):
        return self._selected_version_name

    @Property(str, notify=selectedVersionShotGridIdChanged)
    def selectedVersionShotGridId(self):
        return (
            str(self._selected_version_shotgrid_id)
            if self._selected_version_shotgrid_id
            else ""
        )

    @Property(str, notify=currentNotesChanged)
    def currentNotes(self):
        return self._current_notes

    @Property(str, notify=currentAiNotesChanged)
    def currentAiNotes(self):
        return self._current_ai_notes

    @Property(str, notify=currentTranscriptChanged)
    def currentTranscript(self):
        return self._current_transcript

    @Property(str, notify=stagingNoteChanged)
    def stagingNote(self):
        return self._staging_note

    @stagingNote.setter
    def stagingNote(self, value):
        if self._staging_note != value:
            self._staging_note = value
            self.stagingNoteChanged.emit()

    @Property(str, notify=currentVersionNoteChanged)
    def currentVersionNote(self):
        return self._current_version_note

    # ===== LLM Properties =====

    @Property(str, notify=openaiApiKeyChanged)
    def openaiApiKey(self):
        return self._openai_api_key

    @openaiApiKey.setter
    def openaiApiKey(self, value):
        if self._openai_api_key != value:
            self._openai_api_key = value
            self.openaiApiKeyChanged.emit()
            self.save_setting("openai_api_key", value)

    @Property(str, notify=openaiPromptChanged)
    def openaiPrompt(self):
        return self._openai_prompt

    @openaiPrompt.setter
    def openaiPrompt(self, value):
        if self._openai_prompt != value:
            self._openai_prompt = value
            self.openaiPromptChanged.emit()
            self.save_setting("openai_prompt", value)

    @Property(str, notify=claudeApiKeyChanged)
    def claudeApiKey(self):
        return self._claude_api_key

    @claudeApiKey.setter
    def claudeApiKey(self, value):
        if self._claude_api_key != value:
            self._claude_api_key = value
            self.claudeApiKeyChanged.emit()
            self.save_setting("claude_api_key", value)

    @Property(str, notify=claudePromptChanged)
    def claudePrompt(self):
        return self._claude_prompt

    @claudePrompt.setter
    def claudePrompt(self, value):
        if self._claude_prompt != value:
            self._claude_prompt = value
            self.claudePromptChanged.emit()
            self.save_setting("claude_prompt", value)

    @Property(str, notify=geminiApiKeyChanged)
    def geminiApiKey(self):
        return self._gemini_api_key

    @geminiApiKey.setter
    def geminiApiKey(self, value):
        if self._gemini_api_key != value:
            self._gemini_api_key = value
            self.geminiApiKeyChanged.emit()
            self.save_setting("gemini_api_key", value)

    @Property(str, notify=geminiPromptChanged)
    def geminiPrompt(self):
        return self._gemini_prompt

    @geminiPrompt.setter
    def geminiPrompt(self, value):
        if self._gemini_prompt != value:
            self._gemini_prompt = value
            self.geminiPromptChanged.emit()
            self.save_setting("gemini_prompt", value)

    # ===== Version Management =====

    def fetch_versions(self):
        """Fetch versions from backend API"""
        try:
            response = self._make_request("GET", "/versions")
            data = response.json()

            versions = data.get("versions", [])
            print(f"Fetched {len(versions)} versions from backend")

            # Convert to format expected by model
            return [{"id": v["id"], "description": v["name"]} for v in versions]
        except Exception as e:
            print(f"ERROR: Failed to fetch versions: {e}")
            return []

    @Slot(str)
    def selectVersion(self, version_id):
        """Select a version and load its data from backend"""
        print(f"\nSelecting version: {version_id}")

        try:
            response = self._make_request("GET", f"/versions/{version_id}")
            data = response.json()
            version = data.get("version", {})

            # Update selected version
            self._selected_version_id = version.get("id", "")
            self._selected_version_name = version.get("name", "")
            self._selected_version_shotgrid_id = version.get("shotgrid_version_id")

            # Load notes and transcript
            self._current_notes = version.get("user_notes", "")
            self._current_ai_notes = version.get("ai_notes", "")
            self._current_transcript = version.get("transcript", "")

            # Load status (convert code to display name for UI)
            status_code = version.get("status", "")
            # Find the display name for this code
            self._selected_version_status = ""
            for display_name, code in self._version_status_codes.items():
                if code == status_code:
                    self._selected_version_status = display_name
                    break

            # Load per-version note
            self._current_version_note = self._version_notes.get(version_id, "")

            # Clear staging
            self._staging_note = ""

            # Reset transcript tracking for new version - start fresh
            # BUT only if this version is not pinned, or if it IS the pinned version
            # (When a version is pinned, only that version gets new transcript segments)
            if not self._pinned_version_id or self._pinned_version_id == version_id:
                import time

                self._version_activation_time = time.time()
                self._seen_segment_ids = {}  # Clear the dict of seen segments (timestamp -> length)
                self._current_version_segments = {}  # Clear segments dict for new version
                self._base_transcript = (
                    self._current_transcript
                )  # Save existing transcript as base

                # Mark all CURRENT segments in the meeting as "seen" immediately
                # so we only capture NEW segments that arrive after this point
                self._mark_current_segments_as_seen()

                print(
                    f"  Reset transcript tracking - will only capture new segments from now on"
                )
            else:
                # A different version is pinned, so this version won't receive new transcripts
                pinned_version_name = self._get_version_name(self._pinned_version_id)
                print(
                    f"  Note: Version '{pinned_version_name}' is pinned - transcripts will continue streaming to that version only"
                )

            # Emit signals
            self.selectedVersionIdChanged.emit()
            self.selectedVersionNameChanged.emit()
            self.selectedVersionShotGridIdChanged.emit()
            self.currentNotesChanged.emit()
            self.currentAiNotesChanged.emit()
            self.currentTranscriptChanged.emit()
            self.currentVersionNoteChanged.emit()
            self.stagingNoteChanged.emit()
            self.selectedVersionStatusChanged.emit()

            print(f"✓ Loaded version '{self._selected_version_name}'")
            print(f"  User notes: {len(self._current_notes)} chars")
            print(f"  AI notes: {len(self._current_ai_notes)} chars")
            print(f"  Version note: {len(self._current_version_note)} chars")
            print(f"  Transcript: {len(self._current_transcript)} chars")

        except Exception as e:
            print(f"ERROR: Failed to select version: {e}")

    @Slot(str)
    def saveNoteToVersion(self, note_text):
        """Save a note to the currently selected version via backend API"""
        if not note_text.strip():
            print("Note text is empty, not saving")
            return

        if not self._selected_version_id:
            print("ERROR: No version selected")
            return

        print(
            f"Saving note to version '{self._selected_version_name}': {note_text[:50]}..."
        )

        try:
            response = self._make_request(
                "POST",
                f"/versions/{self._selected_version_id}/notes",
                json={"version_id": self._selected_version_id, "note_text": note_text},
            )

            data = response.json()
            version = data.get("version", {})

            # Update current notes from backend response
            self._current_notes = version.get("user_notes", "")
            self.currentNotesChanged.emit()

            # Clear staging
            self._staging_note = ""
            self.stagingNoteChanged.emit()

            print(f"✓ Note saved successfully")

        except Exception as e:
            print(f"ERROR: Failed to save note: {e}")

    @Slot()
    def generateNotes(self):
        """Generate AI notes for the current version (async with QThread)"""
        if not self._selected_version_id:
            print("ERROR: No version selected")
            return

        if not self._current_transcript:
            print("ERROR: No transcript available for AI note generation")
            return

        # Check if a worker is already running
        if self._llm_worker and self._llm_worker.isRunning():
            print("WARNING: LLM generation already in progress, please wait...")
            return

        # Determine which provider, prompt, and API key to use based on API keys
        provider = None
        prompt = None
        api_key = None

        if self._openai_api_key:
            provider = "openai"
            prompt = self._openai_prompt
            api_key = self._openai_api_key
        elif self._gemini_api_key:
            provider = "gemini"
            prompt = self._gemini_prompt
            api_key = self._gemini_api_key
        elif self._claude_api_key:
            provider = "claude"
            prompt = self._claude_prompt
            api_key = self._claude_api_key

        print(f"Generating AI notes for version '{self._selected_version_name}'...")
        if provider:
            print(f"  Using provider: {provider}")

        # Create worker thread for async generation
        self._llm_worker = LLMGenerationWorker(
            self._backend_url,
            self._selected_version_id,
            self._current_transcript,
            prompt,
            provider,
            api_key,
            self._request_timeout
        )

        # Connect signals
        self._llm_worker.finished.connect(self._on_llm_generation_finished)
        self._llm_worker.error.connect(self._on_llm_generation_error)

        # Start generation in background
        self._llm_worker.start()
        print("  LLM generation started in background thread...")

    def _on_llm_generation_finished(self, ai_notes: str):
        """Handle successful LLM generation"""
        self._current_ai_notes = ai_notes
        self.currentAiNotesChanged.emit()
        print(f"✓ AI notes generated successfully ({len(ai_notes)} chars)")

        # Clean up worker
        if self._llm_worker:
            self._llm_worker.deleteLater()
            self._llm_worker = None

    def _on_llm_generation_error(self, error_msg: str):
        """Handle LLM generation error"""
        print(f"ERROR: Failed to generate AI notes: {error_msg}")

        # Clean up worker
        if self._llm_worker:
            self._llm_worker.deleteLater()
            self._llm_worker = None

    @Slot()
    def addAiNotesToStaging(self):
        """Add AI notes to the current version's note entry"""
        # Get the AI notes text (even if it's placeholder text from the UI)
        ai_text = self._current_ai_notes if self._current_ai_notes else ""

        # Add to current version note (append if there's existing text)
        if self._current_version_note and self._current_version_note.strip():
            self._current_version_note = self._current_version_note + "\n\n" + ai_text
        else:
            self._current_version_note = ai_text

        # Update storage
        if self._selected_version_id:
            self._version_notes[self._selected_version_id] = self._current_version_note

        self.currentVersionNoteChanged.emit()
        print(f"Added AI notes to version note: {len(ai_text)} chars")

    @Slot(str)
    def addAiNotesText(self, text):
        """Add specific text (from AI notes area) to the current version's note entry"""
        # Add to current version note (append if there's existing text)
        if self._current_version_note and self._current_version_note.strip():
            self._current_version_note = self._current_version_note + "\n\n" + text
        else:
            self._current_version_note = text

        # Update storage
        if self._selected_version_id:
            self._version_notes[self._selected_version_id] = self._current_version_note

        self.currentVersionNoteChanged.emit()
        print(f"Added text to version note: {len(text)} chars")

    @Slot(str)
    def updateVersionNote(self, note_text):
        """Update the note for the current version (stored locally per-version)"""
        if not self._selected_version_id:
            return

        # Store note for this version
        self._version_notes[self._selected_version_id] = note_text
        self._current_version_note = note_text
        self.currentVersionNoteChanged.emit()

        # Sync to backend
        try:
            response = self._make_request(
                "GET", f"/versions/{self._selected_version_id}"
            )
            if response.status_code == 200:
                version_data = response.json().get("version", {})
                version_data["user_notes"] = note_text
                self._make_request("POST", "/versions", json=version_data)
        except Exception as e:
            print(f"ERROR: Failed to sync note to backend: {e}")

    @Slot()
    def captureScreenshot(self):
        """Capture a screenshot (placeholder for now)"""
        print("📷 Screenshot capture requested")
        # TODO: Implement screenshot capture functionality

    @Slot()
    def resetWorkspace(self):
        """Reset workspace - clear all versions and notes"""
        print("Resetting workspace...")

        try:
            # Clear all versions via backend API
            response = self._make_request("DELETE", "/versions")

            # Clear local state
            self._selected_version_id = None
            self._selected_version_name = ""
            self._selected_version_shotgrid_id = None
            self._current_notes = ""
            self._current_ai_notes = ""
            self._current_transcript = ""
            self._staging_note = ""
            self._current_version_note = ""
            self._version_notes.clear()

            # Emit signals to update UI
            self.selectedVersionIdChanged.emit()
            self.selectedVersionNameChanged.emit()
            self.selectedVersionShotGridIdChanged.emit()
            self.currentNotesChanged.emit()
            self.currentAiNotesChanged.emit()
            self.currentTranscriptChanged.emit()
            self.stagingNoteChanged.emit()
            self.currentVersionNoteChanged.emit()
            self.versionsLoaded.emit()

            print("✓ Workspace reset successfully")

        except Exception as e:
            print(f"ERROR: Failed to reset workspace: {e}")

    # ===== Vexa/Meeting Integration =====

    @Property(str, notify=vexaApiKeyChanged)
    def vexaApiKey(self):
        return self._vexa_api_key

    @vexaApiKey.setter
    def vexaApiKey(self, value):
        if self._vexa_api_key != value:
            self._vexa_api_key = value
            self.vexaApiKeyChanged.emit()
            self.save_setting("vexa_api_key", value)
            # Reinitialize Vexa service with new key
            if value:
                self._vexa_service = VexaService(value, self._vexa_api_url)

    @Property(str, notify=vexaApiUrlChanged)
    def vexaApiUrl(self):
        return self._vexa_api_url

    @vexaApiUrl.setter
    def vexaApiUrl(self, value):
        if self._vexa_api_url != value:
            self._vexa_api_url = value
            self.vexaApiUrlChanged.emit()
            self.save_setting("vexa_api_url", value)
            # Reinitialize Vexa service with new URL
            if self._vexa_api_key:
                self._vexa_service = VexaService(self._vexa_api_key, value)

    @Property(bool, notify=meetingStatusChanged)
    def meetingActive(self):
        return self._meeting_active

    @Property(str, notify=meetingStatusChanged)
    def meetingStatus(self):
        return self._meeting_status

    @Slot()
    def joinMeeting(self):
        """Join a meeting and start transcription"""
        if not self._meeting_id or not self._vexa_api_key:
            print("ERROR: Meeting ID or Vexa API key not set")
            self._meeting_status = "error"
            self.meetingStatusChanged.emit()
            return

        if not self._vexa_service:
            self._vexa_service = VexaService(self._vexa_api_key, self._vexa_api_url)

        # Set status to connecting
        self._meeting_status = "connecting"
        self.meetingStatusChanged.emit()

        try:
            print(f"\n=== Joining Meeting ===")
            print(f"Meeting URL/ID: {self._meeting_id}")

            result = self._vexa_service.start_transcription(
                self._meeting_id, language="auto", bot_name="Dailies Notes Assistant"
            )

            if result.get("success"):
                self._current_meeting_id = result.get("meeting_id", self._meeting_id)
                self._meeting_active = True
                # Don't set status to connected yet - it will be updated by WebSocket status messages
                # Status progression: connecting -> joining -> connected

                print(f"✓ Successfully started bot")
                print(f"  Internal meeting ID: {self._current_meeting_id}")

                # Start WebSocket streaming for transcription updates
                # Status will be updated when we receive meeting.status messages
                self._start_transcription_websocket()
            else:
                print(f"ERROR: Failed to join meeting")
                self._meeting_status = "error"
                self.meetingStatusChanged.emit()

        except Exception as e:
            print(f"ERROR: Failed to join meeting: {e}")
            self._meeting_active = False
            self._meeting_status = "error"
            self.meetingStatusChanged.emit()

    @Slot()
    def leaveMeeting(self):
        """Leave the current meeting and stop transcription"""
        if not self._current_meeting_id:
            print("ERROR: No active meeting")
            return

        if not self._vexa_service:
            print("ERROR: Vexa service not initialized")
            return

        try:
            print(f"\n=== Leaving Meeting ===")
            print(f"Meeting ID: {self._current_meeting_id}")

            result = self._vexa_service.stop_transcription(self._current_meeting_id)

            if result.get("success"):
                print(f"✓ Successfully left meeting")

                # Stop WebSocket streaming
                self._stop_transcription_websocket()

                self._meeting_active = False
                self._meeting_status = "disconnected"
                self._current_meeting_id = ""
                self.meetingStatusChanged.emit()
            else:
                print(f"ERROR: Failed to leave meeting")
                self._meeting_status = "error"
                self.meetingStatusChanged.emit()

        except Exception as e:
            print(f"ERROR: Failed to leave meeting: {e}")
            self._meeting_status = "error"
            self.meetingStatusChanged.emit()

    @Slot()
    def pauseTranscript(self):
        """Pause the transcript stream"""
        if self._vexa_websocket:
            self._vexa_websocket.pause_transcript()
            print("⏸️  Transcript paused")
        else:
            print("ERROR: WebSocket service not initialized")

    @Slot()
    def playTranscript(self):
        """Resume/play the transcript stream"""
        if self._vexa_websocket:
            self._vexa_websocket.play_transcript()
            # The _on_transcript_resumed handler will mark segments as seen
        else:
            print("ERROR: WebSocket service not initialized")

    def isTranscriptPaused(self) -> bool:
        """Check if transcript is paused"""
        if self._vexa_websocket:
            return self._vexa_websocket.is_paused()
        return False

    @Slot(str)
    def updateTranscriptionLanguage(self, language):
        """Update the transcription language"""
        if not self._current_meeting_id:
            print("ERROR: No active meeting")
            return

        if not self._vexa_service:
            print("ERROR: Vexa service not initialized")
            return

        try:
            print(f"Updating transcription language to: {language}")
            result = self._vexa_service.update_language(
                self._current_meeting_id, language
            )

            if result.get("success"):
                print(f"✓ Language updated successfully")
            else:
                print(f"ERROR: Failed to update language")

        except Exception as e:
            print(f"ERROR: Failed to update language: {e}")

    def _start_transcription_websocket(self):
        """Start WebSocket connection for real-time transcription streaming"""
        if not self._current_meeting_id:
            print("ERROR: No meeting ID for WebSocket connection")
            return

        # Parse meeting ID to get platform and native_meeting_id
        parts = self._current_meeting_id.split("/")
        if len(parts) < 2:
            print("ERROR: Invalid meeting ID format for WebSocket")
            return

        platform = parts[0]
        native_meeting_id = parts[1]

        print(f"\n=== Starting WebSocket Connection ===")
        print(f"Platform: {platform}")
        print(f"Native Meeting ID: {native_meeting_id}")

        # Create WebSocket service if it doesn't exist
        if not self._vexa_websocket:
            self._vexa_websocket = VexaWebSocketService(
                self._vexa_api_key, self._vexa_api_url
            )

            # Connect signals
            self._vexa_websocket.connected.connect(self._on_websocket_connected)
            self._vexa_websocket.disconnected.connect(self._on_websocket_disconnected)
            self._vexa_websocket.error.connect(self._on_websocket_error)
            self._vexa_websocket.transcriptMutableReceived.connect(
                self._on_transcript_mutable
            )
            self._vexa_websocket.transcriptFinalizedReceived.connect(
                self._on_transcript_finalized
            )
            self._vexa_websocket.transcriptInitialReceived.connect(
                self._on_transcript_initial
            )
            self._vexa_websocket.meetingStatusChanged.connect(
                self._on_meeting_status_changed
            )
            self._vexa_websocket.transcriptPaused.connect(
                self._on_transcript_paused
            )
            self._vexa_websocket.transcriptResumed.connect(
                self._on_transcript_resumed
            )

        # Connect to WebSocket server
        self._vexa_websocket.connect_to_server()

        # Subscribe to meeting (will happen after connection is established)
        QTimer.singleShot(
            1000,
            lambda: self._vexa_websocket.subscribe_to_meeting(
                platform, native_meeting_id
            ),
        )

    def _stop_transcription_websocket(self):
        """Stop WebSocket connection"""
        if self._vexa_websocket:
            print("Stopping WebSocket connection")

            # Unsubscribe from meeting if we have an ID
            if self._current_meeting_id:
                parts = self._current_meeting_id.split("/")
                if len(parts) >= 2:
                    self._vexa_websocket.unsubscribe_from_meeting(parts[0], parts[1])

            # Disconnect from server
            self._vexa_websocket.disconnect_from_server()

        # Clear segment tracking (reset to dict for _seen_segment_ids)
        self._all_segments = []
        self._mutable_segment_ids = set()
        self._seen_segment_ids = {}
        self._current_version_segments = {}
        self._base_transcript = ""

    def _mark_current_segments_as_seen(self):
        """Mark all current meeting segments as seen (called when switching versions)"""
        # Mark all segments in _all_segments as seen with their text length
        # Use absolute_start_time for consistency with merge logic
        print(f"  Marking {len(self._all_segments)} segments as seen...")

        # Group by timestamp and keep only the longest text for each timestamp
        # This handles cases where segments have same timestamp but different text
        timestamp_to_segment = {}
        for seg in self._all_segments:
            segment_key = seg.get("absolute_start_time") or seg.get("timestamp", "")
            if not segment_key:
                continue

            existing = timestamp_to_segment.get(segment_key)
            if not existing or len(seg.get("text", "")) > len(existing.get("text", "")):
                timestamp_to_segment[segment_key] = seg

        # Now mark the longest version of each timestamp as seen
        for segment_key, seg in timestamp_to_segment.items():
            text_length = len(seg.get("text", ""))
            self._seen_segment_ids[segment_key] = text_length
            text_preview = seg.get("text", "")[:30]
            print(
                f"    ✓ Marked: {segment_key[-12:]} -> length {text_length} ('{text_preview}...')"
            )

        print(
            f"  Marked {len(self._seen_segment_ids)} segments as seen (from {len(self._all_segments)} total segments)"
        )

    # ===== WebSocket Event Handlers =====

    def _on_websocket_connected(self):
        """Handle WebSocket connection established"""
        print("✅ WebSocket connected - ready to receive transcripts")

        # Mark all current segments as seen to prevent replay after reconnection
        if self._all_segments:
            self._mark_current_segments_as_seen()
            print("  Marked existing segments as seen (reconnection)")

        # Don't set status to connected here - wait for meeting.status messages
        # The status will be updated by _on_meeting_status_changed when we get
        # the actual meeting status (joining -> awaiting_admission -> active)

    def _on_websocket_disconnected(self):
        """Handle WebSocket disconnection"""
        print("❌ WebSocket disconnected")
        if self._meeting_active:
            self._meeting_status = "error"
            self.meetingStatusChanged.emit()

    def _on_websocket_error(self, error_msg: str):
        """Handle WebSocket error"""
        print(f"🔴 WebSocket error: {error_msg}")
        self._meeting_status = "error"
        self.meetingStatusChanged.emit()

    def _on_transcript_initial(self, segments: list):
        """Handle initial transcript dump (all existing segments)"""
        print(f"🟣 Received initial transcript: {len(segments)} segments")
        # Mark all initial segments as seen so we don't process them
        # We only want NEW segments from this point forward
        for seg in segments:
            segment_key = seg.get("absolute_start_time") or seg.get("timestamp", "")
            if segment_key:
                self._seen_segment_ids[segment_key] = len(seg.get("text", ""))

        # Still merge them into _all_segments for tracking purposes
        self._all_segments = merge_segments_by_absolute_utc(
            self._all_segments, segments
        )

        print(f"  Marked {len(segments)} initial segments as seen - will not be processed")

    def _on_transcript_mutable(self, segments: list):
        """Handle mutable (in-progress) transcript segments"""
        # Check if paused - discard if so
        if self._vexa_websocket and self._vexa_websocket.is_paused():
            print(f"🟢 Received mutable transcript but paused - discarding {len(segments)} segments")
            return

        # Filter out segments from before pause cutoff time
        if self._pause_cutoff_time is not None:
            filtered_segments = []
            discarded_count = 0
            for seg in segments:
                abs_time = seg.get("absolute_start_time")
                if abs_time and abs_time > self._pause_cutoff_time:
                    filtered_segments.append(seg)
                else:
                    discarded_count += 1

            if discarded_count > 0:
                print(f"🟢 Received mutable transcript: {len(segments)} segments ({discarded_count} discarded from pause period)")
            else:
                print(f"🟢 Received mutable transcript: {len(segments)} segments")

            segments = filtered_segments
        else:
            print(f"🟢 Received mutable transcript: {len(segments)} segments")

        # If all segments were filtered out, return early
        if not segments:
            return

        # Debug: print segment details to see what's coming through
        for seg in segments:
            text = seg.get("text", "")
            speaker = seg.get("speaker", "Unknown")
            abs_time = seg.get("absolute_start_time", "")
            print(
                f"  📝 {speaker}: '{text}' [abs_time: {abs_time[-12:] if abs_time else 'N/A'}]"
            )

        # Merge with existing segments (deduplicates by absolute_start_time)
        self._all_segments = merge_segments_by_absolute_utc(
            self._all_segments, segments
        )
        # Mark these segments as mutable
        for seg in segments:
            seg_id = seg.get("id", "")
            if seg_id:
                self._mutable_segment_ids.add(seg_id)
        # Update UI
        self._update_transcript_display()

    def _on_transcript_finalized(self, segments: list):
        """Handle finalized (completed) transcript segments"""
        # Check if paused - discard if so
        if self._vexa_websocket and self._vexa_websocket.is_paused():
            print(f"🔵 Received finalized transcript but paused - discarding {len(segments)} segments")
            return

        # Filter out segments from before pause cutoff time
        if self._pause_cutoff_time is not None:
            filtered_segments = []
            discarded_count = 0
            for seg in segments:
                abs_time = seg.get("absolute_start_time")
                if abs_time and abs_time > self._pause_cutoff_time:
                    filtered_segments.append(seg)
                else:
                    discarded_count += 1

            if discarded_count > 0:
                print(f"🔵 Received finalized transcript: {len(segments)} segments ({discarded_count} discarded from pause period)")
            else:
                print(f"🔵 Received finalized transcript: {len(segments)} segments")

            segments = filtered_segments
        else:
            print(f"🔵 Received finalized transcript: {len(segments)} segments")

        # If all segments were filtered out, return early
        if not segments:
            return

        # Merge with existing segments
        self._all_segments = merge_segments_by_absolute_utc(
            self._all_segments, segments
        )
        # Remove these segments from mutable set (they're now finalized)
        for seg in segments:
            seg_id = seg.get("id", "")
            if seg_id:
                self._mutable_segment_ids.discard(seg_id)
        # Update UI
        self._update_transcript_display()

    def _on_meeting_status_changed(self, status: str):
        """Handle meeting status change"""
        print(f"🟡 Meeting status changed: {status}")
        # Map Vexa status to our status
        if status == "active":
            self._meeting_status = "connected"
        elif status in ["joining", "awaiting_admission"]:
            self._meeting_status = "joining"
        elif status in ["completed", "stopped"]:
            self._meeting_status = "disconnected"
            self._meeting_active = False
        elif status == "error":
            self._meeting_status = "error"

        self.meetingStatusChanged.emit()

    def _on_transcript_paused(self, pause_timestamp: float):
        """Handle transcript pause"""
        print(f"⏸️  Transcript paused at {pause_timestamp}")

        # Record the latest absolute_start_time from all segments
        # Any segments with absolute_start_time <= this value should be ignored after resume
        if self._all_segments:
            # Find the maximum absolute_start_time
            max_time = None
            for seg in self._all_segments:
                abs_time = seg.get("absolute_start_time")
                if abs_time:
                    if max_time is None or abs_time > max_time:
                        max_time = abs_time
            self._pause_cutoff_time = max_time
            print(f"  Recorded pause cutoff time: {max_time}")
        else:
            # No segments yet, use current timestamp as fallback
            import time
            from datetime import datetime
            # Convert to ISO format similar to absolute_start_time
            self._pause_cutoff_time = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            print(f"  No segments yet, using current time as cutoff: {self._pause_cutoff_time}")

    def _on_transcript_resumed(self):
        """Handle transcript resume"""
        import time
        self._resume_timestamp = time.time()
        print(f"▶️  Transcript resumed at {self._resume_timestamp}")

        # Mark all current segments as seen so we don't replay them
        self._mark_current_segments_as_seen()

        # Clear the pause cutoff time - we'll start accepting new segments now
        # The cutoff will be set again on next pause
        print(f"  Cleared pause cutoff time - accepting all new segments from now on")
        self._pause_cutoff_time = None

    def _emit_transcript_changed(self):
        """Emit transcript changed signal (called by debounce timer)"""
        if self._pending_transcript_update:
            self.currentTranscriptChanged.emit()
            self._pending_transcript_update = False

    def _update_transcript_display(self):
        """Update transcript display from all segments"""
        # Determine which version should receive the transcript
        # If a version is pinned, ONLY that version receives transcripts
        # Otherwise, the currently selected version receives them
        target_version_id = self._pinned_version_id if self._pinned_version_id else self._selected_version_id

        if not target_version_id or self._version_activation_time is None:
            return

        # Filter to segments that are NEW or have been UPDATED (longer text)
        # Use absolute_start_time as the key (same as merge logic)
        new_or_updated_segments = []
        for seg in self._all_segments:
            segment_key = seg.get("absolute_start_time") or seg.get("timestamp", "")
            if not segment_key:
                continue

            text = seg.get("text", "")
            text_length = len(text)

            # Check if this is new or has been updated
            if segment_key not in self._seen_segment_ids:
                # New segment
                new_or_updated_segments.append(seg)
                self._seen_segment_ids[segment_key] = text_length
            elif self._seen_segment_ids[segment_key] < text_length:
                # Updated segment with more text (mutable becoming more complete)
                new_or_updated_segments.append(seg)
                self._seen_segment_ids[segment_key] = text_length

        if new_or_updated_segments:
            # Update or add segments to current version's dict (O(1) lookup/insert)
            for new_seg in new_or_updated_segments:
                segment_key = new_seg.get("absolute_start_time") or new_seg.get(
                    "timestamp", ""
                )
                # Dict automatically handles both insert and update
                self._current_version_segments[segment_key] = new_seg

            # Rebuild transcript from current version's segments (segments from this session)
            # Convert dict values to list for processing
            # This ensures each segment appears only once with its latest text
            segment_list = list(self._current_version_segments.values())
            speaker_groups = group_segments_by_speaker(segment_list)
            new_transcript_text = format_transcript_for_display(speaker_groups)

            # Combine base transcript (what existed before) with new segments
            # Use StringIO for efficient string building
            buffer = StringIO()
            if self._base_transcript:
                buffer.write(self._base_transcript)
                buffer.write("\n")
            buffer.write(new_transcript_text)
            self._current_transcript = buffer.getvalue()

            # Only emit transcript change if we're updating the currently selected version
            # (If pinned version != selected version, don't update the display)
            if target_version_id == self._selected_version_id:
                # Use debounced emit instead of immediate emit
                self._pending_transcript_update = True
                if not self._transcript_update_timer.isActive():
                    self._transcript_update_timer.start(300)  # 300ms debounce

            # Save the updated transcript to the target version in backend
            self._save_transcript_to_version(target_version_id, self._current_transcript)

            # Get target version name for logging
            target_version_name = self._selected_version_name if target_version_id == self._selected_version_id else self._get_version_name(target_version_id)

            print(
                f"Transcript updated for version '{target_version_name}': {len(new_or_updated_segments)} new/updated segments"
            )

    def _save_transcript_to_version(self, version_id, transcript_text):
        """Save transcript to the specified version"""
        if not version_id:
            return

        try:
            # Update the version's transcript in the backend
            response = self._make_request(
                "PUT",
                f"/versions/{version_id}/notes",
                json={
                    "version_id": version_id,
                    "transcript": transcript_text,
                },
            )

            if response.status_code == 200:
                version_name = self._get_version_name(version_id)
                print(f"  ✓ Saved transcript to version '{version_name}'")
            else:
                print(f"  ✗ Failed to save transcript: {response.text}")

        except Exception as e:
            print(f"  ✗ Error saving transcript: {e}")

    def _get_version_name(self, version_id):
        """Get version name from version ID by fetching from backend"""
        try:
            response = self._make_request("GET", f"/versions/{version_id}")
            if response.status_code == 200:
                version_data = response.json()
                return version_data.get("name", version_id)
        except Exception:
            pass
        return version_id  # Fallback to ID if can't fetch name

    # ===== CSV Import/Export =====

    @Slot(str)
    def addVersion(self, version_name):
        """Add a new version with the given name"""
        if not version_name or not version_name.strip():
            print("ERROR: Version name is empty")
            return

        version_name = version_name.strip()
        print(f"Adding new version: {version_name}")

        try:
            new_version = {
                "id": version_name,  # Use name as ID for CSV versions
                "name": version_name,
                "user_notes": "",
                "ai_notes": "",
                "transcript": "",
                "status": "",
            }
            response = self._make_request("POST", "/versions", json=new_version)

            if response.status_code == 200:
                print(f"✓ Added version '{version_name}'")

                # CSV versions are not from ShotGrid
                self._has_shotgrid_versions = False
                self.hasShotGridVersionsChanged.emit()

                # Emit signal to reload versions
                self.versionsLoaded.emit()
            else:
                print(f"ERROR: Failed to add version: {response.text}")

        except Exception as e:
            print(f"ERROR: Failed to add version: {e}")

    @Slot(str)
    def importCSV(self, file_url):
        """Import versions from CSV via backend API"""
        # Convert file URL to path
        file_path = file_url.replace("file://", "")

        print(f"Importing CSV: {file_path}")

        try:
            with open(file_path, "rb") as f:
                files = {"file": ("playlist.csv", f, "text/csv")}
                response = requests.post(
                    f"{self._backend_url}/versions/upload-csv", files=files
                )
                response.raise_for_status()

            data = response.json()
            count = data.get("count", 0)

            print(f"✓ Imported {count} versions from CSV")

            # CSV versions are not from ShotGrid
            self._has_shotgrid_versions = False
            self.hasShotGridVersionsChanged.emit()

            # Emit signal to reload versions
            self.versionsLoaded.emit()

        except Exception as e:
            print(f"ERROR: Failed to import CSV: {e}")

    @Slot(str)
    def exportCSV(self, file_url):
        """Export versions to CSV via backend API"""
        # Convert file URL to path
        file_path = file_url.replace("file://", "")

        print(f"Exporting CSV: {file_path}")

        try:
            # Pass includeStatuses parameter if status mode is enabled
            params = {"include_status": self._include_statuses}
            response = self._make_request("GET", "/versions/export/csv", params=params)

            # Write response content to file
            with open(file_path, "wb") as f:
                f.write(response.content)

            status_info = " (with Status column)" if self._include_statuses else ""
            print(f"✓ Exported versions to CSV{status_info}: {file_path}")

        except Exception as e:
            print(f"ERROR: Failed to export CSV: {e}")

    # ===== ShotGrid Integration =====

    @Property(list, notify=shotgridProjectsChanged)
    def shotgridProjects(self):
        return self._shotgrid_projects

    @Property(list, notify=shotgridPlaylistsChanged)
    def shotgridPlaylists(self):
        return self._shotgrid_playlists

    @Property(int, notify=selectedPlaylistIdChanged)
    def selectedPlaylistId(self):
        return self._selected_playlist_id if self._selected_playlist_id else -1

    @Property(int, notify=lastLoadedPlaylistIdChanged)
    def lastLoadedPlaylistId(self):
        return self._last_loaded_playlist_id if self._last_loaded_playlist_id else -1

    @Property(bool, notify=hasShotGridVersionsChanged)
    def hasShotGridVersions(self):
        return self._has_shotgrid_versions

    @Property(str, notify=pinnedVersionIdChanged)
    def pinnedVersionId(self):
        return self._pinned_version_id if self._pinned_version_id else ""

    @Slot(str)
    def pinVersion(self, version_id):
        """Pin a version for transcript streaming"""
        if self._pinned_version_id != version_id:
            self._pinned_version_id = version_id
            self.pinnedVersionIdChanged.emit()
            print(f"📌 Pinned version: {version_id}")

            # If this version is not currently selected, select it
            if self._selected_version_id != version_id:
                self.selectVersion(version_id)

    @Slot()
    def unpinVersion(self):
        """Unpin the currently pinned version"""
        if self._pinned_version_id:
            print(f"📌 Unpinned version: {self._pinned_version_id}")
            self._pinned_version_id = None
            self.pinnedVersionIdChanged.emit()

    @Property(str, notify=shotgridUrlChanged)
    def shotgridUrl(self):
        return self._shotgrid_url

    @shotgridUrl.setter
    def shotgridUrl(self, value):
        if self._shotgrid_url != value:
            self._shotgrid_url = value
            self.shotgridUrlChanged.emit()
            print(f"ShotGrid URL updated: {value}")
            self.save_setting("shotgrid_url", value)
            self._try_update_shotgrid_config()

    @Property(str, notify=shotgridApiKeyChanged)
    def shotgridApiKey(self):
        return self._shotgrid_api_key

    @shotgridApiKey.setter
    def shotgridApiKey(self, value):
        if self._shotgrid_api_key != value:
            self._shotgrid_api_key = value
            self.shotgridApiKeyChanged.emit()
            print("ShotGrid API Key updated")
            self.save_setting("shotgrid_api_key", value)
            self._try_update_shotgrid_config()

    @Property(str, notify=shotgridScriptNameChanged)
    def shotgridScriptName(self):
        return self._shotgrid_script_name

    @shotgridScriptName.setter
    def shotgridScriptName(self, value):
        if self._shotgrid_script_name != value:
            self._shotgrid_script_name = value
            self.shotgridScriptNameChanged.emit()
            print(f"ShotGrid Script Name updated: {value}")
            self.save_setting("shotgrid_script_name", value)
            self._try_update_shotgrid_config()

    @Property(str, notify=shotgridAuthorEmailChanged)
    def shotgridAuthorEmail(self):
        return self._shotgrid_author_email

    @shotgridAuthorEmail.setter
    def shotgridAuthorEmail(self, value):
        if self._shotgrid_author_email != value:
            self._shotgrid_author_email = value
            self.shotgridAuthorEmailChanged.emit()
            print(f"ShotGrid Author Email updated: {value}")
            self.save_setting("shotgrid_author_email", value)

    @Property(bool, notify=sgSyncTranscriptsChanged)
    def sgSyncTranscripts(self):
        return self._sg_sync_transcripts

    @sgSyncTranscripts.setter
    def sgSyncTranscripts(self, value):
        if self._sg_sync_transcripts != value:
            self._sg_sync_transcripts = value
            self.sgSyncTranscriptsChanged.emit()
            print(f"ShotGrid Sync Transcripts updated: {value}")
            self.save_setting("sg_sync_transcripts", value)

    @Property(str, notify=sgDnaTranscriptEntityChanged)
    def sgDnaTranscriptEntity(self):
        return self._sg_dna_transcript_entity

    @sgDnaTranscriptEntity.setter
    def sgDnaTranscriptEntity(self, value):
        if self._sg_dna_transcript_entity != value:
            self._sg_dna_transcript_entity = value
            self.sgDnaTranscriptEntityChanged.emit()
            print(f"ShotGrid DNA Transcript Entity updated: {value}")
            self.save_setting("sg_dna_transcript_entity", value)

    @Property(str, notify=sgTranscriptFieldChanged)
    def sgTranscriptField(self):
        return self._sg_transcript_field

    @sgTranscriptField.setter
    def sgTranscriptField(self, value):
        if self._sg_transcript_field != value:
            self._sg_transcript_field = value
            self.sgTranscriptFieldChanged.emit()
            print(f"ShotGrid Transcript Field updated: {value}")
            self.save_setting("sg_transcript_field", value)

    @Property(str, notify=sgVersionFieldChanged)
    def sgVersionField(self):
        return self._sg_version_field

    @sgVersionField.setter
    def sgVersionField(self, value):
        if self._sg_version_field != value:
            self._sg_version_field = value
            self.sgVersionFieldChanged.emit()
            print(f"ShotGrid Version Field updated: {value}")
            self.save_setting("sg_version_field", value)

    @Property(str, notify=sgPlaylistFieldChanged)
    def sgPlaylistField(self):
        return self._sg_playlist_field

    @sgPlaylistField.setter
    def sgPlaylistField(self, value):
        if self._sg_playlist_field != value:
            self._sg_playlist_field = value
            self.sgPlaylistFieldChanged.emit()
            print(f"ShotGrid Playlist Field updated: {value}")
            self.save_setting("sg_playlist_field", value)

    @Property(bool, notify=prependSessionHeaderChanged)
    def prependSessionHeader(self):
        return self._prepend_session_header

    @prependSessionHeader.setter
    def prependSessionHeader(self, value):
        if self._prepend_session_header != value:
            self._prepend_session_header = value
            self.prependSessionHeaderChanged.emit()
            print(f"Prepend Session Header updated: {value}")
            self.save_setting("prepend_session_header", value)

    @Property(bool, notify=includeStatusesChanged)
    def includeStatuses(self):
        return self._include_statuses

    @includeStatuses.setter
    def includeStatuses(self, value):
        if self._include_statuses != value:
            self._include_statuses = value
            self.includeStatusesChanged.emit()
            print(f"Include Statuses updated: {value}")
            self.save_setting("include_statuses", value)
            if value:
                self.loadVersionStatuses()

    @Property(list, notify=versionStatusesChanged)
    def versionStatuses(self):
        return self._version_statuses

    @Property(str, notify=selectedVersionStatusChanged)
    def selectedVersionStatus(self):
        # Return display name for UI
        return self._selected_version_status

    @selectedVersionStatus.setter
    def selectedVersionStatus(self, value):
        # value is the display name from UI
        if self._selected_version_status != value:
            self._selected_version_status = value
            self.selectedVersionStatusChanged.emit()
            print(f"Version status display name updated: {value}")
            # Convert display name to code before updating backend
            status_code = self._version_status_codes.get(value, value)
            print(f"  Status code: {status_code}")
            self.updateVersionStatus(status_code)

    def _try_update_shotgrid_config(self):
        """Auto-update backend config when all three values are set"""
        if self._shotgrid_url and self._shotgrid_api_key and self._shotgrid_script_name:
            self.updateShotGridConfig()

    @Slot()
    def updateShotGridConfig(self):
        """Send ShotGrid configuration to backend"""
        if (
            not self._shotgrid_url
            or not self._shotgrid_api_key
            or not self._shotgrid_script_name
        ):
            print("ERROR: ShotGrid configuration is incomplete")
            return

        try:
            payload = {
                "shotgrid_url": self._shotgrid_url,
                "script_name": self._shotgrid_script_name,
                "api_key": self._shotgrid_api_key,
            }

            response = self._make_request("POST", "/shotgrid/config", json=payload)
            data = response.json()

            if data.get("status") == "success":
                print("✓ ShotGrid configuration updated on backend")
                # Auto-load projects after configuration
                self.loadShotGridProjects()
            else:
                print(f"ERROR: Failed to update ShotGrid config: {data.get('message')}")

        except Exception as e:
            print(f"ERROR: Failed to update ShotGrid configuration: {e}")

    @Slot()
    def loadShotGridProjects(self):
        """Load ShotGrid projects from backend API"""
        print("Loading ShotGrid projects...")

        try:
            response = self._make_request("GET", "/shotgrid/active-projects")
            data = response.json()

            if data.get("status") == "success":
                projects = data.get("projects", [])
                # Convert to QML-friendly format (list of strings showing project code)
                self._shotgrid_projects = [
                    f"{p['code']} (ID: {p['id']})" for p in projects
                ]
                # Store full project data for later use
                self._shotgrid_projects_data = projects
                self.shotgridProjectsChanged.emit()

                print(f"✓ Loaded {len(projects)} ShotGrid projects")
            else:
                print(f"ERROR: Failed to load projects: {data.get('message')}")
                self._shotgrid_projects = []
                self._shotgrid_projects_data = []
                self.shotgridProjectsChanged.emit()

        except Exception as e:
            print(f"ERROR: Failed to load ShotGrid projects: {e}")
            self._shotgrid_projects = []
            self._shotgrid_projects_data = []
            self.shotgridProjectsChanged.emit()

    @Slot(int)
    def selectShotgridProject(self, index):
        """Select a ShotGrid project by index and load its playlists"""
        if (
            not hasattr(self, "_shotgrid_projects_data")
            or index < 0
            or index >= len(self._shotgrid_projects_data)
        ):
            print(f"ERROR: Invalid project index: {index}")
            return

        project = self._shotgrid_projects_data[index]
        project_id = project["id"]
        self._selected_project_id = project_id
        print(f"Selected ShotGrid project: {project['code']} (ID: {project_id})")

        # Load playlists for this project
        self.loadShotGridPlaylists(project_id)

        # Load version statuses for this project if includeStatuses is enabled
        if self._include_statuses:
            self.loadVersionStatuses()

    @Slot(int)
    def loadShotGridPlaylists(self, project_id):
        """Load ShotGrid playlists for a project"""
        print(f"Loading ShotGrid playlists for project ID: {project_id}")

        try:
            response = self._make_request(
                "GET", f"/shotgrid/latest-playlists/{project_id}"
            )
            data = response.json()

            if data.get("status") == "success":
                playlists = data.get("playlists", [])
                # Convert to QML-friendly format
                self._shotgrid_playlists = [
                    f"{p['code']} (ID: {p['id']})" for p in playlists
                ]
                # Store full playlist data for later use
                self._shotgrid_playlists_data = playlists
                self.shotgridPlaylistsChanged.emit()

                print(f"✓ Loaded {len(playlists)} ShotGrid playlists")

                # Auto-select first playlist if available
                if len(playlists) > 0:
                    self.selectShotgridPlaylist(0)
            else:
                print(f"ERROR: Failed to load playlists: {data.get('message')}")
                self._shotgrid_playlists = []
                self._shotgrid_playlists_data = []
                self.shotgridPlaylistsChanged.emit()

        except Exception as e:
            print(f"ERROR: Failed to load ShotGrid playlists: {e}")
            self._shotgrid_playlists = []
            self._shotgrid_playlists_data = []
            self.shotgridPlaylistsChanged.emit()

    @Slot(int)
    def selectShotgridPlaylist(self, index):
        """Select a ShotGrid playlist by index"""
        if (
            not hasattr(self, "_shotgrid_playlists_data")
            or index < 0
            or index >= len(self._shotgrid_playlists_data)
        ):
            print(f"ERROR: Invalid playlist index: {index}")
            return

        playlist = self._shotgrid_playlists_data[index]
        old_id = getattr(self, "_selected_playlist_id", None)
        self._selected_playlist_id = playlist["id"]
        self.selectedPlaylistIdChanged.emit()
        print(
            f"Selected ShotGrid playlist: {playlist['code']} (ID: {playlist['id']}) [was: {old_id}]"
        )

    @Slot()
    def loadShotgridPlaylist(self):
        """Load versions from the selected ShotGrid playlist with statuses"""
        playlist_id = getattr(self, "_selected_playlist_id", None)
        print(
            f"DEBUG: loadShotgridPlaylist() called, _selected_playlist_id = {playlist_id}"
        )

        if not playlist_id:
            print("ERROR: No playlist selected")
            return

        print(f"Loading versions from ShotGrid playlist ID: {playlist_id}")

        # Only clear versions if loading a different playlist
        is_same_playlist = self._last_loaded_playlist_id == playlist_id
        if not is_same_playlist:
            print(
                f"  Loading different playlist (was: {self._last_loaded_playlist_id}), clearing existing versions"
            )
            try:
                self._make_request("DELETE", "/versions")
                print("  Cleared existing versions")
            except Exception as e:
                print(f"  Warning: Could not clear versions: {e}")
        else:
            print(f"  Reloading same playlist, will add only new versions")

        # Get existing versions if reloading same playlist
        existing_versions_map = {}  # Maps ShotGrid ID -> internal version data
        if is_same_playlist:
            try:
                versions_response = self._make_request("GET", "/versions")
                if versions_response.status_code == 200:
                    response_data = versions_response.json()

                    # Handle both dict (with 'versions' key) and list responses
                    versions_list = []
                    if isinstance(response_data, dict):
                        # Try common keys for version lists
                        versions_list = response_data.get(
                            "versions", response_data.get("data", [])
                        )
                    elif isinstance(response_data, list):
                        versions_list = response_data

                    # Process versions
                    for version in versions_list:
                        if isinstance(version, dict):
                            sg_id = version.get("shotgrid_version_id")
                            if sg_id:
                                existing_versions_map[sg_id] = version

                    print(
                        f"  Found {len(existing_versions_map)} existing versions with ShotGrid IDs"
                    )
            except Exception as e:
                print(f"  Warning: Could not get existing versions: {e}")
                import traceback

                traceback.print_exc()

        try:
            # Always use the endpoint that includes statuses
            response = self._make_request(
                "GET", f"/shotgrid/playlist-versions-with-statuses/{playlist_id}"
            )
            data = response.json()

            if data.get("status") == "success":
                items = data.get("versions", [])
                print(
                    f"✓ Loaded {len(items)} versions from ShotGrid playlist with statuses"
                )

                # Create versions via backend API
                # Items are dicts with 'id' (ShotGrid version ID), 'name' (display name), and 'status'
                added_count = 0
                skipped_count = 0
                playlist_sg_ids = set()  # Track which ShotGrid IDs are in the playlist

                for idx, item in enumerate(items):
                    # Extract ShotGrid version ID, display name, and status
                    shotgrid_version_id = item.get("id")
                    display_name = item.get("name")
                    status = item.get("status", "")

                    # Track this ShotGrid ID
                    playlist_sg_ids.add(shotgrid_version_id)

                    # Skip if this version already exists (when reloading same playlist)
                    if (
                        is_same_playlist
                        and shotgrid_version_id in existing_versions_map
                    ):
                        skipped_count += 1
                        continue

                    # Generate internal version ID
                    internal_id = f"sg_{idx + 1}"

                    try:
                        # Create version via backend with status
                        create_response = self._make_request(
                            "POST",
                            "/versions",
                            json={
                                "id": internal_id,
                                "name": display_name,
                                "shotgrid_version_id": shotgrid_version_id,
                                "user_notes": "",
                                "ai_notes": "",
                                "transcript": "",
                                "status": status,
                            },
                        )

                        if create_response.status_code == 200:
                            status_info = f" [{status}]" if status else ""
                            print(
                                f"  ✓ Created version: {display_name}{status_info} (SG ID: {shotgrid_version_id})"
                            )
                            added_count += 1
                        else:
                            print(
                                f"  ✗ Failed to create version: {display_name} - {create_response.text}"
                            )

                    except Exception as e:
                        print(f"  ✗ Error creating version {display_name}: {e}")

                # Delete versions that are no longer in the playlist (when reloading same playlist)
                deleted_count = 0
                if is_same_playlist:
                    for sg_id, version_data in existing_versions_map.items():
                        if sg_id not in playlist_sg_ids:
                            # This version was removed from the ShotGrid playlist
                            internal_id = version_data.get("id")
                            version_name = version_data.get("name", "Unknown")
                            try:
                                delete_response = self._make_request(
                                    "DELETE", f"/versions/{internal_id}"
                                )
                                if delete_response.status_code == 200:
                                    print(
                                        f"  ✓ Deleted removed version: {version_name} (SG ID: {sg_id})"
                                    )
                                    deleted_count += 1
                                else:
                                    print(
                                        f"  ✗ Failed to delete version: {version_name}"
                                    )
                            except Exception as e:
                                print(f"  ✗ Error deleting version {version_name}: {e}")

                # Print summary
                if is_same_playlist:
                    print(
                        f"  Summary: Added {added_count} new versions, skipped {skipped_count} existing versions, deleted {deleted_count} removed versions"
                    )
                else:
                    print(f"  Summary: Added {added_count} versions")

                # Update last loaded playlist ID
                self._last_loaded_playlist_id = playlist_id
                self.lastLoadedPlaylistIdChanged.emit()

                # Set flag that ShotGrid versions are loaded
                self._has_shotgrid_versions = True
                self.hasShotGridVersionsChanged.emit()

                # Emit signal to reload versions
                self.versionsLoaded.emit()

            else:
                print(f"ERROR: Failed to load playlist versions: {data.get('message')}")

        except Exception as e:
            print(f"ERROR: Failed to load ShotGrid playlist: {e}")

    @Slot()
    def loadVersionStatuses(self):
        """Load available version statuses from ShotGrid for the selected project"""
        print("Loading version statuses from ShotGrid...")

        try:
            # Use project_id parameter if available to only get statuses used in that project
            params = {}
            if self._selected_project_id:
                params["project_id"] = self._selected_project_id
                print(
                    f"  Filtering statuses for project ID: {self._selected_project_id}"
                )

            response = self._make_request(
                "GET", "/shotgrid/version-statuses", params=params
            )
            data = response.json()

            if data.get("status") == "success":
                statuses_response = data.get("statuses", {})
                print(f"DEBUG: statuses_response type: {type(statuses_response)}")
                print(f"DEBUG: statuses_response content: {statuses_response}")

                # Handle both dict and list responses
                if isinstance(statuses_response, dict):
                    # status_dict is {code: display_name}
                    # We want to show display names in the UI but store codes in the backend
                    self._version_statuses = list(
                        statuses_response.values()
                    )  # Display names for UI
                    self._version_status_codes = {
                        v: k for k, v in statuses_response.items()
                    }  # Reverse map: name -> code
                elif isinstance(statuses_response, list):
                    # If it's a list of codes, use them as-is (no display names available)
                    self._version_statuses = statuses_response
                    self._version_status_codes = {
                        v: v for v in statuses_response
                    }  # Map code to itself
                else:
                    print(
                        f"ERROR: Unexpected statuses response type: {type(statuses_response)}"
                    )
                    self._version_statuses = []
                    self._version_status_codes = {}

                self.versionStatusesChanged.emit()
                print(f"✓ Loaded {len(self._version_statuses)} version statuses")
                print(f"  Display names: {self._version_statuses}")
                print(f"  Code mapping: {self._version_status_codes}")
            else:
                print(f"ERROR: Failed to load version statuses: {data.get('message')}")

        except Exception as e:
            print(f"ERROR: Failed to load version statuses: {e}")

    @Slot(int)
    def loadPlaylistVersionsWithStatuses(self, playlist_id):
        """Load versions with their statuses from a playlist"""
        print(f"Loading version statuses for playlist ID: {playlist_id}")

        try:
            response = self._make_request(
                "GET", f"/shotgrid/playlist-versions-with-statuses/{playlist_id}"
            )
            data = response.json()

            if data.get("status") == "success":
                versions = data.get("versions", [])
                print(f"✓ Loaded statuses for {len(versions)} versions")

                # Update each version's status via backend API
                for version_info in versions:
                    version_name = version_info.get("name", "")
                    status = version_info.get("status", "")

                    if version_name and status:
                        try:
                            # Extract just the version name (part after the /)
                            if "/" in version_name:
                                version_id = version_name.split("/")[-1]
                            else:
                                version_id = version_name

                            # Update version status via backend
                            update_response = self._make_request(
                                "PUT",
                                f"/versions/{version_id}/notes",
                                json={
                                    "version_id": version_id,
                                    "user_notes": None,
                                    "ai_notes": None,
                                    "transcript": None,
                                },
                            )

                            # Also update the version with status field
                            # We need to get the current version data first
                            get_response = self._make_request(
                                "GET", f"/versions/{version_id}"
                            )
                            if get_response.status_code == 200:
                                version_data = get_response.json().get("version", {})
                                version_data["status"] = status

                                # Update with new status
                                self._make_request(
                                    "POST", "/versions", json=version_data
                                )
                                print(
                                    f"  ✓ Updated status for {version_name}: {status}"
                                )

                        except Exception as e:
                            print(f"  ✗ Error updating status for {version_name}: {e}")

            else:
                print(f"ERROR: Failed to load version statuses: {data.get('message')}")

        except Exception as e:
            print(f"ERROR: Failed to load version statuses for playlist: {e}")

    @Slot(str)
    def updateVersionStatus(self, status):
        """Update the status of the currently selected version"""
        if not self._selected_version_id:
            print("ERROR: No version selected")
            return

        print(f"Updating status for version {self._selected_version_id} to: {status}")

        try:
            # Get current version data
            response = self._make_request(
                "GET", f"/versions/{self._selected_version_id}"
            )
            if response.status_code == 200:
                version_data = response.json().get("version", {})
                version_data["status"] = status

                # Update version with new status
                update_response = self._make_request(
                    "POST", "/versions", json=version_data
                )

                if update_response.status_code == 200:
                    print(f"✓ Updated version status to: {status}")
                else:
                    print(f"✗ Failed to update version status: {update_response.text}")

        except Exception as e:
            print(f"ERROR: Failed to update version status: {e}")

    @Slot()
    def syncNotesToShotGrid(self):
        """Batch sync all playlist version notes to ShotGrid in one operation"""
        print(f"\n=== Starting Batch Sync to ShotGrid ===")

        # Get all versions to sync the entire playlist
        try:
            response = self._make_request("GET", "/versions")
            versions_data = response.json().get("versions", [])
        except Exception as e:
            print(f"ERROR: Failed to get versions: {e}")
            return False

        if not versions_data:
            print("ERROR: No versions loaded")
            return False

        # Collect versions with notes that have ShotGrid IDs
        versions_to_sync = []
        skipped_count = 0

        for version in versions_data:
            vid = version.get("id")
            sg_version_id = version.get("shotgrid_version_id")
            user_notes = version.get("user_notes", "")
            transcript = version.get("transcript", "")
            vstatus = version.get("status", "")
            attachments = version.get("attachments", [])

            # Skip versions without ShotGrid IDs (CSV-loaded versions)
            if not sg_version_id:
                continue

            # Skip versions without notes
            if not user_notes or not user_notes.strip():
                skipped_count += 1
                continue

            # Add to sync list
            version_item = {
                "version_id": vid,
                "shotgrid_version_id": sg_version_id,
                "notes": user_notes.strip(),
            }

            # Include transcript if present
            if transcript and transcript.strip():
                version_item["transcript"] = transcript.strip()

            # Include status if enabled
            if self._include_statuses and vstatus:
                version_item["status_code"] = vstatus

            # Include attachments if present
            if attachments:
                attachment_paths = [
                    att.get("filepath") for att in attachments if att.get("filepath")
                ]
                if attachment_paths:
                    version_item["attachments"] = attachment_paths

            versions_to_sync.append(version_item)

        if not versions_to_sync:
            print(
                f"⚠ No versions with notes to sync ({skipped_count} versions have no notes)"
            )
            return False

        print(f"Found {len(versions_to_sync)} version(s) with notes to sync")
        if skipped_count > 0:
            print(f"  (Skipping {skipped_count} version(s) without notes)")

        # Get playlist name for session header
        playlist_name = None
        if self._prepend_session_header and hasattr(self, "_selected_playlist_id"):
            if hasattr(self, "_shotgrid_playlists_data"):
                for playlist in self._shotgrid_playlists_data:
                    if playlist.get("id") == self._selected_playlist_id:
                        playlist_name = playlist.get("code", "Daily Session")
                        break

        # Build batch sync request
        sync_data = {
            "versions": versions_to_sync,
            "author_email": self._shotgrid_author_email
            if self._shotgrid_author_email
            else None,
            "prepend_session_header": self._prepend_session_header,
            "playlist_name": playlist_name,
            "playlist_id": getattr(self, "_selected_playlist_id", None),
            "session_date": None,  # Will use current date
            "update_status": self._include_statuses,
            "sync_transcripts": self._sg_sync_transcripts,
            "dna_transcript_entity": self._sg_dna_transcript_entity
            if self._sg_dna_transcript_entity
            else None,
            "transcript_field": self._sg_transcript_field,
            "version_field": self._sg_version_field,
            "playlist_field": self._sg_playlist_field,
        }

        try:
            # Make API call to batch sync
            print(f"Syncing {len(versions_to_sync)} version(s) to ShotGrid...")
            response = self._make_request(
                "POST", "/shotgrid/batch-sync-notes", json=sync_data
            )

            data = response.json()

            if data.get("status") == "success":
                results = data.get("results", {})
                synced = results.get("synced", [])
                skipped = results.get("skipped", [])
                failed = results.get("failed", [])

                print(f"\n✓ Batch sync complete!")
                print(f"  Synced: {len(synced)} version(s)")
                if skipped:
                    print(f"  Skipped: {len(skipped)} duplicate(s)")
                if failed:
                    print(f"  Failed: {len(failed)} error(s)")

                # Print details
                for item in synced:
                    print(
                        f"    ✓ {item.get('version_code')} → Note ID: {item.get('note_id')}"
                    )
                for item in skipped:
                    print(f"    ⊘ {item.get('version_code')} (duplicate)")
                for item in failed:
                    print(f"    ✗ {item.get('version_id')}: {item.get('error')}")

                # Calculate total attachments uploaded
                total_attachments = sum(
                    item.get("attachments_uploaded", 0) for item in synced
                )

                # Check if any statuses were updated
                any_status_updated = any(
                    item.get("status_updated", False) for item in synced
                )

                # Emit signal to show completion dialog
                self.syncCompleted.emit(
                    len(synced),
                    len(skipped),
                    len(failed),
                    total_attachments,
                    any_status_updated,
                )

                return len(synced) > 0
            else:
                print(f"✗ Failed to batch sync: {data.get('message', 'Unknown error')}")
                return False

        except Exception as e:
            print(f"ERROR: Failed to batch sync notes to ShotGrid: {e}")
            import traceback

            traceback.print_exc()
            return False

    # ===== Settings Persistence =====

    def load_settings(self):
        """Load settings from backend .env file"""
        try:
            response = self._make_request("GET", "/settings")
            data = response.json()

            if data.get("status") == "success":
                settings = data.get("settings", {})
                print(f"✓ Loaded settings from .env file")

                # Apply settings to properties
                if "shotgrid_url" in settings:
                    self._shotgrid_url = settings["shotgrid_url"]
                    self.shotgridUrlChanged.emit()

                if "shotgrid_api_key" in settings:
                    self._shotgrid_api_key = settings["shotgrid_api_key"]
                    self.shotgridApiKeyChanged.emit()

                if "shotgrid_script_name" in settings:
                    self._shotgrid_script_name = settings["shotgrid_script_name"]
                    self.shotgridScriptNameChanged.emit()

                if "shotgrid_author_email" in settings:
                    self._shotgrid_author_email = settings["shotgrid_author_email"]
                    self.shotgridAuthorEmailChanged.emit()

                if "sg_sync_transcripts" in settings:
                    self._sg_sync_transcripts = settings["sg_sync_transcripts"]
                    self.sgSyncTranscriptsChanged.emit()

                if "sg_dna_transcript_entity" in settings:
                    self._sg_dna_transcript_entity = settings[
                        "sg_dna_transcript_entity"
                    ]
                    self.sgDnaTranscriptEntityChanged.emit()

                if "sg_transcript_field" in settings:
                    self._sg_transcript_field = settings["sg_transcript_field"]
                    self.sgTranscriptFieldChanged.emit()

                if "sg_version_field" in settings:
                    self._sg_version_field = settings["sg_version_field"]
                    self.sgVersionFieldChanged.emit()

                if "sg_playlist_field" in settings:
                    self._sg_playlist_field = settings["sg_playlist_field"]
                    self.sgPlaylistFieldChanged.emit()

                if "prepend_session_header" in settings:
                    self._prepend_session_header = settings["prepend_session_header"]
                    self.prependSessionHeaderChanged.emit()

                if "vexa_api_key" in settings:
                    self._vexa_api_key = settings["vexa_api_key"]
                    self.vexaApiKeyChanged.emit()
                    if self._vexa_api_key:
                        self._vexa_service = VexaService(
                            self._vexa_api_key, self._vexa_api_url
                        )

                if "vexa_api_url" in settings:
                    self._vexa_api_url = settings["vexa_api_url"]
                    self.vexaApiUrlChanged.emit()

                if "openai_api_key" in settings:
                    self._openai_api_key = settings["openai_api_key"]
                    self.openaiApiKeyChanged.emit()

                if "claude_api_key" in settings:
                    self._claude_api_key = settings["claude_api_key"]
                    self.claudeApiKeyChanged.emit()

                if "gemini_api_key" in settings:
                    self._gemini_api_key = settings["gemini_api_key"]
                    self.geminiApiKeyChanged.emit()

                if "openai_prompt" in settings:
                    self._openai_prompt = settings["openai_prompt"]
                    self.openaiPromptChanged.emit()

                if "claude_prompt" in settings:
                    self._claude_prompt = settings["claude_prompt"]
                    self.claudePromptChanged.emit()

                if "gemini_prompt" in settings:
                    self._gemini_prompt = settings["gemini_prompt"]
                    self.geminiPromptChanged.emit()

                if "include_statuses" in settings:
                    self._include_statuses = settings["include_statuses"]
                    self.includeStatusesChanged.emit()

                return True
            else:
                print(
                    f"Failed to load settings: {data.get('message', 'Unknown error')}"
                )
                return False

        except Exception as e:
            print(f"ERROR: Failed to load settings: {e}")
            return False

    def save_setting(self, field_name: str, value):
        """Save a single setting to .env file"""
        try:
            response = self._make_request(
                "POST", "/settings/save-partial", json={field_name: value}
            )

            data = response.json()
            if data.get("status") == "success":
                print(f"✓ Saved setting: {field_name}")
                return True
            else:
                print(f"Failed to save setting: {data.get('message', 'Unknown error')}")
                return False

        except Exception as e:
            print(f"ERROR: Failed to save setting {field_name}: {e}")
            return False

    # ===== Image Attachments =====

    @Slot(str)
    def addAttachment(self, file_path):
        """Add an image attachment to the current version"""
        if not self._selected_version_id:
            print("ERROR: No version selected")
            return False

        # Convert file URL to path if needed
        if file_path.startswith("file://"):
            file_path = file_path.replace("file://", "")

        # Extract filename from path
        import os

        filename = os.path.basename(file_path)

        print(f"Adding attachment to version {self._selected_version_id}: {filename}")

        try:
            response = self._make_request(
                "POST",
                f"/versions/{self._selected_version_id}/attachments",
                json={
                    "version_id": self._selected_version_id,
                    "filepath": file_path,
                    "filename": filename,
                },
            )

            if response.status_code == 200:
                print(f"✓ Added attachment: {filename}")
                self.attachmentsChanged.emit()
                return True
            else:
                print(f"✗ Failed to add attachment: {response.text}")
                return False

        except Exception as e:
            print(f"ERROR: Failed to add attachment: {e}")
            return False

    @Slot(str)
    def removeAttachment(self, file_path):
        """Remove an image attachment from the current version"""
        if not self._selected_version_id:
            print("ERROR: No version selected")
            return False

        print(
            f"Removing attachment from version {self._selected_version_id}: {file_path}"
        )

        try:
            response = self._make_request(
                "DELETE",
                f"/versions/{self._selected_version_id}/attachments",
                json={
                    "version_id": self._selected_version_id,
                    "filepath": file_path,
                },
            )

            if response.status_code == 200:
                print(f"✓ Removed attachment: {file_path}")
                self.attachmentsChanged.emit()
                return True
            else:
                print(f"✗ Failed to remove attachment: {response.text}")
                return False

        except Exception as e:
            print(f"ERROR: Failed to remove attachment: {e}")
            return False

    @Slot(result=list)
    def getAttachments(self):
        """Get all attachments for the current version"""
        if not self._selected_version_id:
            return []

        try:
            response = self._make_request(
                "GET",
                f"/versions/{self._selected_version_id}/attachments",
            )

            if response.status_code == 200:
                data = response.json()
                attachments = data.get("attachments", [])
                return attachments
            else:
                print(f"✗ Failed to get attachments: {response.text}")
                return []

        except Exception as e:
            print(f"ERROR: Failed to get attachments: {e}")
            return []
