"""
Backend API Service
Handles communication with the FastAPI backend server
ONLY uses backend API - no local storage
"""

import requests
from PySide6.QtCore import QObject, Signal, Property, Slot


class BackendService(QObject):
    """Service for communicating with the backend API"""

    # Signals for property changes
    userNameChanged = Signal()
    meetingIdChanged = Signal()
    selectedVersionIdChanged = Signal()
    selectedVersionNameChanged = Signal()
    currentNotesChanged = Signal()
    currentAiNotesChanged = Signal()
    currentTranscriptChanged = Signal()
    stagingNoteChanged = Signal()

    # LLM API Keys and Prompts
    openaiApiKeyChanged = Signal()
    openaiPromptChanged = Signal()
    claudeApiKeyChanged = Signal()
    claudePromptChanged = Signal()
    llamaApiKeyChanged = Signal()
    llamaPromptChanged = Signal()

    # ShotGrid
    shotgridProjectsChanged = Signal()
    shotgridPlaylistsChanged = Signal()

    # Versions
    versionsLoaded = Signal()

    def __init__(self, backend_url="http://localhost:8000"):
        super().__init__()
        self._backend_url = backend_url
        self._check_backend_connection()

        # User info
        self._user_name = ""
        self._meeting_id = ""

        # Current version
        self._selected_version_id = None
        self._selected_version_name = ""

        # Notes and transcript
        self._current_notes = ""
        self._current_ai_notes = ""
        self._current_transcript = ""
        self._staging_note = ""

        # LLM settings
        self._openai_api_key = ""
        self._openai_prompt = ""
        self._claude_api_key = ""
        self._claude_prompt = ""
        self._llama_api_key = ""
        self._llama_prompt = ""

        # ShotGrid
        self._shotgrid_projects = []
        self._shotgrid_playlists = []

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

    def _make_request(self, method, endpoint, **kwargs):
        """Make a request to the backend API with error handling"""
        url = f"{self._backend_url}{endpoint}"
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            print(f"ERROR: API request failed: {method} {endpoint}")
            print(f"  Error: {e}")
            raise

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

    # ===== LLM Properties =====

    @Property(str, notify=openaiApiKeyChanged)
    def openaiApiKey(self):
        return self._openai_api_key

    @openaiApiKey.setter
    def openaiApiKey(self, value):
        if self._openai_api_key != value:
            self._openai_api_key = value
            self.openaiApiKeyChanged.emit()

    @Property(str, notify=openaiPromptChanged)
    def openaiPrompt(self):
        return self._openai_prompt

    @openaiPrompt.setter
    def openaiPrompt(self, value):
        if self._openai_prompt != value:
            self._openai_prompt = value
            self.openaiPromptChanged.emit()

    @Property(str, notify=claudeApiKeyChanged)
    def claudeApiKey(self):
        return self._claude_api_key

    @claudeApiKey.setter
    def claudeApiKey(self, value):
        if self._claude_api_key != value:
            self._claude_api_key = value
            self.claudeApiKeyChanged.emit()

    @Property(str, notify=claudePromptChanged)
    def claudePrompt(self):
        return self._claude_prompt

    @claudePrompt.setter
    def claudePrompt(self, value):
        if self._claude_prompt != value:
            self._claude_prompt = value
            self.claudePromptChanged.emit()

    @Property(str, notify=llamaApiKeyChanged)
    def llamaApiKey(self):
        return self._llama_api_key

    @llamaApiKey.setter
    def llamaApiKey(self, value):
        if self._llama_api_key != value:
            self._llama_api_key = value
            self.llamaApiKeyChanged.emit()

    @Property(str, notify=llamaPromptChanged)
    def llamaPrompt(self):
        return self._llama_prompt

    @llamaPrompt.setter
    def llamaPrompt(self, value):
        if self._llama_prompt != value:
            self._llama_prompt = value
            self.llamaPromptChanged.emit()

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

            # Load notes and transcript
            self._current_notes = version.get("user_notes", "")
            self._current_ai_notes = version.get("ai_notes", "")
            self._current_transcript = version.get("transcript", "")

            # Clear staging
            self._staging_note = ""

            # Emit signals
            self.selectedVersionIdChanged.emit()
            self.selectedVersionNameChanged.emit()
            self.currentNotesChanged.emit()
            self.currentAiNotesChanged.emit()
            self.currentTranscriptChanged.emit()
            self.stagingNoteChanged.emit()

            print(f"✓ Loaded version '{self._selected_version_name}'")
            print(f"  User notes: {len(self._current_notes)} chars")
            print(f"  AI notes: {len(self._current_ai_notes)} chars")

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
        """Generate AI notes for the current version"""
        if not self._selected_version_id:
            print("ERROR: No version selected")
            return

        if not self._current_transcript:
            print("ERROR: No transcript available for AI note generation")
            return

        print(f"Generating AI notes for version '{self._selected_version_name}'...")

        try:
            response = self._make_request(
                "POST",
                f"/versions/{self._selected_version_id}/generate-ai-notes",
                json={
                    "version_id": self._selected_version_id,
                    "transcript": self._current_transcript,
                },
            )

            data = response.json()
            version = data.get("version", {})

            # Update AI notes from backend response
            self._current_ai_notes = version.get("ai_notes", "")
            self.currentAiNotesChanged.emit()

            print(f"✓ AI notes generated successfully")

        except Exception as e:
            print(f"ERROR: Failed to generate AI notes: {e}")

    @Slot()
    def addAiNotesToStaging(self):
        """Add AI notes to staging area"""
        if self._current_ai_notes:
            self._staging_note = self._current_ai_notes
            self.stagingNoteChanged.emit()
            print("Added AI notes to staging")

    # ===== CSV Import/Export =====

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
            response = self._make_request("GET", "/versions/export/csv")

            # Write response content to file
            with open(file_path, "wb") as f:
                f.write(response.content)

            print(f"✓ Exported versions to CSV: {file_path}")

        except Exception as e:
            print(f"ERROR: Failed to export CSV: {e}")

    # ===== ShotGrid Integration =====

    @Property(list, notify=shotgridProjectsChanged)
    def shotgridProjects(self):
        return self._shotgrid_projects

    @Property(list, notify=shotgridPlaylistsChanged)
    def shotgridPlaylists(self):
        return self._shotgrid_playlists

    @Slot(str)
    def loadShotGridProjects(self, site_url):
        """Load ShotGrid projects"""
        print(f"Loading ShotGrid projects from: {site_url}")
        # TODO: Implement ShotGrid project loading
        pass

    @Slot(str, str)
    def loadShotGridPlaylists(self, site_url, project_id):
        """Load ShotGrid playlists for a project"""
        print(f"Loading ShotGrid playlists for project: {project_id}")
        # TODO: Implement ShotGrid playlist loading
        pass

    @Slot(str, str, str)
    def loadShotGridPlaylist(self, site_url, project_id, playlist_id):
        """Load versions from a ShotGrid playlist"""
        print(f"Loading ShotGrid playlist: {playlist_id}")
        # TODO: Implement ShotGrid playlist loading
        pass
