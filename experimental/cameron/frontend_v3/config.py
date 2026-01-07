"""
Frontend Configuration
Handles frontend-specific settings and backend connection configuration
"""

import os
from pathlib import Path

# =============================================================================
# BACKEND CONNECTION
# =============================================================================
# Backend API URL - can be overridden with DNA_BACKEND_URL environment variable
BACKEND_URL = os.getenv("DNA_BACKEND_URL", "http://localhost:8000")

# Connection timeout settings
REQUEST_TIMEOUT = int(os.getenv("DNA_REQUEST_TIMEOUT", "30"))  # seconds
CONNECTION_RETRY_ATTEMPTS = int(os.getenv("DNA_RETRY_ATTEMPTS", "3"))

# =============================================================================
# FRONTEND PATHS
# =============================================================================
# User config directory (for frontend-specific settings)
USER_CONFIG_DIR = Path.home() / ".dna_dailies"
USER_CONFIG_DIR.mkdir(exist_ok=True)

# Frontend preferences file (for UI state, window geometry, etc.)
FRONTEND_PREFS_FILE = USER_CONFIG_DIR / "frontend_preferences.json"

# =============================================================================
# UI DEFAULTS
# =============================================================================
DEFAULT_WINDOW_WIDTH = 1400
DEFAULT_WINDOW_HEIGHT = 800
DEFAULT_THEME = "dark"

# =============================================================================
# FEATURE FLAGS
# =============================================================================
# Enable debug logging
DEBUG_MODE = os.getenv("DNA_DEBUG", "false").lower() == "true"

# Enable experimental features
EXPERIMENTAL_FEATURES = os.getenv("DNA_EXPERIMENTAL", "false").lower() == "true"

# =============================================================================
# LOGGING
# =============================================================================
LOG_LEVEL = os.getenv("DNA_LOG_LEVEL", "INFO")
LOG_FILE = USER_CONFIG_DIR / "frontend.log" if os.getenv("DNA_LOG_TO_FILE") else None


def print_config():
    """Print current configuration (for debugging)"""
    print("=" * 60)
    print("DNA Dailies Assistant - Frontend Configuration")
    print("=" * 60)
    print(f"Backend URL:        {BACKEND_URL}")
    print(f"Request Timeout:    {REQUEST_TIMEOUT}s")
    print(f"Retry Attempts:     {CONNECTION_RETRY_ATTEMPTS}")
    print(f"Config Directory:   {USER_CONFIG_DIR}")
    print(f"Debug Mode:         {DEBUG_MODE}")
    print(f"Log Level:          {LOG_LEVEL}")
    print("=" * 60)


if __name__ == "__main__":
    print_config()
