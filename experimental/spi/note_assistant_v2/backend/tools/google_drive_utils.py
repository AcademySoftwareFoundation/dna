#!/usr/bin/env python3
"""
Google Drive Utilities for File Downloads

This module provides utilities to download files from Google Drive using OAuth2 user authentication.

Features:
- Parse Google Drive URLs and extract file IDs
- Authenticate using OAuth2 user credentials (one-time browser login)
- Download files with progress tracking and retry logic
- Comprehensive error handling with actionable messages

OAuth2 Setup:
1. Enable Google Drive API:
   - Go to https://console.cloud.google.com/apis/library/drive.googleapis.com
   - Select your project (imageworks-ml-experiments)
   - Click "Enable" if not already enabled

2. Configure OAuth Consent Screen (if needed):
   - Go to https://console.cloud.google.com/apis/credentials/consent
   - Add Drive scopes if prompted

3. First Run Authentication:
   - Script will open browser automatically
   - Log in with your Google account (@imageworks.com)
   - Grant permissions to access Drive
   - Token saved to token.json for future use

4. Subsequent Runs:
   - No authentication needed
   - Automatically uses cached token from token.json
   - Auto-refreshes when expired (transparent to user)

Usage Example:
    from google_drive_utils import parse_drive_url, download_drive_file

    # Parse URL to get file ID
    file_id = parse_drive_url("https://drive.google.com/file/d/1a2b3c4d/view")

    # Download file (OAuth2 - will prompt for login on first run)
    if file_id:
        success = download_drive_file(
            file_id,
            "output.mp4",
            "client_secret.json",  # OAuth2 credentials
            verbose=True
        )
"""

import os
import re
import io
import json
import time
import shutil
from typing import Optional, Dict
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from googleapiclient.errors import HttpError


# Google Drive API configuration
# Include both regular Drive and Shared Drives (Team Drives) access
SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/gmail.send'  # Added for email functionality
]

# Regular expressions for parsing Google Drive URLs
DRIVE_URL_PATTERNS = [
    r'https://drive\.google\.com/file/d/([a-zA-Z0-9_-]+)',  # Standard share URL
    r'https://drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)',  # Open URL
    r'https://drive\.google\.com/uc\?id=([a-zA-Z0-9_-]+)',  # Direct download URL
    r'^([a-zA-Z0-9_-]{25,})$'  # Raw file ID (25+ chars, alphanumeric with dash/underscore)
]


def parse_drive_url(input_string: str) -> Optional[str]:
    """
    Parse Google Drive URL or file ID from input string.

    This function detects whether the input is a Google Drive URL/ID or a local file path.
    If it's a Drive URL, it extracts and returns the file ID. If it's a local file path
    that exists, it returns None to indicate local file processing should be used.

    Args:
        input_string: URL, file ID, or local file path

    Returns:
        File ID if Drive URL/ID detected, None if local path or invalid input

    Examples:
        >>> parse_drive_url("https://drive.google.com/file/d/1a2b3c4d/view")
        '1a2b3c4d'

        >>> parse_drive_url("1a2b3c4d5e6f7g8h9i0j1k2l3m")
        '1a2b3c4d5e6f7g8h9i0j1k2l3m'

        >>> parse_drive_url("/path/to/local/file.mp4")
        None
    """
    # First check if it's a local file path that exists
    if os.path.exists(input_string) and os.path.isfile(input_string):
        return None

    # Try to match against Drive URL patterns
    for pattern in DRIVE_URL_PATTERNS:
        match = re.search(pattern, input_string)
        if match:
            return match.group(1)

    # No match found
    return None


def is_drive_url(input_string: str) -> bool:
    """
    Quick check if input string is a Google Drive URL or file ID.

    Args:
        input_string: String to check

    Returns:
        True if appears to be Drive URL/ID, False otherwise
    """
    return parse_drive_url(input_string) is not None


