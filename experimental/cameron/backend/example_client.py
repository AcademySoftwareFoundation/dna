#!/usr/bin/env python3
"""
Example Python Client for DNA Dailies Notes Assistant API

This demonstrates how to use the backend API from a different client.
The backend is completely decoupled - any HTTP client can use it!
"""

import requests
import json
from typing import Dict, List, Optional


class DNAClient:
    """Simple Python client for DNA Dailies API"""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.session = requests.Session()

    def health_check(self) -> Dict:
        """Check if backend is running and what features are available"""
        response = self.session.get(f"{self.base_url}/health")
        response.raise_for_status()
        return response.json()

    def get_settings(self) -> Dict:
        """Get current backend settings"""
        response = self.session.get(f"{self.base_url}/settings")
        response.raise_for_status()
        return response.json()

    def create_version(self, version_id: str, description: str = "") -> Dict:
        """Create a new version"""
        response = self.session.post(
            f"{self.base_url}/versions",
            json={"version_id": version_id, "description": description}
        )
        response.raise_for_status()
        return response.json()

    def list_versions(self) -> List[Dict]:
        """Get all versions"""
        response = self.session.get(f"{self.base_url}/versions")
        response.raise_for_status()
        data = response.json()
        return data.get("versions", [])

    def get_version_notes(self, version_id: str) -> Dict:
        """Get notes for a specific version"""
        response = self.session.get(f"{self.base_url}/versions/{version_id}/notes")
        response.raise_for_status()
        return response.json()

    def update_version_notes(self, version_id: str, user_notes: str = None,
                            ai_notes: str = None, transcript: str = None) -> Dict:
        """Update notes for a version"""
        data = {}
        if user_notes is not None:
            data["user_notes"] = user_notes
        if ai_notes is not None:
            data["ai_notes"] = ai_notes
        if transcript is not None:
            data["transcript"] = transcript

        response = self.session.put(
            f"{self.base_url}/versions/{version_id}/notes",
            json=data
        )
        response.raise_for_status()
        return response.json()

    def generate_ai_notes(self, transcript: str, provider: str = "openai") -> Dict:
        """Generate AI notes from transcript using specified LLM provider"""
        response = self.session.post(
            f"{self.base_url}/notes/generate",
            json={"transcript": transcript, "provider": provider}
        )
        response.raise_for_status()
        return response.json()

    def import_csv_playlist(self, csv_content: str) -> Dict:
        """Import versions from CSV"""
        response = self.session.post(
            f"{self.base_url}/playlists/import-csv",
            json={"csv_content": csv_content}
        )
        response.raise_for_status()
        return response.json()

    def export_versions_to_csv(self) -> str:
        """Export versions to CSV format"""
        response = self.session.get(f"{self.base_url}/versions/export/csv")
        response.raise_for_status()
        return response.text


def main():
    """Example usage"""
    print("DNA Dailies API Client Example")
    print("=" * 60)

    # Initialize client
    client = DNAClient()

    # Check health
    print("\n1. Checking backend health...")
    health = client.health_check()
    print(f"   Status: {health['status']}")
    print(f"   Python: {health['python_version']}")
    print(f"   Features available:")
    for feature, enabled in health['features'].items():
        print(f"     - {feature}: {'✓' if enabled else '✗'}")

    # Get settings
    print("\n2. Getting backend settings...")
    settings = client.get_settings()
    if settings.get('status') == 'success':
        print("   Settings loaded successfully")
        config = settings.get('settings', {})
        if 'shotgrid_web_url' in config:
            print(f"   ShotGrid URL: {config['shotgrid_web_url']}")

    # Create a version
    print("\n3. Creating a test version...")
    result = client.create_version("TEST_001", "Test version for API demo")
    print(f"   Created: {result.get('message', 'OK')}")

    # List versions
    print("\n4. Listing all versions...")
    versions = client.list_versions()
    print(f"   Found {len(versions)} version(s)")
    for v in versions[:3]:  # Show first 3
        print(f"     - {v.get('version_id')}: {v.get('description', 'No description')}")

    # Update notes
    print("\n5. Adding notes to TEST_001...")
    client.update_version_notes(
        "TEST_001",
        user_notes="This is a test note from the API client",
        ai_notes="AI-generated summary would go here"
    )
    print("   Notes updated successfully")

    # Get notes
    print("\n6. Retrieving notes...")
    notes = client.get_version_notes("TEST_001")
    print(f"   User notes: {notes.get('user_notes', 'None')}")
    print(f"   AI notes: {notes.get('ai_notes', 'None')}")

    # Generate AI notes (if LLM configured)
    print("\n7. Testing AI note generation...")
    try:
        sample_transcript = "The shot looks good. The lighting needs some tweaks. Let's finalize it."
        ai_result = client.generate_ai_notes(sample_transcript, provider="openai")
        print(f"   Generated notes: {ai_result.get('notes', 'None')[:100]}...")
    except requests.exceptions.HTTPError as e:
        print(f"   Skipped (no LLM configured or error: {e})")

    print("\n" + "=" * 60)
    print("Example complete! The backend API is fully decoupled.")
    print("You can build web apps, CLIs, or any other client!")


if __name__ == "__main__":
    try:
        main()
    except requests.exceptions.ConnectionError:
        print("\nERROR: Could not connect to backend.")
        print("Make sure the backend is running: cd backend && python main.py")
    except Exception as e:
        print(f"\nERROR: {e}")