def get_drive_service_oauth(credentials_path: str, token_path: str = 'token.json'):
    """
    Create Google Drive API service using OAuth2 user credentials.

    On first run, opens a browser for user authentication. Subsequent runs
    use the cached token from token.json.

    Args:
        credentials_path: Path to OAuth2 client credentials JSON file
        token_path: Path to store/load OAuth2 token (default: token.json)

    Returns:
        Google Drive API v3 service object

    Raises:
        FileNotFoundError: Credentials file not found
        ValueError: Invalid credentials format
        Exception: Authentication failed
    """
    if not os.path.exists(credentials_path):
        raise FileNotFoundError(
            f"OAuth2 credentials not found at: {credentials_path}\n"
            f"Please ensure client_secret.json exists in the parent directory."
        )

    creds = None

    # Load token from file if it exists
    if os.path.exists(token_path):
        try:
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        except Exception as e:
            print(f"Warning: Could not load token from {token_path}: {e}")
            creds = None

    # If there are no (valid) credentials available, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"Token refresh failed: {e}")
                print("Re-authenticating...")
                creds = None

        if not creds:
            # Run OAuth2 flow
            try:
                flow = InstalledAppFlow.from_client_secrets_file(
                    credentials_path, SCOPES
                )
                creds = flow.run_local_server(port=0)
            except Exception as e:
                raise Exception(f"OAuth2 authentication failed: {e}")

        # Save the credentials for the next run
        try:
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
        except Exception as e:
            print(f"Warning: Could not save token to {token_path}: {e}")

    # Build and return Drive service
    try:
        service = build('drive', 'v3', credentials=creds)
        return service
    except Exception as e:
        raise Exception(f"Failed to create Drive API service: {e}")


def get_file_metadata(file_id: str, credentials_path: str, token_path: str = 'token.json') -> Optional[Dict]:
    """
    Get file metadata from Google Drive (name, size, mimeType).

    Args:
        file_id: Google Drive file ID
        credentials_path: Path to OAuth2 credentials JSON
        token_path: Path to OAuth2 token file

    Returns:
        Dictionary with file metadata, or None if failed

    Example:
        >>> metadata = get_file_metadata("1a2b3c4d", "client_secret.json")
        >>> print(metadata['name'], metadata['size'])
    """
    try:
        service = get_drive_service_oauth(credentials_path, token_path)
        file_metadata = service.files().get(
            fileId=file_id,
            fields='name,size,mimeType',
            supportsAllDrives=True  # Support Shared Drives (Team Drives)
        ).execute()
        return file_metadata
    except HttpError as e:
        if e.resp.status == 404:
            print(f"Error: File not found on Google Drive (ID: {file_id})")
        elif e.resp.status == 403:
            print(f"Error: Permission denied to access file (ID: {file_id})")
        else:
            print(f"Error getting file metadata: {e}")
        return None
    except Exception as e:
        print(f"Error getting file metadata: {e}")
        return None


def download_drive_file(
    file_id: str,
    output_path: str,
    credentials_path: str,
    verbose: bool = False,
    max_retries: int = 3,
    token_path: str = 'token.json'
) -> bool:
    """
    Download file from Google Drive to local path using OAuth2 authentication.

    Features:
    - Downloads in 1MB chunks with optional progress tracking
    - Validates file access before downloading
    - Checks disk space before download
    - Implements retry logic for network errors
    - Comprehensive error handling with actionable messages
    - First run: Opens browser for authentication
    - Subsequent runs: Uses cached token

    Args:
        file_id: Google Drive file ID
        output_path: Local path to save file
        credentials_path: Path to OAuth2 credentials JSON
        verbose: Print progress information
        max_retries: Maximum retry attempts for network errors (default: 3)
        token_path: Path to OAuth2 token file (default: token.json)

    Returns:
        True if successful, False otherwise

    Raises:
        FileNotFoundError: Credentials file not found
        ValueError: Invalid credentials format
    """
    # Get Drive service with OAuth2
    try:
        service = get_drive_service_oauth(credentials_path, token_path)
    except (FileNotFoundError, ValueError) as e:
        print(f"Authentication error: {e}")
        return False
    except Exception as e:
        print(f"Failed to authenticate with Google Drive: {e}")
        return False

    # Get file metadata to validate access and get file info
    try:
        file_metadata = service.files().get(
            fileId=file_id,
            fields='name,size,mimeType',
            supportsAllDrives=True  # Support Shared Drives (Team Drives)
        ).execute()

        file_name = file_metadata.get('name', 'unknown')
        file_size = int(file_metadata.get('size', 0))

        if verbose:
            print(f"File found: {file_name}")
            print(f"Size: {file_size / (1024**2):.2f} MB")

    except HttpError as e:
        if e.resp.status == 404:
            print(f"Error: File not found on Google Drive (ID: {file_id})")
            print("Possible causes:")
            print("  - File ID is incorrect")
            print("  - File has been deleted")
            print("  - File is in trash")
        elif e.resp.status == 403:
            print(f"Error: Permission denied to access file (ID: {file_id})")
            print("\nPossible causes:")
            print("  - File is not shared with you")
            print("  - You don't have permission to view this file")
            print("  - Try re-authenticating with --use-oauth flag")
        else:
            print(f"Error accessing file: {e}")
        return False
    except Exception as e:
        print(f"Error getting file metadata: {e}")
        return False

    # Check available disk space
    try:
        output_dir = os.path.dirname(output_path) or '.'
        stat = shutil.disk_usage(output_dir)
        available_space = stat.free

        # Require 1.2x file size for safety margin
        required_space = int(file_size * 1.2)

        if available_space < required_space:
            print(f"Error: Insufficient disk space")
            print(f"  Required: {required_space / (1024**3):.2f} GB")
            print(f"  Available: {available_space / (1024**3):.2f} GB")
            return False
    except Exception as e:
        if verbose:
            print(f"Warning: Could not check disk space: {e}")

    # Download file with retry logic
    for attempt in range(max_retries):
        try:
            if verbose and attempt > 0:
                print(f"Retry attempt {attempt + 1}/{max_retries}...")

            # Create download request
            request = service.files().get_media(
                fileId=file_id,
                supportsAllDrives=True  # Support Shared Drives (Team Drives)
            )

            # Download to file
            fh = io.FileIO(output_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request, chunksize=1024*1024)  # 1MB chunks

            done = False
            while not done:
                status, done = downloader.next_chunk()
                if verbose and status:
                    progress = int(status.progress() * 100)
                    # Create progress bar that updates on same line
                    bar_length = 40
                    filled = int(bar_length * status.progress())
                    bar = '█' * filled + '░' * (bar_length - filled)
                    print(f'\rDownloading: |{bar}| {progress}%', end='', flush=True)

            if verbose:
                print()  # New line after progress bar completes

            fh.close()

            if verbose:
                print(f"Download complete: {output_path}")

            return True

        except HttpError as e:
            # Retry on server errors (5xx)
            if e.resp.status in [500, 502, 503, 504]:
                if attempt < max_retries - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    if verbose:
                        print(f"Server error ({e.resp.status}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue

            # Don't retry on client errors
            print(f"Download failed: {e}")
            return False

        except Exception as e:
            # Retry on connection errors
            error_str = str(e).lower()
            if attempt < max_retries - 1 and ('connection' in error_str or 'timeout' in error_str):
                wait_time = 2 ** attempt  # Exponential backoff
                if verbose:
                    print(f"Connection error, retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue

            print(f"Download failed: {e}")
            return False

    # All retries exhausted
    print(f"Error: Failed to download file after {max_retries} attempts")
    return False


# ============================================================================
# Recording Cache Functions
# ============================================================================

def sanitize_filename(filename: str, max_length: int = 200) -> str:
    """
    Sanitize filename for cross-platform filesystem compatibility.

    Removes/replaces characters that are invalid on Windows/Linux/macOS:
    < > : " / \\ | ? *

    Args:
        filename: Original filename from Google Drive
        max_length: Maximum filename length (default: 200, leaves room for extension)

    Returns:
        Sanitized filename safe for all filesystems

    Example:
        >>> sanitize_filename("Daily Review: 2024/12/28.mp4")
        'Daily_Review_2024_12_28.mp4'
    """
    import re

    # Remove file extension temporarily
    name_parts = filename.rsplit('.', 1)
    if len(name_parts) == 2:
        name, ext = name_parts
    else:
        name = filename
        ext = ''

    # Replace invalid characters with underscores
    # Invalid: < > : " / \ | ? *
    name = re.sub(r'[<>:"/\\|?*]', '_', name)

    # Replace multiple underscores with single underscore
    name = re.sub(r'_+', '_', name)

    # Remove leading/trailing underscores and spaces
    name = name.strip('_ ')

    # Truncate to max_length
    if len(name) > max_length:
        name = name[:max_length]

    # Reconstruct with extension
    if ext:
        return f"{name}.{ext}"
    return name


def get_cached_recording_path(
    file_id: str,
    project: str,
    output_dir: str,
    recording_name: str
) -> str:
    """
    Generate cache path for a recording.

    Args:
        file_id: Google Drive file ID
        project: Project name for organization
        output_dir: Root output directory
        recording_name: Original recording filename (will be sanitized)

    Returns:
        Full path to cached file location

    Example:
        >>> get_cached_recording_path("1a2b3c4d", "myproject", "/cache", "meeting.mp4")
        '/cache/myproject/meeting/recording.mp4'
    """
    # Sanitize the recording name for filesystem safety
    sanitized_name = sanitize_filename(recording_name)

    # Remove extension from sanitized name for directory
    name_without_ext = sanitized_name.rsplit('.', 1)[0] if '.' in sanitized_name else sanitized_name

    # Build path: {output_dir}/{project}/{sanitized_name}/recording.mp4
    cache_path = os.path.join(
        output_dir,
        project,
        name_without_ext,
        "recording.mp4"
    )

    return cache_path


def validate_cached_recording(
    cache_path: str,
    expected_size: Optional[int] = None,
    verbose: bool = False
) -> bool:
    """
    Validate that cached file exists and is complete.

    Checks:
    - File exists
    - File is not empty
    - File size matches expected (if provided)

    Args:
        cache_path: Path to cached file
        expected_size: Expected file size in bytes (from Drive metadata)
        verbose: Print validation details

    Returns:
        True if valid, False otherwise
    """
    # Check if file exists
    if not os.path.exists(cache_path):
        return False

    # Check file is not empty
    actual_size = os.path.getsize(cache_path)
    if actual_size == 0:
        if verbose:
            print(f"Warning: Cached file is empty: {cache_path}")
        return False

    # Optionally validate size matches expected
    if expected_size is not None:
        # Convert to int if needed (Google Drive API returns size as string)
        expected_size_int = int(expected_size) if isinstance(expected_size, str) else expected_size
        if actual_size != expected_size_int:
            if verbose:
                print(f"Warning: Cached file size mismatch (expected {expected_size_int}, got {actual_size})")
                print(f"File may be corrupted: {cache_path}")
            return False

    return True


def get_cached_recording(
    file_id: str,
    project: str,
    output_dir: str,
    recording_name: str,
    expected_size: Optional[int] = None,
    verbose: bool = False
) -> Optional[str]:
    """
    Check if file exists in cache and return path if valid.

    Args:
        file_id: Google Drive file ID
        project: Project name
        output_dir: Root output directory
        recording_name: Original recording filename
        expected_size: Expected file size for validation
        verbose: Print cache lookup details

    Returns:
        Path to cached file if valid, None if not found or invalid
    """
    cache_path = get_cached_recording_path(file_id, project, output_dir, recording_name)

    if verbose:
        print(f"Checking cache: {cache_path}")

    if validate_cached_recording(cache_path, expected_size, verbose):
        return cache_path

    return None


def cache_recording(
    source_path: str,
    file_id: str,
    project: str,
    output_dir: str,
    recording_name: str,
    verbose: bool = False
) -> Optional[str]:
    """
    Store downloaded file in cache.

    Creates cache directory structure and copies file from temp location
    to permanent cache location.

    Args:
        source_path: Path to downloaded temp file
        file_id: Google Drive file ID
        project: Project name
        output_dir: Root output directory
        recording_name: Original recording filename
        verbose: Print caching details

    Returns:
        Path to cached file if successful, None if failed

    Raises:
        PermissionError: If cannot write to cache directory
        OSError: If disk full or other I/O error
    """
    import shutil

    try:
        # Get cache path
        cache_path = get_cached_recording_path(file_id, project, output_dir, recording_name)

        # Create cache directory
        cache_dir = os.path.dirname(cache_path)
        os.makedirs(cache_dir, exist_ok=True)

        if verbose:
            print(f"Caching file to: {cache_path}")

        # Copy file to cache
        shutil.copy2(source_path, cache_path)

        # Validate the cached file
        if not validate_cached_recording(cache_path, verbose=verbose):
            print(f"Warning: Cached file validation failed")
            return None

        if verbose:
            print(f"Successfully cached recording")

        return cache_path

    except PermissionError as e:
        print(f"Error: Cannot write to cache directory: {e}")
        return None
    except OSError as e:
        print(f"Error: Failed to cache file: {e}")
        return None
    except Exception as e:
        print(f"Error: Unexpected error caching file: {e}")
        return None
